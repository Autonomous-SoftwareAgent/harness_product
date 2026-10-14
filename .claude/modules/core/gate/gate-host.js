'use strict';
// spec: GATE-S-005
// spec: GATE-S-007
// spec: GATE-S-001
// BỘ CHUYỂN Claude Code của cổng duyệt. Nơi DUY NHẤT trong gate/ biết dạng dữ liệu hook của Claude Code:
//   vào: JSON trên stdin -> sự kiện chung (cùng dạng với ports/events.js của phần còn lại của harness);
//   ra : quyết định chung -> JSON mà Claude Code hiểu.
// Cổng duyệt là một khối cài riêng được (install.js chép nguyên thư mục gate/ sang dự án khác), nên nó giữ bộ chuyển của riêng mình ở đây
// thay vì nhập adapters/claude-code/hook.js. Hai bộ chuyển phải dịch giống nhau: test acceptance/test/contracts.test.js so từng trường.
const fs = require('node:fs');
const path = require('node:path');

const HOOK_EVENT = { 'before-action': 'PreToolUse', 'session-start': 'SessionStart', 'user-prompt': 'UserPromptSubmit', 'turn-end': 'Stop' };
const WRITE_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit']);

// Đọc dữ liệu hook từ stdin. Không phải JSON thì coi như sự kiện rỗng (cổng đóng vẫn là mặc định an toàn).
function readInput() {
  try { return JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { return {}; }
}

// Dữ liệu hook của Claude Code -> sự kiện chung. `kind` do cửa vào cho biết (nó được khai cho sự kiện nào trong settings.json).
function toEvent(input, { kind, root }) {
  const src = input && typeof input === 'object' ? input : {};
  const ti = src.tool_input && typeof src.tool_input === 'object' ? src.tool_input : {};
  const cwd = src.cwd || process.cwd();
  const tool = String(src.tool_name || '');
  const given = ti.file_path || ti.notebook_path;
  const type = tool === 'Bash' ? 'run-command' : WRITE_TOOLS.has(tool) ? 'write-file' : 'other';
  return {
    kind,
    root,
    session: src.session_id || '',
    cwd,
    action: { type, tool, file: given ? path.resolve(cwd, given) : '', command: type === 'run-command' ? String(ti.command || '') : '' },
    prompt: String(src.prompt || ''),
    reply: typeof src.last_assistant_message === 'string' ? src.last_assistant_message : '',
    scratch: typeof src.scratchpad_dir === 'string' ? src.scratchpad_dir : '',
    again: Boolean(src.stop_hook_active),
  };
}

// Quyết định chung -> chuỗi JSON cho Claude Code ('' nếu không có gì để nói).
// `lang`: ngôn ngữ của dự án; 'en' thì lời được dịch qua messages-en.js ngay trước khi in.
function fromDecision(kind, d, lang = 'vi') {
  if (!d) return '';
  const hookEventName = HOOK_EVENT[kind];
  const reason = lang === 'en' ? require('./messages-en').translate(d.reason) : d.reason;
  if (d.verdict === 'block') return JSON.stringify({ decision: 'block', reason });
  if (d.verdict === 'note') return JSON.stringify({ hookSpecificOutput: { hookEventName, additionalContext: reason } });
  return JSON.stringify({ hookSpecificOutput: { hookEventName, permissionDecision: d.verdict, permissionDecisionReason: reason } });
}

module.exports = { readInput, toEvent, fromDecision, HOOK_EVENT };
