'use strict';
// spec: HOOK-S-006
// BỘ CHUYỂN cho Claude Code, phần phiên (S-024, S-054, S-055): gom dữ liệu thô về các phiên Claude Code trên MÁY NÀY thành một ảnh chụp
// trung lập cho lõi (core/sessions/table.js) ghép bảng. Đây là nơi DUY NHẤT của bảng phiên biết tệp nội bộ và lệnh của Claude Code:
//   1. Sổ phiên của Claude Code (<thư mục cấu hình>/sessions/<pid>.json): tên nhắn tin, rảnh hay bận, pid, tên máy, giờ khởi động.
//   2. Nhật ký của phiên (<thư mục cấu hình>/projects/*/<mã phiên>.jsonl): tiêu đề người dùng đặt (custom-title), không có thì tiêu đề máy đặt (ai-title).
//   3. Lệnh `claude agents --json`: các phiên nền của máy này.
// Nguồn 1 và 2 là tệp nội bộ của Claude Code, định dạng có thể đổi: đọc không được thì trả { error }, KHÔNG đoán.
// Chỉ đọc. Không bao giờ ghi vào thư mục cấu hình của Claude Code.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const claudeDir = () => process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const samePath = (a, b) => path.resolve(String(a || '')).toLowerCase() === path.resolve(String(b || '')).toLowerCase();
const TAIL = 2 * 1024 * 1024;
const MAX_SCAN = 96 * 1024 * 1024;

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

// Tiêu đề của một phiên từ nhật ký: bản ghi tiêu đề được ghi lại nhiều lần nên thường nằm ở đuôi tệp; không thấy thì mới đọc cả tệp.
function titleOf(dir, sid) {
  let file = null;
  try {
    for (const p of fs.readdirSync(path.join(dir, 'projects'))) {
      const f = path.join(dir, 'projects', p, `${sid}.jsonl`);
      if (fs.existsSync(f)) { file = f; break; }
    }
  } catch { return null; }
  if (!file) return null;
  const last = (text, key) => {
    const re = new RegExp(`"${key}":"((?:[^"\\\\]|\\\\.)*)"`, 'g');
    let m; let v = null;
    while ((m = re.exec(text))) v = m[1];
    if (v === null) return null;
    try { return JSON.parse(`"${v}"`); } catch { return v; }
  };
  const read = (from, size) => { const fd = fs.openSync(file, 'r'); try { const b = Buffer.alloc(size); fs.readSync(fd, b, 0, size, from); return b.toString('utf8'); } finally { fs.closeSync(fd); } };
  try {
    const size = fs.statSync(file).size;
    let text = read(Math.max(0, size - TAIL), Math.min(size, TAIL));
    let custom = last(text, 'customTitle'); let ai = last(text, 'aiTitle');
    if (custom === null && size > TAIL && size <= MAX_SCAN) { text = read(0, size); custom = last(text, 'customTitle'); if (ai === null) ai = last(text, 'aiTitle'); }
    if (custom) return { title: custom, by: 'người dùng đặt' };
    if (ai) return { title: ai, by: 'máy đặt' };
  } catch { /* nhật ký không đọc được: coi như chưa có tiêu đề */ }
  return null;
}

// ---------- Phiên nằm Ở ĐÂU (S-054) ----------
// Bảng chỉ gồm phiên chạy trên MÁY NÀY, và mỗi dòng mang bằng chứng: tên máy ghi trong sổ của Claude Code (pidDomain), mở từ đâu
// (entrypoint, kind), có Remote Control không (bridgeSessionId), và tiến trình có đúng là tiến trình của phiên đó không (procStart).
// Thiếu trường nào thì ghi "không rõ" hoặc "chưa xác nhận", không đoán.
const hostId = () => `${process.platform}:${os.hostname().toLowerCase()}`;
// Thư mục của một phiên có thuộc dự án này không: chính gốc, hoặc một bản sao làm việc trong .claude/worktrees/ của gốc.
function inRoot(cwd, root) {
  const a = path.resolve(String(cwd || '')).toLowerCase();
  const b = path.resolve(root).toLowerCase();
  return a === b || a.startsWith(path.join(b, '.claude', 'worktrees').toLowerCase() + path.sep);
}
const strip = (s) => String(s || '').replace(/\u001b\[[0-9;?]*[A-Za-z]/g, '').replace(/\u001b\][^\u0007]*\u0007/g, '');

