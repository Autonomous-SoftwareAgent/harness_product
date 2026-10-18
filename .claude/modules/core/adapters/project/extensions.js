'use strict';
// spec: HOOK-S-011
// BỘ CHUYỂN của khối mở rộng: mọi việc với đĩa và git của khối mở rộng. Không quyết định gì; hợp đồng và cách gộp quyết định
// nằm ở core/extensions/contract.js, phần lắp ráp ở hooks/wire.js.
//   - Tìm khối: cả dự án ở <thư mục dự án>/extensions/<tên>/module.json; một đơn vị ở <thư mục đơn vị>/.harness/module.json.
//   - Dấu vân tay của thư mục khối (mã băm của mọi tệp, theo đường dẫn), sổ xác nhận, bản đã xác nhận.
//   - Mã của khối CHỈ chạy từ bản đã xác nhận chép ở .claude/local/extensions/<khóa>/: sửa tệp trong repo không đổi mã đang chạy, xóa
//     tệp cũng không tắt được luật chặn, cho tới khi người dùng xác nhận lại (ngoài phiên Claude).
//   - Cửa sổ nhìn của khối: đọc tệp và hỏi git chỉ trong thư mục gốc của nó (đơn vị, hoặc gốc dự án).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const P = require('../../gate/gate-paths');

const MAX_FILES = 200;
const MAX_BYTES = 2 * 1024 * 1024;
const SKIP_DIRS = new Set(['node_modules', '.git']);
// Trong <đơn vị>/.harness/ còn có ghi chép và tệp cửa vào của đơn vị (bố cục gom): chúng KHÔNG thuộc khối mở rộng. Không bỏ qua thì mỗi
// lần ghi tài liệu làm đổi dấu vân tay của khối (bị báo "đã sửa sau khi xác nhận"), và lệnh xác nhận chép cả ghi chép vào bản đã xác nhận.
const NOT_BLOCK_DIRS = new Set(['docs', 'skills', 'notes', 'agents']);
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return undefined; } };
const posix = (p) => p.split(path.sep).join('/');

// Mọi khối mở rộng đang có trên đĩa (bản đang sửa, chưa chắc đã xác nhận): [{ key, scope, name, unit, dir, base, manifestFile, raw }].
//   key   'project:<tên>' hoặc 'unit:<đơn vị>'   base  thư mục khối được nhìn (gốc dự án, hoặc thư mục đơn vị)
//   raw   nội dung module.json (undefined nếu hỏng)
function discover(root) {
  const out = [];
  const ext = P.extensionsDir(root);
  let names = [];
  try { names = fs.readdirSync(ext, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort(); } catch { /* chưa có khối của dự án */ }
  for (const name of names) {
    const dir = path.join(ext, name);
    const manifestFile = path.join(dir, 'module.json');
    if (!fs.existsSync(manifestFile)) continue;
    out.push({ key: `project:${name}`, scope: 'project', name, unit: '', dir, base: root, manifestFile, raw: readJson(manifestFile) });
  }
  for (const { name, dir: unitDir } of P.serviceEntries(root)) {
    const dir = path.join(unitDir, P.UNIT_EXT_DIR);
    const manifestFile = path.join(dir, 'module.json');
    if (!fs.existsSync(manifestFile)) continue;
    out.push({ key: `unit:${name}`, scope: 'unit', name, unit: name, dir, base: unitDir, manifestFile, raw: readJson(manifestFile) });
  }
  return out;
}

// Các tệp của một thư mục khối: [{ rel, abs }], sắp theo đường dẫn. Quá giới hạn thì ném lỗi (khối là mã nhỏ, không phải nơi chứa dữ liệu).
function files(dir, { entry = '' } = {}) {
  const out = [];
  let bytes = 0;
  const walk = (d) => {
    const top = d === dir;
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const abs = path.join(d, e.name);
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name) && !(top && NOT_BLOCK_DIRS.has(e.name))) walk(abs); continue; }
      if (!e.isFile()) continue;
      if (top && entry && e.name === entry) continue; // tệp cửa vào của đơn vị
      bytes += fs.statSync(abs).size;
      out.push({ rel: posix(path.relative(dir, abs)), abs });
      if (out.length > MAX_FILES || bytes > MAX_BYTES) throw new Error(`khối quá lớn (giới hạn ${MAX_FILES} tệp, ${MAX_BYTES / 1024 / 1024} MB)`);
    }
  };
  walk(dir);
  return out;
}

