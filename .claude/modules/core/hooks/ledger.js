'use strict';
// spec: LEDG-S-001
// CỬA VÀO của sổ phiên (S-032). Luật ghi sổ nằm ở core/rules/ledger.js; tệp này chỉ nối bộ chuyển Claude Code với luật đó (S-055).
//   node ledger.js record   (PostToolUse, mọi công cụ)
//   node ledger.js prompt   (UserPromptSubmit)
//   node ledger.js start    (SessionStart)
// Lỗi gì cũng chỉ ghi ra stderr và thoát 0.
const KIND = { record: 'after-action', prompt: 'user-prompt', start: 'session-start' };

if (require.main === module) {
  const kind = KIND[process.argv[2]];
  if (!kind) process.exit(0);
  require('./wire').hook({ name: 'ledger', id: 'ledger', kind, cwdFallback: 'root', badInput: 'empty' });
}
