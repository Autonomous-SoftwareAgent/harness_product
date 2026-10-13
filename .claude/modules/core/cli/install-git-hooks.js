#!/usr/bin/env node
'use strict';
// spec: HOOK-S-003
// spec: PORT-S-001
// spec: HOOK-S-004
// Cài git hook `post-commit` để cổng docs/portal tự dựng lại sau MỖI commit của một repo trong dự án (repo gốc hoặc một dịch vụ).
// Cổng chỉ hiện nội dung đã commit, nên commit chính là lúc cổng cần cập nhật; hook chạy cả khi commit tay ngoài Claude.
//
//   node .claude/modules/core/cli/install-git-hooks.js              cài cho repo chứa thư mục đang đứng (chạy ở gốc dự án hoặc trong <dịch-vụ>/)
//   node .claude/modules/core/cli/install-git-hooks.js <thư-mục>... cài cho các repo nêu tên (ví dụ: . <đơn-vị-a> <đơn-vị-b>, tính từ gốc dự án)
//   node .claude/modules/core/cli/install-git-hooks.js --check ...  chỉ báo đã cài hay chưa, không ghi gì
//
// Hook nằm trong .git/hooks (không thuộc cây mã, không được commit), nên dịch vụ vẫn chỉ giữ mã và tài liệu. Máy khác phải cài lại.
// Không ghi đè hook post-commit do người khác đặt: gặp thì dừng và nói cách gộp tay. Hook lỗi KHÔNG làm hỏng commit.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const P = require('../gate/gate-paths');

const ROOT = P.rootFrom(__dirname);
const MARK = '# bsn-portal-hook';
const same = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
// Đường dẫn đúng chữ trên đĩa. Nội dung hook chứa đường dẫn của gốc dự án, nên cùng một thư mục mà viết khác hoa thường
// (phiên mở ở thư mục gõ toàn chữ thường) sẽ ra nội dung khác: hook đã cài đúng bị báo "chưa cài" (lỗi gặp 2026-10-13 ở doctor) và bị ghi lại.
const canon = (d) => { try { return fs.realpathSync.native(path.resolve(d)); } catch { return path.resolve(d); } };

// Git hook gọi thẳng lệnh thật ở cli/ (trước đây gọi hai tệp lối tắt mcp/cli.js và tools/banned-scan.js). Đổi chữ trong hook thì mọi
// repo đã cài bị coi là hook cũ và phải cài lại (harness tự cài lại khi mở phiên).
function hookText(bsn = ROOT) {
  bsn = canon(bsn);
  const cli = P.codePath(bsn, 'cli/cli.js').split(path.sep).join('/'); // đường dẫn thật theo bố cục của dự án
  return [
    '#!/bin/sh',
    MARK,
    '# Dựng lại cổng docs/portal sau mỗi commit (cài bởi install-git-hooks.js của harness). Lỗi ở đây không làm hỏng commit.',
    `node "${cli}" on-commit || echo "harness: cong docs/portal KHONG dung lai duoc sau commit. Chay tay: node ${P.codeRel(bsn, 'cli/cli.js')} portal" >&2`,
    'exit 0',
    '',
  ].join('\n');
}

// Thư mục .git/hooks của repo có gốc ĐÚNG là `dir` (không nhận thư mục con của một repo khác).
function hooksDir(dir) {
  const top = spawnSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  if (top.status !== 0 || !same(top.stdout.trim(), dir)) return null;
  const r = spawnSync('git', ['-C', dir, 'rev-parse', '--git-path', 'hooks'], { encoding: 'utf8' });
  return r.status === 0 ? path.resolve(dir, r.stdout.trim()) : null;
}

