'use strict';
// spec: HOOK-S-013
// CHUYỂN PHIÊN: đưa việc của một đơn vị từ phiên đang làm sang một phiên nền MỚI có Remote Control, kèm một tờ bàn giao.
// Lệnh `session.js transfer` và công cụ MCP `session_transfer` cùng gọi run() ở đây. Thứ tự:
//   1. kiểm phần phiên giao tự viết (khuôn sáu mục ở core/sessions/transfer.js); thiếu mục thì TỪ CHỐI, chưa tạo gì;
//   2. gom phần máy đọc được (adapters/jobs/transfer-facts.js) và ghép thành tờ bàn giao;
//   3. dò từ cấm và bí mật trong tờ; có thì TỪ CHỐI, chỉ nêu dòng, không in lại từ;
//   4. đặt tên phiên mới <đơn-vị>-<số>, ghi tờ vào thư mục trạng thái ở máy;
//   5. tạo phiên nền có Remote Control với lời mở đầu trỏ tới tờ đó (cùng lệnh với `session.js new`: không cờ nào về quyền);
//   6. chờ phiên mới ĐỌC tờ (luật ghi sổ ghi nhận lần đọc); chỉ khi đã đọc mới in đường link là "đã bàn giao".
// Không bao giờ dừng phiên giao: dừng hay không do người dùng quyết. Lời duyệt kế hoạch không chuyển theo.
const fs = require('node:fs');
const P = require('../gate/gate-paths');
const T = require('../core/sessions/transfer');
const store = require('../adapters/project/transfers');

const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function readNote(noteFile, note) {
  if (note && typeof note === 'object') return note;
  if (!noteFile) throw new Error(`Thiếu phần tự viết. Truyền --note <tệp.json> chứa sáu mục: ${T.SECTIONS.map((s) => `${s.key} (${s.title})`).join(', ')}. Mỗi mục là một chuỗi hoặc danh sách chuỗi.`);
  if (!fs.existsSync(noteFile)) throw new Error(`Không có tệp ${noteFile}.`);
  try { return JSON.parse(fs.readFileSync(noteFile, 'utf8')); } catch (e) { throw new Error(`Tệp ${noteFile} không phải JSON hợp lệ: ${e.message}`); }
}

// Dò từ cấm (danh sách của máy) và bí mật trong tờ bàn giao. Trả danh sách lời báo; chỉ nêu số dòng.
function scan(root, text, deps = {}) {
  const out = [];
  let words = null;
  try { words = (deps.words || (() => require('../adapters/project/workspace').loadWords(root)))(); } catch { words = null; }
  if (words && words.length) {
    const B = require('../core/rules/lib/banned-words');
    const hits = B.linesWith(text, B.matcher(words));
    if (hits.length) out.push(`có từ trong danh sách từ cấm của máy ở dòng ${hits.map((h) => (h && h.line) || h).slice(0, 10).join(', ')} của tờ bàn giao`);
  }
  const sec = T.secretsIn(text);
  if (sec.length) out.push(`có thứ giống bí mật: ${sec.slice(0, 10).map((s) => `dòng ${s.line} (${s.what})`).join(', ')}. Tờ bàn giao chỉ ghi TÊN biến môi trường, không ghi giá trị`);
  return out;
}