// Lệnh claude: biến BSN_CLAUDE_BIN (test dùng), rồi bản trong extension VS Code (lệnh `claude` thường không có trong PATH ở máy này), rồi PATH.
function findClaude() {
  if (process.env.BSN_CLAUDE_BIN) return process.env.BSN_CLAUDE_BIN;
  try {
    const ext = path.join(os.homedir(), '.vscode', 'extensions');
    const dirs = fs.readdirSync(ext).filter((n) => /^anthropic\.claude-code-/.test(n)).sort();
    for (const d of dirs.reverse()) {
      const exe = path.join(ext, d, 'resources', 'native-binary', process.platform === 'win32' ? 'claude.exe' : 'claude');
      if (fs.existsSync(exe)) return exe;
    }
  } catch { /* không có extension */ }
  return 'claude';
}
function runClaude(args, { root, timeout = 60000 } = {}) {
  // BSN_CLAUDE_BIN trỏ tới một tệp .js (lệnh giả của test) thì chạy nó bằng node: cách này giống nhau trên Windows và Linux.
  const bin = findClaude();
  const [cmd, argv] = /\.c?js$/i.test(bin) ? [process.execPath, [bin, ...args]] : [bin, args];
  let cwd = root;
  try { cwd = fs.realpathSync.native(root); } catch { /* giữ nguyên */ }
  const r = spawnSync(cmd, argv, { cwd, encoding: 'utf8', timeout, windowsHide: true, input: '' });
  return { ok: r.status === 0, out: strip(`${r.stdout || ''}${r.stderr || ''}`), error: r.error && r.error.message };
}
// Danh sách phiên do Claude Code trên máy này quản lý (`claude agents --json`), gồm cả phiên nền. Trả mảng, hoặc { error }.
function agentsList(root) {
  const r = runClaude(['agents', '--json'], { root, timeout: 30000 });
  try { const list = JSON.parse(r.out); if (Array.isArray(list)) return list; } catch { /* báo ở dưới */ }
  return { error: r.error || r.out.trim().slice(0, 200) || 'lệnh claude không trả danh sách' };
}

// Giờ khởi động của các tiến trình, cùng dạng với trường procStart trong sổ của Claude Code. Đã đo trên Windows (2026-10-10): procStart
// là FILETIME (UTC) của tiến trình, khớp từng đơn vị với StartTime.ToFileTimeUtc(). Hệ khác chưa đo: trả rỗng, bảng ghi "chưa xác nhận".
function procStarts(pids) {
  const out = new Map();
  const list = [...new Set(pids)].filter((p) => Number.isInteger(p) && p > 0);
  if (!list.length || process.platform !== 'win32') return out;
  try {
    const script = `Get-Process -Id ${list.join(',')} -ErrorAction SilentlyContinue | ForEach-Object { "$($_.Id) $($_.StartTime.ToFileTimeUtc())" }`;
    const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', timeout: 10000, windowsHide: true, input: '' });
    for (const line of String(r.stdout || '').split(/\r?\n/)) { const m = /^(\d+) (\d+)$/.exec(line.trim()); if (m) out.set(Number(m[1]), m[2]); }
  } catch { /* không đọc được: để rỗng */ }
  return out;
}

const VIA = { 'claude-vscode': 'VS Code', cli: 'terminal' };

