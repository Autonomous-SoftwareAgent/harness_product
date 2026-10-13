'use strict';
// spec: HOOK-S-013
// CỬA VÀO của luật nhắc đọc tờ bàn giao: phiên nhận việc từ một phiên khác mà chưa đọc tờ bàn giao thì bị nhắc ở đầu phiên và mỗi lượt.
// Luật ở core/rules/transfer.js; tệp này chỉ nối bộ chuyển Claude Code với luật đó.
//   node transfer.js start    (SessionStart)
//   node transfer.js prompt   (UserPromptSubmit)
// Lỗi gì cũng chỉ ghi ra stderr và thoát 0.
const KIND = { start: 'session-start', prompt: 'user-prompt' };

if (require.main === module) {
  const kind = KIND[process.argv[2]];
  if (!kind) process.exit(0);
  require('./wire').hook({ name: 'transfer', id: 'transfer', kind, cwdFallback: 'root', badInput: 'skip' });
}
