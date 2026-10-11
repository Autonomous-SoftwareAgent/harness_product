'use strict';
// spec: MCP-S-002
// Lõi ghi an toàn cho tài liệu dùng chung (Node thuần, không thư viện). Mọi lần ghi tài liệu đi qua đây:
//  (a) giữ khóa theo tên cho cả repo (nhiều tiến trình/phiên không ghi chồng nhau);
//  (b) từ chối ghi đè nội dung mà người gọi chưa đọc (expectedSha, dạng so sánh rồi mới ghi);
//  (c) thay tệp NGUYÊN TỬ (tệp tạm cùng thư mục, fsync, đổi tên);
//  (d) cam kết nhiều tệp như MỘT đơn vị, có sao lưu và hoàn tác nếu hỏng giữa chừng;
//  (e) để lại một dòng nhật ký JSONL cho mỗi lần cam kết (băm của từng tệp), dùng để phát hiện sửa tay ngoài công cụ.
// Thiết kế theo mô tả hành vi của lõi lưu trữ bên 9c (chỉ mô tả, không có mã nguồn); đây là bản viết lại độc lập.
//
// Bẫy đã biết (ghi lại để không dẫm lại):
//  - Kiểm băm chỉ an toàn nhờ khóa đang được giữ: commit() luôn tự bọc khóa, KHÔNG xuất hàm cam kết trần.
//  - Người giữ khóa chạy quá staleMs có thể mất khóa cho người khác. Giữ thao tác ngắn.
//  - pid của người dùng khác báo EPERM khi kiểm "còn sống không": phải coi là CÒN SỐNG.
//  - pid bị dùng lại có thể giữ một khóa chết sống đến hết staleMs.
//  - Nhật ký chỉ ghi thêm; nếu cần sống sót qua mất điện thì phải fsync nó (ở đây chỉ làm cho tệp dữ liệu, không làm cho nhật ký).
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const paths = require('../../gate/gate-paths');

const DEFAULTS = { timeoutMs: 10000, staleMs: 120000, pollMs: 100, keepBackups: 20, renameRetries: 8, renameDelayMs: 40 };

class LockedError extends Error {
  constructor(name, waitedMs) {
    super(`Khóa '${name}' đang được giữ bởi tiến trình khác (đã chờ ${waitedMs} ms). Thử lại sau.`);
    this.code = 'LOCKED';
    this.retry_after_ms = 1000;
  }
}
class StaleError extends Error {
  constructor(file, expected, actual) {
    super(`Tệp đã đổi kể từ lần đọc: ${file} (mong đợi ${expected}, hiện ${actual}). Không ghi gì cả; hãy đọc lại rồi làm lại.`);
    this.code = 'STALE_DOCUMENT';
    this.file = file;
  }
}

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const fileSha = (p) => (fs.existsSync(p) ? sha(fs.readFileSync(p)) : null);

// Ngủ đồng bộ (core.js chạy đồng bộ nên khóa cũng phải lấy được đồng bộ).
function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM'; // không có quyền gửi tín hiệu = tiến trình của người dùng khác = CÒN SỐNG
  }
}

function lockIsStale(file, staleMs) {
  let info;
  try {
    info = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return true; // không đọc được (đang ghi dở, hoặc hỏng): coi là cũ sau một nhịp, xem lockHeld
  }
  if (!info || !Number.isFinite(info.ts)) return true;
  if (Date.now() - info.ts > staleMs) return true;
  return !pidAlive(info.pid);
}

// ---------- khóa ----------
const held = new Map(); // `${root}|${name}` -> { depth, token } (tái nhập trong cùng tiến trình)

