'use strict';
// Tra cứu sổ phiên (harness.db) bằng một câu SELECT, chỉ đọc. Dùng cho công cụ MCP `db_query`.
// Ba lớp chặn ghi, mỗi lớp đủ một mình: (1) sổ mở ở chế độ chỉ đọc của SQLite; (2) chỉ nhận MỘT câu bắt đầu bằng SELECT hoặc WITH;
// (3) bộ cấp phép của SQLite chỉ cho đọc cột, không cho lệnh nào khác (nếu bản Node có).
const fs = require('node:fs');
const P = require('../../gate/gate-paths');

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const MAX_CELL = 300;
const MAX_SQL = 4000;

function sqliteOrNull() { try { return require('node:sqlite'); } catch { return null; } }

// Bỏ chú thích và chuỗi chữ để kiểm cấu trúc câu lệnh (chuỗi chữ không được làm lộ dấu chấm phẩy giả).
function skeleton(sql) {
  return String(sql).replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/'(?:[^']|'')*'/g, "''").replace(/"(?:[^"]|"")*"/g, '""');
}

// Trả { ok, sql, limit } hoặc { ok:false, why }. Bọc LIMIT khi câu chưa có.
function check(raw, limit) {
  const sql = String(raw || '').trim().replace(/;+\s*$/, '');
  if (!sql) return { ok: false, why: 'Câu SQL trống.' };
  if (sql.length > MAX_SQL) return { ok: false, why: `Câu SQL dài quá ${MAX_SQL} ký tự.` };
  const sk = skeleton(sql);
  if (sk.includes(';')) return { ok: false, why: 'Chỉ nhận MỘT câu lệnh (không dùng dấu chấm phẩy giữa câu).' };
  if (!/^\s*(select|with)\b/i.test(sk)) return { ok: false, why: 'Chỉ nhận câu bắt đầu bằng SELECT hoặc WITH. Công cụ này chỉ đọc.' };
  if (/\b(insert|update|delete|drop|alter|create|replace|attach|detach|pragma|vacuum|reindex)\b/i.test(sk)) {
    return { ok: false, why: 'Câu SQL có lệnh ghi hoặc lệnh quản trị. Công cụ này chỉ đọc.' };
  }
  const n = Math.max(1, Math.min(MAX_LIMIT, Number.isInteger(limit) ? limit : DEFAULT_LIMIT));
  const wrapped = /\blimit\s+\d+/i.test(sk) ? sql : `SELECT * FROM (${sql}) LIMIT ${n}`;
  return { ok: true, sql: wrapped, limit: n };
}

function openReadOnly(root) {
  const sqlite = sqliteOrNull();
  if (!sqlite) return { error: 'Bản Node này không có node:sqlite, không tra được sổ.' };
  const file = P.ledgerPath(root);
  if (!fs.existsSync(file)) return { error: 'Chưa có sổ phiên (harness.db): chưa phiên nào ghi gì.' };
  let db;
  try {
    db = new sqlite.DatabaseSync(file, { readOnly: true });
    db.exec('PRAGMA busy_timeout = 3000;');
  } catch (e) {
    return { error: `Không mở được sổ phiên: ${String(e.message).split('\n')[0]}` };
  }
  try {
    const c = sqlite.constants;
    if (typeof db.setAuthorizer === 'function' && c) {
      const okCodes = new Set([c.SQLITE_SELECT, c.SQLITE_READ, c.SQLITE_RECURSIVE, c.SQLITE_FUNCTION]);
      db.setAuthorizer((code) => (okCodes.has(code) ? c.SQLITE_OK : c.SQLITE_DENY));
    }
  } catch { /* bản Node không có: hai lớp còn lại vẫn giữ */ }
  return { db };
}

const cell = (v) => {
  if (v === null || v === undefined) return '';
  const one = String(v).replace(/\s+/g, ' ');
  return one.length > MAX_CELL ? `${one.slice(0, MAX_CELL)}…` : one;
};

// Sơ đồ gọn của các bảng act_, rec_ và sessions: để model viết đúng câu ngay lần đầu.
// Đọc bằng lớp mở chung nhưng TRƯỚC khi gắn bộ cấp phép chặt, nên dùng kết nối riêng không gắn.
function schemaText(root) {
  const sqlite = sqliteOrNull();
  if (!sqlite) return 'Bản Node này không có node:sqlite.';
  const file = P.ledgerPath(root);
  if (!fs.existsSync(file)) return 'Chưa có sổ phiên (harness.db).';
  let db;
  try {
    db = new sqlite.DatabaseSync(file, { readOnly: true });
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND (name LIKE 'act\\_%' ESCAPE '\\' OR name LIKE 'rec\\_%' ESCAPE '\\' OR name = 'sessions') ORDER BY name").all();
    return tables.map((t) => `${t.name}(${db.prepare(`SELECT name FROM pragma_table_info('${t.name}')`).all().map((c) => c.name).join(', ')})`).join('\n');
  } catch (e) {
    return `Không đọc được sơ đồ bảng: ${String(e.message).split('\n')[0]}`;
  } finally { try { if (db) db.close(); } catch { /* bỏ qua */ } }
}

// Chạy câu SELECT; trả văn bản dạng bảng (cột ngăn bằng " | "). Ném lỗi có lời nói rõ khi bị từ chối.
function run(root, rawSql, limit) {
  if (!String(rawSql || '').trim()) return `Chưa có câu SQL. Bảng của sổ phiên:\n${schemaText(root)}`;
  const c = check(rawSql, limit);
  if (!c.ok) throw new Error(c.why);
  const o = openReadOnly(root);
  if (o.error) throw new Error(o.error);
  try {
    const rows = o.db.prepare(c.sql).all();
    if (!rows.length) return '(không có dòng nào)';
    const cols = Object.keys(rows[0]);
    const out = [cols.join(' | ')];
    for (const r of rows) out.push(cols.map((k) => cell(r[k])).join(' | '));
    out.push(`(${rows.length} dòng${rows.length >= c.limit ? `, đã đủ giới hạn ${c.limit}: thêm điều kiện hoặc LIMIT để xem tiếp` : ''})`);
    return out.join('\n');
  } catch (e) {
    throw new Error(`Lỗi SQL: ${String(e.message).split('\n')[0]}`);
  } finally { try { o.db.close(); } catch { /* bỏ qua */ } }
}

module.exports = { run, check, schemaText, DEFAULT_LIMIT, MAX_LIMIT };
