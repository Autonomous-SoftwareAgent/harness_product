#!/usr/bin/env node
'use strict';
// spec: HOOK-S-003
// spec: PORT-S-001
// spec: HOOK-S-004
// Cài git hook `post-commit` để cổng BSN_/docs/portal tự dựng lại sau MỖI commit của một repo trong BSN_ (repo gốc hoặc một dịch vụ).
// Cổng chỉ hiện nội dung đã commit, nên commit chính là lúc cổng cần cập nhật; hook chạy cả khi commit tay ngoài Claude.
//
//   node .claude/plugin/cli/install-git-hooks.js              cài cho repo chứa thư mục đang đứng (chạy trong BSN_/ hoặc trong <dịch-vụ>/)
//   node .claude/plugin/cli/install-git-hooks.js <thư-mục>... cài cho các repo nêu tên (ví dụ: . payment-hub ingest, tính từ BSN_/)
//   node .claude/plugin/cli/install-git-hooks.js --check ...  chỉ báo đã cài hay chưa, không ghi gì
//
// Hook nằm trong .git/hooks (không thuộc cây mã, không được commit), nên dịch vụ vẫn chỉ giữ mã và tài liệu. Máy khác phải cài lại.
// Không ghi đè hook post-commit do người khác đặt: gặp thì dừng và nói cách gộp tay. Hook lỗi KHÔNG làm hỏng commit.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const P = require('../gate/gate-paths');

const BSN = path.resolve(__dirname, '..', '..', '..');
const MARK = '# bsn-portal-hook';
const same = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

