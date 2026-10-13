'use strict';
// spec: LEDG-S-002
// CỬA VÀO: PreToolUse (Write|Edit|NotebookEdit và mọi công cụ bsn-docs). Luật đủ kiến thức nằm ở core/rules/skill.js;
// tệp này chỉ nối bộ chuyển Claude Code với luật đó. Hook lỗi thì cho qua (fail open).
if (require.main === module) require('./wire').hook({ name: 'guard-skill', id: 'skill', kind: 'before-action', cwdFallback: 'root' });
