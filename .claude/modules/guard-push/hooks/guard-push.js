'use strict';
// spec: HOOK-S-004
// CỬA VÀO: PreToolUse (Bash). Luật "không đưa mã ra ngoài sai cách" (S-034, S-035) nằm ở core/rules/push.js;
// tệp này chỉ nối bộ chuyển Claude Code với luật đó (S-055). Hook lỗi thì cho qua.
if (require.main === module) require('../../core/hooks/wire').hook({ name: 'guard-push', id: 'push', kind: 'before-action', cwdFallback: 'root' });
