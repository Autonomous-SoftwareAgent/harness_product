'use strict';
// Làm việc thật với GitHub và kho bí mật cho khối bí mật: lấy token từ kho, hỏi GitHub về token, chạy lệnh gh với token (che token
// trong đầu ra), đọc remote của các đơn vị, đọc kế hoạch đang duyệt của một phiên, ghi sổ dùng (không ghi token). Không quyết định gì:
// cho hay chặn là việc của core/secrets/policy.js, ghép ở cửa vào (cli/github.js).
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const P = require('../../../core/gate/gate-paths');
const stores = require('./index');

const NAME = 'github';
const store = () => stores.pick();
const token = () => { try { return store().get(NAME) || ''; } catch { return ''; } };
const scrub = (text, t = token()) => (t ? String(text).split(t).join('***') : String(text));

// Cấu hình của dự án (.claude/project/secrets.json, không chứa bí mật). Không có thì {}.
function projectConfig(root) { try { return JSON.parse(fs.readFileSync(path.join(P.projectDir(root), 'secrets.json'), 'utf8')); } catch { return {}; } }

// ---------- sổ dùng ----------
const auditFile = (root) => path.join(P.stateDir(root), 'secrets-audit.jsonl');
function audit(root, row) {
  try { fs.mkdirSync(P.stateDir(root), { recursive: true }); fs.appendFileSync(auditFile(root), `${JSON.stringify({ at: Date.now(), ...row })}\n`); } catch { /* sổ hỏng không đổi quyết định */ }
}
function auditRows(root, limit = 50) {
  try { return fs.readFileSync(auditFile(root), 'utf8').split('\n').filter(Boolean).slice(-limit).map((l) => JSON.parse(l)); } catch { return []; }
}

// ---------- remote và kế hoạch ----------
function remoteOf(dir) {
  const r = spawnSync('git', ['-C', dir, 'remote', 'get-url', 'origin'], { encoding: 'utf8' });
  const m = /github\.com[/:]([^/\s]+\/[^/\s]+?)(?:\.git)?\s*$/i.exec(String(r.stdout || '').trim());
  return m ? m[1].toLowerCase() : '';
}
// Địa chỉ của một remote (tên) trong repo ở `dir`; '' nếu không có.
const remoteUrl = (dir, name = 'origin') => String(spawnSync('git', ['-C', dir, 'remote', 'get-url', name], { encoding: 'utf8' }).stdout || '').trim();
// { đơn vị: "chủ/tên" } của mọi đơn vị có remote origin trên github.com.
function unitRepos(root) {
  const out = {};
  for (const [name, dir] of Object.entries(P.unitDirs(root))) if (fs.existsSync(path.join(dir, '.git'))) { const r = remoteOf(dir); if (r) out[name] = r; }
  for (const parent of P.unitParents(root)) {
    const base = path.join(P.workspaceRoot(root), parent);
    let names = [];
    try { names = fs.readdirSync(base, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name); } catch { /* chưa có */ }
    for (const n of names) if (!out[n] && fs.existsSync(path.join(base, n, '.git'))) { const r = remoteOf(path.join(base, n)); if (r) out[n] = r; }
  }
  return out;
}
// Kế hoạch đang duyệt của phiên `sid` (đọc trạng thái cổng): kết quả parsePlan, hoặc null khi cổng đóng.
function approvedPlan(root, sid) {
  if (!sid) return null;
  try {
    const st = require('../../../core/gate/gate-state').loadState(root, sid);
    if (!st.open || !st.approved || !st.approved.plan) return null;
    return require('../../../core/gate/plan-format').parsePlan(st.approved.plan);
  } catch { return null; }
}

// ---------- token ----------
// Hỏi GitHub về token (không in token): { present, ok, login, expiresAt, scopes | null, error }.
async function tokenInfo() {
  const t = token();
  if (!t) return { present: false };
  try {
    const res = await fetch('https://api.github.com/user', { headers: { Authorization: `Bearer ${t}`, 'User-Agent': 'harness-secrets', Accept: 'application/vnd.github+json' } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { present: true, ok: false, error: `HTTP ${res.status} ${scrub(body.message || '', t)}` };
    const exp = res.headers.get('github-authentication-token-expiration');
    const scopes = res.headers.get('x-oauth-scopes');
    return { present: true, ok: true, login: body.login, expiresAt: exp ? Date.parse(exp.replace(' UTC', 'Z').replace(' ', 'T')) : 0, scopes: scopes === null ? null : scopes.split(',').map((s) => s.trim()).filter(Boolean) };
  } catch (e) { return { present: true, ok: false, error: `không gọi được GitHub: ${e.message}` }; }
}
// Bản tạm của tokenInfo (6 giờ) trong .claude/.state, không chứa token.
const cacheFile = (root) => path.join(P.stateDir(root), 'secrets-token.json');
function cachedInfo(root, maxAgeMs = 6 * 3600 * 1000) {
  try { const c = JSON.parse(fs.readFileSync(cacheFile(root), 'utf8')); return Date.now() - c.checkedAt < maxAgeMs && c.storeKind === store().kind ? c.info : null; } catch { return null; }
}
function saveInfo(root, info) {
  try { fs.mkdirSync(P.stateDir(root), { recursive: true }); fs.writeFileSync(cacheFile(root), JSON.stringify({ checkedAt: Date.now(), storeKind: store().kind, info })); } catch { /* bỏ qua */ }
}

// Chạy gh với token; trả { status, text } đã che token, hoặc { error }.
function execGh(argv, { exec = spawnSync } = {}) {
  const t = token();
  if (!t) return { error: 'no-token' };
  // BSN_GH_BIN: lệnh gh khác (tệp .js thì chạy bằng node), như BSN_CLAUDE_BIN; để test và ảnh chụp hành vi không gọi mạng.
  const bin = process.env.BSN_GH_BIN || 'gh';
  const [cmd, args] = /\.js$/i.test(bin) ? [process.execPath, [bin, ...argv]] : [bin, argv];
  const r = exec(cmd, args, { encoding: 'utf8', env: { ...process.env, GH_TOKEN: t, GITHUB_TOKEN: t, GH_PROMPT_DISABLED: '1', GH_NO_UPDATE_NOTIFIER: '1' }, maxBuffer: 16 * 1024 * 1024 });
  if (r.error) return { error: r.error.message };
  const out = scrub(`${r.stdout || ''}${r.stderr || ''}`, t).trimEnd();
  return { status: r.status, text: out.length > 60000 ? `${out.slice(0, 60000)}\n... (cắt bớt)` : out };
}

module.exports = { NAME, store, token, scrub, projectConfig, audit, auditRows, remoteOf, remoteUrl, unitRepos, approvedPlan, tokenInfo, cachedInfo, saveInfo, execGh };
