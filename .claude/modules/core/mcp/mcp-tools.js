'use strict';
// spec: MCP-S-001
// spec: HOOK-S-010
// spec: LEDG-S-003
// LỚP DƯỚI của các máy chủ MCP của harness: định nghĩa và chạy công cụ. Tệp này và mọi tệp nó nạp được sửa tự do:
// lớp bề mặt (mcp-server.js) chạy tệp này trong một tiến trình MỚI cho mỗi yêu cầu, nên phiên đang mở dùng mã mới ngay ở lời gọi kế,
// không phải nối lại. Công cụ không giữ gì trong bộ nhớ giữa hai lần gọi (mọi thứ ở tệp, có khóa và giao dịch).
// Công cụ của từng khối nằm trong khối đó (mcp/<việc>/tools.js) và được gom qua bảng đăng ký (khóa `tools` trong tệp tự khai):
// khối tắt thì công cụ của nó không có. Tệp này chỉ giữ công cụ của lõi (phạm vi của phiên).
// Mỗi công cụ thuộc MỘT khối (`block`), và mỗi khối có máy chủ MCP riêng: `list(block)` và `call(name, args, block)` chỉ thấy công cụ của khối đó;
// không truyền khối thì thấy cả bộ (máy chủ cũ một cục, và các lệnh dòng lệnh).
const P = require('../gate/gate-paths');
const engine = require('../adapters/storage/unit-docs');

const ROOT = P.rootFrom(__dirname);
const strs = (description) => ({ type: 'array', items: { type: 'string' }, description });