function acquire(root, name, opts) {
  const file = paths.lockPath(root, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const token = `${process.pid}.${crypto.randomBytes(6).toString('hex')}`;
  const started = Date.now();
  for (;;) {
    try {
      const fd = fs.openSync(file, 'wx');
      try {
        fs.writeSync(fd, JSON.stringify({ pid: process.pid, ts: Date.now(), token }));
      } finally {
        fs.closeSync(fd);
      }
      return { file, token };
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
    // đã có khóa: cũ thì gỡ rồi thử lại ngay; không thì chờ
    let stale = false;
    try {
      stale = lockIsStale(file, opts.staleMs);
      if (stale) {
        // một tệp khóa rỗng/đang ghi dở có thể chỉ là khóa mới của người khác: chờ một nhịp rồi kiểm lại trước khi gỡ
        let empty = false;
        try { empty = fs.readFileSync(file, 'utf8').trim() === ''; } catch { /* mất giữa chừng */ }
        if (empty) { sleep(opts.pollMs); stale = lockIsStale(file, opts.staleMs); }
      }
    } catch { stale = false; }
    if (stale) {
      try { fs.unlinkSync(file); } catch { /* người khác vừa gỡ */ }
      continue;
    }
    if (Date.now() - started >= opts.timeoutMs) throw new LockedError(name, Date.now() - started);
    sleep(opts.pollMs);
  }
}

function release(lock) {
  try {
    const info = JSON.parse(fs.readFileSync(lock.file, 'utf8'));
    if (info.token !== lock.token) return; // khóa đã bị người khác lấy sau khi hết hạn: không gỡ khóa của họ
    fs.unlinkSync(lock.file);
  } catch { /* đã mất */ }
}

// Chạy fn khi giữ khóa `name` của `root`. Tái nhập được. Luôn nhả khóa (kể cả khi fn ném lỗi).
function withLock(root, name, fn, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  const key = `${path.resolve(root)}|${name}`;
  const mine = held.get(key);
  if (mine) {
    mine.depth++;
    try { return fn(); } finally { mine.depth--; }
  }
  const lock = acquire(root, name, opts);
  const entry = { depth: 1, lock };
  held.set(key, entry);
  try {
    return fn();
  } finally {
    held.delete(key);
    release(lock);
  }
}

const holdsLock = (root, name) => held.has(`${path.resolve(root)}|${name}`);

// ---------- ghi tệp nguyên tử ----------
function renameWithRetry(from, to, opts) {
  const rename = opts._rename || fs.renameSync;
  for (let i = 0; ; i++) {
    try {
      return rename(from, to);
    } catch (e) {
      // Trên Windows đổi tên đè lên tệp đang được tiến trình khác mở có thể báo EPERM/EBUSY/EACCES thoáng qua.
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(e.code) || i >= opts.renameRetries) throw e;
      sleep(opts.renameDelayMs * (i + 1));
    }
  }
}

function writeFileAtomic(target, content, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  const dir = path.dirname(target);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(target)}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`);
  try {
    const fd = fs.openSync(tmp, 'w');
    try {
      fs.writeFileSync(fd, content);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    renameWithRetry(tmp, target, opts);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch { /* chưa tạo */ }
    throw e;
  }
  try { // fsync thư mục: một số hệ tệp (và Windows) từ chối, bỏ qua
    const dfd = fs.openSync(dir, 'r');
    try { fs.fsyncSync(dfd); } finally { fs.closeSync(dfd); }
  } catch { /* không hỗ trợ */ }
}

// ---------- nhật ký ----------
function journal(root, entry) {
  try {
    const file = paths.docsJournalPath(root);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`);
  } catch { /* nhật ký không được làm hỏng cam kết */ }
}

// Băm của lần cam kết gần nhất cho từng tệp (đường dẫn tương đối so với `root`), đọc từ đuôi nhật ký. Dùng để phát hiện sửa tay.
function lastShas(root) {
  const out = new Map();
  try {
    const lines = fs.readFileSync(paths.docsJournalPath(root), 'utf8').split('\n').filter(Boolean);
    for (const l of lines) {
      let e;
      try { e = JSON.parse(l); } catch { continue; }
      if (e.event === 'commit' && Array.isArray(e.files)) for (const f of e.files) out.set(f.path, f.sha);
    }
  } catch { /* chưa có nhật ký */ }
  return out;
}

// ---------- cam kết nhiều tệp ----------
function backupInto(root, id, changes, reason) {
  const dir = path.join(paths.docsBackupsDir(root), id);
  fs.mkdirSync(dir, { recursive: true });
  const files = changes.map((c, i) => {
    const existed = fs.existsSync(c.path);
    if (existed) fs.copyFileSync(c.path, path.join(dir, String(i)));
    return { index: i, path: c.path, existed };
  });
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ id, reason, at: new Date().toISOString(), files }, null, 2));
  return { dir, files };
}

