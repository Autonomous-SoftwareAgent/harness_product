'use strict';
// spec: GATE-S-003
// Nhật ký chẩn đoán của gate (JSONL, chỉ ghi thêm). KHÔNG ghi nội dung tin nhắn, chỉ độ dài và quyết định.
// Có hai việc: (1) dấu vết để biết hook có chạy và đã quyết định gì (hook fail open nên im lặng là nguy hiểm);
// (2) "nhân chứng thứ hai" cho trạng thái: mỗi lần mở/đóng cổng ghi một dòng kèm băm của kế hoạch đã duyệt.
// Ghi nhật ký không bao giờ được làm hỏng hook: mọi lỗi đều nuốt.
const fs = require('node:fs');
const path = require('node:path');
const { diagLogPath } = require('./gate-paths');

const MAX_BYTES = 200 * 1024;
const KEEP_LINES = 400;
const TAIL_BYTES = 128 * 1024;

// Xoay vòng khi quá lớn. Phải GIỮ dòng chuyển trạng thái (gate-open/gate-close) cuối cùng của từng phiên: đó là nhân chứng
// của cổng đang mở, mất nó thì cổng hợp lệ bị báo giả mạo nhầm. Phần còn lại giữ đuôi gần nhất trong ngân sách byte.
const KEEP_SESSIONS = 200;
function rotateIfNeeded(file) {
  try {
    if (fs.statSync(file).size <= MAX_BYTES) return;
    const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
    const lastBySid = new Map();
    for (const l of lines) {
      try {
        const e = JSON.parse(l);
        if (e && (e.event === 'gate-open' || e.event === 'gate-close')) { lastBySid.delete(e.sid); lastBySid.set(e.sid, l); }
      } catch { /* dòng hỏng: bỏ */ }
    }
    const keep = [...lastBySid.values()].slice(-KEEP_SESSIONS);
    let bytes = keep.reduce((n, l) => n + l.length + 1, 0);
    const tail = [];
    for (let i = lines.length - 1; i >= 0 && tail.length < KEEP_LINES; i--) {
      const len = lines[i].length + 1;
      if (bytes + len > MAX_BYTES / 2) break;
      tail.unshift(lines[i]);
      bytes += len;
    }
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, `${[...keep, ...tail].join('\n')}\n`);
    fs.renameSync(tmp, file);
  } catch { /* chưa có tệp hoặc không xoay được: bỏ qua */ }
}

function logEvent(root, entry) {
  try {
    const file = diagLogPath(root);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    rotateIfNeeded(file);
    fs.appendFileSync(file, `${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`);
    return true;
  } catch {
    return false;
  }
}

// Dòng chuyển trạng thái (gate-open / gate-close) gần nhất của một phiên, đọc ngược từ đuôi tệp.
function lastTransition(root, sessionId) {
  try {
    const file = diagLogPath(root);
    const fd = fs.openSync(file, 'r');
    try {
      const size = fs.fstatSync(fd).size;
      const len = Math.min(size, TAIL_BYTES);
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, size - len);
      const lines = buf.toString('utf8').split('\n').filter(Boolean);
      for (let i = lines.length - 1; i >= 0; i--) {
        let e;
        try { e = JSON.parse(lines[i]); } catch { continue; }
        if (e && e.sid === sessionId && (e.event === 'gate-open' || e.event === 'gate-close')) return e;
      }
    } finally {
      fs.closeSync(fd);
    }
  } catch { /* chưa có nhật ký */ }
  return null;
}

module.exports = { logEvent, lastTransition, MAX_BYTES, KEEP_LINES };
