'use strict';
// spec: GATE-S-009
// CỬA VÀO: PreToolUse (công cụ MCP của harness). Luật "công cụ duyệt kế hoạch chỉ phiên chính được gọi" nằm ở core/rules/delegate-guard.js;
// tệp này chỉ nối bộ chuyển Claude Code với luật đó. Hook lỗi thì cho qua (fail open); công cụ plan_approve tự kiểm ủy quyền nên đây là lớp thêm.
if (require.main === module) require('./wire').hook({ name: 'guard-delegate', id: 'delegate-guard', kind: 'before-action', cwdFallback: 'root', badInput: 'skip' });
