'use strict';
// spec: HOOK-S-002
// CỬA VÀO: PreToolUse (Write|Edit|NotebookEdit|Bash), dùng chung cho mọi service. Luật "tệp do công cụ docs sở hữu chỉ ghi qua công cụ"
// nằm ở core/rules/owned.js; tệp này chỉ nối bộ chuyển Claude Code với luật đó (S-055). Với Bash, bộ chuyển phân tích đích ghi thật
// bằng bộ phân tích của gate (bash-targets.js) rồi đưa kết quả cho luật.
// Hook lỗi thì cho qua (fail open), nên đừng coi đây là chốt chặn duy nhất.
if (require.main === module) require('./wire').hook({ name: 'guard-owned', id: 'owned', kind: 'before-action', shell: true });