// deps (để test): create(name, opts) -> { id, link, row } | { error }; names() -> tên phiên đang có; facts(unit, sid); sleep(ms); now().
function run(root, { unit, noteFile, note, model, sid, waitReadMs = 180000 } = {}, deps = {}) {
  const now = (deps.now || Date.now)();
  if (!T.UNIT_RE.test(String(unit || '')) || !P.serviceHasRepo(root, unit)) {
    return `KHÔNG chuyển: "${unit || ''}" không phải một đơn vị của dự án. Dùng: session.js transfer <đơn-vị> --note <tệp.json>. Đơn vị đang có: ${P.serviceEntries(root).map((d) => d.name).filter((n) => P.serviceHasRepo(root, n)).join(', ') || '(không có)'}.`;
  }
  let body;
  try { body = readNote(noteFile, note); } catch (e) { return `KHÔNG chuyển: ${e.message}`; }
  const errs = T.checkNote(body);
  if (errs.length) return `KHÔNG chuyển, phần tự viết chưa đủ khuôn (chưa tạo phiên nào):\n  - ${errs.join('\n  - ')}`;

  const lib = require('../hooks/sessions-lib');
  let existing = [];
  try { existing = deps.names ? deps.names() : lib.table(root, { background: lib.agentsList(root) }).rows.flatMap((r) => [r.name, r.title]); } catch { existing = []; }
  const name = T.nextName(unit, [...existing, ...store.list(root).map((m) => m.name)]);
  const id = T.idOf(name, now);
  let me = { sid: sid || '', name: '' };
  try { const row = deps.names ? null : lib.table(root).rows.find((r) => r.sid === sid); if (row) me = { sid, name: row.name }; } catch { /* không biết tên phiên giao: để trống */ }

  let facts;
  try { facts = deps.facts ? deps.facts(unit, sid) : require('../adapters/jobs/transfer-facts').gather(root, unit, sid, { scope: require('../adapters/storage/scope-db'), ledger: require('../adapters/storage/ledger-db') }); } catch (e) { facts = { scope: [`không gom được: ${e.message}`] }; }
  const markdown = T.render({ id, unit, name, from: me, at: now, note: body, facts });
  const bad = scan(root, markdown, deps);
  if (bad.length) return `KHÔNG chuyển, tờ bàn giao không được ghi (chưa tạo phiên nào):\n  - ${bad.join('\n  - ')}\nSửa phần tự viết rồi chạy lại.`;

  let saved;
  try { saved = store.save(root, { id, unit, name, from: me, to: '', createdAt: new Date(now).toISOString(), link: '', readAt: '', readBy: '' }, markdown); } catch (e) { return `KHÔNG chuyển: ${e.message}`; }

  const create = deps.create || ((n, o) => require('./session').createRaw(n, o, root));
  const made = create(name, { prompt: T.opening({ unit, rel: saved.rel, id }), model });
  if (made.error) return `Đã ghi tờ bàn giao ${saved.rel} nhưng KHÔNG tạo được phiên "${name}": ${made.error}\nChưa có gì được bàn giao. Sửa nguyên nhân rồi chạy lại (lần sau sẽ là một tờ mới).`;
  store.update(root, id, { to: made.id, link: made.link || '' });

  // Chờ phiên mới đọc tờ bàn giao. Phiên vừa tạo cần thời gian khởi động; hết giờ thì nói rõ là CHƯA xác nhận.
  const sleep = deps.sleep || sleepSync;
  let meta = store.readMeta(root, id);
  for (let waited = 0; waited < waitReadMs && !(meta && meta.readAt); waited += 3000) { sleep(3000); meta = store.readMeta(root, id); }
  const read = Boolean(meta && meta.readAt);

  const lines = [`Phiên mới: "${name}" (phiên nền, mã ${made.id}), nhận việc của đơn vị ${unit}.`];
  lines.push(`Tờ bàn giao: ${saved.rel} (chỉ ở máy này).`);
  lines.push(read ? 'Phiên mới ĐÃ ĐỌC tờ bàn giao.' : `CHƯA xác nhận phiên mới đã đọc tờ bàn giao sau ${Math.round(waitReadMs / 1000)} giây. Kiểm lại: node .claude/modules/core/cli/session.js transfers; xem phiên: claude logs ${made.id}. Phiên mới vẫn bị nhắc đọc ở mỗi lượt.`);
  lines.push(made.link
    ? `${read ? 'ĐÃ BÀN GIAO. ' : ''}Mở phiên mới ở claude.ai/code hoặc ứng dụng Claude: ${made.link}`
    : `Remote Control: CHƯA xác nhận được (không thấy đường link trong đầu ra của phiên). Xem: claude logs ${made.id}`);
  if (made.row) lines.push(`Tên nhắn tin giữa các phiên: ${made.row.name}`);
  lines.push('Phiên giao KHÔNG bị dừng và lời duyệt kế hoạch KHÔNG chuyển theo: phiên mới phải trình kế hoạch và được người dùng duyệt. Dừng phiên giao hay không do người dùng quyết.');
  return lines.join('\n');
}

function listText(root) {
  const all = store.list(root).slice(-15);
  if (!all.length) return 'Chưa có lần chuyển phiên nào trên máy này.';
  return all.map((m) => `${m.id} | ${m.unit} | phiên mới "${m.name}"${m.to ? ` (mã ${m.to})` : ' (CHƯA tạo được phiên)'} | ${m.readAt ? `đã đọc lúc ${m.readAt}` : 'CHƯA đọc tờ bàn giao'} | ${store.relOf(root, m.id)}${m.link ? ` | ${m.link}` : ''}`).join('\n');
}

module.exports = { run, listText, scan, readNote };
