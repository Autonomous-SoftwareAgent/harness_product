'use strict';
// Công cụ mẫu (chỉ đọc): liệt kê một thư mục trong khối. Trên máy chủ MCP nó có tên <tên khối>_dem_tep.
module.exports = {
  name: 'dem_tep',
  api: '1.0',
  description: 'Đếm và liệt kê các mục trong một thư mục (tính từ thư mục của khối). Chỉ đọc.',
  inputSchema: { type: 'object', properties: { dir: { type: 'string', description: 'Thư mục, tính từ thư mục của khối. Bỏ trống là thư mục gốc của khối.' } } },
  run(args, ctx) {
    const names = ctx.fs.list(args.dir || '.');
    return `${names.length} mục trong ${args.dir || '.'}: ${names.slice(0, 50).join(', ')}${names.length > 50 ? ', ...' : ''}`;
  },
};
