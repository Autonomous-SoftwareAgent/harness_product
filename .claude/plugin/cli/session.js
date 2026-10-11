#!/usr/bin/env node
'use strict';
// spec: HOOK-S-003
// Phiên Claude Code của BSN_: xem phiên nào đang làm gì, và TẠO phiên mới có bật Remote Control theo yêu cầu của người dùng.
//   node .claude/plugin/cli/session.js list                       bảng phiên TRÊN MÁY NÀY, kể cả phiên nền (tên nhắn tin, ở đâu, tiêu đề, dịch vụ, trạng thái)
//   node .claude/plugin/cli/session.js for <dịch-vụ>              các phiên đang mở đã làm dịch vụ đó, mới nhất trước
//   node .claude/plugin/cli/session.js new <tên> [--prompt "..."] [--model <tên model>]
//                                                                   tạo một phiên NỀN tại BSN_/, bật Remote Control, hiện trên claude.ai/code
//   node .claude/plugin/cli/session.js bg                         các phiên nền đang có (mã, tên, trạng thái)
//   node .claude/plugin/cli/session.js close <mã>                 dừng một phiên nền (cuộc trò chuyện được giữ, mở lại bằng claude attach)
//   node .claude/plugin/cli/session.js skills [--days N]          số liệu từ sổ phiên: skill nào được mở, skill nào chưa ai mở, việc nào bị chặn vì thiếu skill
//   thêm --json (list, for) để lấy dữ liệu
// Dùng bảng TRƯỚC khi nhắn tin cho phiên khác, để nhắn đúng một phiên. Cách ghép và giới hạn: .claude/plugin/hooks/sessions-lib.js.
// Tạo phiên: chỉ khi người dùng yêu cầu. Phiên mới chạy với chế độ quyền mà người dùng đã cấu hình cho Claude Code; lệnh này KHÔNG bao giờ
// thêm cờ bỏ qua quyền. Cổng duyệt của harness áp dụng cho phiên mới như mọi phiên.
const fs = require('node:fs');
const path = require('node:path');
const lib = require('../hooks/sessions-lib');

// Đường dẫn đúng chữ hoa thường như trên đĩa. Trên Windows, thư mục làm việc có thể mang ổ đĩa viết thường ("d:\...") tùy shell gọi;
// Claude Code coi đó là một dự án KHÁC: phiên mới hỏi lại việc tin máy chủ MCP và kẹt ở câu hỏi đó (đã gặp 2026-10-09).
function canon(dir) { try { return fs.realpathSync.native(dir); } catch { return dir; } }
// Tìm lệnh claude, chạy nó, và phép thử "thư mục này có thuộc dự án không" nằm ở sessions-lib.js (bảng phiên cũng cần để gộp phiên nền).
const { inRoot, findClaude } = lib;

const ROOT = canon(path.resolve(__dirname, '..', '..', '..'));
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,39}$/;

// Đối số của lệnh tạo phiên. Tách riêng để test: không có cờ nào về quyền, tên phiên dùng cho cả Remote Control và tên hiển thị.
function newArgs(name, { prompt, model, service } = {}) {
  if (!NAME_RE.test(String(name || ''))) throw new Error('Tên phiên: 1 đến 40 ký tự, chỉ chữ không dấu, số, dấu cách, chấm, gạch dưới, gạch ngang; nên đặt theo dịch vụ (ví dụ payment-hub).');
  const given = String(prompt || '').trim();
  const first = service && given ? `Phiên này được giao dịch vụ "${service}" (một phiên làm một dịch vụ một lúc). ${given}` : given || `Phiên "${name}" vừa được tạo theo yêu cầu của người dùng, có bật Remote Control. ${service ? `Phiên được giao dịch vụ "${service}". ` : ''}Chưa có việc: đọc CLAUDE.md, rồi chờ người dùng giao việc. Không sửa gì.`;
  return ['--bg', '--remote-control', name, '--name', name, ...(model ? ['--model', String(model)] : []), first];
}

const claude = lib.runClaude;

function create(name, opts, root, { waitMs = 90000, sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms) } = {}) {
  const started = claude(newArgs(name, opts), { root });
  const id = (/backgrounded\s*·\s*([0-9a-f]{6,})/.exec(started.out) || [])[1];
  if (!id) return `KHÔNG tạo được phiên "${name}": ${started.error || started.out.trim().split('\n').slice(-3).join(' | ') || 'lệnh claude không trả mã phiên'}`;
  // Chờ tới khi phiên báo Remote Control đã bật và có đường link. Không thấy thì nói rõ, không báo thành công.
  let link = null;
  for (let waited = 0; waited < waitMs && !link; waited += 3000) {
    sleep(3000);
    link = (/https:\/\/claude\.ai\/code\/session_[A-Za-z0-9]+/.exec(claude(['logs', id], { root, timeout: 30000 }).out) || [])[0] || null;
  }
  const row = lib.table(root, { background: true }).rows.find((r) => r.sid.startsWith(id));
  const lines = [`Đã tạo phiên nền "${name}" tại ${root} (mã ${id}).`];
  lines.push(link ? `Remote Control: ĐÃ BẬT. Mở ở claude.ai/code hoặc ứng dụng Claude: ${link}` : `Remote Control: CHƯA xác nhận được sau ${Math.round(waitMs / 1000)} giây (không thấy đường link trong đầu ra của phiên). Xem: claude logs ${id}`);
  if (row) lines.push(`Tên nhắn tin giữa các phiên: ${row.name}`);
  lines.push(`Xem đầu ra: claude logs ${id} · dừng: node .claude/plugin/cli/session.js close ${id}`);
  return lines.join('\n');
}

