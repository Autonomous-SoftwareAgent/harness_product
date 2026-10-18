'use strict';
// Lệnh dòng lệnh của khối bí mật, góp vào bảng lệnh của cli.js qua khóa `commands` trong secrets/module.json.
//   secret status [--fresh]     token còn dùng được không, còn bao nhiêu ngày, quyền thừa hay thiếu, kho nào, lần dùng cuối
//   secret audit [N]            N dòng cuối của sổ dùng (không có token)
//   secret set [--accept-excess]   NGƯỜI DÙNG nạp token (gõ không hiện chữ); từ chối trong phiên Claude; từ chối token có quyền thừa
//   secret rotate               như set, kèm mở trang tạo token và nhắc thu hồi token cũ
//   secret revoke               NGƯỜI DÙNG xóa token khỏi kho ở máy; mở trang thu hồi trên GitHub
//   secret migrate              chuyển GH_TOKEN từ .env ở gốc dự án vào kho, so khớp, bỏ dòng khỏi .env
//   secret setup-git [repo...]  cài trình cấp mật khẩu cho github.com vào các repo (mặc định: repo của mọi đơn vị có remote GitHub)
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const NEW_TOKEN_URL = 'https://github.com/settings/tokens/new?scopes=repo,workflow&description=harness';
const TOKENS_URL = 'https://github.com/settings/tokens';
const inSession = () => Boolean(process.env.CLAUDECODE || process.env.CLAUDE_CODE_SESSION_ID);
const REFUSE = 'Lệnh này chỉ người dùng chạy, trong terminal của chính họ (không trong phiên Claude): token không bao giờ đi qua phiên.';

