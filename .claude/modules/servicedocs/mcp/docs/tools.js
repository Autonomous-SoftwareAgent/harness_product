'use strict';
// spec: HOOK-S-010
// Công cụ MCP của khối servicedocs (S-064): tài liệu ba tầng, docs/service.yaml, sổ vấn đề. mcp-tools.js gom qua bảng đăng ký
// (khóa `tools` trong modules/servicedocs.json); khối tắt thì các công cụ này không có trong danh sách.
const core = require('./core');
const serviceDoc = require('./service-doc');

const str = (description) => ({ type: 'string', description });
const strs = (description) => ({ type: 'array', items: { type: 'string' }, description });

const TOOLS = [
  {
    name: 'design_record',
    description:
      'Ghi một quyết định design mới vào docs/modules/<module>/1-design.md. Tự tạo module (nếu chưa có), gán ID PREFIX-D-nnn, và tự scaffold khung spec (2-spec.md) và impl (3-impl.md) tương ứng.',
    inputSchema: {
      type: 'object',
      properties: {
        module: str('Tên module, chữ thường, ví dụ: booking, payment'),
        prefix: str('Prefix ID 2-6 ký tự in hoa (chỉ cần khi tạo module mới), ví dụ BOOK. Mặc định lấy 4 ký tự đầu của tên.'),
        title: str('Tiêu đề ngắn của quyết định'),
        decision: str('Quyết định là gì'),
        rationale: str('Vì sao chọn như vậy, đã cân nhắc gì'),
        impacts: str('Ảnh hưởng tới module/service khác, ràng buộc kéo theo'),
        status: { type: 'string', enum: ['proposed', 'accepted', 'superseded', 'rejected'], description: 'Mặc định accepted' },
      },
      required: ['module', 'title', 'decision', 'rationale'],
    },
    run: core.designRecord,
  },
  {
    name: 'design_update',
    description: 'Sửa một quyết định design đã có. Spec/impl liên quan sẽ bị đánh dấu STALE cho tới khi rà lại. Muốn thay thế quyết định thì đặt status=superseded và ghi design mới bằng design_record.',
    inputSchema: {
      type: 'object',
      properties: {
        id: str('ID design, ví dụ BOOK-D-001'),
        title: str('Tiêu đề mới'),
        decision: str('Nội dung quyết định mới'),
        rationale: str('Lý do mới'),
        impacts: str('Ảnh hưởng mới'),
        status: { type: 'string', enum: ['proposed', 'accepted', 'superseded', 'rejected'] },
      },
      required: ['id'],
    },
    run: core.designUpdate,
  },
  {
    name: 'spec_fill',
    description:
      'Điền hoặc rà lại spec (tầng 2) cho một quyết định design: requirement, contract, acceptance, tasks. Gọi lại sau khi design đổi để xóa trạng thái STALE (có thể không truyền trường nào nếu spec vẫn đúng). Spec thành ready khi có cả requirement và acceptance.',
    inputSchema: {
      type: 'object',
      properties: {
        id: str('ID spec, ví dụ BOOK-S-001'),
        requirement: str('Hệ thống phải làm gì (có thể nhiều dòng)'),
        contract: str('API, sự kiện, schema, ràng buộc giao tiếp'),
        acceptance: str('Tiêu chí nghiệm thu kiểm chứng được'),
        tasks: str('Thay toàn bộ danh sách task, dạng "- [ ] việc" mỗi dòng'),
        add_tasks: strs('Thêm task mới vào cuối danh sách'),
      },
      required: ['id'],
    },
    run: core.specFill,
  },
  {
    name: 'impl_link',
    description:
      'Ghi tầng 3: gắn spec với code và test đã làm, trạng thái và chỗ lệch spec. Mọi file code liệt kê phải tồn tại và nên chứa marker "// spec: <ID>". Chỉ dùng khi spec đã ready.',
    inputSchema: {
      type: 'object',
      properties: {
        id: str('ID spec, ví dụ BOOK-S-001'),
        status: { type: 'string', enum: ['planned', 'in-progress', 'done', 'deviated'] },
        code: strs('Đường dẫn file code tương đối từ gốc repo (thay toàn bộ danh sách)'),
        tests: strs('Đường dẫn file test'),
        deviation: str('Chỗ code lệch spec và lý do (tự đặt status=deviated nếu không truyền status)'),
        notes: str('Ghi chú'),
      },
      required: ['id'],
    },
    run: core.implLink,
  },
  {
    name: 'docs_status',
    description: 'Xem tiến độ design -> spec -> impl theo module và các vấn đề (STALE, thiếu, lệch). Không truyền module thì xem tất cả.',
    inputSchema: { type: 'object', properties: { module: str('Tên module (tùy chọn)') } },
    run: core.docsStatus,
  },
  {
    name: 'docs_check',
    description: 'Kiểm tra đồng bộ toàn bộ docs và code: STALE, thiếu khung, code path không tồn tại, marker spec mồ côi. Tự tạo khung còn thiếu và cập nhật docs/_generated/traceability.md.',
    inputSchema: { type: 'object', properties: {} },
    run: () => core.formatCheck(core.check()),
  },
  {
    name: 'service_doc_get',
    description: 'Đọc nguồn có cấu trúc của dịch vụ (docs/service.yaml): nghiệp vụ, kiến trúc kỹ thuật, vấn đề và tiến độ. Đây là nguồn sinh ra docs/_generated/overview.md (cho agent) và trang ba tab của dịch vụ ở BSN_/docs/portal/<dịch-vụ>/ (cho người đọc).',
    inputSchema: { type: 'object', properties: {} },
    run: () => serviceDoc.get(),
  },
  {
    name: 'service_doc_set',
    description:
      'Ghi THAY TOÀN BỘ một phần của docs/service.yaml (đọc bằng service_doc_get trước, sửa rồi ghi lại cả phần). Kiểm lược đồ trước khi ghi; sai thì không ghi gì. ' +
      'section=meta: {title, summary}. ' +
      'section=business: {goal, users:[{who,need}], value:[..], flows:[{id,title,steps:[..]}], out_of_scope:[..], unverified:[..]} (unverified = điều CHƯA kiểm với hệ thống thật). ' +
      'section=architecture: {summary, layers:[{id,title,role,paths:[..]}], components:[{id,title,layer?,role,paths:[..]}], depends_on:[{target,kind:service|external|infra,via,purpose}], provides:[{to,via,purpose}], ' +
      'diagrams?:[] (trường CŨ, không còn được vẽ; sơ đồ mới khai bằng diagram_save), decisions:[{id,title}], ' +
      'diagram_na?:[{type: flowchart|sequence|state|erd|class, reason}] (loại sơ đồ KHÔNG áp dụng cho dịch vụ này, kèm lý do; đang có thì nhớ gửi lại kẻo mất)}. ' +
      'section=progress: {done:[..], doing:[..], next:[..]}. Mã (id) viết chữ thường, số, gạch ngang. Chỉ ghi điều đã đọc thấy trong mã hoặc người dùng đã chốt.',
    inputSchema: {
      type: 'object',
      properties: {
        section: { type: 'string', enum: ['meta', 'business', 'architecture', 'progress'] },
        value: { type: 'object', description: 'Toàn bộ nội dung mới của phần đó, đúng lược đồ nêu trong mô tả công cụ' },
      },
      required: ['section', 'value'],
    },
    run: (a) => serviceDoc.setSection(a),
  },
  {
    name: 'problem_record',
    description: 'Ghi hoặc cập nhật MỘT vấn đề trong sổ "vấn đề và tinh chỉnh" của dịch vụ (tab 3 ở cổng). Bỏ id để tạo mới (tự gán P-nnn); truyền id để cập nhật các trường được truyền. Khi xử lý xong: status=resolved và ghi cách xử lý vào refine.',
    inputSchema: {
      type: 'object',
      properties: {
        id: str('Mã vấn đề đã có, dạng P-001 (bỏ trống để tạo mới)'),
        title: str('Tiêu đề ngắn'),
        severity: { type: 'string', enum: ['low', 'medium', 'high'] },
        status: { type: 'string', enum: ['open', 'refining', 'resolved'] },
        detail: str('Vấn đề là gì, ảnh hưởng tới tiền, đơn hay người dùng thế nào'),
        refine: str('Đã/đang tinh chỉnh thế nào, kết quả đo được'),
        refs: strs('Tham chiếu: mã spec, mã quyết định, đường-dẫn:dòng'),
      },
    },
    run: (a) => serviceDoc.problemRecord(a),
  },
];

module.exports = { TOOLS };
