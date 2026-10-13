'use strict';
// spec: MCP-S-006
// CỬA VÀO của luật công cụ ghi ra ngoài: PreToolUse cho mọi công cụ MCP (matcher mcp__.*). Luật ở core/rules/mcp-writes.js;
// tệp này chỉ nối bộ chuyển Claude Code với luật đó. Công cụ không được khai là ghi ra ngoài thì đi qua, không in gì.
// Lỗi gì cũng chỉ ghi ra stderr và thoát 0.
if (require.main === module) require('./wire').hook({ name: 'guard-mcp', id: 'mcp-writes', kind: 'before-action', cwdFallback: 'root', badInput: 'skip' });
