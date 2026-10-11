#!/usr/bin/env node
'use strict';
// spec: HOOK-S-004
// spec: HOOK-S-008
// Quét "từ cấm": những từ KHÔNG được có trong bất kỳ commit nào của repo gốc hay một dịch vụ (nội dung, tên tệp, lời nhắn commit).
// Danh sách từ chỉ nằm ở MÁY (tệp bị gitignore, đường dẫn do gate-paths.bannedListPath sinh), không bao giờ được commit: chính danh sách
// là thông tin không được lộ. Vì vậy mã, test và tài liệu của harness không chứa từ nào trong danh sách; test dùng từ giả.
//
//   node .claude/plugin/cli/banned-scan.js pre-commit            git hook: quét phần SẮP commit (dòng thêm vào và tên tệp)
//   node .claude/plugin/cli/banned-scan.js commit-msg <tệp>      git hook: quét lời nhắn commit
//   node .claude/plugin/cli/banned-scan.js pre-push <remote>     git hook: quét MỌI commit sắp đẩy (đọc danh sách ref từ stdin);
//                                                                trước đó dò nội dung BSN_/docs/ (docs-guard.js, S-062)
//   node .claude/plugin/cli/banned-scan.js scan [--history]      quét tay repo đang đứng: tệp đang theo dõi; thêm --history thì cả mọi commit
//
// Mỗi từ khớp nhiều cách viết (hoa thường, chen dấu phân cách, số nhiều, camelCase, và với từ dài là cả khi dính liền trong từ khác):
// luật đầy đủ ở core/rules/lib/banned-words.js.
// Kết quả chỉ nêu tệp và dòng, không in lại từ. Thoát mã 1 khi có; 0 khi sạch hoặc khi máy không có danh sách (lúc đó KHÔNG quét,
// và tóm tắt đầu phiên nói rõ). Riêng pre-push: có danh sách mà quét lỗi thì từ chối đẩy (thà chặn nhầm còn hơn lọt ra ngoài).
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const P = require('../gate/gate-paths');

const BSN = path.resolve(__dirname, '..', '..', '..');
const ZERO = /^0+$/;
const MAX = 1024 * 1024 * 1024;

// Danh sách từ cấm của máy do bộ chuyển dự án đọc; luật khớp (một từ khớp những cách viết nào) là phần "nghĩ", nằm ở lõi (S-055).
const project = require('../adapters/project/workspace');
const { matcher, linesWith } = require('../core/rules/lib/banned-words');

// Trả mảng từ (đã bỏ rỗng), hoặc null khi máy không có danh sách hay tệp hỏng.
const loadWords = (root = BSN) => project.loadWords(root);

const git = (cwd, args, input) => spawnSync('git', ['-c', 'core.quotepath=false', ...args], { cwd, encoding: 'utf8', maxBuffer: MAX, input });

