'use strict';
// spec: MCP-S-006
// CỔNG MCP, phần NỐI tới một máy chủ MCP phía sau. Ba cách nối, cùng một mặt:
//   stdio  chạy một tiến trình trên máy và nói JSON-RPC theo dòng qua stdin/stdout (Playwright, máy chủ tự viết). Tiến trình SỐNG suốt,
//          vì loại này có trạng thái (trình duyệt đang mở).
//   http   HTTP kiểu mới (Streamable HTTP): mỗi tin là một lần POST; trả lời là JSON hoặc một luồng sự kiện.
//   sse    SSE kiểu cũ: một luồng sự kiện mở sẵn báo địa chỉ nhận tin; gửi bằng POST, trả lời về theo luồng.
// Mặt chung: create(khai báo, { root }) -> { start(), request(method, params, { timeoutMs }), notify(method, params), close(), on(tên, hàm) }
//   sự kiện 'notify' (tin báo từ máy chủ: { method, params }), 'close' (đứt nối: lý do).
// Không thư viện ngoài: Node thuần (child_process, fetch có sẵn). Khóa truy cập chỉ đến từ biến môi trường qua ${BIẾN} (adapters/project/mcp-servers.js).
const { spawn } = require('node:child_process');
const C = require('../../adapters/project/mcp-servers');

const PROTOCOL = '2025-03-26';

function base() {
  const handlers = { notify: [], close: [] };
  let seq = 0;
  const pending = new Map(); // id -> { resolve, reject, timer }
  const self = {
    on(name, fn) { (handlers[name] || []).push(fn); return self; },
    emit(name, arg) { for (const fn of handlers[name] || []) { try { fn(arg); } catch { /* người nghe hỏng không làm đứt nối */ } } },
    nextId: () => ++seq,
    wait(id, timeoutMs, what) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); const e = new Error(`${what}: quá ${timeoutMs} ms không trả lời`); e.timeout = true; reject(e); }, timeoutMs);
        pending.set(id, { resolve, reject, timer });
      });
    },
    // Một tin đến từ máy chủ: trả lời của một yêu cầu đang chờ, một tin báo, hoặc một yêu cầu ngược (máy chủ hỏi cổng).
    incoming(msg, reply) {
      if (!msg || typeof msg !== 'object') return;
      if (msg.id !== undefined && (msg.result !== undefined || msg.error !== undefined)) {
        const p = pending.get(msg.id);
        if (!p) return;
        pending.delete(msg.id); clearTimeout(p.timer);
        if (msg.error) { const e = new Error(String(msg.error.message || 'lỗi từ máy chủ')); if (msg.error.viaTransport) { e.transport = true; e.timeout = Boolean(msg.error.timedOut); } else e.rpc = msg.error; p.reject(e); } else p.resolve(msg.result);
        return;
      }
      if (msg.id !== undefined && msg.method) {
        // Yêu cầu ngược: cổng chỉ trả lời hai thứ vô hại; phần còn lại (lấy mẫu từ model, hỏi người dùng) không chuyển tiếp.
        if (msg.method === 'ping') return reply({ jsonrpc: '2.0', id: msg.id, result: {} });
        if (msg.method === 'roots/list') return reply({ jsonrpc: '2.0', id: msg.id, result: { roots: [] } });
        return reply({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `cổng MCP của harness không chuyển tiếp ${msg.method}` } });
      }
      if (msg.method) self.emit('notify', { method: msg.method, params: msg.params || {} });
    },
    failAll(why) { for (const [id, p] of pending) { clearTimeout(p.timer); const e = new Error(why); e.transport = true; p.reject(e); pending.delete(id); } },
  };
  return self;
}

const initParams = () => ({ protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: 'harness-mcp-gateway', version: '1.0.0' } });

