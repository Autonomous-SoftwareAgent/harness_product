'use strict';
// spec: HOOK-S-010
// Công cụ MCP của khối portal (S-064): dựng lại cổng HTML. mcp-tools.js gom qua bảng đăng ký (khóa `tools` trong modules/portal.json).
const TOOLS = [
  {
    name: 'portal_build',
    description: 'Dựng lại cổng HTML BSN_/docs/portal/: trang ba tab của từng dịch vụ (từ bản đã commit của repo dịch vụ) và trang tổng chỉ gom liên kết tới các trang đó. Cổng cũng tự dựng lại sau mỗi commit và khi kết thúc lượt.',
    inputSchema: { type: 'object', properties: {} },
    noService: true,
    run: () => require('./portal').build().summary,
  },
];

module.exports = { TOOLS };
