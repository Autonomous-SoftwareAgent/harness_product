'use strict';
// spec: HOOK-S-004
// CỬA VÀO: PreToolUse (Write|Edit|NotebookEdit và công cụ ghi của bsn-docs). Luật từ cấm (S-034) nằm ở core/rules/banned.js;
// tệp này chỉ nối bộ chuyển Claude Code với luật đó (S-055). Tệp này không chứa và không in lại từ nào. Hook lỗi thì cho qua.
if (require.main === module) require('./wire').hook({ name: 'guard-banned', id: 'banned', kind: 'before-action', cwdFallback: 'root' });
