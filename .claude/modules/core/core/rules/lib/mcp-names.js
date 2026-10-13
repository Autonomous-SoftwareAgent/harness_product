'use strict';
// spec: MCP-S-007
// TÊN MÁY CHỦ MCP của harness, phía luật (hàm thuần). Harness có vài máy chủ, mỗi khối một cái: <tiền tố> (lõi), <tiền tố>-docs,
// <tiền tố>-diagrams, ... Công cụ của chúng cùng chịu các luật như nhau (đủ kiến thức, từ cấm, sổ phiên), nên luật hỏi "có phải máy chủ
// của harness không" ở đây thay vì so với một tên. Tên cũ "bsn-docs" (một máy chủ giữ cả bộ) vẫn được nhận: phiên đang mở có thể còn chạy nó.
const LEGACY = 'bsn-docs';
const DEFAULT_PREFIX = 'harness';

// `prefix` lấy từ cấu hình dự án (ws.mcpPrefix); cổng giả không có thì dùng mặc định.
const prefixOf = (ws) => { try { return (ws && typeof ws.mcpPrefix === 'function' && ws.mcpPrefix()) || DEFAULT_PREFIX; } catch { return DEFAULT_PREFIX; } };

function isOwn(server, prefix = DEFAULT_PREFIX) {
  const s = String(server || '');
  return Boolean(s) && (s === LEGACY || s === prefix || s.startsWith(`${prefix}-`));
}

module.exports = { LEGACY, DEFAULT_PREFIX, prefixOf, isOwn };
