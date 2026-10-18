'use strict';
// Luật của khối bí mật, viết thành hàm thuần (không đọc đĩa, không gọi mạng):
//   - xếp một lệnh `gh` (kể cả `gh api`) thành { targets, action }: đối tượng là repo "chủ/tên", tổ chức "org:<tên>" hay "tài khoản";
//     việc là 'read' (đọc thường) hoặc một món của dòng "Được làm" (push, tag, deploy, rollback, delete, overwrite, create, admin);
//   - phạm vi của một phiên theo kế hoạch đang duyệt: repo của các đơn vị ở mục Dịch vụ cộng đối tượng ở dòng GitHub;
//   - quyết định cho / chặn kèm lời nói thiếu gì trong kế hoạch;
//   - tình trạng token: còn bao nhiêu ngày, quyền thừa, quyền thiếu.
// Không suy ra được đối tượng thì chặn (lời nói phải nêu -R hay đường dẫn rõ). Nghi ngờ thì xếp chặt hơn (quản trị), không xếp vào đọc.

const LABEL = { read: 'đọc', commit: 'commit', push: 'đẩy', tag: 'gắn nhãn', deploy: 'deploy', rollback: 'quay lui', delete: 'xóa', overwrite: 'ghi đè', create: 'tạo repo', admin: 'quản trị', gate: 'sửa cổng duyệt' };
const REPO_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100}$/;
const lc = (s) => String(s || '').toLowerCase();
const repoT = (r) => ({ kind: 'repo', id: lc(r).replace(/\.git$/, '') });
const orgT = (o) => ({ kind: 'org', id: lc(o) });
const ACCOUNT = { kind: 'account', id: 'account' };
const show = (t) => (t.kind === 'repo' ? t.id : t.kind === 'org' ? `org:${t.id}` : 'tài khoản');

// ---------- gh api ----------
// Đọc nhạy cảm (secret, khóa, webhook, thành viên, nhật ký kiểm toán, cài đặt) tính là quản trị.
const SENSITIVE_READ = /\/(?:actions\/(?:secrets|variables)|dependabot\/secrets|codespaces\/secrets|environments\/[^/]+\/(?:secrets|variables)|hooks|keys|collaborators|invitations|members|memberships|outside_collaborators|audit-log|credential-authorizations|personal-access-tokens|settings|installations|blocks|teams\/[^/]+\/members)(?:\/|$)/;
function apiAction(method, sub) {
  if (method === 'GET' || method === 'HEAD') return SENSITIVE_READ.test(sub) ? 'admin' : 'read';
  if (method === 'DELETE') return 'delete';
  if (/^\/(?:git\/refs\/tags|releases|tags)(?:\/|$)/.test(sub)) return 'tag';
  if (/^\/actions\/(?:workflows\/[^/]+\/dispatches|runs\/\d+\/(?:rerun|rerun-failed-jobs|cancel))/.test(sub) || /^\/dispatches$/.test(sub)) return 'deploy';
  if (/^\/(?:git\/(?:refs|blobs|trees|commits)|contents|merges|pulls|issues|comments|labels|milestones|statuses|check-runs|check-suites)(?:\/|$)/.test(sub)) return method === 'PATCH' && /^\/git\/refs/.test(sub) ? 'overwrite' : 'push';
  return 'admin';
}
function classifyApi(args) {
  let method = '';
  let pathArg = '';
  let hasFields = false;
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '-X' || a === '--method') { method = String(args[i + 1] || '').toUpperCase(); i += 1; continue; }
    if (/^--method=/.test(a)) { method = a.slice(9).toUpperCase(); continue; }
    if (['-f', '-F', '--field', '--raw-field', '--input'].includes(a)) { hasFields = true; i += 1; continue; }
    if (/^(?:-H|--header|-q|--jq|-t|--template|--hostname|--cache|-p|--preview)$/.test(a)) { i += 1; continue; }
    if (a.startsWith('-')) continue;
    if (!pathArg) pathArg = a;
  }
  if (!method) method = hasFields ? 'POST' : 'GET';
  if (!pathArg) return { error: 'gh api thiếu đường dẫn' };
  if (/^graphql$/i.test(pathArg)) return method === 'GET' ? { targets: [], action: 'read' } : { error: 'gh api graphql: không xác định được đối tượng; dùng đường dẫn REST có nêu repo hay tổ chức' };
  const p = `/${pathArg.replace(/^https?:\/\/api\.github\.com\//i, '').replace(/^\/+/, '').split('?')[0]}`;
  let m = /^\/repos\/([^/]+)\/([^/]+)(\/.*)?$/.exec(p);
  if (m) {
    const sub = m[3] || '';
    const action = sub === '' && method === 'DELETE' ? 'delete' : sub === '' && method === 'PATCH' ? 'admin' : apiAction(method, sub);
    return { targets: [repoT(`${m[1]}/${m[2]}`)], action };
  }
  m = /^\/orgs\/([^/]+)(\/.*)?$/.exec(p);
  if (m) {
    const sub = m[2] || '';
    if (method === 'POST' && sub === '/repos') return { targets: [orgT(m[1])], action: 'create' };
    return { targets: [orgT(m[1])], action: method === 'GET' || method === 'HEAD' ? (SENSITIVE_READ.test(sub) ? 'admin' : 'read') : method === 'DELETE' ? 'delete' : 'admin' };
  }
  m = /^\/user(\/.*)?$/.exec(p);
  if (m) {
    const sub = m[1] || '';
    if (method === 'POST' && sub === '/repos') return { targets: [ACCOUNT], action: 'create' };
    return { targets: [ACCOUNT], action: method === 'GET' || method === 'HEAD' ? (SENSITIVE_READ.test(sub) || /^\/(?:keys|gpg_keys|ssh_signing_keys|emails)/.test(sub) ? 'admin' : 'read') : method === 'DELETE' ? 'delete' : 'admin' };
  }
  // Dữ liệu công khai chung (users/<tên>, search, rate_limit, meta...): chỉ đọc được, không đối tượng.
  if (method === 'GET' || method === 'HEAD') return { targets: [], action: 'read' };
  return { error: `gh api ${method} ${p}: không xác định được đối tượng (repo, tổ chức hay tài khoản)` };
}

