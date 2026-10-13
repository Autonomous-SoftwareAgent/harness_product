'use strict';
// spec: HOOK-S-003
// spec: HOOK-S-006
// CỬA VÀO của bảng phiên: biết phiên Claude Code nào đang sửa dịch vụ nào, để nhắn đúng phiên và cảnh báo khi hai phiên
// cùng làm một dịch vụ. Tệp này chỉ GHÉP:
//   dữ liệu thô về phiên trên máy này   adapters/claude-code/sessions.js (tệp nội bộ và lệnh của Claude Code)
//   dịch vụ đã sửa, đã đăng ký, skill   sổ của harness (hooks/scope-lib.js, hooks/ledger-lib.js)
//   ghép thành bảng và viết thành chữ   core/sessions/table.js (thuần)
// Chỉ là dấu hiệu để NHẮC, không phải khóa: phiên ghi qua Bash không để lại dấu, và phiên đã đóng vẫn còn dấu cho tới khi quá hạn.
// Không mở được sổ thì coi như không có phiên nào khác (không cảnh báo).
const T = require('../core/sessions/table');
const host = require('../adapters/claude-code/sessions');
const P = require('../gate/gate-paths');

// [{ sid, services: string[], ageMs }] của các phiên KHÁC, mới nhất trước.
function otherSessions(root, mySid, { withinMs = T.ACTIVE_MS, now = Date.now() } = {}) {
  try { return require('./scope-lib').recentOthers(root, mySid, { withinMs, now }); } catch { return []; }
}
const sessionsOn = (root, mySid, service, opts) => otherSessions(root, mySid, opts).filter((s) => s.services.includes(service));

// Ghi "phiên này vừa làm dịch vụ X" vào sổ mà KHÔNG tính là một lần sửa tệp. Dùng cho việc ghi qua công cụ bsn-docs, thứ hook sửa tệp
// không thấy. Lỗi thì im lặng.
function mark(root, sid, service, now = Date.now()) {
  if (!sid || !service) return false;
  try {
    if (!P.serviceHasRepo(root, service)) return false;
    require('./scope-lib').noteEdit(root, sid, service, { count: false, now });
    return true;
  } catch { return false; }
}

// Bảng phiên của dự án ở `root` (dạng ghi ở core/sessions/table.js). Chỉ phiên đang mở ở đúng thư mục gốc này.
// background: true thì hỏi `claude agents --json`; truyền mảng thì dùng mảng đó (test); bỏ trống thì không gộp phiên nền.
function table(root, { now = Date.now(), mySid = process.env.CLAUDE_CODE_SESSION_ID, ...opts } = {}) {
  const snap = host.gather(root, opts);
  for (const sid of Object.keys(snap.info || {})) {
    const i = snap.info[sid];
    try {
      const scope = require('./scope-lib');
      i.edits = scope.editsOf(root, sid);
      i.registered = scope.registeredOf(root, sid);
    } catch { i.edits = []; i.registered = null; /* không có sổ: coi như phiên chưa sửa dịch vụ nào */ }
    // Skill phiên đã mở (sổ phiên); chưa có sổ thì để trống.
    try { i.skills = require('./ledger-lib').skillsOf(root, sid); } catch { i.skills = []; }
    // Thứ chỉ nạp một lần lúc phiên mở (CLAUDE.md gốc, máy chủ MCP) đã đổi mà phiên chưa được nhắc; null = phiên chưa có dấu gốc.
    try {
      const R = require('../core/rules/reload');
      const items = require('../adapters/project/workspace').loadedOnce(root);
      const notes = require('./scope-lib').notesOf(root, sid, R.NOTE_PREFIXES);
      i.stale = R.staleOf(items, notes);
      // Riêng tệp mồi của máy chủ MCP: phiên phải được nối lại mới nhận bản mới (lệnh refresh dựng lại phiên nền đang rảnh).
      i.staleMcp = Boolean((R.staleOf(items.filter((x) => x.id === 'mcp'), notes) || []).length);
    } catch { i.stale = null; i.staleMcp = false; }
  }
  return T.build(snap, { now, mySid });
}

const sessionsFor = (root, service, opts = {}) => T.forService(table(root, opts).rows, service);
const tableText = (root, opts = {}) => T.text(table(root, opts), { withBackground: opts.background });
const myTitle = (sid, dir = host.claudeDir()) => host.titleOf(dir, sid);

module.exports = {
  hostId: host.hostId, inRoot: host.inRoot, findClaude: host.findClaude, runClaude: host.runClaude, agentsList: host.agentsList, procStarts: host.procStarts, titleOf: host.titleOf,
  statusText: T.statusText, whereText: T.whereText, ago: T.ago, ACTIVE_MS: T.ACTIVE_MS,
  myTitle, otherSessions, sessionsOn, table, tableText, sessionsFor, mark,
};