// `dir` là một BẢN SAO LÀM VIỆC phụ (git worktree) của một repo khác? Bản sao phụ dùng CHUNG thư mục hooks với repo chính, nên cài hook
// từ đó sẽ ghi đè hook của repo chính và trỏ nó sang bản sao: cổng dựng nhầm chỗ, và bộ quét từ cấm chạy ở nơi không có danh sách
// (tức là KHÔNG quét). Đã gặp 2026-10-10 khi chạy test trong .claude/worktrees/. Vì vậy không bao giờ cài từ một bản sao phụ.
function isLinkedWorktree(dir) {
  const one = (arg) => { const r = spawnSync('git', ['-C', dir, 'rev-parse', '--path-format=absolute', arg], { encoding: 'utf8' }); return r.status === 0 ? r.stdout.trim() : null; };
  const own = one('--git-dir'); const common = one('--git-common-dir');
  return Boolean(own && common && !same(own, common));
}

// Trả { repo, status: 'installed' | 'updated' | 'ok' | 'missing' | 'foreign' | 'not-a-repo' | 'outside' | 'linked-worktree', file }
function install(dir, { check = false, bsn = ROOT } = {}) {
  const repo = path.resolve(dir);
  // dịch vụ = thư mục con trực tiếp của một thư mục cha khai trong cấu hình dự án, hoặc thư mục gốc của một đơn vị khai riêng
  const unit = P.serviceOf(bsn, repo);
  const inBsn = same(repo, bsn) || (unit !== '' && same(repo, P.serviceDir(bsn, unit)));
  if (!inBsn) return { repo, status: 'outside' };
  if (isLinkedWorktree(repo)) return { repo, status: 'linked-worktree' };
  const hooks = hooksDir(repo);
  if (!hooks) return { repo, status: 'not-a-repo' };
  const file = path.join(hooks, 'post-commit');
  const want = hookText(bsn);
  const have = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (have !== null && !have.includes(MARK)) return { repo, status: 'foreign', file };
  if (have === want) return { repo, status: 'ok', file };
  if (check) return { repo, status: 'missing', file };
  fs.mkdirSync(hooks, { recursive: true });
  fs.writeFileSync(file, want, { mode: 0o755 });
  return { repo, status: have === null ? 'installed' : 'updated', file };
}

// Ba git hook quét từ cấm (cli/banned-scan.js): pre-commit, commit-msg, pre-push. Cài cùng lúc với post-commit, cùng luật:
// không ghi đè hook của người khác. Khác post-commit ở chỗ hook này CHẶN (thoát mã 1) khi bộ quét báo có; thiếu tệp bộ quét thì cho qua.
const BAN_MARK = '# bsn-banned-hook';
const BAN_HOOKS = { 'pre-commit': 'pre-commit', 'commit-msg': 'commit-msg "$1"', 'pre-push': 'pre-push "$1"' };

// Repo gốc của dự án KHÔNG BAO GIỜ đẩy lên remote nào: pre-push của nó luôn từ chối,
// không phụ thuộc Node hay danh sách từ cấm. Repo deploy và repo dịch vụ vẫn đẩy được khi bộ quét cho qua.
function rootPushHookText() {
  return [
    '#!/bin/sh',
    BAN_MARK,
    '# Repo goc cua du an khong bao gio day len remote. Cai boi install-git-hooks.js cua harness.',
    'echo "harness: repo goc cua du an KHONG BAO GIO day len remote. Lenh day bi tu choi; chi commit o may." >&2',
    'exit 1',
    '',
  ].join('\n');
}

// Chốt thứ hai cho repo gốc, vì `git push --no-verify` bỏ qua hook (đã thử 2026-10-08): hai luật đổi địa chỉ trong cấu hình của repo
// trỏ MỌI địa chỉ (tiền tố rỗng) về một đích không tồn tại. Lệnh đẩy hỏng ở tầng kết nối, sau bước hook, nên --no-verify không vượt được;
// đã thử với đường dẫn trên máy, https, git@, remote mới thêm, remote có pushurl riêng, và `-c` trên dòng lệnh. Lệnh ở máy (commit, log) không đổi.
// Repo gốc không có remote nên việc `fetch` cũng hỏng theo là chấp nhận được. Người sửa tay .git/config thì gỡ được: đây không phải khóa tuyệt đối.
const PUSH_LOCK_URL = 'khong-day://bi-chan/';
const PUSH_LOCK_KEYS = [`url.${PUSH_LOCK_URL}.insteadOf`, `url.${PUSH_LOCK_URL}.pushInsteadOf`];
const gitIn = (repo, args) => spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });

