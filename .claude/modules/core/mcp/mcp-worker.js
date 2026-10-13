#!/usr/bin/env node
'use strict';
// spec: MCP-S-001
// Chạy MỘT yêu cầu của một máy chủ MCP của harness rồi thoát. Lớp bề mặt (mcp-server.js) gọi tệp này trong tiến trình mới cho mỗi yêu cầu.
// Vào (stdin): { op: 'list' } hoặc { op: 'call', name, arguments }, kèm `block` (khối của máy chủ gọi; không có thì cả bộ). Ra: MỘT dòng cuối bắt đầu bằng dấu MARK, theo sau là JSON kết quả.
// Dòng in ra trước đó (nếu công cụ nào lỡ in) bị lớp bề mặt bỏ qua.
const MARK = '\u001ebsn-docs-result\u001e';
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { input += c; });
process.stdin.on('end', async () => {
  let out;
  try {
    const req = JSON.parse(input || '{}');
    const tools = require('./mcp-tools');
    // Công cụ của khối mở rộng có thể trả lời hứa: chờ.
    out = await (req.op === 'list' ? { tools: tools.list(req.block || undefined) } : tools.call(req.name, req.arguments || {}, req.block || undefined));
  } catch (e) {
    out = { crash: String((e && e.stack) || e).slice(0, 1500) };
  }
  process.stdout.write(`\n${MARK}${JSON.stringify(out)}\n`, () => process.exit(0));
});