// Phạm vi của phiên. Hai công cụ này làm việc trên sổ phiên của harness, theo mã phiên Claude Code truyền qua biến môi trường.
const CORE_TOOLS = [
  {
    name: 'scope_register',
    description: 'ĐĂNG KÝ dịch vụ mà phiên sẽ sửa theo kế hoạch người dùng VỪA DUYỆT. Thứ tự bắt buộc: trình kế hoạch theo khuôn (## Kế hoạch, sáu mục: Dịch vụ, Lý do, Làm gì, Sửa tệp, Không làm, Rủi ro) -> người dùng duyệt -> gọi công cụ này -> mới sửa tệp. Chỉ đăng ký được dịch vụ có trong mục "Dịch vụ" của kế hoạch đã duyệt; sửa dịch vụ chưa đăng ký bị hook chặn. Phần dùng chung (docs/system, docs/handoff) không cần đăng ký.',
    inputSchema: { type: 'object', required: ['services'], properties: { services: strs('Tên các dịch vụ cần đăng ký, ví dụ ["billing"]. Đơn vị khai riêng trong cấu hình dự án cũng đăng ký như vậy.') } },
    noService: true,
    run: (a) => {
      const r = require('../hooks/scope-lib').register(ROOT, process.env.CLAUDE_CODE_SESSION_ID, a.services);
      if (!r.ok) throw new Error(r.text);
      return r.text;
    },
  },
  {
    name: 'plan_draft',
    description: 'DỰNG kế hoạch trình người dùng đúng khuôn của cổng duyệt. GỌI công cụ này thay vì tự viết khối "## Kế hoạch": bạn chỉ điền nội dung các trường, công cụ dựng khối chuẩn (tên mục, tiêu đề, mục bắt buộc thêm của dự án) và trả về. ' +
      'Sai nội dung (mục trống, đơn vị không có thật, thiếu mục bắt buộc thêm) thì từ chối ngay kèm lý do. Được thì DÁN NGUYÊN khối trả về vào tin trả lời (lời giải thích viết tự do ở trên hoặc dưới khối), rồi DỪNG chờ người dùng duyệt. Cuối lượt hệ thống kiểm tin kế hoạch có dán đúng khối này không. Chỉ đọc, không đổi tệp nào của dự án. Cách dùng: skill plan.',
    inputSchema: {
      type: 'object',
      required: ['services', 'reason', 'work', 'files', 'skip', 'risks'],
      properties: {
        services: strs('Mục "Dịch vụ": tên các đơn vị sẽ sửa, ví dụ ["harness"]; chỉ đụng phần dùng chung thì truyền []'),
        reason: { description: 'Mục "Lý do": vì sao cần làm việc này (chuỗi, hoặc danh sách chuỗi nối bằng dấu chấm phẩy)' },
        work: { description: 'Mục "Làm gì": các việc sẽ làm' },
        files: { description: 'Mục "Sửa tệp": các tệp và thư mục sẽ sửa' },
        skip: { description: 'Mục "Không làm": điều cố ý không làm' },
        risks: { description: 'Mục "Rủi ro": điều có thể sai, và cách xử lý' },
        extra: { type: 'object', description: 'Các mục bắt buộc thêm mà dự án hay đơn vị đòi (tên mục: nội dung); thiếu thì công cụ nói rõ mục nào' },
      },
    },
    noService: true,
    run: (a) => {
      const F = require('../gate/plan-format');
      const known = [...new Set([...engine.listAllServices(), ...Object.keys(P.extraUnits(ROOT))])].sort();
      const r = F.draftPlan(a, F.loadOptions(ROOT), known);
      if (!r.ok) throw new Error(`Chưa dựng được kế hoạch: ${r.errors.join('; ')}. Sửa các trường đó rồi gọi lại plan_draft.`);
      const sid = process.env.CLAUDE_CODE_SESSION_ID;
      if (sid) { try { require('../gate/gate-state').saveDraft(ROOT, sid, r.block); } catch { /* không ghi được: lưới cuối lượt sẽ nhắc một lần */ } }
      return 'Kế hoạch đúng khuôn. Dán NGUYÊN khối dưới đây vào tin trả lời (không đổi chữ nào), rồi DỪNG chờ người dùng duyệt:\n\n' + r.block;
    },
  },
  {
    name: 'scope_status',
    description: 'Xem phạm vi của phiên này: kế hoạch nào đang được duyệt, kế hoạch nêu dịch vụ nào, đã đăng ký dịch vụ nào, còn thiếu gì. Chỉ đọc.',
    inputSchema: { type: 'object', properties: {} },
    noService: true,
    run: () => require('../hooks/scope-lib').statusText(ROOT, process.env.CLAUDE_CODE_SESSION_ID),
  },
  {
    name: 'session_transfer',
    description: 'CHUYỂN việc của một đơn vị sang một phiên nền MỚI có Remote Control. Chỉ gọi khi người dùng bảo chuyển phiên. Công cụ ghi một tờ bàn giao ' +
      '(phần bạn viết theo khuôn sáu mục, cộng phần máy gom: kế hoạch và phạm vi, skill đã mở, tình trạng git, yêu cầu còn mở), đặt tên phiên mới <đơn-vị>-<số>, ' +
      'tạo phiên, chờ phiên mới đọc tờ bàn giao, rồi trả đường link claude.ai/code để đưa cho người dùng. Thiếu mục, có từ cấm hay bí mật thì từ chối và chưa tạo gì. ' +
      'Phiên này KHÔNG bị dừng; lời duyệt kế hoạch KHÔNG chuyển sang phiên mới. Có thể chạy vài phút. Cách viết sáu mục: skill transfer-session.',
    inputSchema: {
      type: 'object',
      required: ['unit', 'note'],
      properties: {
        unit: { type: 'string', description: 'Đơn vị (dịch vụ) được chuyển, ví dụ "harness"' },
        note: {
          type: 'object',
          description: 'Sáu mục, mỗi mục là chuỗi hoặc danh sách chuỗi; mục không có gì thì ghi "không có"',
          required: ['doing', 'todo', 'decided', 'forbidden', 'traps', 'unverified'],
          properties: {
            doing: { description: 'Đang làm gì: mục tiêu người dùng giao, đang ở bước nào' },
            todo: { description: 'Việc dở theo thứ tự: việc làm trước đứng trước; nêu tệp và lệnh' },
            decided: { description: 'Điều người dùng đã chốt, kèm lời của họ nếu có' },
            forbidden: { description: 'Điều cấm: việc không được làm, thứ không được xóa hay đẩy' },
            traps: { description: 'Bẫy đã gặp và cách tránh' },
            unverified: { description: 'Điều chưa kiểm: đã viết hay đã nói mà chưa chạy thật' },
          },
        },
        model: { type: 'string', description: 'Model cho phiên mới; bỏ trống thì dùng model mặc định của máy' },
      },
    },
    noService: true,
    run: (a) => require('../cli/transfer').run(ROOT, { unit: a.unit, note: a.note, model: a.model, sid: process.env.CLAUDE_CODE_SESSION_ID }),
  },
];