// ---------- lệnh gh thường ----------
const READ_VERBS = new Set(['list', 'view', 'status', 'diff', 'checks', 'watch', 'download', 'browse', 'logs', 'search']);
// Món ghi theo nhóm lệnh và động từ; động từ không có trong bảng thì xếp quản trị (chặt hơn).
const VERB_ACTION = {
  repo: { create: 'create', fork: 'create', delete: 'delete', clone: 'read', sync: 'push', edit: 'admin', rename: 'admin', archive: 'admin', unarchive: 'admin', 'set-default': 'read', 'deploy-key': 'admin', autolink: 'admin', gitignore: 'read', license: 'read' },
  run: { rerun: 'deploy', cancel: 'deploy', delete: 'delete' },
  workflow: { run: 'deploy', enable: 'admin', disable: 'admin' },
  release: { create: 'tag', upload: 'tag', edit: 'tag', delete: 'delete', 'delete-asset': 'delete' },
  pr: { create: 'push', comment: 'push', edit: 'push', merge: 'push', close: 'push', reopen: 'push', review: 'push', ready: 'push', checkout: 'read', lock: 'admin', unlock: 'admin', revert: 'push', update: 'push' },
  issue: { create: 'push', comment: 'push', edit: 'push', close: 'push', reopen: 'push', delete: 'delete', transfer: 'admin', pin: 'push', unpin: 'push', lock: 'admin', unlock: 'admin', develop: 'push' },
  label: { create: 'push', edit: 'push', clone: 'push', delete: 'delete' },
  secret: { list: 'admin', set: 'admin', delete: 'admin' },
  variable: { list: 'admin', get: 'admin', set: 'admin', delete: 'admin' },
  cache: { delete: 'delete' },
  ruleset: { list: 'admin', view: 'admin', check: 'read' },
  'ssh-key': { list: 'admin', add: 'admin', delete: 'admin' },
  'gpg-key': { list: 'admin', add: 'admin', delete: 'admin' },
  gist: { create: 'push', edit: 'push', delete: 'delete', clone: 'read', rename: 'push' },
  org: { list: 'read' },
  codespace: { create: 'admin', delete: 'delete', edit: 'admin', stop: 'admin' },
  project: { create: 'admin', delete: 'delete', edit: 'admin', close: 'admin', copy: 'admin' },
};
const ACCOUNT_GROUPS = new Set(['ssh-key', 'gpg-key', 'gist', 'codespace', 'org']);
function flagValue(args, names) {
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    for (const n of names) {
      if (a === n) return String(args[i + 1] || '');
      if (a.startsWith(`${n}=`)) return a.slice(n.length + 1);
    }
  }
  return '';
}
const positional = (args) => args.filter((a, i) => !a.startsWith('-') && !(i > 0 && /^-[A-Za-z]$|^--[a-z-]+$/.test(args[i - 1]) && !['--yes', '--confirm', '--public', '--private', '--internal', '--web', '--json'].includes(args[i - 1])));