// Dấu vân tay: mã băm của danh sách (đường dẫn, mã băm nội dung). Thư mục không có hay không đọc được thì ''.
function fingerprint(dir, opts) {
  try {
    const h = crypto.createHash('sha256');
    for (const f of files(dir, opts || unitOpts(dir))) h.update(`${f.rel}\0${crypto.createHash('sha256').update(fs.readFileSync(f.abs)).digest('hex')}\n`);
    return h.digest('hex');
  } catch { return ''; }
}

// Thư mục khối là <đơn vị>/.harness thì tệp cửa vào của đơn vị (tên do dự án khai) không thuộc khối.
function unitOpts(dir) {
  if (path.basename(dir) !== P.UNIT_EXT_DIR) return {};
  try { return { entry: P.projectConfig(P.rootFrom(__dirname)).units.entry }; } catch { return { entry: P.LOGICAL_ENTRY }; }
}

const safeKey = (key) => key.replace(':', '-').replace(/[^\w.-]/g, '_');
const trustedCopy = (root, key) => path.join(P.trustDir(root), safeKey(key));
const readTrust = (root) => { const t = readJson(P.trustFile(root)); return t && typeof t === 'object' && t.extensions && typeof t.extensions === 'object' ? t : { extensions: {} }; };

// Tình trạng mọi khối, gồm cả khối đã xác nhận mà tệp trong repo đã bị xóa:
//   state  'trusted'   đang chạy, bản trong repo đúng bản đã xác nhận
//          'changed'   bản trong repo đã sửa: VẪN chạy bản đã xác nhận cho tới khi xác nhận lại
//          'removed'   tệp trong repo đã xóa: VẪN chạy bản đã xác nhận cho tới khi người dùng gỡ
//          'untrusted' chưa xác nhận: không chạy
//   run    thư mục chạy mã (bản đã xác nhận), '' nếu không chạy
function status(root) {
  const trust = readTrust(root).extensions;
  const seen = new Set();
  const out = [];
  for (const e of discover(root)) {
    seen.add(e.key);
    const t = trust[e.key];
    const copy = trustedCopy(root, e.key);
    const live = fingerprint(e.dir);
    const ok = t && fs.existsSync(path.join(copy, 'module.json'));
    out.push({ ...e, fingerprint: live, trusted: ok ? t : null, state: !ok ? 'untrusted' : (t.fingerprint === live ? 'trusted' : 'changed'), run: ok ? copy : '' });
  }
  for (const [key, t] of Object.entries(trust)) {
    if (seen.has(key)) continue;
    const copy = trustedCopy(root, key);
    if (!fs.existsSync(path.join(copy, 'module.json'))) continue;
    const [scope, name] = key.split(':');
    const base = scope === 'unit' ? P.serviceDir(root, name) : root;
    if (scope === 'unit' && !fs.existsSync(base)) continue; // đơn vị không còn: không có gì để giữ
    out.push({ key, scope, name, unit: scope === 'unit' ? name : '', dir: '', base, manifestFile: '', raw: readJson(path.join(copy, 'module.json')), fingerprint: '', trusted: t, state: 'removed', run: copy });
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

// Manifest của bản ĐANG CHẠY (bản đã xác nhận) của một khối.
const runningManifest = (e) => (e.run ? readJson(path.join(e.run, 'module.json')) : undefined);

// Xác nhận một khối: chép bản trong repo vào .claude/local/extensions/<khóa>/ và ghi dấu vân tay. Bên gọi (cli/extension.js) đã kiểm
// manifest và đã từ chối khi chạy trong phiên Claude.
function trust(root, e, now = new Date().toISOString()) {
  const list = files(e.dir, unitOpts(e.dir));
  const copy = trustedCopy(root, e.key);
  fs.rmSync(copy, { recursive: true, force: true });
  for (const f of list) { const to = path.join(copy, ...f.rel.split('/')); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(f.abs, to); }
  const t = readTrust(root);
  t.extensions[e.key] = { fingerprint: fingerprint(e.dir), files: list.length, at: now, from: posix(path.relative(root, e.dir)) };
  fs.mkdirSync(P.trustDir(root), { recursive: true });
  fs.writeFileSync(P.trustFile(root), `${JSON.stringify(t, null, 2)}\n`);
  return t.extensions[e.key];
}

function untrust(root, key) {
  const t = readTrust(root);
  const had = Boolean(t.extensions[key]);
  delete t.extensions[key];
  fs.rmSync(trustedCopy(root, key), { recursive: true, force: true });
  if (had) fs.writeFileSync(P.trustFile(root), `${JSON.stringify(t, null, 2)}\n`);
  return had;
}

// Cửa sổ nhìn của khối: đường dẫn tương đối kiểu posix tính từ `base`; thoát ra ngoài thì ném lỗi.
function inBase(base, rel) {
  const abs = path.resolve(base, String(rel || ''));
  const r = path.relative(base, abs);
  if (r.startsWith('..') || path.isAbsolute(r)) throw new Error(`đường dẫn nằm ngoài thư mục của khối: ${rel}`);
  return abs;
}
function view(base, { write = false } = {}) {
  const fsx = {
    read: (rel) => fs.readFileSync(inBase(base, rel), 'utf8'),
    exists: (rel) => { try { return fs.existsSync(inBase(base, rel)); } catch { return false; } },
    list: (rel = '.') => fs.readdirSync(inBase(base, rel)).sort(),
  };
  if (write) {
    fsx.write = (rel, text) => { const f = inBase(base, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, String(text)); };
  }
  const git = {
    // Tệp đã có trong commit hiện tại (HEAD) của repo chứa `base`.
    isCommitted: (rel) => {
      const abs = inBase(base, rel);
      try { execFileSync('git', ['-C', base, 'cat-file', '-e', `HEAD:./${posix(path.relative(base, abs))}`], { stdio: 'ignore', timeout: 3000 }); return true; } catch { return false; }
    },
  };
  return { fs: fsx, git };
}

// Sổ lỗi lúc chạy (mỗi dòng một JSON). Hook chạy đồng thời: mỗi lần ghi là một lệnh nối ngắn; tệp quá 512 KB thì đổi tên thành .old.
const ERR_MAX = 512 * 1024;
function logError(root, entry, now = new Date().toISOString()) {
  try {
    const f = P.extensionErrorsPath(root);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    try { if (fs.statSync(f).size > ERR_MAX) fs.renameSync(f, `${f}.old`); } catch { /* chưa có tệp */ }
    fs.appendFileSync(f, `${JSON.stringify({ at: now, ...entry })}\n`);
  } catch { /* không ghi được sổ lỗi: bỏ qua, hook vẫn cho qua */ }
}
// Lỗi ghi sau mốc `since` (chuỗi ISO): [{ at, key, rule, kind, error }].
function recentErrors(root, since) {
  let text = '';
  try { text = fs.readFileSync(P.extensionErrorsPath(root), 'utf8'); } catch { return []; }
  const out = [];
  for (const line of text.split('\n')) { try { const e = JSON.parse(line); if (e && e.at >= since) out.push(e); } catch { /* dòng hỏng */ } }
  return out;
}

// Đường dẫn tương đối kiểu posix của `abs` trong `base`, hoặc '' nếu nằm ngoài.
function relIn(base, abs) {
  if (!abs) return '';
  const r = path.relative(base, path.resolve(abs));
  return r && !r.startsWith('..') && !path.isAbsolute(r) ? posix(r) : '';
}

module.exports = { discover, files, fingerprint, status, runningManifest, trust, untrust, view, relIn, logError, recentErrors, trustedCopy, MAX_FILES, MAX_BYTES };
