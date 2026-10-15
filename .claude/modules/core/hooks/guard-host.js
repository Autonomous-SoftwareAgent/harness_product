'use strict';
// spec: HOOK-S-002
// CỬA VÀO: PreToolUse (Write|Edit|NotebookEdit|Bash). Luật "tệp công cụ do harness sinh không sửa tay" nằm ở core/rules/host-generated.js;
// tệp này chỉ nối bộ chuyển Claude Code với luật đó. Với Bash, bộ chuyển phân tích đích ghi thật rồi đưa kết quả cho luật.
// Hook lỗi thì cho qua (fail open), nên đừng coi đây là chốt chặn duy nhất: lệnh đồng bộ lần sau vẫn báo tệp bị sửa tay.
if (require.main === module) require('./wire').hook({ name: 'guard-host', id: 'host-generated', kind: 'before-action', shell: true });