// Xếp argv của gh (không có chữ "gh" ở đầu). Trả { targets, action } hoặc { error }.
function classifyGh(argv) {
  const args = (argv || []).map(String);
  const group = args[0] || '';
  if (!group) return { error: 'thiếu lệnh gh' };
  if (group === 'auth') return { error: 'gh auth: harness không in, không đổi đăng nhập; token chỉ người dùng quản (lệnh secret)' };
  if (group === 'api') return classifyApi(args.slice(1));
  if (['version', 'help', '--version', 'status', 'search'].includes(group)) return { targets: [], action: 'read' };
  const verb = args[1] || '';
  const rest = args.slice(2);
  const table = VERB_ACTION[group] || {};
  const action = table[verb] || (READ_VERBS.has(verb) ? 'read' : 'admin');
  const repoFlag = flagValue(args, ['-R', '--repo']);
  const orgFlag = flagValue(args, ['--org', '-o', '--owner']);
  const targets = [];
  if (group === 'repo') {
    const pos = positional(rest)[0] || '';
    if (verb === 'create') {
      const owner = pos.includes('/') ? pos.split('/')[0] : '';
      targets.push(owner ? orgT(owner) : ACCOUNT); // chủ là tổ chức hay tài khoản: chỉ biết tên; tài khoản cá nhân cũng ghi dạng org:<tên> được
      return { targets, action, ownerName: owner };
    }
    if (verb === 'fork') return { targets: [ACCOUNT, ...(REPO_RE.test(pos) ? [repoT(pos)] : [])], action };
    if (verb === 'list') return { targets: pos ? [orgT(pos)] : [ACCOUNT], action: 'read' };
    const r = REPO_RE.test(pos) ? pos : repoFlag;
    if (r && REPO_RE.test(r)) return { targets: [repoT(r)], action };
    return { error: `gh repo ${verb}: nêu repo dạng chủ/tên` };
  }
  if (repoFlag) { if (!REPO_RE.test(repoFlag)) return { error: `-R ${repoFlag}: repo phải dạng chủ/tên` }; targets.push(repoT(repoFlag)); }
  if (orgFlag && ['secret', 'variable', 'project', 'ruleset'].includes(group)) targets.push(orgT(orgFlag));
  if (ACCOUNT_GROUPS.has(group) && !targets.length) targets.push(ACCOUNT);
  if (!targets.length) return { error: `gh ${group} ${verb}: nêu repo bằng -R chủ/tên (hoặc --org với lệnh của tổ chức)` };
  return { targets, action };
}

// ---------- phạm vi theo kế hoạch ----------
// parsed: kết quả parsePlan của kế hoạch đang duyệt (hoặc null); unitRepos: { đơn vị: "chủ/tên" } đọc từ remote của đơn vị.
// Trả { open, targets: [...], actions: Set } . Không có kế hoạch duyệt thì chỉ đọc, trên repo của mọi đơn vị trong dự án.
function scopeOf(parsed, unitRepos = {}) {
  const all = Object.values(unitRepos).filter(Boolean).map(repoT);
  if (!parsed || !parsed.ok) return { open: false, targets: all, actions: new Set(['read']) };
  const g = parsed.github || { repos: [], orgs: [], account: false };
  const targets = [
    ...(parsed.services || []).map((s) => unitRepos[s]).filter(Boolean).map(repoT),
    ...g.repos.map(repoT), ...g.orgs.map(orgT), ...(g.account ? [ACCOUNT] : []),
  ];
  const actions = new Set(['read', ...((parsed.allowed && parsed.allowed.actions) || ['commit'])]);
  return { open: true, targets, actions, readAll: all };
}
// Đối tượng t có nằm trong phạm vi không: trùng hẳn, hoặc repo thuộc một tổ chức có trong phạm vi.
const covers = (scope, t) => scope.targets.some((s) => s.kind === t.kind && s.id === t.id)
  || (t.kind === 'repo' && scope.targets.some((s) => s.kind === 'org' && t.id.startsWith(`${s.id}/`)));

