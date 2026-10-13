'use strict';
// spec: MCP-S-006
// LUẬT công cụ GHI RA NGOÀI của máy chủ MCP. Một công cụ của máy chủ phía sau cổng MCP, hoặc của một kết nối do tài khoản quản,
// được dự án khai là "ghi ra ngoài" (tạo việc, sửa trang, gửi tin ở hệ thống khác) thì đi qua cùng chốt với một lần sửa tệp:
// phiên chỉ gọi được khi người dùng đã duyệt kế hoạch của phiên. Công cụ chỉ đọc và công cụ không được khai thì luật không có ý kiến.
// Lõi không biết máy chủ nào tồn tại: cổng "dự án" trả tên máy chủ chủ của công cụ (externalWrite), cổng "sổ" trả kế hoạch đang hiệu lực.
const { deny } = require('../../ports/events');

async function run(event, { workspace: ws, store }) {
  const a = event.action;
  if (!a || a.type !== 'call-tool' || !a.tool) return null;
  let owner = '';
  try { owner = ws.externalWrite(a.tool); } catch { return null; } // không đọc được khai báo: không chặn (doctor báo khai báo hỏng)
  if (!owner) return null;
  const plan = await store.activePlan(event.session);
  if (plan && plan.plan) return null; // người dùng đã duyệt kế hoạch của phiên: được gọi
  const why = plan && plan.invalid ? `kế hoạch đã duyệt không đọc được theo khuôn (${(plan.errors || []).join('; ')})` : 'người dùng CHƯA duyệt kế hoạch nào của phiên này';
  return {
    ...deny(`Công cụ ${a.tool} được dự án khai là GHI RA NGOÀI (máy chủ MCP "${owner}"): nó đổi dữ liệu ở hệ thống khác, khó hoàn tác, nên cần lời duyệt như một lần sửa tệp. Lời gọi này bị chặn vì ${why}. Trình kế hoạch theo khuôn (## Kế hoạch, sáu mục), nêu rõ sẽ ghi gì ra đâu, chờ người dùng duyệt, rồi gọi lại. Công cụ chỉ đọc của cùng máy chủ không bị chặn.`),
    detail: `ghi ra ngoài khi chưa duyệt: ${owner}`,
  };
}

module.exports = { id: 'mcp-writes', on: ['before-action'], run };
