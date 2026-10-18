'use strict';
// Kho bí mật trên Linux: Secret Service (GNOME Keyring, KWallet) qua lệnh `secret-tool`. Giá trị đi qua stdin.
const { spawnSync } = require('node:child_process');

const NAME_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const run = (args, input) => spawnSync('secret-tool', args, { input, encoding: 'utf8' });
const check = (name) => { if (!NAME_RE.test(name)) throw new Error(`tên bí mật không hợp lệ: ${name}`); };
const available = () => process.platform === 'linux' && !run(['--version']).error;

function set(name, value) {
  check(name);
  if (!value) throw new Error('bí mật rỗng');
  const r = run(['store', '--label', `harness ${name}`, 'service', 'harness', 'name', name], value);
  if (r.status !== 0) throw new Error(`secret-tool store lỗi: ${String(r.stderr || '').trim().slice(0, 200)}`);
  return `secret-service:harness/${name}`;
}
function get(name) { check(name); const r = run(['lookup', 'service', 'harness', 'name', name]); return r.status === 0 ? String(r.stdout || '') : ''; }
const has = (name) => Boolean(get(name));
function remove(name) { check(name); run(['clear', 'service', 'harness', 'name', name]); return true; }

module.exports = { kind: 'linux-secret-tool', secure: true, available, set, get, has, remove };