function background(root) {
  const r = claude(['agents', '--json'], { root, timeout: 30000 });
  let list;
  try { list = JSON.parse(r.out); } catch { return `Không đọc được danh sách phiên nền: ${r.error || r.out.trim().slice(0, 200)}`; }
  const rows = list.filter((a) => a.kind === 'background' && inRoot(a.cwd, root));
  if (!rows.length) return 'Không có phiên nền nào ở thư mục này.';
  const where = (a) => (path.resolve(String(a.cwd || '')).toLowerCase() === path.resolve(root).toLowerCase() ? '' : ` | ĐANG Ở BẢN SAO LÀM VIỆC: ${a.cwd}`);
  // Phiên nền đang chạy thì có số tiến trình; không có thì đã dừng dù state còn ghi chữ cũ (S-054).
  const state = (a) => (typeof a.pid === 'number' ? `${a.status || '?'}${a.state ? ` (${a.state})` : ''}` : `ĐÃ DỪNG (chạy lại: claude respawn ${a.id})`);
  return rows.map((a) => `${a.id} | ${a.name || '(chưa có tên)'} | ${state(a)}${where(a)}`).join('\n');
}

// Xu hướng hai tuần từ sổ đo lường (S-060): số đã gom theo ngày, giữ mãi. Chỉ đọc; chưa có sổ hay chưa gom ngày nào thì nói vậy.
function trendLines(root) {
  if (!require('node:fs').existsSync(require('../gate/gate-paths').evalDbPath(root))) return ['Xu hướng theo ngày: chưa có sổ đo lường (tự tạo ở lần commit kế tiếp, hoặc chạy cli.js db-maintain).'];
  const E = require('../adapters/storage/eval-db');
  const db = E.open(root);
  if (!db) return ['Xu hướng theo ngày: không mở được sổ đo lường.'];
  let t;
  try { t = E.trend(db); } finally { try { db.close(); } catch { /* bỏ qua */ } }
  if (!t.last) return ['Xu hướng theo ngày: chưa gom ngày nào (chỉ gom ngày đã hết).'];
  const out = [`Xu hướng (7 ngày tới ${t.last} | 7 ngày trước đó; số đã gom, giữ mãi):`];
  const label = { tool: 'công cụ', skill: 'skill', rule: 'luật (số lần chặn, hỏi hoặc giữ lượt)' };
  for (const kind of ['tool', 'skill', 'rule']) {
    const rows = t.rows.filter((r) => r.kind === kind).slice(0, kind === 'tool' ? 8 : 6);
    if (!rows.length) continue;
    const val = (r, which) => (kind === 'rule' ? r[which === 'recent' ? 'blocksRecent' : 'blocksBefore'] : r[which]);
    out.push(`  ${label[kind]}: ${rows.map((r) => `${r.name} ${val(r, 'recent')} | ${val(r, 'before')}`).join('; ')}`);
  }
  return out;
}

// Số liệu dùng skill từ sổ phiên (S-032). Chỉ đọc.
function skillsReport(root, days = 30) {
  const L = require('../hooks/ledger-lib');
  const problems = L.health(root);
  const db = L.open(root);
  if (!db) return 'Không mở được sổ phiên (tệp harness.db trong thư mục trạng thái của harness): Node này không có node:sqlite, hoặc thư mục đó không ghi được.';
  let s;
  let chain = [];
  try { s = L.stats(db, root, { days }); chain = L.verifyChain(db); } finally { try { db.close(); } catch { /* bỏ qua */ } }
  const map = L.loadMap(root);
  const lines = [`Sổ phiên, ${s.days} ngày gần đây: ${s.sessions} phiên. Chế độ chặn theo skill: ${map ? map.mode : 'không có bảng nối'}.`];
  lines.push('Skill (số lần mở | số phiên | lần gần nhất):');
  for (const k of s.skills) lines.push(`  ${k.skill}${k.gone ? ' (đã bỏ)' : ''} | ${k.loads} | ${k.sessions} | ${k.last ? lib.ago(Date.now() - k.last) : 'CHƯA AI MỞ'}`);
  lines.push(s.blocked.length ? 'Bị chặn vì chưa nạp đủ (công cụ | dịch vụ | còn thiếu | số lần):' : 'Bị chặn vì chưa nạp đủ: không có.');
  for (const b of s.blocked.slice(0, 15)) lines.push(`  ${b.tool} | ${b.service || '-'} | ${b.missing} | ${b.n}`);
  lines.push('Công cụ được gọi nhiều nhất (công cụ | số lần | số phiên):');
  for (const c of s.tools.slice(0, 12)) lines.push(`  ${c.tool} | ${c.n} | ${c.sessions}`);
  // Quyết định của mọi luật (S-060): luật nào chặn, hỏi, giữ lượt hay nhắc bao nhiêu lần.
  lines.push(s.rules.length ? 'Quyết định của các luật (luật | chặn, hỏi, giữ lượt hay nhắc | số lần):' : 'Quyết định của các luật: chưa có.');
  for (const r of s.rules) lines.push(`  ${r.rule} | ${r.verdict} | ${r.n}`);
  lines.push(...trendLines(root));
  const bad = chain.filter((c) => c.broken);
  lines.push(bad.length
    ? `Hồ sơ kế hoạch và commit: CHUỖI BĂM BỊ ĐỨT ở ${bad.map((c) => `${c.table} (dòng ${c.broken})`).join(', ')}: có dòng đã bị sửa hoặc xóa sau khi ghi. Báo người dùng.`
    : `Hồ sơ kế hoạch và commit: chuỗi băm nguyên vẹn (${chain.map((c) => `${c.table} ${c.rows} dòng`).join(', ')}).`);
  for (const p of problems) lines.push(`VẤN ĐỀ: ${p}`);
  return lines.join('\n');
}