function restoreFrom(dir, manifest) {
  for (const f of manifest.files) {
    if (f.existed) writeFileAtomic(f.path, fs.readFileSync(path.join(dir, String(f.index))));
    else { try { fs.unlinkSync(f.path); } catch { /* chưa tạo */ } }
  }
}

function pruneBackups(root, keep) {
  try {
    const base = paths.docsBackupsDir(root);
    const dirs = fs.readdirSync(base).sort(); // id bắt đầu bằng thời gian nên sắp theo tên là theo thời gian
    for (const d of dirs.slice(0, Math.max(0, dirs.length - keep))) fs.rmSync(path.join(base, d), { recursive: true, force: true });
  } catch { /* chưa có */ }
}

// changes: [{ path: tuyệt đối, content: string|Buffer, expectedSha?: string|null }]
//   expectedSha === undefined: không kiểm; === null: tệp phải CHƯA tồn tại; chuỗi: băm sha256 phải khớp lúc này.
// options: { reason, service, lock: tên khóa (mặc định 'docs'), _failAfterWrite: n (chỉ để test) , ...DEFAULTS }
function commit(root, changes, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  const lockName = opts.lock || 'docs';
  const list = changes.filter((c) => c && typeof c.path === 'string');
  if (!list.length) return { id: null, files: [] };
  return withLock(root, lockName, () => {
    // 1. kiểm mọi băm mong đợi trước khi ghi bất cứ thứ gì
    for (const c of list) {
      if (c.expectedSha === undefined) continue;
      const actual = fileSha(c.path);
      if (actual !== c.expectedSha) throw new StaleError(path.relative(root, c.path).split(path.sep).join('/'), c.expectedSha, actual);
    }
    const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(3).toString('hex')}`;
    // 2. sao lưu mọi tệp sẽ bị ghi đè
    const backup = backupInto(root, id, list, opts.reason || '');
    const manifest = JSON.parse(fs.readFileSync(path.join(backup.dir, 'manifest.json'), 'utf8'));
    const written = [];
    try {
      // 3. ghi từng tệp nguyên tử, đọc lại để xác nhận
      list.forEach((c, i) => {
        if (opts._failAfterWrite !== undefined && i >= opts._failAfterWrite) throw new Error('lỗi giả lập giữa chừng (test)');
        writeFileAtomic(c.path, c.content, opts);
        written.push(c);
        const want = sha(Buffer.isBuffer(c.content) ? c.content : Buffer.from(String(c.content)));
        if (fileSha(c.path) !== want) throw new Error(`đọc lại không khớp sau khi ghi: ${c.path}`);
      });
    } catch (err) {
      // 4. hỏng giữa chừng: khôi phục TẤT CẢ từ sao lưu
      try { restoreFrom(backup.dir, manifest); } catch (e2) { err.message += ` (khôi phục cũng lỗi: ${e2.message})`; }
      journal(root, { event: 'rollback', id, reason: opts.reason || '', service: opts.service, error: err.message, files: list.map((c) => path.relative(root, c.path).split(path.sep).join('/')) });
      throw err;
    }
    // 5. nhật ký + dọn sao lưu cũ
    const files = list.map((c) => ({
      path: path.relative(root, c.path).split(path.sep).join('/'),
      sha: sha(Buffer.isBuffer(c.content) ? c.content : Buffer.from(String(c.content))),
    }));
    journal(root, { event: 'commit', id, reason: opts.reason || '', service: opts.service, files });
    pruneBackups(root, opts.keepBackups);
    return { id, files };
  }, opts);
}

// Khôi phục thủ công theo mã sao lưu (id trong nhật ký). Cũng đi qua khóa.
function restore(root, id, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  return withLock(root, opts.lock || 'docs', () => {
    const dir = path.join(paths.docsBackupsDir(root), id);
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    restoreFrom(dir, manifest);
    journal(root, { event: 'restore', id, files: manifest.files.map((f) => path.relative(root, f.path).split(path.sep).join('/')) });
    return manifest.files.length;
  }, opts);
}

module.exports = { withLock, holdsLock, commit, restore, writeFileAtomic, lastShas, fileSha, sha, pidAlive, LockedError, StaleError, DEFAULTS };
