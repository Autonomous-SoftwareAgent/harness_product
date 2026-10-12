'use strict';
// spec: MCP-S-001
// spec: HOOK-S-010
// spec: LEDG-S-003
// LỚP DƯỚI của máy chủ MCP bsn-docs: định nghĩa và chạy công cụ. Tệp này và mọi tệp nó nạp được sửa tự do:
// lớp bề mặt (mcp-server.js) chạy tệp này trong một tiến trình MỚI cho mỗi yêu cầu, nên phiên đang mở dùng mã mới ngay ở lời gọi kế,
// không phải nối lại. Công cụ không giữ gì trong bộ nhớ giữa hai lần gọi (mọi thứ ở tệp, có khóa và giao dịch).
// Công cụ của từng khối nằm trong khối đó (mcp/<việc>/tools.js) và được gom qua bảng đăng ký (S-064, khóa `tools` trong tệp tự khai):
// khối tắt thì công cụ của nó không có. Tệp này chỉ giữ công cụ của lõi (phạm vi của phiên).
const P = require('../gate/gate-paths');
const engine = require('../adapters/storage/unit-docs');

const ROOT = P.rootFrom(__dirname);
const strs = (description) => ({ type: 'array', items: { type: 'string' }, description });

// Phạm vi của phiên (S-050). Hai công cụ này làm việc trên sổ phiên của harness, theo mã phiên Claude Code truyền qua biến môi trường.
const CORE_TOOLS = [
  {
    name: 'scope_register',
    description: 'ĐĂNG KÝ dịch vụ mà phiên sẽ sửa theo kế hoạch người dùng VỪA DUYỆT. Thứ tự bắt buộc: trình kế hoạch theo khuôn (## Kế hoạch, sáu mục: Dịch vụ, Lý do, Làm gì, Sửa tệp, Không làm, Rủi ro) -> người dùng duyệt -> gọi công cụ này -> mới sửa tệp. Chỉ đăng ký được dịch vụ có trong mục "Dịch vụ" của kế hoạch đã duyệt; sửa dịch vụ chưa đăng ký bị hook chặn. Phần dùng chung (docs/system, docs/handoff) không cần đăng ký.',
    inputSchema: { type: 'object', required: ['services'], properties: { services: strs('Tên các dịch vụ cần đăng ký, ví dụ ["provider-service"]. Đơn vị ngoài (infra, harness) cũng là dịch vụ.') } },
    noService: true,
    run: (a) => {
      const r = require('../hooks/scope-lib').register(ROOT, process.env.CLAUDE_CODE_SESSION_ID, a.services);
      if (!r.ok) throw new Error(r.text);
      return r.text;
    },
  },
  {
    name: 'scope_status',
    description: 'Xem phạm vi của phiên này: kế hoạch nào đang được duyệt, kế hoạch nêu dịch vụ nào, đã đăng ký dịch vụ nào, còn thiếu gì. Chỉ đọc.',
    inputSchema: { type: 'object', properties: {} },
    noService: true,
    run: () => require('../hooks/scope-lib').statusText(ROOT, process.env.CLAUDE_CODE_SESSION_ID),
  },
];

// Công cụ của các khối đang bật, theo `order` khai trong tệp tự khai, rồi công cụ của lõi. Nạp mỗi lần gọi (tiến trình ngắn).
function tools() {
  const out = [];
  for (const c of P.contributions(ROOT, 'tools')) out.push(...require(c.file).TOOLS);
  out.push(...CORE_TOOLS);
  // Một server dùng chung cho mọi service: mỗi công cụ nhận thêm `service`. Đơn vị nằm ở đâu và đơn vị mặc định lấy từ cấu hình dự án (S-063).
  const cfg = P.projectConfig(ROOT);
  const base = require('node:path').basename(ROOT);
  const where = cfg.units.parents.map((p) => `${base}/${p}/`).join(', ');
  const extra = Object.keys(P.extraUnits(ROOT))[0];
  const what = [where && `thư mục dưới ${where}`, extra && `một đơn vị ngoài như ${extra}`].filter(Boolean).join(', hoặc ') || `đơn vị khai trong ${require('node:path').relative(ROOT, P.projectConfigPath(ROOT)).split(require('node:path').sep).join('/')}`;
  const dflt = cfg.defaultUnit ? `Bỏ trống = ${cfg.defaultUnit}.` : 'Bắt buộc truyền.';
  for (const t of out) {
    if (t.noService) continue; // công cụ của cả hệ: tự khai tham số service (nếu có), không ép về một dịch vụ
    t.inputSchema.properties = t.inputSchema.properties || {};
    t.inputSchema.properties.service = { type: 'string', description: `Tên service (${what}), có thể là: ${engine.listAllServices().join(', ') || '(chưa có)'}. ${dflt}` };
  }
  return out;
}

const list = () => tools().map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));

// Trả { text, isError } hoặc { unknown: true }.
function call(name, args = {}) {
  const tool = tools().find((t) => t.name === name);
  if (!tool) return { unknown: true };
  try {
    // Công cụ GHI vào một dịch vụ: để lại dấu (kể cả khi lời gọi sau đó bị từ chối) "phiên này vừa làm dịch vụ đó" cho bảng phiên
    // (hook sửa tệp không thấy việc ghi qua MCP). Chỉ có khi Claude Code truyền mã phiên qua biến môi trường; thiếu thì bỏ qua.
    if (!tool.noService && args.service && !/_(get|list|status|check|explore|validate)$/.test(tool.name)) {
      try { require('../hooks/sessions-lib').mark(ROOT, process.env.CLAUDE_CODE_SESSION_ID, String(args.service)); } catch { /* bỏ qua */ }
    }
    const text = tool.noService ? tool.run(args) : engine.withService(args.service, () => tool.run(args));
    return { text: String(text), isError: false };
  } catch (e) {
    return { text: e.message, isError: true };
  }
}

module.exports = { list, call };
