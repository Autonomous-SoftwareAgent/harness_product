#!/usr/bin/env node
'use strict';
// spec: MCP-S-001
// spec: MCP-S-006
// TỆP MỒI của máy chủ MCP của harness (stdio, JSON-RPC 2.0, mỗi dòng một tin, không phụ thuộc gì). ĐÓNG BĂNG từ S-068.
// Phiên Claude Code nạp tệp này MỘT lần và giữ nó thành một tiến trình suốt phiên; sửa tệp này thì mọi phiên đang mở phải nối lại
// (/mcp). Vì vậy tệp này chỉ làm đúng ba việc và KHÔNG chứa chút xử lý nào của giao thức hay của công cụ:
//   1. đọc từng dòng từ Claude Code, đưa cho PHẦN XỬ LÝ (mcp-surface.js và gateway/); viết ra điều phần xử lý trả lời;
//   2. nạp lại phần xử lý khi mã của nó đổi (kể cả giữa hai lời gọi); bản mới không nạp được thì giữ bản tốt gần nhất;
//   3. mã harness dời chỗ thì tìm phần xử lý theo chỗ .mcp.json của dự án đang trỏ (S-067).
// Hệ quả: sửa giao thức, thêm cách nối, thêm máy chủ phía sau, sửa công cụ đều tới phiên đang mở mà không ai phải làm gì.
// Muốn sửa tệp này: cần quyết định mới (nó nằm trong danh sách đường dẫn và nội dung bị khóa của sổ tính năng).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const NAME = 'bsn-docs';
const SURFACE = 'mcp-surface.js';
const WATCH_MS = 3000;
const send = (msg) => { try { process.stdout.write(`${JSON.stringify(msg)}\n`); } catch { /* Claude Code đã đóng ống */ } };
const hashOf = (file) => { try { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); } catch { return ''; } };
const BOOT_HASH = hashOf(__filename);

// Thư mục đang chứa phần xử lý: cạnh tệp này; không còn thì cạnh tệp máy chủ mà .mcp.json của dự án khai (máy chủ cùng tên trước).
function home() {
  if (fs.existsSync(path.join(__dirname, SURFACE))) return __dirname;
  for (const root of [process.env.CLAUDE_PROJECT_DIR, process.cwd()].filter(Boolean)) {
    try {
      const servers = JSON.parse(fs.readFileSync(path.join(root, '.mcp.json'), 'utf8')).mcpServers || {};
      for (const k of Object.keys(servers).sort((a, b) => (b === NAME) - (a === NAME))) {
        const arg = [].concat(servers[k].args || []).find((x) => String(x).endsWith('mcp-server.js'));
        if (!arg) continue;
        const dir = path.dirname(path.resolve(root, String(arg)));
        if (fs.existsSync(path.join(dir, SURFACE))) return dir;
      }
    } catch { /* không có .mcp.json đọc được ở đó */ }
  }
  return __dirname;
}

// Các tệp của phần xử lý (không phải mã công cụ: mã công cụ chạy trong tiến trình riêng cho mỗi lời gọi, luôn là bản mới nhất).
function surfaceFiles(dir) {
  const out = [];
  const add = (d) => { try { for (const n of fs.readdirSync(d)) if (n.endsWith('.js')) out.push(path.join(d, n)); } catch { /* thiếu thư mục */ } };
  try { for (const n of fs.readdirSync(dir)) if (n.startsWith('mcp-surface') && n.endsWith('.js')) out.push(path.join(dir, n)); } catch { /* thiếu */ }
  add(path.join(dir, 'gateway'));
  return out.sort();
}
const stampOf = (files) => files.map((f) => { try { const s = fs.statSync(f); return `${f}:${s.size}:${s.mtimeMs}`; } catch { return `${f}:mất`; } }).join('|');

