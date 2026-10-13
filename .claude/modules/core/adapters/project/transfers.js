'use strict';
// spec: HOOK-S-013
// BỘ CHUYỂN nơi lưu tờ bàn giao khi chuyển phiên: thư mục trạng thái ở máy (gate-paths.transfersDir), mỗi lần chuyển hai tệp:
//   <mã>.md    tờ bàn giao, phiên mới đọc bằng công cụ Read
//   <mã>.json  { id, unit, name, from: { sid, name }, to (mã phiên nền của phiên mới, có sau khi tạo), createdAt, link, readAt, readBy }
// Chỉ ở máy, không commit: tờ bàn giao có thể nhắc tên tệp dở và việc riêng của một phiên; chuyển phiên chỉ giữa các phiên trên máy này.
// Mọi lần ghi là ghi tệp tạm rồi đổi tên (hook của nhiều phiên chạy cùng lúc).
const fs = require('node:fs');
const path = require('node:path');
const P = require('../../gate/gate-paths');

const KEEP_MS = 14 * 24 * 3600 * 1000; // tờ cũ hơn thì không còn nhắc ai (tệp vẫn nằm đó)
const ID_RE = /^[a-z][a-z0-9-]{0,39}-\d{1,4}-\d{8}T\d{4}$/;
const dir = (root) => P.transfersDir(root);
const mdOf = (root, id) => path.join(dir(root), `${id}.md`);
const metaOf = (root, id) => path.join(dir(root), `${id}.json`);
const relOf = (root, id) => path.relative(root, mdOf(root, id)).split(path.sep).join('/');

function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}
function readMeta(root, id) {
  try { const m = JSON.parse(fs.readFileSync(metaOf(root, id), 'utf8')); return m && m.id === id ? m : null; } catch { return null; }
}
function list(root) {
  let names = [];
  try { names = fs.readdirSync(dir(root)); } catch { return []; }
  return names.filter((n) => n.endsWith('.json') && ID_RE.test(n.slice(0, -5))).map((n) => readMeta(root, n.slice(0, -5))).filter(Boolean)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

function save(root, meta, markdown) {
  if (!ID_RE.test(String(meta.id || ''))) throw new Error(`mã lần chuyển không hợp lệ: ${meta.id}`);
  if (fs.existsSync(metaOf(root, meta.id))) throw new Error(`đã có lần chuyển mã ${meta.id}; chờ một phút rồi thử lại`);
  writeAtomic(mdOf(root, meta.id), markdown);
  writeAtomic(metaOf(root, meta.id), `${JSON.stringify(meta, null, 2)}\n`);
  return { file: mdOf(root, meta.id), rel: relOf(root, meta.id) };
}
// Sửa vài trường của một lần chuyển (đọc lại rồi ghi; trường `readAt` đã có thì không bị ghi đè bởi bản đọc trước đó).
function update(root, id, fields) {
  const cur = readMeta(root, id);
  if (!cur) return null;
  const next = { ...cur, ...fields };
  if (cur.readAt && !fields.readAt) { next.readAt = cur.readAt; next.readBy = cur.readBy; }
  writeAtomic(metaOf(root, id), `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

// Phiên `sid` có phải phiên NHẬN của lần chuyển `m` không: mã phiên bắt đầu bằng mã phiên nền đã ghi; chưa ghi mã (phiên vừa tạo, lệnh
// chưa kịp ghi) thì mọi phiên KHÁC phiên giao đều tính, vì chỉ phiên mới được trỏ tới tệp này.
const addressed = (m, sid) => Boolean(sid) && sid !== (m.from && m.from.sid) && (m.to ? String(sid).startsWith(m.to) : true);

// Tờ bàn giao phiên `sid` chưa đọc: { id, rel, unit } hoặc null. Chỉ tính lần chuyển đã ghi mã phiên nhận, còn trong hạn.
function pending(root, sid, now = Date.now()) {
  if (!sid) return null;
  const m = list(root).filter((x) => !x.readAt && x.to && String(sid).startsWith(x.to) && now - Date.parse(x.createdAt) < KEEP_MS).pop();
  return m ? { id: m.id, rel: relOf(root, m.id), unit: m.unit } : null;
}
// Phiên `sid` vừa đọc tệp `abs`: nếu đó là một tờ bàn giao gửi cho nó và chưa ai đọc thì ghi nhận. Trả mã lần chuyển, hoặc ''.
function markRead(root, abs, sid, now = Date.now()) {
  if (!sid || !abs) return '';
  const file = path.resolve(String(abs));
  if (P.norm(path.dirname(file)) !== P.norm(dir(root)) || !file.endsWith('.md')) return '';
  const id = path.basename(file, '.md');
  const m = ID_RE.test(id) ? readMeta(root, id) : null;
  if (!m || m.readAt || !addressed(m, sid)) return '';
  update(root, id, { readAt: new Date(now).toISOString(), readBy: sid });
  return id;
}

module.exports = { ID_RE, KEEP_MS, dir, mdOf, relOf, list, readMeta, save, update, pending, markRead };