// Ảnh chụp cho lõi (dạng ghi ở core/sessions/table.js), CHƯA có phần của sổ harness: `info` mới chỉ có tiêu đề; bên gọi bổ sung
// dịch vụ đã sửa, dịch vụ đã đăng ký và skill đã mở từ sổ của harness.
// Chỉ phiên đang mở ở đúng thư mục gốc này. background: true thì hỏi `claude agents --json`; truyền mảng hoặc { error } thì dùng luôn
// (test, hoặc kết quả của một lần hỏi trước); bỏ trống thì không gộp phiên nền.
function gather(root, { dir = claudeDir(), isAlive = alive, host = hostId(), starts = procStarts, background } = {}) {
  let names;
  try { names = fs.readdirSync(path.join(dir, 'sessions')).filter((n) => n.endsWith('.json')); } catch (e) { return { error: `không đọc được sổ phiên của Claude Code (${path.join(dir, 'sessions')}): ${e.code || e.message}` }; }
  const records = []; let bad = 0;
  for (const n of names) {
    let o;
    try { o = JSON.parse(fs.readFileSync(path.join(dir, 'sessions', n), 'utf8')); } catch { bad += 1; continue; }
    if (!o || typeof o.sessionId !== 'string' || typeof o.name !== 'string') { bad += 1; continue; }
    if (!samePath(o.cwd, root)) continue;
    const at = typeof o.pidDomain === 'string' && o.pidDomain ? (o.pidDomain.toLowerCase() === host.toLowerCase() ? 'here' : 'other') : 'unknown';
    // Số tiến trình của máy khác không có nghĩa gì ở máy này: không kiểm.
    if (at !== 'other' && typeof o.pid === 'number' && !isAlive(o.pid)) continue;
    records.push({
      sid: o.sessionId, name: o.name, nameByUser: o.nameSource === 'user', status: o.status, pid: o.pid, procStart: o.procStart, hostName: o.pidDomain || null, at,
      via: o.kind === 'background' ? 'phiên nền' : VIA[o.entrypoint] || o.entrypoint || null,
      remote: at === 'unknown' && !('bridgeSessionId' in o) ? null : Boolean(o.bridgeSessionId),
    });
  }
  // Giờ khởi động thật của các tiến trình cần đối chiếu (số tiến trình còn tồn tại chưa đủ: có thể đã về tay chương trình khác).
  const need = records.filter((r) => r.at !== 'other' && typeof r.pid === 'number' && r.procStart).map((r) => r.pid);
  let real = new Map();
  try { if (need.length) real = starts(need) || real; } catch { /* không đọc được: chưa xác nhận */ }
  const snap = { host, bad, records, starts: Object.fromEntries(real), info: {} };
  if (background) {
    const list = background === true ? agentsList(root) : background;
    if (!Array.isArray(list)) snap.background = { error: (list && list.error) || 'danh sách phiên nền không đúng dạng' };
    else {
      // Đã đo: phiên nền đang chạy thì danh sách có số tiến trình (pid); phiên đã dừng (dịch vụ nền tắt, máy khởi động lại) thì KHÔNG có pid
      // nhưng vẫn mang state cũ ("blocked").
      snap.background = { list: list.filter((a) => a && a.kind === 'background' && typeof a.sessionId === 'string' && inRoot(a.cwd, root))
        .map((a) => ({ sid: a.sessionId, bgId: a.id || null, name: a.name || '(chưa có tên)', status: a.status || a.state || '?', running: typeof a.pid === 'number' && isAlive(a.pid), sameRoot: samePath(a.cwd, root), cwd: a.cwd })) };
    }
  }
  for (const sid of new Set([...records.map((r) => r.sid), ...((snap.background && snap.background.list) || []).map((a) => a.sid)])) snap.info[sid] = { title: titleOf(dir, sid) };
  return snap;
}

module.exports = { claudeDir, alive, titleOf, hostId, inRoot, findClaude, runClaude, agentsList, procStarts, gather };
