'use strict';
// Kho bí mật dự phòng: tệp chữ thường quyền 600 ở %USERPROFILE%/.claude/secrets/<tên>.secret, ngoài cây dự án. KHÔNG mã hóa:
// chỉ dùng khi máy không có kho của hệ điều hành; lệnh secret status nói rõ điều đó.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const NAME_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const dir = () => process.env.BSN_SECRETS_DIR || path.join(os.homedir(), '.claude', 'secrets');
const fileOf = (name) => { if (!NAME_RE.test(name)) throw new Error(`tên bí mật không hợp lệ: ${name}`); return path.join(dir(), `${name}.secret`); };

function set(name, value) {
  if (!value) throw new Error('bí mật rỗng');
  const file = fileOf(name);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, value, { mode: 0o600 });
  fs.renameSync(tmp, file);
  try { fs.chmodSync(file, 0o600); } catch { /* Windows: quyền theo ACL */ }
  return file;
}
function get(name) { try { return fs.readFileSync(fileOf(name), 'utf8'); } catch { return ''; } }
const has = (name) => { try { return fs.statSync(fileOf(name)).size > 0; } catch { return false; } };
function remove(name) { try { fs.rmSync(fileOf(name), { force: true }); return true; } catch { return false; } }

module.exports = { kind: 'file-0600', secure: false, available: () => true, set, get, has, remove, fileOf };