// ---------- stdio ----------
function stdio(decl, { root }) {
  const b = base();
  let child = null;
  let closed = false;
  let errTail = '';
  const write = (msg) => { try { child.stdin.write(`${JSON.stringify(msg)}\n`); } catch (e) { b.failAll(`không gửi được tới tiến trình: ${e.message}`); } };
  return {
    on: b.on,
    async start(timeoutMs) {
      const env = { ...process.env };
      for (const [k, v] of Object.entries(decl.env || {})) env[k] = C.expand(v);
      // Windows: lệnh như npx, uvx là tệp .cmd, phải chạy qua trình thông dịch lệnh.
      // (tệp .exe gọi thẳng được). Qua trình thông dịch thì Node KHÔNG tự bọc nháy: đối số có dấu cách phải được bọc ở đây.
      const viaShell = process.platform === 'win32' && !/\.(exe|com)$/i.test(decl.command);
      const q = (s) => (/[\s"&|<>^]/.test(s) ? `"${String(s).replace(/"/g, '\\"')}"` : s);
      // Qua trình thông dịch thì đưa MỘT chuỗi lệnh đã bọc nháy (Node cảnh báo khi vừa bật shell vừa đưa mảng đối số).
      child = spawn(viaShell ? [decl.command, ...(decl.args || [])].map(q).join(' ') : decl.command, viaShell ? [] : decl.args || [], { cwd: decl.cwd ? require('node:path').resolve(root, decl.cwd) : root, env, shell: viaShell, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      let buf = '';
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (d) => {
        buf += d;
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
          if (!line) continue;
          let msg; try { msg = JSON.parse(line); } catch { continue; } // máy chủ lỡ in chữ thường ra stdout: bỏ qua dòng đó
          b.incoming(msg, write);
        }
      });
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (d) => { errTail = (errTail + d).slice(-400); });
      const gone = (why) => { if (closed) return; closed = true; b.failAll(why); b.emit('close', why); };
      child.on('error', (e) => gone(`không chạy được lệnh "${decl.command}": ${e.message}`));
      child.on('exit', (code, sig) => gone(`tiến trình đã thoát (mã ${code === null ? sig : code})${errTail.trim() ? `: ${errTail.trim().split('\n').slice(-2).join(' | ')}` : ''}`));
      child.stdin.on('error', () => { /* tiến trình đã chết: sự kiện exit lo */ });
      const id = b.nextId();
      const p = b.wait(id, timeoutMs, 'initialize');
      write({ jsonrpc: '2.0', id, method: 'initialize', params: initParams() });
      const info = await p;
      write({ jsonrpc: '2.0', method: 'notifications/initialized' });
      return info;
    },
    request(method, params, { timeoutMs }) {
      if (closed || !child) return Promise.reject(Object.assign(new Error('tiến trình không còn chạy'), { transport: true }));
      const id = b.nextId();
      const p = b.wait(id, timeoutMs, method);
      write({ jsonrpc: '2.0', id, method, params: params || {} });
      p.rpcId = id;
      return p;
    },
    notify(method, params) { if (!closed && child) write({ jsonrpc: '2.0', method, params: params || {} }); },
    close() {
      if (closed) return; closed = true;
      b.failAll('đã ngắt nối');
      try { child.stdin.end(); } catch { /* đã đóng */ }
      const c = child;
      setTimeout(() => { try { if (c && c.exitCode === null) { if (process.platform === 'win32') spawn('taskkill', ['/pid', String(c.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); else c.kill('SIGKILL'); } } catch { /* đã thoát */ } }, 1500).unref();
    },
  };
}

// ---------- đọc một luồng sự kiện (text/event-stream) ----------
// Gọi onEvent({ event, data }) cho từng sự kiện. Kết thúc khi luồng đóng; ném lỗi khi đứt giữa chừng.
async function readEvents(body, onEvent) {
  const dec = new TextDecoder();
  let buf = '';
  let event = 'message'; let data = [];
  const flush = () => { if (data.length) onEvent({ event, data: data.join('\n') }); event = 'message'; data = []; };
  for await (const chunk of body) {
    buf += dec.decode(chunk, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).replace(/\r$/, ''); buf = buf.slice(nl + 1);
      if (line === '') { flush(); continue; }
      if (line.startsWith(':')) continue;
      const i = line.indexOf(':');
      const field = i < 0 ? line : line.slice(0, i);
      const value = i < 0 ? '' : line.slice(i + 1).replace(/^ /, '');
      if (field === 'event') event = value; else if (field === 'data') data.push(value);
    }
  }
  flush();
}

const headersOf = (decl) => { const h = {}; for (const [k, v] of Object.entries(decl.headers || {})) h[k] = C.expand(v); return h; };

// ---------- HTTP kiểu mới ----------
function http(decl) {
  const b = base();
  let session = '';
  let closed = false;
  let version = PROTOCOL;
  const aborts = new Set();
  async function post(msg, timeoutMs) {
    const ac = new AbortController(); aborts.add(ac);
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(decl.url, { method: 'POST', signal: ac.signal, headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': version, ...(session ? { 'mcp-session-id': session } : {}), ...headersOf(decl) }, body: JSON.stringify(msg) });
      const sid = res.headers.get('mcp-session-id'); if (sid) session = sid;
      if (res.status === 401 || res.status === 403) throw Object.assign(new Error(`máy chủ từ chối (HTTP ${res.status}): cần đăng nhập hoặc khóa. Máy chủ cần đăng nhập thì nối ở tài khoản claude.ai, không qua cổng này`), { transport: true });
      if (!res.ok && res.status !== 202) throw Object.assign(new Error(`HTTP ${res.status}`), { transport: true });
      const type = String(res.headers.get('content-type') || '');
      if (type.includes('text/event-stream')) await readEvents(res.body, (ev) => { try { b.incoming(JSON.parse(ev.data), (r) => { post(r, timeoutMs).catch(() => {}); }); } catch { /* sự kiện không phải JSON */ } });
      else if (type.includes('application/json')) { const j = await res.json(); for (const m of Array.isArray(j) ? j : [j]) b.incoming(m, (r) => { post(r, timeoutMs).catch(() => {}); }); } else { try { await res.arrayBuffer(); } catch { /* không có thân */ } }
    } finally { clearTimeout(timer); aborts.delete(ac); }
  }
  const req = (method, params, timeoutMs) => {
    const id = b.nextId();
    const p = b.wait(id, timeoutMs, method);
    post({ jsonrpc: '2.0', id, method, params: params || {} }, timeoutMs).catch((e) => b.incoming({ id, error: { message: e.name === 'AbortError' ? `${method}: quá ${timeoutMs} ms không trả lời` : e.message, viaTransport: true, timedOut: e.name === 'AbortError' } }, () => {}));
    p.rpcId = id;
    return p;
  };
  return {
    on: b.on,
    async start(timeoutMs) {
      const info = await req('initialize', initParams(), timeoutMs);
      if (info && typeof info.protocolVersion === 'string') version = info.protocolVersion;
      await post({ jsonrpc: '2.0', method: 'notifications/initialized' }, timeoutMs).catch(() => {});
      return info;
    },
    request(method, params, { timeoutMs }) { return closed ? Promise.reject(Object.assign(new Error('đã ngắt nối'), { transport: true })) : req(method, params, timeoutMs); },
    notify(method, params) { if (!closed) post({ jsonrpc: '2.0', method, params: params || {} }, 15000).catch(() => {}); },
    close() {
      if (closed) return; closed = true;
      b.failAll('đã ngắt nối');
      for (const ac of aborts) { try { ac.abort(); } catch { /* bỏ qua */ } }
      if (session) fetch(decl.url, { method: 'DELETE', headers: { 'mcp-session-id': session, ...headersOf(decl) } }).catch(() => {});
    },
  };
}

// ---------- SSE kiểu cũ ----------
function sse(decl) {
  const b = base();
  let endpoint = '';
  let closed = false;
  let stream = null;
  const send = async (msg) => {
    const res = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', ...headersOf(decl) }, body: JSON.stringify(msg) });
    if (!res.ok && res.status !== 202) throw Object.assign(new Error(`HTTP ${res.status}`), { transport: true });
    try { await res.arrayBuffer(); } catch { /* không có thân */ }
  };
  return {
    on: b.on,
    async start(timeoutMs) {
      stream = new AbortController();
      const res = await fetch(decl.url, { signal: stream.signal, headers: { accept: 'text/event-stream', ...headersOf(decl) } });
      if (res.status === 401 || res.status === 403) throw new Error(`máy chủ từ chối (HTTP ${res.status}): cần đăng nhập hoặc khóa`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ready = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`quá ${timeoutMs} ms không nhận được địa chỉ nhận tin`)), timeoutMs);
        readEvents(res.body, (ev) => {
          if (ev.event === 'endpoint') { endpoint = new URL(ev.data, decl.url).href; clearTimeout(timer); resolve(); return; }
          try { b.incoming(JSON.parse(ev.data), (r) => { send(r).catch(() => {}); }); } catch { /* không phải JSON */ }
        }).then(() => { if (!closed) { closed = true; b.failAll('luồng sự kiện đã đóng'); b.emit('close', 'luồng sự kiện đã đóng'); } }, (e) => { clearTimeout(timer); reject(e); if (!closed) { closed = true; b.failAll(`đứt luồng sự kiện: ${e.message}`); b.emit('close', `đứt luồng sự kiện: ${e.message}`); } });
      });
      await ready;
      const id = b.nextId();
      const p = b.wait(id, timeoutMs, 'initialize');
      await send({ jsonrpc: '2.0', id, method: 'initialize', params: initParams() });
      const info = await p;
      await send({ jsonrpc: '2.0', method: 'notifications/initialized' }).catch(() => {});
      return info;
    },
    request(method, params, { timeoutMs }) {
      if (closed) return Promise.reject(Object.assign(new Error('đã ngắt nối'), { transport: true }));
      const id = b.nextId();
      const p = b.wait(id, timeoutMs, method);
      send({ jsonrpc: '2.0', id, method, params: params || {} }).catch((e) => b.incoming({ id, error: { message: e.message, viaTransport: true } }, () => {}));
      p.rpcId = id;
      return p;
    },
    notify(method, params) { if (!closed) send({ jsonrpc: '2.0', method, params: params || {} }).catch(() => {}); },
    close() { if (closed) return; closed = true; b.failAll('đã ngắt nối'); try { stream.abort(); } catch { /* bỏ qua */ } },
  };
}

function create(decl, ctx) {
  if (decl.type === 'stdio') return stdio(decl, ctx);
  if (decl.type === 'http') return http(decl, ctx);
  if (decl.type === 'sse') return sse(decl, ctx);
  throw new Error(`không biết cách nối "${decl.type}"`);
}

module.exports = { create, readEvents, PROTOCOL };