// Trả { lock: 'ok' | 'installed' | 'missing', remotes: [tên remote đang có] }.
function lockRootPush(repo, { check = false } = {}) {
  const has = (key) => { const r = gitIn(repo, ['config', '--local', '--get-all', key]); return r.status === 0 && r.stdout.split('\n').includes(''); };
  const remotes = (gitIn(repo, ['remote']).stdout || '').split('\n').map((x) => x.trim()).filter(Boolean);
  if (PUSH_LOCK_KEYS.every(has)) return { lock: 'ok', remotes };
  if (check) return { lock: 'missing', remotes };
  for (const key of PUSH_LOCK_KEYS) gitIn(repo, ['config', '--local', '--replace-all', key, '']);
  return { lock: PUSH_LOCK_KEYS.every(has) ? 'installed' : 'missing', remotes };
}

function banHookText(name, bsn = ROOT, { root = false } = {}) {
  bsn = canon(bsn);
  if (root && name === 'pre-push') return rootPushHookText();
  const tool = P.codePath(bsn, 'cli/banned-scan.js').split(path.sep).join('/'); // đường dẫn thật theo bố cục của dự án
  const installer = P.codePath(bsn, 'cli/install-git-hooks.js').split(path.sep).join('/');
  return [
    '#!/bin/sh',
    BAN_MARK,
    '# Quet tu cam truoc khi commit va truoc khi day (cai boi install-git-hooks.js cua harness). Danh sach tu chi nam o may.',
    // Mất bộ quét (harness dời chỗ hay bị xóa) thì CHẶN và nói cách cài lại; trước đây hook im lặng cho qua.
    `[ -f "${tool}" ] || { echo "harness: khong thay bo quet tu cam (${tool}) nen KHONG quet duoc; lenh bi chan. Cai lai git hook: node ${installer} <repo>" >&2; exit 1; }`,
    `node "${tool}" ${BAN_HOOKS[name]} || exit 1`,
    'exit 0',
    '',
  ].join('\n');
}

// Trả { repo, status, hooks: { <tên>: 'installed' | 'updated' | 'ok' | 'missing' | 'foreign' } }; status như install().
function installBan(dir, { check = false, bsn = ROOT } = {}) {
  const repo = path.resolve(dir);
  const unit = P.serviceOf(bsn, repo);
  const inBsn = same(repo, bsn) || (unit !== '' && same(repo, P.serviceDir(bsn, unit)));
  if (!inBsn) return { repo, status: 'outside', hooks: {} };
  if (isLinkedWorktree(repo)) return { repo, status: 'linked-worktree', hooks: {} };
  const dirHooks = hooksDir(repo);
  if (!dirHooks) return { repo, status: 'not-a-repo', hooks: {} };
  const hooks = {};
  for (const name of Object.keys(BAN_HOOKS)) {
    const file = path.join(dirHooks, name);
    const want = banHookText(name, bsn, { root: same(repo, bsn) && P.policy(bsn, 'rootNeverPush') === true });
    const have = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    if (have !== null && !have.includes(BAN_MARK)) { hooks[name] = 'foreign'; continue; }
    if (have === want) { hooks[name] = 'ok'; continue; }
    if (check) { hooks[name] = 'missing'; continue; }
    fs.mkdirSync(dirHooks, { recursive: true });
    fs.writeFileSync(file, want, { mode: 0o755 });
    hooks[name] = have === null ? 'installed' : 'updated';
  }
  // Repo gốc: thêm chốt cấu hình chặn đẩy, và báo remote nào đang có (repo gốc không được có remote).
  let root = null;
  if (same(repo, bsn) && P.policy(bsn, 'rootNeverPush') === true) { root = lockRootPush(repo, { check }); hooks['push-lock'] = root.lock; }
  const v = Object.values(hooks);
  const status = v.includes('foreign') ? 'foreign' : v.includes('missing') ? 'missing' : v.includes('installed') ? 'installed' : v.includes('updated') ? 'updated' : 'ok';
  return { repo, status, hooks, remotes: root ? root.remotes : [] };
}

