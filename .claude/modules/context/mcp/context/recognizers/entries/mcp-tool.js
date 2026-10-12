'use strict';
// spec: CTX-S-003
// Bộ nhận dạng CỬA VÀO: công cụ MCP mà một máy chủ MCP cung cấp cho phiên Claude. Đọc bằng mẫu văn bản:
//   JavaScript: một dòng `name: 'ten_cong_cu',` mà trước định nghĩa kế tiếp (tối đa 24 dòng) có `inputSchema` (hình dạng của một định nghĩa công cụ MCP).
//   Python:     decorator `@<máy-chủ>.tool(...)` đứng ngay trước một `def tên(`.
// Không thấy công cụ có tên dựng lúc chạy hay đăng ký qua vòng lặp.
const NAME = /^\s*name:\s*(['"])([A-Za-z][\w-]*)\1\s*,?\s*$/;

function find(file, text, lang) {
  const out = [];
  const rows = text.split('\n');
  if (lang === 'js') {
    rows.forEach((l, i) => {
      const m = NAME.exec(l);
      if (!m) return;
      // Tìm `inputSchema` trong các dòng kế, dừng ở định nghĩa kế tiếp (mô tả của một công cụ có thể dài nhiều dòng).
      for (let j = i + 1; j < Math.min(rows.length, i + 25) && !NAME.test(rows[j]); j++) if (/\binputSchema\b/.test(rows[j])) { out.push({ name: m[2], line: i + 1 }); break; }
    });
  } else if (lang === 'py') {
    rows.forEach((l, i) => {
      if (!/^\s*@\w[\w.]*\.tool\s*(\(|$)/.test(l)) return;
      for (let j = i + 1; j < Math.min(rows.length, i + 4); j++) { const m = /^\s*(?:async\s+)?def\s+([A-Za-z]\w*)/.exec(rows[j]); if (m) { out.push({ name: m[1], line: j + 1 }); break; } }
    });
  }
  return out;
}

// Trên sơ đồ, công cụ gom theo phần đầu của tên (trước dấu gạch dưới đầu tiên): diagram_save, diagram_get -> "diagram".
const bucket = (name) => name.split('_')[0];

module.exports = { id: 'mcp-tool', label: 'công cụ MCP', group: 'Cửa vào: công cụ MCP cho phiên Claude (đọc từ mã)', unit: 'công cụ', order: 20, find, bucket };
