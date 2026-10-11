'use strict';
// spec: HOOK-S-001
// spec: HOOK-S-005
// CỬA VÀO: PreToolUse (Write|Edit|NotebookEdit) cho phiên mở ở gốc BSN_. Luật phạm vi nằm ở core/rules/scope.js;
// tệp này chỉ nối bộ chuyển Claude Code với luật đó (S-055).
if (require.main === module) require('./wire').hook({ name: 'guard-scope', id: 'scope', kind: 'before-action' });
