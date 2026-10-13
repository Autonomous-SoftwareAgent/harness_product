'use strict';
// spec: PORT-S-002
// BỘ CHUYỂN PostgreSQL: bộ đọc cấu trúc dữ liệu cho sơ đồ dữ liệu tự sinh (diagram_generate). Hiện có một bộ đọc: PostgreSQL.
// Cách làm (không đụng cơ sở dữ liệu của hệ đang chạy):
//   1. tạo MỘT cơ sở dữ liệu tạm, trống, và một tài khoản tạm trên PostgreSQL local của máy (chạy trong Docker);
//   2. chạy LỆNH TẠO BẢNG của dịch vụ (mã ở thư mục dịch vụ) trỏ vào cơ sở dữ liệu tạm đó;
//   3. hỏi PostgreSQL cấu trúc thật: bảng, cột, kiểu, khóa chính, ràng buộc duy nhất, khóa ngoại;
//   4. xóa cơ sở dữ liệu tạm và tài khoản tạm (kể cả khi bước 2 hay 3 hỏng).
// Lệnh của dịch vụ chạy KHÔNG qua shell, chỉ nhận trình thông dịch trong danh sách cho phép. Mật khẩu tạm sinh ngẫu nhiên, chỉ sống
// trong tiến trình này, không ghi ra tệp hay nhật ký.
// Thêm loại cơ sở dữ liệu khác (MongoDB, ClickHouse...) = thêm một bộ đọc trả cùng dạng { tables: [...] }; loại sơ đồ và trang không đổi.
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const PG = () => ({
  container: process.env.BSN_PG_CONTAINER || 'bsn-postgres',
  admin: process.env.BSN_PG_ADMIN || 'bsn',
  host: process.env.BSN_PG_HOST || '127.0.0.1',
  port: process.env.BSN_PG_PORT || '55440',
});
const INTERPRETERS = ['node', 'python', 'python3', 'py', 'uv'];
const SYSTEM_SCHEMAS = "('pg_catalog', 'information_schema', 'pg_toast')";

const STRUCTURE_SQL = `
WITH rel AS (
  SELECT c.oid, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r', 'p') AND n.nspname NOT IN ${SYSTEM_SCHEMAS}
), cols AS (
  SELECT r.relname AS tbl, a.attname AS name, a.attnum AS num, format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull AS required
  FROM rel r JOIN pg_attribute a ON a.attrelid = r.oid WHERE a.attnum > 0 AND NOT a.attisdropped
), cons AS (
  SELECT r.relname AS tbl, con.contype AS kind, con.conname AS name,
    (SELECT json_agg(a.attname ORDER BY k.ord) FROM unnest(con.conkey) WITH ORDINALITY k(num, ord) JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.num) AS cols,
    (SELECT relname FROM pg_class WHERE oid = con.confrelid) AS ftable,
    (SELECT json_agg(a.attname ORDER BY k.ord) FROM unnest(con.confkey) WITH ORDINALITY k(num, ord) JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k.num) AS fcols
  FROM pg_constraint con JOIN rel r ON r.oid = con.conrelid WHERE con.contype IN ('p', 'u', 'f')
)
SELECT json_build_object(
  'columns', (SELECT coalesce(json_agg(json_build_object('table', tbl, 'name', name, 'type', type, 'notnull', required) ORDER BY tbl, num), '[]'::json) FROM cols),
  'constraints', (SELECT coalesce(json_agg(json_build_object('table', tbl, 'kind', kind, 'name', name, 'cols', cols, 'ftable', ftable, 'fcols', fcols) ORDER BY tbl, name), '[]'::json) FROM cons)
)`;

function psql(db, sql) {
  const pg = PG();
  const r = spawnSync('docker', ['exec', pg.container, 'psql', '-U', pg.admin, '-d', db, '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql],
    { encoding: 'utf8', timeout: 60000, windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  if (r.error) throw new Error(`không gọi được docker (${r.error.message}). Bộ đọc cần một PostgreSQL local đang chạy trong Docker (tên container: biến BSN_PG_CONTAINER).`);
  if (r.status !== 0) throw new Error(`PostgreSQL local (${pg.container}) trả lỗi: ${(r.stderr || '').trim().slice(0, 300) || `mã thoát ${r.status}`}. Container PostgreSQL đó đã chạy chưa?`);
  return r.stdout;
}

function checkCommand(command) {
  if (!Array.isArray(command) || !command.length || command.some((x) => typeof x !== 'string')) throw new Error('command phải là danh sách chuỗi (lệnh và các đối số), không rỗng');
  if (!INTERPRETERS.includes(command[0])) throw new Error(`command[0] phải là một trong: ${INTERPRETERS.join(', ')} (lệnh chạy không qua shell, trong thư mục dịch vụ)`);
}

// Chạy lệnh tạo bảng của dịch vụ vào một cơ sở dữ liệu tạm rồi trả cấu trúc thô { columns: [...], constraints: [...] }.
function readPostgres({ command, url_env: urlEnv, url_format: urlFormat, cwd }) {
  checkCommand(command);
  if (!/^[A-Z][A-Z0-9_]{1,59}$/.test(urlEnv || '')) throw new Error('url_env phải là tên biến môi trường (chữ hoa, số, gạch dưới)');
  for (const k of ['{user}', '{password}', '{host}', '{port}', '{db}']) if (!String(urlFormat || '').includes(k)) throw new Error(`url_format thiếu ${k} (ví dụ: postgres://{user}:{password}@{host}:{port}/{db})`);
  const pg = PG();
  const tag = crypto.randomBytes(6).toString('hex');
  const db = `bsn_schema_${tag}`;
  const role = `bsn_schema_${tag}`;
  const password = crypto.randomBytes(18).toString('hex');
  const url = urlFormat.replace('{user}', role).replace('{password}', password).replace('{host}', pg.host).replace('{port}', pg.port).replace('{db}', db);
  psql('postgres', `CREATE ROLE ${role} LOGIN PASSWORD '${password}'`);
  try {
    psql('postgres', `CREATE DATABASE ${db} OWNER ${role}`);
    const run = spawnSync(command[0], command.slice(1), { cwd, env: { ...process.env, [urlEnv]: url }, encoding: 'utf8', timeout: 120000, windowsHide: true, shell: false, maxBuffer: 16 * 1024 * 1024 });
    const scrub = (s) => String(s || '').split(password).join('***');
    if (run.error) throw new Error(`lệnh tạo bảng không chạy được: ${scrub(run.error.message)}`);
    if (run.status !== 0) throw new Error(`lệnh tạo bảng thoát mã ${run.status}: ${scrub(run.stderr || run.stdout).trim().slice(-600)}`);
    return JSON.parse(psql(db, STRUCTURE_SQL));
  } finally {
    try { psql('postgres', `DROP DATABASE IF EXISTS ${db} WITH (FORCE)`); } catch { /* dọn hết sức */ }
    try { psql('postgres', `DROP ROLE IF EXISTS ${role}`); } catch { /* dọn hết sức */ }
  }
}

const READ = { postgres: readPostgres };

module.exports = { READ, readPostgres, checkCommand, INTERPRETERS, STRUCTURE_SQL };
