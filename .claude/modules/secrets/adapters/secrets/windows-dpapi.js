'use strict';
// Kho bí mật trên Windows: mã hóa bằng DPAPI của tài khoản Windows đang đăng nhập (ConvertFrom-SecureString), cất ở
// %USERPROFILE%\.claude\secrets\<tên>.dpapi, ngoài cây dự án. Bí mật đi qua đầu vào chuẩn của PowerShell, không nằm trong tham số lệnh.
// Giới hạn: tiến trình nào chạy dưới cùng tài khoản Windows cũng giải mã được; đây là chỗ cất tốt hơn tệp chữ thường, không phải két tuyệt đối.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const NAME_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const dir = () => process.env.BSN_SECRETS_DIR || path.join(os.homedir(), '.claude', 'secrets');
const fileOf = (name) => {
  if (!NAME_RE.test(name)) throw new Error(`tên bí mật không hợp lệ: ${name}`);
  return path.join(dir(), `${name}.dpapi`);
};
const available = () => process.platform === 'win32';

function ps(script, input) {
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], { input, encoding: 'utf8', windowsHide: true });
  if (r.error) throw new Error(`không chạy được PowerShell: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`PowerShell báo lỗi (mã ${r.status}): ${String(r.stderr || '').trim().split('\n')[0].slice(0, 200)}`);
  return String(r.stdout || '');
}

// Ghi bí mật `value` dưới tên `name`. Ghi qua tệp tạm rồi đổi tên.
function set(name, value) {
  if (!available()) throw new Error('kho DPAPI chỉ có trên Windows');
  if (!value) throw new Error('bí mật rỗng');
  const blob = ps('$v = [Console]::In.ReadToEnd(); ConvertTo-SecureString -String $v -AsPlainText -Force | ConvertFrom-SecureString', value).trim();
  if (!/^[0-9a-f]+$/i.test(blob)) throw new Error('DPAPI không trả bản mã hóa hợp lệ');
  const file = fileOf(name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${blob}\n`, { mode: 0o600 });
  fs.renameSync(tmp, file);
  return file;
}

// Đọc bí mật; chưa có thì ''.
function get(name) {
  if (!available()) return '';
  let blob = '';
  try { blob = fs.readFileSync(fileOf(name), 'utf8').trim(); } catch { return ''; }
  if (!blob) return '';
  const out = ps('$b = [Console]::In.ReadToEnd().Trim(); $s = ConvertTo-SecureString -String $b; $p = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s); try { [Console]::Out.Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($p)) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p) }', blob);
  return out;
}

const has = (name) => { try { return fs.statSync(fileOf(name)).size > 0; } catch { return false; } };
function remove(name) { try { fs.rmSync(fileOf(name), { force: true }); return true; } catch { return false; } }

module.exports = { kind: 'windows-dpapi', secure: true, available, set, get, has, remove, fileOf };