// NỘI DUNG GIT HOOK GIỮ ĐƯỜNG DẪN CŨ (S-057): hook gọi mcp/cli.js và tools/banned-scan.js, nay là hai tệp lối tắt sang cli/. Đổi chữ trong hook
// thì mọi repo đã cài bị coi là hook cũ và phải cài lại; giữ nguyên thì không repo nào phải đụng tới.
function hookText(bsn = BSN) {
  const cli = path.join(bsn, '.claude', 'plugin', 'mcp', 'cli.js').split(path.sep).join('/');
  return [
    '#!/bin/sh',
    MARK,
    '# Dựng lại cổng BSN_/docs/portal sau mỗi commit (cài bởi BSN_/.claude/plugin/tools/install-git-hooks.js). Lỗi ở đây không làm hỏng commit.',
    `node "${cli}" on-commit || echo "BSN_: cong docs/portal KHONG dung lai duoc sau commit. Chay tay: node .claude/plugin/mcp/cli.js portal" >&2`,
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
function install(dir, { check = false, bsn = BSN } = {}) {
  const repo = path.resolve(dir);
  // dịch vụ = thư mục con trực tiếp của một thư mục cha khai trong cấu hình dự án, hoặc thư mục gốc của một đơn vị khai riêng (infra)
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

// Ba git hook quét từ cấm (tools/banned-scan.js): pre-commit, commit-msg, pre-push. Cài cùng lúc với post-commit, cùng luật:
// không ghi đè hook của người khác. Khác post-commit ở chỗ hook này CHẶN (thoát mã 1) khi bộ quét báo có; thiếu tệp bộ quét thì cho qua.
const BAN_MARK = '# bsn-banned-hook';
const BAN_HOOKS = { 'pre-commit': 'pre-commit', 'commit-msg': 'commit-msg "$1"', 'pre-push': 'pre-push "$1"' };

// Repo gốc BSN_ (harness, quy tắc, tài liệu hệ thống) KHÔNG BAO GIỜ đẩy lên remote nào (S-035): pre-push của nó luôn từ chối,
// không phụ thuộc Node hay danh sách từ cấm. Repo deploy và repo dịch vụ vẫn đẩy được khi bộ quét cho qua.
function rootPushHookText() {
  return [
    '#!/bin/sh',
    BAN_MARK,
    '# Repo goc BSN_ (harness) khong bao gio day len remote (S-035). Cai boi BSN_/.claude/plugin/tools/install-git-hooks.js.',
    'echo "BSN_: repo goc (harness) KHONG BAO GIO day len remote (S-035). Lenh day bi tu choi; chi commit o may." >&2',
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

function banHookText(name, bsn = BSN, { root = false } = {}) {
  if (root && name === 'pre-push') return rootPushHookText();
  const tool = path.join(bsn, '.claude', 'plugin', 'tools', 'banned-scan.js').split(path.sep).join('/');
  return [
    '#!/bin/sh',
    BAN_MARK,
    '# Quet tu cam truoc khi commit va truoc khi day (cai boi BSN_/.claude/plugin/tools/install-git-hooks.js). Danh sach tu chi nam o may.',
    `[ -f "${tool}" ] || exit 0`,
    `node "${tool}" ${BAN_HOOKS[name]} || exit 1`,
    'exit 0',
    '',
  ].join('\n');
}

// Trả { repo, status, hooks: { <tên>: 'installed' | 'updated' | 'ok' | 'missing' | 'foreign' } }; status như install().
function installBan(dir, { check = false, bsn = BSN } = {}) {
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
  // Repo gốc: thêm chốt cấu hình chặn đẩy, và báo remote nào đang có (repo gốc không được có remote, S-035).
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
  foreign: 'đã có hook pre-commit, commit-msg hoặc pre-push KHÁC (không ghi đè) nên repo này KHÔNG được quét từ cấm ở bước đó. Gộp tay: thêm vào hook đó dòng `# bsn-banned-hook` và lệnh `node "<BSN_>/.claude/plugin/tools/banned-scan.js" <tên-hook> "$1" || exit 1`',
};

const TEXT = {
  installed: 'đã cài hook post-commit',
  updated: 'đã cập nhật hook post-commit',
  ok: 'hook post-commit đã có, đúng bản',
  missing: 'CHƯA cài hook post-commit',
  foreign: 'đã có hook post-commit KHÁC (không ghi đè). Gộp tay: thêm vào cuối hook đó hai dòng `# bsn-portal-hook` và lệnh `node "<BSN_>/.claude/plugin/mcp/cli.js" on-commit`',
  'not-a-repo': 'không phải gốc của một repo git',
  outside: 'không phải gốc dự án hay một đơn vị khai trong cấu hình dự án',
  'linked-worktree': 'là bản sao làm việc phụ (git worktree), dùng chung thư mục hooks với repo chính: KHÔNG cài từ đây, để hook của repo chính không bị trỏ sang bản sao',
};

function main(argv) {
  const check = argv.includes('--check');
  let dirs = argv.filter((a) => !a.startsWith('--')).map((a) => (/^[a-z][a-z0-9-]*$/.test(a) && fs.existsSync(P.serviceDir(BSN, a)) ? P.serviceDir(BSN, a) : path.resolve(BSN, a))); // nhận tên dịch vụ hoặc đường dẫn tính từ BSN_/
  if (!dirs.length) {
    const top = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' });
    if (top.status !== 0) { console.error('Thư mục đang đứng không nằm trong repo git nào. Nêu thư mục: node .claude/plugin/cli/install-git-hooks.js . payment-hub'); return 2; }
    dirs = [top.stdout.trim()];
  }
  let bad = 0;
  for (const d of dirs) {
    const r = install(d, { check });
    console.log(`${path.relative(BSN, r.repo) || '(gốc BSN_)'}: ${TEXT[r.status]}`);
    if (['missing', 'foreign', 'not-a-repo', 'outside'].includes(r.status)) bad++;
    if (r.status === 'not-a-repo' || r.status === 'outside' || r.status === 'linked-worktree') continue;
    const b = installBan(d, { check });
    console.log(`${path.relative(BSN, b.repo) || '(gốc BSN_)'}: ${BAN_TEXT[b.status]}`);
    if (['missing', 'foreign'].includes(b.status)) bad++;
    if (b.hooks['push-lock']) console.log(`(gốc BSN_): chốt chặn đẩy trong cấu hình git: ${b.hooks['push-lock'] === 'missing' ? 'CHƯA có' : 'có'} (repo gốc không bao giờ đẩy, S-035)`);
    if (b.remotes.length) { console.log(`(gốc BSN_): ĐANG CÓ remote ${b.remotes.join(', ')}: trái S-035, gỡ bằng \`git remote remove <tên>\``); bad++; }
  }
  return bad ? 1 : 0;
}

module.exports = { main, install, hookText, MARK, installBan, banHookText, rootPushHookText, lockRootPush, PUSH_LOCK_URL, BAN_MARK };
if (require.main === module) process.exit(main(process.argv.slice(2)));
