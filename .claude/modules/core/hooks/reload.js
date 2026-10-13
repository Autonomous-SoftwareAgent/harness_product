'use strict';
// spec: HOOK-S-012
// CỬA VÀO của luật nhắc nạp lại: thứ chỉ nạp một lần lúc phiên mở (tệp hướng dẫn ở gốc, máy chủ MCP) đổi giữa phiên thì nhắn phiên.
// Luật ở core/rules/reload.js; tệp này chỉ nối bộ chuyển Claude Code với luật đó.
//   node reload.js start    (SessionStart: ghi dấu lúc nạp)
//   node reload.js prompt   (UserPromptSubmit: so dấu, lệch thì nhắc một lần)
// Lỗi gì cũng chỉ ghi ra stderr và thoát 0.
const KIND = { start: 'session-start', prompt: 'user-prompt' };

if (require.main === module) {
  const kind = KIND[process.argv[2]];
  if (!kind) process.exit(0);
  require('./wire').hook({ name: 'reload', id: 'reload', kind, cwdFallback: 'root', badInput: 'skip' });
}
