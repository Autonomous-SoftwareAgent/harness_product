'use strict';
// Kho bí mật trên macOS: Keychain của người dùng qua lệnh `security` (dịch vụ "harness", tài khoản = tên bí mật).
// Giá trị đưa vào bằng -w ở cuối dòng lệnh sẽ hiện trong danh sách tiến trình một thoáng; `security` không nhận giá trị qua stdin
// khi có -w kèm giá trị, nên dùng -w không giá trị và đưa qua stdin (security hỏi mật khẩu hai lần).
const { spawnSync } = require('node:child_process');

const NAME_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const SERVICE = 'harness';
const run = (args, input) => spawnSync('security', args, { input, encoding: 'utf8' });
const check = (name) => { if (!NAME_RE.test(name)) throw new Error(`tên bí mật không hợp lệ: ${name}`); };
const available = () => process.platform === 'darwin' && !run(['help']).error;

function set(name, value) {
  check(name);
  if (!value) throw new Error('bí mật rỗng');
  const r = run(['add-generic-password', '-U', '-s', SERVICE, '-a', name, '-w'], `${value}\n${value}\n`);
  if (r.status !== 0) throw new Error(`security add-generic-password lỗi: ${String(r.stderr || '').trim().slice(0, 200)}`);
  return `keychain:${SERVICE}/${name}`;
}
function get(name) { check(name); const r = run(['find-generic-password', '-s', SERVICE, '-a', name, '-w']); return r.status === 0 ? String(r.stdout || '').replace(/\n$/, '') : ''; }
const has = (name) => { check(name); return run(['find-generic-password', '-s', SERVICE, '-a', name]).status === 0; };
function remove(name) { check(name); const r = run(['delete-generic-password', '-s', SERVICE, '-a', name]); return r.status === 0 || r.status === 44; }

module.exports = { kind: 'macos-keychain', secure: true, available, set, get, has, remove };
