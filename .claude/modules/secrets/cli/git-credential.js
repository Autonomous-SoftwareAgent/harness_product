'use strict';
// Trình cấp mật khẩu (credential helper) của git cho github.com, token lấy từ kho bí mật. Cài bằng `cli.js secret setup-git` (bật useHttpPath
// để git gửi kèm đường dẫn repo). Lệnh vẫn là `git push`/`git fetch` bình thường nên mọi hook chặn đẩy vẫn xét như cũ.
// Trong phiên Claude (có CLAUDE_CODE_SESSION_ID): chỉ trả token cho repo nằm trong phạm vi kế hoạch đang duyệt của phiên đó, hoặc repo của
// một đơn vị trong dự án (để đọc). Việc đẩy có được không là việc của hook guard-github (theo dòng "Được làm"). Người dùng chạy tay: không giới hạn.
const policy = require('../core/secrets/policy');
const gh = require('../adapters/secrets/github');
const { ROOT, scopeFor } = require('./github');

function parseInput(text) {
  const kv = {};
  for (const line of String(text).split(/\r?\n/)) { const i = line.indexOf('='); if (i > 0) kv[line.slice(0, i)] = line.slice(i + 1); }
  return kv;
}
// Trả chữ cần in cho git ('' = không cấp).
function answer(kv, { root = ROOT, sid = process.env.CLAUDE_CODE_SESSION_ID || '', token = gh.token } = {}) {
  if (kv.host !== 'github.com' || (kv.protocol && kv.protocol !== 'https')) return '';
  const t = token();
  if (!t) return '';
  if (sid) {
    const repo = String(kv.path || '').replace(/\.git$/i, '').toLowerCase();
    const scope = scopeFor(root, sid);
    const target = { kind: 'repo', id: repo };
    const ok = repo && (policy.covers(scope, target) || (scope.readAll || scope.targets).some((s) => s.id === repo));
    gh.audit(root, { sid, what: 'git credential', on: repo || '(không rõ repo)', action: 'git', ok: Boolean(ok), why: ok ? '' : 'repo ngoài phạm vi kế hoạch' });
    if (!ok) return '';
  }
  return `username=x-access-token\npassword=${t}\n`;
}

if (require.main === module) {
  if (process.argv[2] !== 'get') process.exit(0);
  let input = '';
  process.stdin.on('data', (d) => { input += d; });
  process.stdin.on('end', () => { try { const out = answer(parseInput(input)); if (out) process.stdout.write(out); } catch { /* không cấp */ } });
}

module.exports = { answer, parseInput };
