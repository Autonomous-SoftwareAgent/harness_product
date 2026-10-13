'use strict';
// spec: HOOK-S-017
// BỘ CHUYỂN "kho gói": đọc các bản của gói harness từ một bản clone git ở máy (lịch sử của nó là nguồn bản gốc cho phép gộp ba bên).
// Chỉ ĐỌC kho đó; lệnh duy nhất chạm mạng là fetch, và chỉ khi bên gọi yêu cầu. Không đụng thư mục làm việc của bản clone.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const MAX = 256 * 1024 * 1024;
function git(dir, args, { buffer = false, input, timeout = 60000 } = {}) {
  const r = spawnSync('git', ['-C', dir, '-c', 'core.quotepath=false', ...args], { encoding: buffer ? 'buffer' : 'utf8', input, timeout, windowsHide: true, maxBuffer: MAX });
  return { ok: !r.error && r.status === 0, status: r.status, out: r.stdout, err: r.error ? r.error.message : String(r.stderr || '') };
}

const isRepo = (dir) => fs.existsSync(dir) && git(dir, ['rev-parse', '--git-dir']).ok;
// Lấy bản mới về bản clone (chỉ đọc đối với dự án; thư mục làm việc của bản clone không đổi). Trả { ok, text }.
function fetch(dir) {
  const r = git(dir, ['fetch', '--tags', '--quiet', 'origin'], { timeout: 120000 });
  return { ok: r.ok, text: r.ok ? '' : String(r.err).trim().split('\n').pop() };
}
const resolve = (dir, ref) => { const r = git(dir, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]); return r.ok ? String(r.out).trim() : ''; };
// Bản mới nhất của kho gói: nhánh chính ở remote nếu có, không thì commit đang đứng.
function defaultRef(dir) {
  for (const ref of ['origin/main', 'origin/master', 'HEAD']) if (resolve(dir, ref)) return ref;
  return '';
}
function read(dir, ref, rel) {
  const r = git(dir, ['show', `${ref}:${rel}`], { buffer: true });
  return r.ok ? r.out : null;
}
const VERSION_FILE = '.claude/modules/VERSION';
function versionAt(dir, ref) {
  const buf = read(dir, ref, VERSION_FILE);
  return buf ? buf.toString('utf8').trim() : '';
}
// Mọi tệp của một bản, dưới các tiền tố cho trước: { đường dẫn: mã blob của git }.
function tree(dir, ref, prefixes = []) {
  const r = git(dir, ['ls-tree', '-r', '-z', ref, '--', ...prefixes]);
  const out = {};
  if (!r.ok) return out;
  for (const row of String(r.out).split('\0')) {
    const m = /^\d+ blob ([0-9a-f]+)\t(.+)$/.exec(row);
    if (m) out[m[2]] = m[1];
  }
  return out;
}
// Commit phát hành bản `version`: nhãn v<bản> hoặc <bản> nếu có; không thì commit MỚI NHẤT (tính từ `tip` đi lùi) mà tệp số bản ghi đúng bản đó.
function findVersion(dir, version, tip) {
  for (const tag of [`v${version}`, version]) { const c = resolve(dir, `refs/tags/${tag}`); if (c && versionAt(dir, c) === version) return { commit: c, by: `nhãn ${tag}` }; }
  const log = git(dir, ['log', '--format=%H', '-n', '500', tip, '--', VERSION_FILE]);
  if (!log.ok) return null;
  for (const c of String(log.out).split('\n').map((x) => x.trim()).filter(Boolean)) if (versionAt(dir, c) === version) return { commit: c, by: 'lịch sử của tệp số bản' };
  return null;
}

// Mã blob của git cho một nội dung (để so tệp trên đĩa với tệp trong kho mà không phải đọc kho).
const blobId = (buf) => crypto.createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
// Bản clone trên Windows có thể đổi xuống dòng thành CRLF lúc lấy ra, nên tệp đã cài khác kho ở đúng ký tự đó: tính thêm mã của bản LF.
const toLf = (buf) => Buffer.from(buf.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
const blobIds = (buf) => { const raw = blobId(buf); const lf = buf.includes(13) ? blobId(toLf(buf)) : raw; return { raw, lf }; };

const TEXT_EXT = new Set(['.js', '.cjs', '.mjs', '.json', '.md', '.txt', '.yaml', '.yml', '.html', '.css', '.sh', '.cmd', '.ps1', '.gitignore', '']);
const MERGE_MAX = 1024 * 1024;
const isText = (rel, ...bufs) => TEXT_EXT.has(path.extname(rel).toLowerCase()) && bufs.every((b) => b.length <= MERGE_MAX && !b.includes(0));

// Gộp ba bên một tệp văn bản bằng `git merge-file`. Trả { text (Buffer), conflicts } hoặc { unmergeable: true }.
// Bản của bạn và bản gốc được đưa về LF trước khi gộp, để khác biệt xuống dòng không thành đụng nhau giả.
function mergeFile(rel, mine, base, theirs, labels = {}) {
  if (!isText(rel, mine, base, theirs)) return { unmergeable: true, conflicts: 0, text: null };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-merge-'));
  try {
    const f = (name, buf) => { const p = path.join(dir, name); fs.writeFileSync(p, toLf(buf)); return p; };
    const a = f('mine', mine); const b = f('base', base); const c = f('theirs', theirs);
    const r = spawnSync('git', ['merge-file', '-p', '-L', labels.mine || 'ban-cua-ban', '-L', labels.base || 'ban-goc', '-L', labels.theirs || 'ban-moi', a, b, c], { encoding: 'buffer', windowsHide: true, maxBuffer: MAX });
    if (r.error || r.status === null || r.status < 0 || r.status > 127) return { unmergeable: true, conflicts: 0, text: null };
    return { text: r.stdout, conflicts: r.status };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
// Mã JavaScript vừa gộp có còn chạy được không (hai bên cùng thêm một tên thì gộp "sạch" mà nạp là lỗi). Trả '' hoặc lý do.
function syntaxProblem(rel, buf) {
  if (!/\.(c|m)?js$/.test(rel)) return '';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-check-'));
  try {
    const p = path.join(dir, path.extname(rel) === '.mjs' ? 'f.mjs' : 'f.cjs');
    fs.writeFileSync(p, buf);
    const r = spawnSync(process.execPath, ['--check', p], { encoding: 'utf8', windowsHide: true });
    if (r.status === 0) return '';
    const line = String(r.stderr || '').split('\n').find((l) => /Error/.test(l)) || 'mã không qua kiểm cú pháp';
    return line.trim();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
const CONFLICT_RE = /^(<<<<<<<|>>>>>>>) /m;
const hasMarkers = (buf) => CONFLICT_RE.test(buf.toString('utf8'));

module.exports = { isRepo, fetch, resolve, defaultRef, read, versionAt, tree, findVersion, blobId, blobIds, toLf, isText, mergeFile, syntaxProblem, hasMarkers, VERSION_FILE };