const state = {}; // túi đồ sống qua các lần nạp lại; chỉ phần xử lý dùng
let cur = null; // { dir, stamp, api }
let failed = ''; // dấu của bản mới nhất KHÔNG nạp được (không thử lại bản đó ở mọi dòng)
let lastError = '';

// Phần xử lý có thể khai thêm tệp nó phụ thuộc nằm ngoài thư mục của nó (api.watch: mảng đường dẫn tuyệt đối): các tệp đó đổi thì
// cũng nạp lại, để tệp mồi này không phải biết bố cục của phần còn lại.
function load() {
  const dir = home();
  const extra = cur && cur.dir === dir ? cur.extra : [];
  const files = surfaceFiles(dir).concat(extra);
  const stamp = `${dir}|${stampOf(files)}`;
  if (cur && cur.stamp === stamp) return cur.api;
  if (stamp === failed && cur) return cur.api;
  try {
    for (const f of files) { try { delete require.cache[require.resolve(f)]; } catch { /* tệp đã mất */ } }
    const mod = require(path.join(dir, SURFACE));
    const api = mod.start({ send, state, dir, bootFile: __filename, bootHash: BOOT_HASH, previousError: lastError });
    if (!api || typeof api.handle !== 'function') throw new Error('phần xử lý không trả hàm handle');
    const old = cur;
    const watch = (Array.isArray(api.watch) ? api.watch : []).filter((f) => typeof f === 'string');
    cur = { dir, extra: watch, stamp: `${dir}|${stampOf(surfaceFiles(dir).concat(watch))}`, api };
    failed = ''; lastError = '';
    if (old && old.api && typeof old.api.stop === 'function') { try { old.api.stop(); } catch { /* bản cũ dọn không xong: bỏ qua */ } }
    if (old) send({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' });
  } catch (e) {
    failed = stamp;
    lastError = String((e && e.stack) || e).split('\n').slice(0, 4).join(' | ').slice(0, 600);
    process.stderr.write(`mcp-server: phần xử lý mới không nạp được, giữ bản tốt gần nhất: ${lastError}\n`);
    if (cur && cur.api && typeof cur.api.loadFailed === 'function') { try { cur.api.loadFailed(lastError); } catch { /* bỏ qua */ } }
  }
  return cur ? cur.api : null;
}

// Chưa từng nạp được phần xử lý nào: trả lời đủ để phiên không treo, và nói rõ lỗi là của harness.
function fallback(msg) {
  if (msg.id === undefined) return;
  const broken = `bsn-docs: mã công cụ của harness đang hỏng hoặc bị treo, lời gọi này CHƯA chạy (không phải lỗi của tham số). Báo người dùng để phiên harness sửa. Chi tiết: ${lastError || 'không tìm thấy phần xử lý của máy chủ'}`;
  if (msg.method === 'initialize') return send({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: (msg.params && msg.params.protocolVersion) || '2024-11-05', capabilities: { tools: { listChanged: true } }, serverInfo: { name: NAME, version: '3.0.0' } } });
  if (msg.method === 'ping') return send({ jsonrpc: '2.0', id: msg.id, result: {} });
  if (msg.method === 'tools/call') return send({ jsonrpc: '2.0', id: msg.id, result: { isError: true, content: [{ type: 'text', text: broken }] } });
  return send({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: broken } });
}

function dispatch(msg) {
  const api = load();
  if (!api) return fallback(msg);
  try {
    const p = api.handle(msg);
    if (p && typeof p.catch === 'function') p.catch((e) => { if (msg.id !== undefined) send({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: String((e && e.message) || e).slice(0, 500) } }); });
  } catch (e) {
    if (msg.id !== undefined) send({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: String((e && e.message) || e).slice(0, 500) } });
  }
}

setInterval(load, WATCH_MS).unref();

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch (e) { send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: e.message } }); continue; }
    dispatch(msg);
  }
});
process.stdin.on('end', () => { try { if (cur && cur.api && cur.api.stop) cur.api.stop(); } catch { /* bỏ qua */ } process.exit(0); });