// Công cụ của KHỐI MỞ RỘNG đã xác nhận, tên <tên khối>_<tên công cụ>. Công cụ trùng tên công cụ đã có thì bị bỏ (doctor báo).
// Công cụ nhận cửa sổ nhìn của khối (đọc trong thư mục của khối; ghi chỉ khi khai `write: true`), không nhận tham số `service`.
function extensionTools(taken) {
  const out = [];
  let wire;
  try { wire = require('../hooks/wire'); } catch { return out; }
  const C = require('../core/extensions/contract');
  for (const ext of wire.extensions(ROOT).filter((x) => x.manifest)) {
    for (const t of wire.extensionParts(ext, 'tools').items) {
      const name = C.toolName(ext.name, t.name);
      if (taken.has(name)) continue;
      taken.add(name);
      out.push({
        name, noService: true, extension: ext.key, write: t.write,
        description: `[${ext.scope === 'unit' ? `đơn vị ${ext.name}` : `khối mở rộng ${ext.name}`}] ${t.description}`,
        inputSchema: JSON.parse(JSON.stringify(t.inputSchema)),
        run: (a) => {
          if (t.write && ext.unit) { try { require('../hooks/sessions-lib').mark(ROOT, process.env.CLAUDE_CODE_SESSION_ID, ext.unit); } catch { /* bỏ qua */ } }
          return t.run(a, wire.extensionCtx(ROOT, ext, { kind: 'tool', action: {} }, [], { write: t.write }));
        },
      });
    }
  }
  return out;
}

// Công cụ của các khối đang bật, theo `order` khai trong tệp tự khai, rồi công cụ của lõi, rồi công cụ của khối mở rộng.
// Nạp mỗi lần gọi (tiến trình ngắn).
function tools(block) {
  const out = [];
  const blockOf = new Map(P.mcpServers(ROOT).filter((s) => s.module !== 'core').map((s) => [s.module, s.block]));
  for (const c of P.contributions(ROOT, 'tools')) for (const t of require(c.file).TOOLS) { t.block = blockOf.get(c.module) || 'core'; out.push(t); }
  for (const t of CORE_TOOLS) { t.block = 'core'; out.push(t); }
  try { for (const t of extensionTools(new Set(out.map((x) => x.name)))) { t.block = 'core'; out.push(t); } } catch { /* khối mở rộng hỏng: công cụ của harness vẫn chạy */ }
  // Một server dùng chung cho mọi service: mỗi công cụ nhận thêm `service`. Đơn vị nằm ở đâu và đơn vị mặc định lấy từ cấu hình dự án.
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
  return block ? out.filter((t) => t.block === block) : out;
}

const list = (block) => tools(block).map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));

// Trả { text, isError } hoặc { unknown: true }.
function call(name, args = {}, block) {
  const tool = tools(block).find((t) => t.name === name);
  if (!tool) return { unknown: true };
  try {
    // Công cụ GHI vào một dịch vụ: để lại dấu (kể cả khi lời gọi sau đó bị từ chối) "phiên này vừa làm dịch vụ đó" cho bảng phiên
    // (hook sửa tệp không thấy việc ghi qua MCP). Chỉ có khi Claude Code truyền mã phiên qua biến môi trường; thiếu thì bỏ qua.
    if (!tool.noService && args.service && !/_(get|list|status|check|explore|validate)$/.test(tool.name)) {
      try { require('../hooks/sessions-lib').mark(ROOT, process.env.CLAUDE_CODE_SESSION_ID, String(args.service)); } catch { /* bỏ qua */ }
    }
    const text = tool.noService ? tool.run(args) : engine.withService(args.service, () => tool.run(args));
    // Công cụ của khối mở rộng có thể trả lời hứa; lớp chạy (mcp-worker.js) chờ.
    if (text && typeof text.then === 'function') return text.then((t) => ({ text: String(t), isError: false }), (e) => ({ text: String((e && e.message) || e), isError: true }));
    return { text: String(text), isError: false };
  } catch (e) {
    return { text: e.message, isError: true };
  }
}

module.exports = { list, call, tools };