const BAN_TEXT = {
  installed: 'đã cài ba hook quét từ cấm (pre-commit, commit-msg, pre-push)',
  updated: 'đã cập nhật hook quét từ cấm',
  ok: 'hook quét từ cấm đã có, đúng bản',
  missing: 'CHƯA cài đủ hook quét từ cấm',
  foreign: 'đã có hook pre-commit, commit-msg hoặc pre-push KHÁC (không ghi đè) nên repo này KHÔNG được quét từ cấm ở bước đó. Gộp tay: thêm vào hook đó dòng `# bsn-banned-hook` và lệnh `node "<gốc dự án>/.claude/modules/core/cli/banned-scan.js" <tên-hook> "$1" || exit 1`',
};

const TEXT = {
  installed: 'đã cài hook post-commit',
  updated: 'đã cập nhật hook post-commit',
  ok: 'hook post-commit đã có, đúng bản',
  missing: 'CHƯA cài hook post-commit',
  foreign: 'đã có hook post-commit KHÁC (không ghi đè). Gộp tay: thêm vào cuối hook đó hai dòng `# bsn-portal-hook` và lệnh `node "<gốc dự án>/.claude/modules/core/cli/cli.js" on-commit`',
  'not-a-repo': 'không phải gốc của một repo git',
  outside: 'không phải gốc dự án hay một đơn vị khai trong cấu hình dự án',
  'linked-worktree': 'là bản sao làm việc phụ (git worktree), dùng chung thư mục hooks với repo chính: KHÔNG cài từ đây, để hook của repo chính không bị trỏ sang bản sao',
};

function main(argv) {
  const check = argv.includes('--check');
  let dirs = argv.filter((a) => !a.startsWith('--')).map((a) => (/^[a-z][a-z0-9-]*$/.test(a) && fs.existsSync(P.serviceDir(ROOT, a)) ? P.serviceDir(ROOT, a) : path.resolve(ROOT, a))); // nhận tên dịch vụ hoặc đường dẫn tính từ gốc dự án
  if (!dirs.length) {
    const top = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' });
    if (top.status !== 0) { console.error('Thư mục đang đứng không nằm trong repo git nào. Nêu thư mục: node .claude/modules/core/cli/install-git-hooks.js . <đơn-vị>'); return 2; }
    dirs = [top.stdout.trim()];
  }
  let bad = 0;
  for (const d of dirs) {
    const r = install(d, { check });
    console.log(`${path.relative(ROOT, r.repo) || '(gốc dự án)'}: ${TEXT[r.status]}`);
    if (['missing', 'foreign', 'not-a-repo', 'outside'].includes(r.status)) bad++;
    if (r.status === 'not-a-repo' || r.status === 'outside' || r.status === 'linked-worktree') continue;
    const b = installBan(d, { check });
    console.log(`${path.relative(ROOT, b.repo) || '(gốc dự án)'}: ${BAN_TEXT[b.status]}`);
    if (['missing', 'foreign'].includes(b.status)) bad++;
    if (b.hooks['push-lock']) console.log(`(gốc dự án): chốt chặn đẩy trong cấu hình git: ${b.hooks['push-lock'] === 'missing' ? 'CHƯA có' : 'có'} (repo gốc không bao giờ đẩy)`);
    if (b.remotes.length) { console.log(`(gốc dự án): ĐANG CÓ remote ${b.remotes.join(', ')}: repo gốc không được có remote, gỡ bằng \`git remote remove <tên>\``); bad++; }
  }
  return bad ? 1 : 0;
}

module.exports = { main, install, hookText, MARK, installBan, banHookText, rootPushHookText, lockRootPush, PUSH_LOCK_URL, BAN_MARK };
if (require.main === module) process.exit(main(process.argv.slice(2)));