// Đọc một dòng không hiện chữ từ terminal.
function askHidden(prompt) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) { reject(new Error('cần chạy trong terminal (stdin không phải TTY)')); return; }
    process.stdout.write(prompt);
    const stdin = process.stdin;
    stdin.setRawMode(true); stdin.resume(); stdin.setEncoding('utf8');
    let v = '';
    const onData = (ch) => {
      if (ch === '\r' || ch === '\n' || ch === '\u0004') { stdin.setRawMode(false); stdin.pause(); stdin.removeListener('data', onData); process.stdout.write('\n'); resolve(v.trim()); }
      else if (ch === '\u0003') { stdin.setRawMode(false); process.exit(130); }
      else if (ch === '\u007f' || ch === '\b') v = v.slice(0, -1);
      else v += ch;
    };
    stdin.on('data', onData);
  });
}
const openUrl = (url) => { try { spawnSync(process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open', process.platform === 'win32' ? ['/c', 'start', '', url] : [url], { stdio: 'ignore' }); } catch { /* in địa chỉ là đủ */ } };

function register(on, { argv, cmdRel }) {
  const github = () => require('../github');
  const gh = () => require('../../adapters/secrets/github');
  const policy = () => require('../../core/secrets/policy');
  const done = (r) => { console.log(r.text); if (!r.ok) process.exitCode = 1; };

  async function setToken({ rotate }) {
    if (inSession()) return { ok: false, text: REFUSE };
    if (rotate) { console.log(`Mở trang tạo token (chỉ tick repo và workflow): ${NEW_TOKEN_URL}`); openUrl(NEW_TOKEN_URL); }
    const value = await askHidden('Dán token GitHub (không hiện chữ), Enter: ');
    if (!value) return { ok: false, text: 'Không có token nào được nhập; kho giữ nguyên.' };
    const s = gh().store();
    const old = s.get(gh().NAME);
    s.set(gh().NAME, value);
    const info = await gh().tokenInfo();
    const h = policy().tokenHealth(info, github().conf(github().ROOT), Date.now());
    const excess = Array.isArray(info.scopes) ? info.scopes.filter((x) => (github().conf(github().ROOT).excessScopes || []).includes(x)) : [];
    if (!info.ok || (excess.length && !argv.includes('--accept-excess'))) {
      if (old) s.set(gh().NAME, old); else s.remove(gh().NAME);
      return { ok: false, text: !info.ok ? `GitHub không nhận token mới (${info.error}); kho giữ token cũ.` : `Token mới có quyền thừa: ${excess.join(', ')}. Tạo token chỉ có repo, workflow (${NEW_TOKEN_URL}), hoặc chạy lại với --accept-excess nếu chấp nhận. Kho giữ token cũ.` };
    }
    gh().saveInfo(github().ROOT, info);
    gh().audit(github().ROOT, { sid: '', what: rotate ? 'secret rotate' : 'secret set', on: info.login, action: 'secret', ok: true });
    return { ok: true, text: `Đã cất token vào kho (${s.kind}). ${h.lines.join('; ')}.${rotate && old ? ` Nhớ thu hồi token cũ trên GitHub: ${TOKENS_URL}` : ''}` };
  }

  on('secret', () => {
    const sub = argv[1] || 'status';
    if (sub === 'status') return github().health(github().ROOT, { fresh: argv.includes('--fresh') }).then((h) => done({ ok: h.level !== 'bad', text: github().healthText(h) }));
    if (sub === 'audit') {
      const n = Number(argv[2]) || 30;
      const rows = gh().auditRows(github().ROOT, n);
      return done({ ok: true, text: rows.length ? rows.map((r) => `${new Date(r.at).toISOString().replace('T', ' ').slice(0, 19)} · ${r.sid ? r.sid.slice(0, 8) : 'người dùng'} · ${r.what} · ${r.on || '-'} · ${r.ok ? 'được' : `CHẶN: ${r.why || ''}`}`).join('\n') : 'Sổ dùng còn trống.' });
    }
    if (sub === 'set' || sub === 'rotate') return setToken({ rotate: sub === 'rotate' }).then(done, (e) => done({ ok: false, text: `Lỗi: ${e.message}` }));
    if (sub === 'revoke') {
      if (inSession()) return done({ ok: false, text: REFUSE });
      gh().store().remove(gh().NAME);
      try { fs.rmSync(path.join(require('../../../core/gate/gate-paths').stateDir(github().ROOT), 'secrets-token.json'), { force: true }); } catch { /* bỏ qua */ }
      gh().audit(github().ROOT, { sid: '', what: 'secret revoke', on: '', action: 'secret', ok: true });
      openUrl(TOKENS_URL);
      return done({ ok: true, text: `Đã xóa token khỏi kho ở máy. Thu hồi hẳn trên GitHub (không làm được qua API): ${TOKENS_URL}` });
    }
    if (sub === 'migrate') return done(migrate(github().ROOT, gh()));
    if (sub === 'setup-git') return done(setupGit(github().ROOT, gh(), argv.slice(2)));
    return done({ ok: false, text: `Dùng: node ${cmdRel} secret <status [--fresh]|audit [N]|set [--accept-excess]|rotate|revoke|migrate|setup-git [repo...]>` });
  });
}

// Chuyển GH_TOKEN từ .env ở gốc dự án vào kho; đọc ngược so khớp; bỏ dòng khỏi .env. Không in token.
function migrate(root, gh) {
  const envFile = path.join(root, '.env');
  let text = '';
  try { text = fs.readFileSync(envFile, 'utf8'); } catch { return { ok: gh.store().has(gh.NAME), text: 'Không có .env ở gốc dự án.' }; }
  const line = text.split(/\r?\n/).find((l) => /^\s*(?:export\s+)?GH_TOKEN\s*=/.test(l));
  const value = line ? line.replace(/^\s*(?:export\s+)?GH_TOKEN\s*=\s*/, '').trim().replace(/^(['"])(.*)\1$/, '$2') : '';
  if (!value) return { ok: gh.store().has(gh.NAME), text: gh.store().has(gh.NAME) ? 'Kho đã có token; .env không còn GH_TOKEN.' : 'Không có GH_TOKEN trong .env để chuyển.' };
  const s = gh.store();
  s.set(gh.NAME, value);
  if (s.get(gh.NAME) !== value) return { ok: false, text: 'Ghi vào kho xong nhưng đọc ngược KHÔNG khớp; .env giữ nguyên.' };
  const kept = text.split(/\r?\n/).filter((l) => !/^\s*(?:export\s+)?GH_TOKEN\s*=/.test(l)).join('\n');
  fs.writeFileSync(envFile, `${kept.replace(/\s*$/, '\n')}# GH_TOKEN đã chuyển vào kho bí mật (cli.js secret status).\n`);
  return { ok: true, text: `Đã chuyển token vào kho (${s.kind}); đọc ngược khớp; đã bỏ GH_TOKEN khỏi .env.` };
}

// Cài trình cấp mật khẩu cho github.com vào cấu hình cục bộ của repo (useHttpPath để biết repo nào).
function setupGit(root, gh, repos) {
  const P = require('../../../core/gate/gate-paths');
  const dirs = repos.length ? repos.map((r) => path.resolve(r)) : [...new Set([...Object.values(P.unitDirs(root)), ...P.unitParents(root).flatMap((p) => { const b = path.join(P.workspaceRoot(root), p); try { return fs.readdirSync(b, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => path.join(b, e.name)); } catch { return []; } })])].filter((d) => fs.existsSync(path.join(d, '.git')) && gh.remoteOf(d));
  if (!dirs.length) return { ok: false, text: 'Không thấy repo nào có remote github.com.' };
  const helper = `!node "${path.join(__dirname, '..', 'git-credential.js').split(path.sep).join('/')}"`;
  const key = 'credential.https://github.com';
  const lines = dirs.map((d) => {
    spawnSync('git', ['-C', d, 'config', '--local', '--unset-all', `${key}.helper`]);
    const ok = [['--add', `${key}.helper`, ''], ['--add', `${key}.helper`, helper], ['--replace-all', `${key}.useHttpPath`, 'true']].every((a) => spawnSync('git', ['-C', d, 'config', '--local', ...a]).status === 0);
    return `  ${path.relative(root, d).split(path.sep).join('/')}: ${ok ? 'đã cài' : 'LỖI'}`;
  });
  return { ok: lines.every((l) => !/LỖI/.test(l)), text: ['Trình cấp mật khẩu GitHub của harness (token từ kho bí mật):', ...lines].join('\n') };
}

module.exports = { register, migrate, setupGit };
