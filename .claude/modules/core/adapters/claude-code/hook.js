'use strict';
// spec: HOOK-S-007
// spec: GATE-S-007
// BỘ CHUYỂN cho Claude Code, phần hook. Đây là nơi DUY NHẤT của các luật biết dạng dữ liệu hook của Claude Code:
//   vào: JSON trên stdin ({ session_id, agent_id, cwd, tool_name, tool_input, prompt, source, stop_hook_active, last_assistant_message, scratchpad_dir })
//        -> sự kiện chung của harness (ports/events.js);
//   ra : quyết định chung -> JSON mà Claude Code hiểu ({ hookSpecificOutput: {...} } hoặc { decision: 'block', reason }).
// Căn cứ đo trên Claude Code thật: ghi ở các quyết định của harness. Claude Code cho qua khi hook hỏng,
// nên mọi lỗi ở đây được viết ra stderr kèm tên cửa vào rồi thoát mã 0: không chặn nhầm, nhưng không im lặng.
const fs = require('node:fs');
const path = require('node:path');
const E = require('../../ports/events');

const HOOK_EVENT = { 'before-action': 'PreToolUse', 'after-action': 'PostToolUse', 'session-start': 'SessionStart', 'user-prompt': 'UserPromptSubmit' };
const WRITE_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit']);
// Claude Code đặt tên công cụ MCP là mcp__<máy chủ>__<công cụ>.
const MCP_TOOL = /^mcp__(.+?)__(.+)$/;

// Dữ liệu hook của Claude Code -> sự kiện chung.
//   kind         loại sự kiện mà cửa vào này nhận (cửa vào biết nó được khai cho sự kiện nào trong settings.json)
//   root         thư mục gốc của dự án
//   cwdFallback  thư mục dùng khi Claude Code không gửi cwd
//   shell        hàm phân tích lệnh (chuỗi -> { targets, inline, unparsable }); chỉ cửa vào nào cần mới đưa vào
function toEvent(input, { kind, root, cwdFallback, shell }) {
  const src = input && typeof input === 'object' ? input : {};
  const ti = src.tool_input && typeof src.tool_input === 'object' ? src.tool_input : {};
  const cwd = src.cwd || cwdFallback || root;
  const tool = String(src.tool_name || '');
  const given = ti.file_path || ti.notebook_path;
  const mcp = MCP_TOOL.exec(tool);
  let type = 'other';
  if (WRITE_TOOLS.has(tool)) type = 'write-file';
  else if (tool === 'Bash') type = 'run-command';
  else if (tool === 'Read') type = 'read-file';
  else if (tool === 'Skill') type = 'open-skill';
  else if (mcp) type = 'call-tool';
  const command = type === 'run-command' ? String(ti.command || '') : '';
  return E.checkEvent({
    kind,
    root,
    session: src.session_id || '',
    agent: typeof src.agent_id === 'string' ? src.agent_id : '',
    agentType: typeof src.agent_type === 'string' ? src.agent_type : '',
    cwd,
    action: {
      type,
      tool,
      file: typeof given === 'string' && given ? path.resolve(cwd, given) : '',
      text: [ti.content, ti.new_string, ti.new_source].filter((x) => typeof x === 'string').join('\n'),
      command,
      shell: type === 'run-command' && shell ? shell(command) : null,
      server: mcp ? mcp[1] : '',
      name: mcp ? mcp[2] : (type === 'open-skill' ? String(ti.skill || '') : ''),
      args: ti,
    },
    prompt: String(src.prompt || ''),
    reply: typeof src.last_assistant_message === 'string' ? src.last_assistant_message : '',
    scratch: typeof src.scratchpad_dir === 'string' ? src.scratchpad_dir : '',
    source: typeof src.source === 'string' ? src.source : '',
    again: Boolean(src.stop_hook_active),
  });
}

// Quyết định chung -> chuỗi JSON cho Claude Code ('' nếu không có gì để nói).
// `lang`: ngôn ngữ của dự án; 'en' thì lời được dịch qua gate/messages-en.js ngay trước khi in.
function fromDecision(kind, decision, lang = 'vi') {
  const d0 = E.checkDecision(kind, decision);
  if (!d0) return '';
  const d = lang === 'en' ? { ...d0, reason: require('../../gate/messages-en').translate(d0.reason) } : d0;
  if (d.verdict === 'block') return JSON.stringify({ decision: 'block', reason: d.reason });
  const hookEventName = HOOK_EVENT[kind];
  if (d.verdict === 'note') return JSON.stringify({ hookSpecificOutput: { hookEventName, additionalContext: d.reason } });
  return JSON.stringify({ hookSpecificOutput: { hookEventName, permissionDecision: d.verdict, permissionDecisionReason: d.reason } });
}

// Chạy một cửa vào hook: đọc stdin, dịch thành sự kiện, gọi `handle(sự kiện)`, dịch quyết định ra stdout, thoát mã 0.
//   name        tên cửa vào, in trong lời báo lỗi
//   badInput    Claude Code gửi thứ không phải JSON: 'skip' (không làm gì) hoặc 'empty' (coi như sự kiện rỗng)
async function serve({ name, kind, root, cwdFallback, shell, badInput = 'skip' }, handle) {
  try {
    let input = {};
    try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { if (badInput === 'skip') process.exit(0); }
    let lang = 'vi';
    try { lang = require('../../gate/gate-paths').projectConfig(root).lang; } catch { /* cấu hình hỏng: tiếng Việt */ }
    const out = fromDecision(kind, await handle(toEvent(input, { kind, root, cwdFallback, shell })), lang);
    if (out) process.stdout.write(out);
  } catch (err) {
    process.stderr.write(`${name}: ${err.message}\n`); // lỗi nội bộ: cho qua, không chặn công cụ
  }
  process.exit(0);
}

module.exports = { toEvent, fromDecision, serve, HOOK_EVENT };
