'use strict';
// spec: HOOK-S-010
// Lệnh dòng lệnh của khối diagrams, góp vào bảng lệnh của cli.js qua khóa `commands` trong modules/diagrams.json.
const fs = require('fs');

function register(on, { argv, cmd, arg, si, core, portal }) {
  on('diagrams', () => {
    // Liệt kê sơ đồ của service theo loại, kèm loại còn thiếu (cùng kết quả với công cụ MCP diagram_list).
    console.log(require('../../mcp/diagrams/diagrams').listDetail());
  });
  on('diagrams-check', () => {
    // Kiểm sơ đồ VẼ THẬT trong trình duyệt không giao diện, trên các trang đã dựng của cổng. Thoát 1 nếu có sơ đồ hỏng, 3 nếu không kiểm được.
    // --record: ghi kết quả vào sổ sức khỏe của cổng (docs/portal/.health.json) và làm mới chân trang tổng; dùng cho lần kiểm tự động.
    const dc = require('../../mcp/diagrams/diagram-check');
    const r = dc.run({ service: si >= 0 ? core.serviceName() : undefined });
    const p = portal();
    if (argv.includes('--record') && si < 0 && p) { p.recordCheck(r); p.build(); }
    console.log(dc.format(r));
    process.exit(r.skipped ? 3 : r.ok ? 0 : 1);
  });
  on(['diagram-save', 'diagram-explain'], () => {
    // Cùng đường ghi với công cụ MCP diagram_save / diagram_explain, nhận dữ liệu từ một tệp JSON (cho phiên chưa nối lại MCP).
    //   diagram-save <tệp.json chứa bản khai báo>     diagram-explain <id> <tệp.json chứa {meaning, read, details, pitfalls}>
    const d = require('../../mcp/diagrams/diagrams');
    const file = cmd === 'diagram-save' ? arg : argv[2];
    if (!file || !fs.existsSync(file)) throw new Error(`Dùng: cli.js --service <tên> ${cmd === 'diagram-save' ? 'diagram-save <tệp.json>' : 'diagram-explain <id> <tệp.json>'}`);
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    console.log(cmd === 'diagram-save' ? d.save({ spec: data }) : d.explain({ id: arg, explain: data }));
  });
  on('diagram-get', () => {
    // Đọc MỘT sơ đồ ở dạng gọn (cùng kết quả với công cụ MCP diagram_get); thêm --json để lấy bản khai báo cần sửa.
    console.log(require('../../mcp/diagrams/diagrams').get({ id: arg, format: argv.includes('--json') ? 'json' : 'gon' }));
  });
  on('diagram-generate', () => {
    // Sơ đồ dữ liệu TỰ SINH từ cơ sở dữ liệu thật (data-reader.js). Đối số là mã sơ đồ đã có (sinh lại theo cấu hình đã lưu), hoặc một tệp JSON
    // { id, title, sources: [tệp khai cấu trúc bảng], command: [lệnh tạo bảng, không qua shell], url_env, url_format, tables? } để tạo lần đầu hay đổi cấu hình.
    if (!arg) throw new Error('Dùng: cli.js --service <tên> diagram-generate <id | tệp.json>');
    const input = fs.existsSync(arg) ? JSON.parse(fs.readFileSync(arg, 'utf8')) : { id: arg };
    console.log(require('../../mcp/diagrams/diagrams').generate(input));
  });
  on('diagrams-restamp', () => {
    // Ghi lại dấu của các phần giải thích CÒN KHỚP với hình (dấu kiểu cũ tính cả đường dẫn tệp nguồn). Không đổi hình hay lời giải thích.
    console.log(require('../../mcp/diagrams/diagrams').restamp());
  });
  on('diagrams-drift', () => {
    // Sơ đồ do người khai mà mã nó vẽ theo đã đổi từ khi hình có dạng hiện tại (đếm dòng đổi trong các tệp `sources`). Chỉ đọc.
    console.log(require('../../mcp/diagrams/diagrams').driftReport());
  });
  on('diagram-remove', () => {
    // Xóa MỘT sơ đồ đã khai báo (tệp do công cụ sở hữu nên không xóa tay được).
    console.log(require('../../mcp/diagrams/diagrams').remove({ id: arg }));
  });
}

module.exports = { register };