// Quyết định cho một việc đã xếp: { ok, why }.
function decide(scope, cls) {
  if (cls.error) return { ok: false, why: cls.error };
  const readable = (t) => covers(scope, t) || (cls.action === 'read' && (scope.readAll || []).some((s) => s.id === t.id));
  const outside = cls.targets.filter((t) => !(cls.action === 'read' ? readable(t) : covers(scope, t)));
  if (outside.length) {
    return { ok: false, why: scope.open
      ? `${outside.map(show).join(', ')} không nằm trong kế hoạch đang duyệt (repo của đơn vị ở mục Dịch vụ, hoặc đối tượng ở dòng "- GitHub:")`
      : `chưa có kế hoạch được duyệt: chỉ đọc được repo của các đơn vị trong dự án, không có ${outside.map(show).join(', ')}` };
  }
  if (!scope.actions.has(cls.action)) {
    return { ok: false, why: scope.open
      ? `việc "${LABEL[cls.action] || cls.action}" không có ở dòng "- Được làm:" của kế hoạch đang duyệt`
      : `chưa có kế hoạch được duyệt nên không làm được việc "${LABEL[cls.action] || cls.action}"` };
  }
  return { ok: true, why: '' };
}

// Xếp một lần đẩy git: refs và cờ -> món. pushArgs: các đối số sau "push".
function classifyPush(pushArgs) {
  const a = (pushArgs || []).map(String);
  if (a.some((x) => x === '--delete' || x === '-d' || /^:/.test(x))) return 'delete';
  if (a.some((x) => /^(?:-f|--force|--force-with-lease(?:=.*)?|--mirror)$/.test(x) || /^\+/.test(x))) return 'overwrite';
  if (a.some((x) => x === '--tags' || /refs\/tags\//.test(x) || /^(?:release|v\d)/.test(x))) return 'tag';
  return 'push';
}

// ---------- token ----------
const DEFAULT_POLICY = { requiredScopes: ['repo', 'workflow'], excessScopes: ['delete_repo', 'admin:org', 'admin:enterprise', 'admin:org_hook', 'admin:repo_hook', 'admin:public_key', 'admin:gpg_key', 'admin:ssh_signing_key', 'audit_log', 'user', 'codespace', 'delete:packages', 'write:packages', 'gist'], warnDays: 14 };
// info: { ok, login, expiresAt (ms|0), scopes: [..] | null (token fine-grained) }. Trả { level: 'ok'|'warn'|'bad', lines: [...] }.
function tokenHealth(info, policy, now) {
  policy = policy || DEFAULT_POLICY;
  const lines = [];
  let level = 'ok';
  if (!info || !info.present) return { level: 'bad', lines: ['chưa có token GitHub trong kho bí mật: người dùng chạy `secret set` trong terminal của mình'] };
  if (!info.ok) return { level: 'bad', lines: [`GitHub không nhận token (${info.error || 'sai hoặc hết hạn'}): người dùng chạy \`secret rotate\``] };
  lines.push(`tài khoản ${info.login}`);
  if (info.expiresAt) {
    const days = Math.floor((info.expiresAt - now) / 86400000);
    lines.push(`còn ${days} ngày (hết hạn ${new Date(info.expiresAt).toISOString().slice(0, 10)})`);
    if (days < (policy.warnDays || 14)) { level = 'warn'; lines.push('sắp hết hạn: người dùng chạy `secret rotate`'); }
  } else lines.push('không có ngày hết hạn');
  if (Array.isArray(info.scopes)) {
    const excess = info.scopes.filter((s) => (policy.excessScopes || []).includes(s));
    const missing = (policy.requiredScopes || []).filter((s) => !info.scopes.includes(s));
    if (excess.length) { level = 'warn'; lines.push(`quyền thừa: ${excess.join(', ')} (nên thay bằng token chỉ ${(policy.requiredScopes || []).join(', ')})`); }
    if (missing.length) { level = 'warn'; lines.push(`thiếu quyền: ${missing.join(', ')}`); }
  } else lines.push('token fine-grained (quyền xem trên trang token)');
  return { level, lines };
}

module.exports = { LABEL, classifyGh, classifyApi, classifyPush, scopeOf, covers, decide, tokenHealth, DEFAULT_POLICY, show };
