'use strict';
// spec: GATE-S-009
// LUẬT: công cụ duyệt kế hoạch (plan_approve) chỉ do PHIÊN CHÍNH gọi. Agent con dùng chung mã phiên với phiên chính (đã đo), nên công cụ MCP không
// phân biệt được; hook thì thấy mã agent con (event.agent). Một agent con (ví dụ một agent đọc nội dung do phiên làm việc viết) mà gọi được lệnh duyệt
// thì lời duyệt đi qua một kênh không ai canh; nên chặn ở đây, nói rõ lý do.
const { deny } = require('../../ports/events');
const { isOwn, prefixOf } = require('./lib/mcp-names');

const MAIN_ONLY = new Set(['plan_approve', 'session_spawn']);

async function run(event, { workspace: ws }) {
  const a = event.action;
  if (!a || a.type !== 'call-tool' || !event.agent || !MAIN_ONLY.has(a.name) || !isOwn(a.server, prefixOf(ws))) return null;
  return { ...deny(`Công cụ ${a.name} chỉ phiên chính được gọi, không phải agent con: lời duyệt kế hoạch và việc tạo phiên có dấu "do bạn tạo" phải đi qua phiên điều phối mà người dùng đã ủy quyền. Trả kết quả đã đọc về cho phiên chính và để nó quyết.`), detail: `agent con gọi ${a.name}` };
}

module.exports = { id: 'delegate-guard', on: ['before-action'], run, MAIN_ONLY };