// Đọc đầu ra dạng diff (git diff, git log -p; -U0, không gộp đổi tên): trả [{ commit, file, line }] cho tên tệp và dòng THÊM VÀO có từ cấm.
// Dòng bắt đầu bằng \x01 là mốc commit (do --format đặt).
function hitsInPatch(text, re) {
  const hits = [];
  let commit = '';
  let file = '';
  let line = 0;
  for (const l of String(text).split('\n')) {
    if (l.startsWith('\x01')) { commit = l.slice(1).trim(); file = ''; continue; }
    if (l.startsWith('+++ ')) {
      file = l.slice(4).replace(/^b\//, '').replace(/^"|"$/g, '');
      if (file !== '/dev/null' && re.test(file)) hits.push({ commit, file, line: 0 });
      continue;
    }
    if (l.startsWith('--- ') || l.startsWith('diff --git ')) continue;
    const h = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(l);
    if (h) { line = Number(h[1]); continue; }
    if (l.startsWith('+')) { if (file && re.test(l.slice(1))) hits.push({ commit, file, line }); line++; }
  }
  return hits;
}

function report(hits, what) {
  const seen = new Set();
  const rows = [];
  for (const h of hits) {
    const row = `${h.commit ? `${h.commit.slice(0, 12)} ` : ''}${h.file}${h.line ? `:${h.line}` : h.file === '(lời nhắn commit)' ? '' : ' (tên tệp)'}`;
    if (!seen.has(row)) { seen.add(row); rows.push(row); }
  }
  process.stderr.write([
    `BSN_ TỪ CẤM: ${what} có từ nằm trong danh sách cấm của máy này (${rows.length} chỗ). Từ chối.`,
    ...rows.slice(0, 40).map((r) => `  ${r}`),
    rows.length > 40 ? `  ... còn ${rows.length - 40} chỗ` : '',
    'Danh sách từ: tệp ở máy do người dùng giữ (đường dẫn: xem tóm tắt đầu phiên). Sửa nội dung, tên tệp hay lời nhắn rồi làm lại; không chép từ trong danh sách vào đâu.',
  ].filter(Boolean).join('\n') + '\n');
}

function preCommit(cwd, re) {
  const r = git(cwd, ['diff', '--cached', '-U0', '--no-renames', '--no-color', '--no-ext-diff']);
  if (r.status !== 0) return 0;
  const hits = hitsInPatch(r.stdout, re);
  if (!hits.length) return 0;
  report(hits, 'phần sắp commit');
  return 1;
}

function commitMsg(file, re) {
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch { return 0; }
  const body = text.split('\n').filter((l) => !l.startsWith('#')).join('\n');
  if (!re.test(body)) return 0;
  report([{ commit: '', file: '(lời nhắn commit)', line: 0 }], 'lời nhắn commit');
  return 1;
}

// Mọi commit trong `range` (đối số của git log): lời nhắn, tên tệp, dòng thêm vào. Trả { hits, error }.
function historyHits(cwd, range, re) {
  const hits = [];
  const m = git(cwd, ['log', '--format=%H%x00%B%x01', ...range]);
  if (m.status !== 0) return { hits, error: (m.stderr || '').trim() || 'git log lỗi' };
  for (const chunk of m.stdout.split('\x01')) {
    const [sha, body] = chunk.trim().split('\x00');
    if (sha && body && re.test(body)) hits.push({ commit: sha.trim(), file: '(lời nhắn commit)', line: 0 });
  }
  const p = git(cwd, ['log', '--format=%x01%H', '-p', '-m', '-U0', '--no-renames', '--no-color', '--no-ext-diff', ...range]);
  if (p.status !== 0) return { hits, error: (p.stderr || '').trim() || 'git log -p lỗi' };
  hits.push(...hitsInPatch(p.stdout, re));
  return { hits, error: '' };
}

function prePush(cwd, remote, stdin, re) {
  const all = [];
  for (const l of String(stdin).split('\n')) {
    const [, local, , remoteSha] = l.trim().split(/\s+/);
    if (!local || ZERO.test(local)) continue; // xóa nhánh ở remote: không có gì đẩy lên
    const fresh = [local, '--not', `--remotes=${remote || 'origin'}`];
    let r = ZERO.test(remoteSha || '0') ? historyHits(cwd, fresh, re) : historyHits(cwd, [`${remoteSha}..${local}`], re);
    if (r.error && !ZERO.test(remoteSha || '0')) r = historyHits(cwd, fresh, re); // máy chưa có commit phía remote: quét mọi commit chưa thuộc remote
    if (r.error) { process.stderr.write(`BSN_ TỪ CẤM: không quét được các commit sắp đẩy (${r.error}). Từ chối đẩy cho tới khi quét được.\n`); return 1; }
    all.push(...r.hits);
  }
  if (!all.length) return 0;
  report(all, 'các commit sắp đẩy');
  return 1;
}

// Quét tay: tệp đang theo dõi (đọc từ đĩa) và, khi có --history, mọi commit của mọi nhánh.
function scan(cwd, re, { history = false } = {}) {
  const hits = [];
  const ls = git(cwd, ['ls-files', '-z']);
  for (const f of (ls.stdout || '').split('\0').filter(Boolean)) {
    if (re.test(f)) hits.push({ commit: '', file: f, line: 0 });
    let buf;
    try { buf = fs.readFileSync(path.join(cwd, f)); } catch { continue; }
    if (buf.includes(0)) continue;
    for (const n of linesWith(buf.toString('utf8'), re)) hits.push({ commit: '', file: f, line: n });
  }
  let error = '';
  if (history) { const r = historyHits(cwd, ['--all'], re); hits.push(...r.hits); error = r.error; }
  return { hits, error };
}

function main(argv) {
  const [mode, a1] = argv;
  // pre-push còn dò nội dung BSN_/docs/ (S-062), kể cả khi máy không có danh sách từ cấm. Nằm ở đây để git hook đã cài ở mọi repo
  // (gọi `banned-scan.js pre-push`) có thêm phép dò mà không phải cài lại hook nào.
  let pushStdin = null;
  if (mode === 'pre-push') {
    try { pushStdin = fs.readFileSync(0, 'utf8'); } catch { pushStdin = ''; }
    if (require('./docs-guard').prePush(process.cwd(), a1, pushStdin, BSN)) return 1;
  }
  const words = loadWords(BSN);
  if (!words) {
    if (mode === 'scan') { console.log('Máy này không có danh sách từ cấm: KHÔNG quét.'); return 0; }
    return 0;
  }
  const re = matcher(words);
  const cwd = process.cwd();
  if (mode === 'pre-commit') return preCommit(cwd, re);
  if (mode === 'commit-msg') return commitMsg(a1, re);
  if (mode === 'pre-push') return prePush(cwd, a1, pushStdin, re);
  if (mode === 'scan') {
    const r = scan(cwd, re, { history: argv.includes('--history') });
    if (r.error) console.log(`KHÔNG quét được lịch sử: ${r.error}`);
    if (!r.hits.length) { console.log(`Sạch: không có từ cấm${argv.includes('--history') ? ' (tệp đang theo dõi và mọi commit)' : ' (tệp đang theo dõi; thêm --history để quét mọi commit)'}.`); return r.error ? 1 : 0; }
    report(r.hits, 'repo này');
    return 1;
  }
  console.error('Dùng: banned-scan.js pre-commit | commit-msg <tệp> | pre-push <remote> | scan [--history]');
  return 2;
}

module.exports = { main, loadWords, matcher, linesWith, hitsInPatch, historyHits, scan };
if (require.main === module) process.exit(main(process.argv.slice(2)));
