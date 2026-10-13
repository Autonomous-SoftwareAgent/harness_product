'use strict';
// spec: LEDG-S-002
// LUẬT đủ kiến thức (trước khi phiên ghi tệp hoặc gọi công cụ ghi của máy chủ MCP của harness): CHẶN khi phiên chưa nạp đủ kiến thức cho việc đó.
// "Việc nào cần gì" khai ở MỘT nơi: bảng nối skills-map.json. "Phiên đã nạp gì" lấy từ sổ phiên (do luật ledger ghi).
//   - Công cụ ghi của harness (mọi máy chủ khối): cần skill tổng quát, skill của công cụ đó, và tài liệu bắt buộc của dịch vụ được ghi.
//   - Sửa tệp trong một dịch vụ: cần skill tổng quát và tài liệu bắt buộc của dịch vụ đó (CLAUDE.md, docs/agent/STATUS.md).
//   - Tệp khớp một mẫu trong bảng nối (tờ khai báo, workflow): thêm skill của mẫu đó.
// Công cụ đọc không bị chặn. Chế độ trong bảng nối: "enforce" (chặn), "remind" (chỉ nhắc), "off".
// Hàng rào, không phải sandbox: lệnh ghi qua shell không đi qua đây. Không có bảng nối, không mở được sổ, skill hay tệp tài liệu không tồn tại:
// KHÔNG chặn (thà không chặn còn hơn làm phiên kẹt).
const { deny, note } = require('../../ports/events');
const K = require('./lib/knowledge');
const N = require('./lib/mcp-names');

const TOOL_SERVER = N.LEGACY; // tên cũ; máy chủ theo khối nhận qua N.isOwn

async function run(event, { workspace: ws, store }) {
  const map = K.loadMap(ws);
  if (!map || map.mode === 'off' || !event.session) return null;
  const req = K.requirementsFor(ws, map, event.action, (s) => N.isOwn(s, N.prefixOf(ws)));
  if (!req.skills.length && !req.docs.length) return null;
  return store.ledger(async (book) => {
    const agent = event.agent;
    await book.touch(event.session);
    const miss = K.missing(req, await book.have(event.session, agent));
    if (!miss.skills.length && !miss.docs.length) return null;
    const text = K.denyText(miss, { agent, mapRel: ws.skillsMapRel });
    // `detail` (còn thiếu gì) đi vào sổ quyết định của luật cùng dịch vụ; lời cho phiên vẫn là `reason`.
    const detail = [...miss.skills, ...miss.docs.map((d) => d.rel)].join(', ');
    const d = map.mode === 'enforce' ? deny(text) : note(text.replace('Lời gọi này bị chặn vì', 'Nhắc (chưa chặn):'));
    return { ...d, detail, service: req.service || '' };
  }, null);
}

module.exports = { id: 'skill', on: 'before-action', run, TOOL_SERVER };
