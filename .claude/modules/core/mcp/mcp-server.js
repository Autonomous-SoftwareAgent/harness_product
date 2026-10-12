#!/usr/bin/env node
'use strict';
// spec: MCP-S-001
// LỚP BỀ MẶT của máy chủ MCP bsn-docs (stdio, JSON-RPC 2.0, mỗi dòng một tin, không phụ thuộc gì).
// Phiên Claude Code nạp tệp này MỘT lần và giữ nó suốt phiên, nên tệp này chỉ làm ba việc và gần như không bao giờ phải sửa:
//   1. nói giao thức MCP với phiên;
//   2. chuyển mỗi yêu cầu (danh sách công cụ, gọi công cụ) cho LỚP DƯỚI chạy trong một tiến trình MỚI (mcp-worker.js -> mcp-tools.js);
//   3. thấy mã lớp dưới đổi thì lấy lại danh sách công cụ và báo phiên (notifications/tools/list_changed; đã đo: Claude Code lấy lại danh sách).
// Hệ quả: sửa công cụ, thêm bớt công cụ, sửa mô tả đều có hiệu lực ở mọi phiên đang mở mà KHÔNG phải gõ /mcp.
// Chỉ khi sửa chính tệp này thì phiên đang mở mới phải nối lại; khi đó mọi kết quả kèm dòng "CẢNH BÁO bsn-docs".
// Không đặt logic công cụ ở đây.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');

const WORKER = path.join(__dirname, 'mcp-worker.js');
const MARK = '\u001ebsn-docs-result\u001e';
const CALL_TIMEOUT_MS = 20 * 60 * 1000; // diagram_generate và portal_build có thể chạy lâu
const WATCH_MS = 3000;

const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
const parse = (stdout) => { const i = String(stdout || '').lastIndexOf(MARK); return i < 0 ? null : JSON.parse(String(stdout).slice(i + MARK.length).trim()); };
const broken = (why) => `bsn-docs: mã công cụ của harness đang hỏng hoặc bị treo, lời gọi này CHƯA chạy (không phải lỗi của tham số). Báo người dùng để phiên harness sửa. Chi tiết: ${why}`;

// Chạy một yêu cầu ở lớp dưới, đồng bộ. Trả kết quả của worker, hoặc { crash } khi lớp dưới không chạy nổi.
function run(req) {
  const r = spawnSync(process.execPath, [WORKER], { input: JSON.stringify(req), encoding: 'utf8', cwd: process.cwd(), env: process.env, maxBuffer: 256 * 1024 * 1024, timeout: CALL_TIMEOUT_MS, windowsHide: true });
  try { const out = parse(r.stdout); if (out) return out; } catch { /* rơi xuống dưới */ }
  return { crash: (r.error && r.error.message) || String(r.stderr || '').trim().split('\n').slice(-6).join(' | ').slice(0, 800) || `tiến trình thoát mã ${r.status}` };
}

// ---------- Danh sách công cụ: giữ bản tốt gần nhất; lớp dưới hỏng thì vẫn trả bản đó ----------
let lastTools = null;
function listTools() {
  const out = run({ op: 'list' });
  if (out && Array.isArray(out.tools) && out.tools.length) lastTools = out.tools;
  return lastTools;
}