function main(argv, root = ROOT) {
  const json = argv.includes('--json');
  const flag = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
  const rest = argv.filter((a, i) => a !== '--json' && !['--prompt', '--model', '--days', '--service'].includes(a) && !['--prompt', '--model', '--days', '--service'].includes(argv[i - 1]));
  const [cmd, arg] = rest;
  // spec: HOOK-S-006
  // Bảng gộp cả phiên nền của máy này (S-054): hỏi Claude Code MỘT lần rồi dùng lại cho mọi phép tính trong lệnh.
  const bgOpts = () => ({ background: lib.agentsList(root) });
  if (cmd === 'list' || !cmd) return json ? JSON.stringify(lib.table(root, bgOpts()), null, 2) : lib.tableText(root, bgOpts());
  if (cmd === 'for' && arg) {
    const opts = bgOpts();
    const t = lib.table(root, opts);
    if (t.error) return json ? JSON.stringify(t, null, 2) : lib.tableText(root, opts);
    const rows = lib.sessionsFor(root, arg, opts);
    if (json) return JSON.stringify({ rows }, null, 2);
    const away = t.rows.filter((r) => !r.me && r.where.host === 'other' && r.services.some((s) => s.name === arg)).map((r) => r.name);
    const note = [t.background && t.background.error ? `Phiên nền: KHÔNG đọc được danh sách (${t.background.error}); có thể thiếu phiên nền.` : '', away.length ? `Bỏ qua phiên không ở máy này: ${away.join(', ')}.` : ''].filter(Boolean);
    if (!rows.length) return [`Không có phiên đang mở nào trên máy này đã làm "${arg}". Đừng nhắn cả loạt: báo người dùng, hoặc xem cả bảng bằng lệnh list.`, ...note].join('\n');
    return [...rows.map((r) => `${r.name} | ${lib.whereText(r)} | tiêu đề: ${r.title ? `"${r.title}"` : 'chưa có'} | làm "${arg}" ${lib.ago(r.ageMs)}${r.active ? '' : ' (đã cũ: hỏi người dùng nếu không chắc)'} | ${lib.statusText(r.status, r)}`), ...note].join('\n');
  }
  if (cmd === 'new' && arg) {
    // Dịch vụ được giao: nêu bằng --service; không nêu mà tên phiên trùng tên một dịch vụ đang có thì lấy tên đó.
    let service = flag('--service');
    try { if (!service && require('../gate/gate-paths').serviceHasRepo(root, arg)) service = arg; } catch { /* không đoán */ }
    if (service && !/^[a-z0-9][a-z0-9-]{0,39}$/.test(service)) return 'Tên dịch vụ: chữ thường không dấu, số, gạch ngang.';
    try { return create(arg, { prompt: flag('--prompt'), model: flag('--model'), service }, root); } catch (e) { return e.message; }
  }
  if (cmd === 'bg') return background(root);
  if (cmd === 'skills') return skillsReport(root, Number(flag('--days')) > 0 ? Number(flag('--days')) : 30);
  if (cmd === 'close' && arg) {
    if (!/^[0-9a-f]{6,}$/.test(arg)) return 'Nêu mã phiên nền (xem bằng lệnh bg).';
    const r = claude(['stop', arg], { root, timeout: 30000 });
    return r.ok ? `Đã dừng phiên nền ${arg}. Cuộc trò chuyện được giữ; mở lại: claude attach ${arg}.` : `Không dừng được ${arg}: ${r.error || r.out.trim().slice(0, 200)}`;
  }
  return 'Cách dùng: node .claude/plugin/cli/session.js list | for <dịch-vụ> | new <tên> [--service <dịch-vụ>] [--prompt "..."] [--model <model>] | bg | close <mã> | skills [--days N]';
}

if (require.main === module) console.log(main(process.argv.slice(2)));
module.exports = { main, newArgs, findClaude, canon, inRoot };
