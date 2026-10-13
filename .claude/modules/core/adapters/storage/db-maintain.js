'use strict';
// spec: LEDG-S-004
// BỘ CHUYỂN lưu trữ: bảo trì hằng ngày của hai sổ. Chạy sau mỗi commit (lệnh on-commit) và chạy tay bằng `cli.js db-maintain`;
// KHÔNG chạy trong hook, để hook không phải chờ. Ba việc, theo đúng thứ tự:
//   1. gom các ngày đã hết từ nhóm act_ của sổ phiên vào usage_daily của sổ đo lường (mỗi ngày đúng một lần);
//   2. xóa nhật ký act_ cũ hơn 60 ngày, CHỈ khi bước 1 chạy được (không gom được thì giữ, sổ phiên tự xóa ở hạn cứng 180 ngày);
//   3. chụp bản sao của sổ phiên mỗi ngày một bản, giữ 7 bản mới nhất (hồ sơ rec_ không dựng lại được nếu mất).
// Ngày không có commit nào thì không chạy; dữ liệu còn trong hạn 60 ngày nên không mất gì.
const fs = require('node:fs');
const path = require('node:path');
const P = require('../../gate/gate-paths');
const L = require('./ledger-db');
const E = require('./eval-db');

const KEEP_MS = 60 * L.DAY_MS;
const KEEP_BACKUPS = 7;
const BACKUP_RE = /^harness-\d{4}-\d{2}-\d{2}\.db$/;

function backup(root, now) {
  const dir = P.dbBackupsDir(root);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `harness-${E.dayOf(now)}.db`);
  let made = false;
  if (!fs.existsSync(file)) {
    const db = L.open(root);
    if (!db) return { made: false, removed: 0, error: 'không mở được sổ phiên' };
    try { db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`); made = true; } finally { try { db.close(); } catch { /* bỏ qua */ } }
  }
  const old = fs.readdirSync(dir).filter((n) => BACKUP_RE.test(n)).sort().reverse().slice(KEEP_BACKUPS);
  for (const n of old) { try { fs.unlinkSync(path.join(dir, n)); } catch { /* lần sau thử lại */ } }
  return { made, removed: old.length };
}

// Trả { rolled: [ngày], pruned: true|false, backup: {...}, errors: [chuỗi] }. Không ném lỗi.
function run(root, now = Date.now()) {
  const out = { rolled: [], pruned: false, backup: null, errors: [] };
  if (!fs.existsSync(P.ledgerPath(root))) return out;
  const ev = E.open(root);
  if (!ev) out.errors.push('không mở được sổ đo lường');
  else {
    try {
      out.rolled = E.rollUp(ev, P.ledgerPath(root), now);
      const db = L.open(root);
      if (db) { try { L.prune(db, now, KEEP_MS); out.pruned = true; } finally { try { db.close(); } catch { /* bỏ qua */ } } }
    } catch (e) { out.errors.push(`gom số liệu: ${e.message}`); } finally { try { ev.close(); } catch { /* bỏ qua */ } }
  }
  try { out.backup = backup(root, now); } catch (e) { out.errors.push(`sao lưu: ${e.message}`); }
  return out;
}

function text(r) {
  const parts = [`gom ${r.rolled.length} ngày${r.rolled.length ? ` (${r.rolled[0]} đến ${r.rolled[r.rolled.length - 1]})` : ''}`];
  parts.push(r.pruned ? 'đã xóa nhật ký act_ cũ hơn 60 ngày' : 'chưa xóa nhật ký cũ');
  if (r.backup) parts.push(r.backup.made ? 'đã chụp bản sao hôm nay' : 'bản sao hôm nay đã có');
  return `Bảo trì sổ: ${parts.join('; ')}.${r.errors.length ? ` LỖI: ${r.errors.join('; ')}.` : ''}`;
}

module.exports = { run, text, KEEP_MS, KEEP_BACKUPS };