// ---------- Theo dõi lớp dưới: dấu của mọi tệp mã trong thư mục này (trừ chính tệp này) ----------
function lowerStamp() {
  try {
    // Mã công cụ nằm trong các thư mục con của mcp/ và ở core/, ports/, adapters/ (S-055, S-057): đi hết các thư mục đó, trừ test và thư viện tải về.
    const out = [];
    const walk = (dir, rel) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) { if (!['test', 'vendor', 'node_modules'].includes(e.name)) walk(path.join(dir, e.name), r); } else if (e.name.endsWith('.js') && path.join(dir, e.name) !== __filename) { const st = fs.statSync(path.join(dir, e.name)); out.push(`${r}:${st.size}:${st.mtimeMs}`); }
      }
    };
    walk(__dirname, '');
    for (const d of ['core', 'ports', 'adapters']) { const dir = path.join(__dirname, '..', d); if (fs.existsSync(dir)) walk(dir, `../${d}`); }
    // Bố cục khối (S-064): mã công cụ của các khối khác nằm ở .claude/modules/<khối>/; đi cả các khối đó.
    const home = path.resolve(__dirname, '..', '..');
    if (path.basename(home) === 'modules' && path.basename(path.dirname(home)) === '.claude') {
      for (const m of fs.readdirSync(home, { withFileTypes: true })) if (m.isDirectory() && path.join(home, m.name) !== path.resolve(__dirname, '..')) walk(path.join(home, m.name), `../../${m.name}`);
    }
    return out.sort().join('|');
  } catch { return 'không đọc được'; }
}
let stamp = lowerStamp();
let checking = false;
function watch() {
  if (checking || !lastTools) return; // chưa ai hỏi danh sách thì chưa có gì để báo đổi
  const now = lowerStamp();
  if (now === stamp) return;
  checking = true;
  // Tự kiểm bản mới ở tiến trình riêng, không chặn lời gọi đang chờ. Bản mới không nạp được thì giữ danh sách cũ và KHÔNG báo đổi.
  const child = spawn(process.execPath, [WORKER], { cwd: process.cwd(), env: process.env, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.on('error', () => { checking = false; });
  child.on('close', () => {
    checking = false;
    let res = null;
    try { res = parse(out); } catch { /* bản mới hỏng */ }
    if (!res || !Array.isArray(res.tools) || !res.tools.length) return; // thử lại ở nhịp sau
    stamp = now;
    if (JSON.stringify(res.tools) !== JSON.stringify(lastTools)) { lastTools = res.tools; send({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' }); }
  });
  child.stdin.end(JSON.stringify({ op: 'list' }));
}
setInterval(watch, WATCH_MS).unref();

// ---------- Chính tệp này đổi thì phiên phải nối lại ----------
const selfHash = () => { try { return crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'); } catch { return 'không đọc được'; } };
const STARTED_WITH = selfHash();
let lastCheck = { at: 0, stale: false };
function staleNotice() {
  const now = Date.now();
  if (now - lastCheck.at > 5000) lastCheck = { at: now, stale: selfHash() !== STARTED_WITH };
  return lastCheck.stale
    ? '\n\nCẢNH BÁO bsn-docs: lớp bề mặt của máy chủ MCP (BSN_/.claude/modules/core/mcp/mcp-server.js) đã đổi từ khi phiên này nối, nên phiên đang chạy lớp bề mặt CŨ. ' +
      'Hãy báo người dùng gõ /mcp và nối lại bsn-docs (hoặc mở lại phiên). Kết quả ở trên vẫn là của mã công cụ mới nhất.'
    : '';
}

function handle(msg) {
  const { id, method, params } = msg;
  if (id === undefined) return; // notification (e.g. notifications/initialized)
  if (method === 'initialize') {
    return send({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: (params && params.protocolVersion) || '2024-11-05',
        capabilities: { tools: { listChanged: true } },
        serverInfo: { name: 'bsn-docs', version: '2.0.0' },
      },
    });
  }
  if (method === 'ping') return send({ jsonrpc: '2.0', id, result: {} });
  if (method === 'tools/list') {
    const tools = listTools();
    if (!tools) return send({ jsonrpc: '2.0', id, error: { code: -32603, message: broken('không lấy được danh sách công cụ') } });
    return send({ jsonrpc: '2.0', id, result: { tools } });
  }
  if (method === 'tools/call') {
    const out = run({ op: 'call', name: params && params.name, arguments: (params && params.arguments) || {} });
    if (out.unknown) return send({ jsonrpc: '2.0', id, error: { code: -32602, message: `Unknown tool: ${params && params.name}` } });
    if (out.crash !== undefined) return send({ jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text: broken(out.crash) + staleNotice() }] } });
    setImmediate(watch); // lời gọi vừa rồi đã chạy mã mới nhất; nếu danh sách cũng đổi thì báo ngay, không chờ nhịp
    return send({ jsonrpc: '2.0', id, result: { ...(out.isError ? { isError: true } : {}), content: [{ type: 'text', text: String(out.text) + staleNotice() }] } });
  }
  return send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    try {
      handle(JSON.parse(line));
    } catch (e) {
      send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: e.message } });
    }
  }
});
