'use strict';
// spec: HOOK-S-008
// BỘ CHUYỂN git + đĩa: dò nội dung của `<gốc>/docs/` trong các commit sắp đẩy hay trong một cây thư mục. Chỉ ĐỌC.
// Nội dung docs/ không bao giờ lên remote; repo gốc đã không đẩy, nên đường lọt còn lại là BẢN CHÉP của tệp trong docs/
// nằm trong repo khác (deploy, svc-*, gói sản phẩm) rồi repo đó được đẩy. Hai phép bắt:
//   1. Trùng nội dung: mỗi tệp trong docs/ (bản đã commit của repo gốc VÀ tệp đang có trên đĩa, kể cả docs/portal/) có dấu vân tay là
//      mã băm kiểu git (blob); bản chép nguyên, đổi tên hay dời chỗ vẫn bắt được. Bỏ qua tệp ngắn hơn MIN_BYTES (dễ trùng ngẫu nhiên) và
//      tệp có cùng nội dung với một tệp repo gốc theo dõi NGOÀI docs/ (ví dụ thư viện vẽ chép từ mã harness sang docs/portal/assets/).
//   2. Đường dẫn: docs/system/, docs/handoff/, docs/portal/, docs/tham-chieu/ (bố cục riêng của thư mục docs gốc).
// Không bắt được: bản chép đã sửa vài chữ VÀ đổi cả đường dẫn.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const MIN_BYTES = 200;
const MAX = 1024 * 1024 * 1024;
const ZERO = /^0+$/;
const DOC_PATH = /^docs\/(system|handoff|portal|tham-chieu)\//i;

const git = (cwd, args) => spawnSync('git', ['-c', 'core.quotepath=false', ...args], { cwd, encoding: 'utf8', maxBuffer: MAX });
const blobHash = (buf) => crypto.createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
const same = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

// Dấu vân tay của docs/: Map<mã băm, đường dẫn trong docs/>. Repo gốc chưa có commit (hay không phải repo) thì chỉ dùng tệp trên đĩa.
function fingerprints(root) {
  const ls = git(root, ['ls-tree', '-r', '-l', '-z', 'HEAD']);
  const shared = new Set();
  const map = new Map();
  for (const rec of (ls.status === 0 ? ls.stdout : '').split('\0').filter(Boolean)) {
    const m = /^\d+ blob ([0-9a-f]+)\s+(\d+|-)\t(.*)$/s.exec(rec);
    if (!m) continue;
    const [, sha, size, file] = m;
    if (!/^docs\//.test(file)) shared.add(sha);
    else if (Number(size) >= MIN_BYTES) map.set(sha, file);
  }
  const walk = (dir, rel) => {
    let ents = [];
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const abs = path.join(dir, e.name);
      const r = `${rel}/${e.name}`;
      if (e.isDirectory()) walk(abs, r);
      else if (e.isFile()) {
        let buf;
        try { buf = fs.readFileSync(abs); } catch { continue; }
        if (buf.length >= MIN_BYTES) { const sha = blobHash(buf); if (!map.has(sha)) map.set(sha, r); }
      }
    }
  };
  walk(path.join(root, 'docs'), 'docs');
  for (const sha of shared) map.delete(sha);
  return map;
}

// Lý do một tệp (đường dẫn, mã băm) là nội dung của docs/, hoặc '' khi không phải.
function why(file, sha, fp) {
  if (sha && fp.has(sha)) return `trùng nội dung với ${fp.get(sha)} của dự án`;
  if (DOC_PATH.test(file)) return 'đường dẫn thuộc bố cục của docs/';
  return '';
}

// Tệp thêm hay đổi trong các commit của `range` (đối số git log). Trả { rows: [{ commit, file, sha }], error }.
function changedIn(cwd, range) {
  const r = git(cwd, ['log', '--raw', '--no-abbrev', '--no-renames', '-m', '--format=%x01%H', ...range]);
  if (r.status !== 0) return { rows: [], error: (r.stderr || '').trim() || 'git log lỗi' };
  const rows = [];
  let commit = '';
  for (const l of r.stdout.split('\n')) {
    if (l.startsWith('\x01')) { commit = l.slice(1).trim(); continue; }
    const m = /^:\d+ \d+ [0-9a-f]+ ([0-9a-f]+) ([ACMT])\d*\t(.*)$/.exec(l);
    if (m && !ZERO.test(m[1])) rows.push({ commit, file: m[3].replace(/^"|"$/g, ''), sha: m[1] });
  }
  return { rows, error: '' };
}

// Kiểm các commit sắp đẩy từ repo `cwd`. `refs`: [{ local, remoteSha }] (từ stdin của pre-push; kiểm tay thì HEAD, remoteSha rỗng).
// Trả { leaks: [{ commit, file, why }], error }. Repo gốc thì không dò: nó không bao giờ đẩy.
function checkPush(root, cwd, remote, refs, { fp } = {}) {
  if (same(cwd, root)) return { leaks: [], error: '' };
  if (!require('../../gate/gate-paths').policy(root, 'docsNeverPush')) return { leaks: [], error: '' }; // dự án không bật luật này
  let map = fp;
  try { map = map || fingerprints(root); } catch (e) { return { leaks: [], error: e.message }; }
  const leaks = [];
  for (const { local, remoteSha } of refs) {
    if (!local || ZERO.test(local)) continue; // xóa nhánh ở remote: không có gì đẩy lên
    const fresh = [local, '--not', `--remotes=${remote || 'origin'}`];
    const known = remoteSha && !ZERO.test(remoteSha);
    let r = known ? changedIn(cwd, [`${remoteSha}..${local}`]) : changedIn(cwd, fresh);
    if (r.error && known) r = changedIn(cwd, fresh); // máy chưa có commit phía remote
    if (r.error) return { leaks, error: r.error };
    for (const row of r.rows) { const w = why(row.file, row.sha, map); if (w) leaks.push({ commit: row.commit, file: row.file, why: w }); }
  }
  return { leaks, error: '' };
}

// Kiểm các commit của `ref` (mặc định HEAD) chưa có ở `remote`, như lệnh `git push <remote> <ref>` sẽ đẩy.
function checkRef(root, cwd, remote, ref = 'HEAD') {
  const h = git(cwd, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
  if (h.status !== 0) return { leaks: [], error: '' }; // chưa có commit hay ref lạ: git tự báo khi đẩy, không có gì của ta để dò
  return checkPush(root, cwd, remote, [{ local: h.stdout.trim(), remoteSha: '' }]);
}

// Kiểm một cây thư mục (bỏ qua .git). Trả [{ file, why }]; ném lỗi khi không dựng được dấu vân tay.
function scanDir(root, dir, { fp } = {}) {
  const map = fp || fingerprints(root);
  const out = [];
  const walk = (d, rel) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === '.git') continue;
      const abs = path.join(d, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(abs, r);
      else if (e.isFile()) { const buf = fs.readFileSync(abs); const w = why(r, buf.length >= MIN_BYTES ? blobHash(buf) : '', map); if (w) out.push({ file: r, why: w }); }
    }
  };
  walk(path.resolve(dir), '');
  return out.sort((x, y) => (x.file < y.file ? -1 : x.file > y.file ? 1 : 0)); // thứ tự đọc thư mục khác nhau giữa các hệ điều hành
}

const parseRefs = (stdin) => String(stdin).split('\n').map((l) => l.trim().split(/\s+/)).filter((p) => p[1]).map((p) => ({ local: p[1], remoteSha: p[3] }));

module.exports = { fingerprints, checkPush, checkRef, scanDir, parseRefs, blobHash, why, MIN_BYTES, DOC_PATH };
