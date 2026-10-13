'use strict';
// spec: MCP-S-006
// CỔNG MCP, phần GIỮ CÁC MÁY CHỦ PHÍA SAU. Claude Code chỉ thấy một máy chủ (tệp mồi); phía sau là:
//   - bộ công cụ CỤC BỘ của harness (mcp-tools.js): mỗi lời gọi chạy trong một tiến trình mới (mcp-worker.js), nên luôn là mã mới nhất;
//   - các máy chủ MCP đã khai và đã xác nhận (adapters/project/mcp-servers.js), nối bằng gateway/client.js, giữ nối suốt phiên.
// KIỂM SỨC KHỎE từng máy chủ, để một cái hỏng không kéo theo cái khác:
//   - nối thử có hạn giờ trước khi đưa công cụ vào danh sách; không nối được thì đánh dấu HỎNG, bỏ qua, các máy chủ khác vẫn lên;
//   - đang chạy mà lời gọi quá giờ hoặc đứt nối 3 lần liên tiếp thì TẠM NGẮT: công cụ của nó rút khỏi danh sách của phiên;
//   - thử lại theo nhịp thưa dần (5 giây, 15 giây, 1 phút, 5 phút); nối lại được thì công cụ tự hiện lại;
//   - mỗi thay đổi ghi ra một tệp tình trạng cho `cli.js mcp list`, doctor và tóm tắt đầu phiên đọc.
// Harness có vài máy chủ MCP, mỗi khối một cái (cùng một tệp mồi, khác nhau ở khối): chỉ máy chủ của khối `mcp` (và máy chủ cũ một cục, không
// có khối) giữ các máy chủ phía sau; máy chủ của khối khác chỉ chạy công cụ cục bộ của khối đó, nên một cái hỏng không kéo theo cái khác.
// Khai báo hay sổ xác nhận đổi thì cổng tự nối cái mới, ngắt cái bị gỡ, và báo Claude Code lấy lại danh sách (không ai phải gõ /mcp).
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const C = require('../../adapters/project/mcp-servers');
const Client = require('./client');
const P = require('../../gate/gate-paths');

const MARK = '\u001ebsn-docs-result\u001e';
const LOCAL_TIMEOUT_MS = 20 * 60 * 1000; // diagram_generate và portal_build có thể chạy lâu
const numbers = (text, dflt) => { const a = String(text || '').split(',').map(Number).filter((n) => Number.isFinite(n) && n > 0); return a.length ? a : dflt; };
const BACKOFF = numbers(process.env.BSN_MCP_BACKOFF_MS, [5000, 15000, 60000, 300000]);
const WATCH_MS = numbers(process.env.BSN_MCP_WATCH_MS, [2000])[0];
const FAILS_TO_PAUSE = 3;
const DEFAULT_START_MS = 30000;
const DEFAULT_CALL_MS = 120000;

function create({ dir, root, send, block = '' }) {
  const WORKER = path.join(dir, 'mcp-worker.js');
  const external = !block || block === 'mcp'; // có giữ các máy chủ MCP phía sau không
  const hasLocal = block !== 'mcp'; // có công cụ cục bộ không (khối `mcp` chỉ là cổng)
  let stopped = false;
  const timers = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); if (!stopped) fn(); }, ms); if (t.unref) t.unref(); timers.add(t); return t; };

  // ---------- bộ công cụ cục bộ ----------
  function runWorker(req, timeoutMs = LOCAL_TIMEOUT_MS) {
    return new Promise((resolve) => {
      let out = ''; let err = ''; let done = false;
      const finish = (v) => { if (done) return; done = true; clearTimeout(timer); resolve(v); };
      let child;
      try { child = spawn(process.execPath, [WORKER], { cwd: process.cwd(), env: process.env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }); } catch (e) { return finish({ crash: e.message }); }
      const timer = setTimeout(() => { try { child.kill(); } catch { /* đã thoát */ } finish({ crash: `quá ${Math.round(timeoutMs / 1000)} giây không xong` }); }, timeoutMs);
      child.stdout.on('data', (d) => { out += d; });
      child.stderr.on('data', (d) => { err = (err + d).slice(-4000); });
      child.on('error', (e) => finish({ crash: e.message }));
      child.on('close', (code) => {
        try { const i = out.lastIndexOf(MARK); if (i >= 0) return finish(JSON.parse(out.slice(i + MARK.length).trim())); } catch { /* rơi xuống dưới */ }
        finish({ crash: err.trim().split('\n').slice(-6).join(' | ').slice(0, 800) || `tiến trình thoát mã ${code}` });
      });
      child.stdin.on('error', () => { /* tiến trình chết sớm: sự kiện close lo */ });
      child.stdin.end(JSON.stringify(block ? { ...req, block } : req));
    });
  }
  // Dấu của mọi tệp mã công cụ (mọi khối, trừ test và thư viện tải về): đổi thì lấy lại danh sách công cụ cục bộ.
  function lowerStamp() {
    try {
      const out = [];
      const walk = (d, rel) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          const r = rel ? `${rel}/${e.name}` : e.name;
          if (e.isDirectory()) { if (!['test', 'vendor', 'node_modules'].includes(e.name)) walk(path.join(d, e.name), r); } else if (e.name.endsWith('.js')) { const st = fs.statSync(path.join(d, e.name)); out.push(`${r}:${st.size}:${st.mtimeMs}`); }
        }
      };
      walk(dir, '');
      for (const d of ['core', 'ports', 'adapters']) { const x = path.join(dir, '..', d); if (fs.existsSync(x)) walk(x, `../${d}`); }
      const home = path.resolve(dir, '..', '..');
      if (path.basename(home) === 'modules' && path.basename(path.dirname(home)) === '.claude') {
        for (const m of fs.readdirSync(home, { withFileTypes: true })) if (m.isDirectory() && path.join(home, m.name) !== path.resolve(dir, '..')) walk(path.join(home, m.name), `../../${m.name}`);
      }
      return out.sort().join('|');
    } catch { return 'không đọc được'; }
  }
  let localTools = hasLocal ? null : []; // bản tốt gần nhất; lớp dưới hỏng thì vẫn trả bản này
  let localStamp = lowerStamp();
  let localChecking = false;
  async function listLocal() {
    const out = await runWorker({ op: 'list' }, 120000);
    if (out && Array.isArray(out.tools) && out.tools.length) localTools = out.tools;
    return localTools;
  }
  async function watchLocal() {
    if (!hasLocal || localChecking || !localTools) return; // chưa ai hỏi danh sách thì chưa có gì để báo đổi
    const now = lowerStamp();
    if (now === localStamp) return;
    localChecking = true;
    try {
      const out = await runWorker({ op: 'list' }, 120000);
      if (!out || !Array.isArray(out.tools) || !out.tools.length) return; // bản mới hỏng: giữ danh sách cũ, thử lại ở nhịp sau
      localStamp = now;
      if (JSON.stringify(out.tools) !== JSON.stringify(localTools)) { localTools = out.tools; changed(['tools']); }
    } finally { localChecking = false; }
  }

  // ---------- máy chủ phía sau ----------
  const backends = new Map(); // tên -> backend
  const inflight = new Map(); // mã yêu cầu của Claude Code -> { b, rpcId }

  const publicState = (b) => ({ name: b.name, type: b.decl.type, status: b.status, error: b.error, since: b.since, tools: exposed(b).length, fp: b.fp, dropped: b.dropped.slice(0, 5) });
  function writeStatus() {
    if (!external) return; // tình trạng máy chủ phía sau chỉ do máy chủ giữ chúng ghi
    try {
      const file = path.join(P.mcpStateDir(root), `${process.pid}.json`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ pid: process.pid, at: Date.now(), sid: process.env.CLAUDE_CODE_SESSION_ID || '', servers: [...backends.values()].map(publicState) }));
      fs.renameSync(tmp, file);
    } catch { /* không ghi được tình trạng: cổng vẫn chạy */ }
  }
  let pendingKinds = new Set();
  let notifyTimer = null;
  function changed(kinds = ['tools', 'resources', 'prompts']) {
    writeStatus();
    for (const k of kinds) pendingKinds.add(k);
    if (notifyTimer) return;
    notifyTimer = later(() => {
      notifyTimer = null;
      const ks = pendingKinds; pendingKinds = new Set();
      for (const k of ks) send({ jsonrpc: '2.0', method: `notifications/${k}/list_changed` });
    }, 150);
  }

  // Công cụ của một máy chủ sau khi lọc và đổi tên theo khai báo: [{ exposed, original, def }].
  function exposed(b) {
    if (b.status !== 'ok') return [];
    const f = b.decl.tools || {};
    const out = [];
    b.dropped = [];
    const local = new Set((localTools || []).map((t) => t.name));
    for (const t of b.tools) {
      if (f.include && f.include.length && !C.any(f.include, t.name)) continue;
      if (C.any(f.exclude, t.name)) continue;
      const name = `${b.name}_${(f.rename && f.rename[t.name]) || t.name}`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64);
      if (local.has(name) || out.some((x) => x.exposed === name)) { b.dropped.push(`${t.name}: trùng tên ${name}`); continue; }
      out.push({ exposed: name, original: t.name, def: { ...t, name } });
    }
    return out;
  }

  async function listAll(b, method, key, timeoutMs) {
    const all = [];
    let cursor;
    for (let i = 0; i < 50; i++) {
      const r = await b.client.request(method, cursor ? { cursor } : {}, { timeoutMs });
      for (const x of (r && r[key]) || []) all.push(x);
      cursor = r && r.nextCursor;
      if (!cursor) break;
    }
    return all;
  }
  async function refresh(b) {
    const ms = b.decl.startTimeoutMs || DEFAULT_START_MS;
    const tools = await listAll(b, 'tools/list', 'tools', ms);
    if (!tools.every((t) => t && typeof t.name === 'string' && t.inputSchema && typeof t.inputSchema === 'object')) throw new Error('danh sách công cụ sai hợp đồng (thiếu name hoặc inputSchema)');
    b.tools = tools;
    const caps = (b.info && b.info.capabilities) || {};
    b.resources = caps.resources ? await listAll(b, 'resources/list', 'resources', ms).catch(() => []) : [];
    b.templates = caps.resources ? await listAll(b, 'resources/templates/list', 'resourceTemplates', ms).catch(() => []) : [];
    b.prompts = caps.prompts ? await listAll(b, 'prompts/list', 'prompts', ms).catch(() => []) : [];
  }

  function down(b, why, status = 'broken') {
    if (backends.get(b.name) !== b) return;
    const c = b.client; b.client = null;
    if (c) { try { c.close(); } catch { /* bỏ qua */ } }
    b.status = status; b.error = String(why || '').slice(0, 400); b.since = Date.now();
    b.tools = []; b.resources = []; b.templates = []; b.prompts = [];
    const wait = BACKOFF[Math.min(b.tries, BACKOFF.length - 1)];
    b.tries++;
    b.nextTry = Date.now() + wait;
    if (b.timer) { clearTimeout(b.timer); timers.delete(b.timer); }
    b.timer = later(() => { if (backends.get(b.name) === b) connect(b); }, wait);
    changed();
  }

  async function connect(b) {
    if (stopped || backends.get(b.name) !== b) return;
    let client;
    try {
      client = Client.create(b.decl, { root });
      b.client = client;
      client.on('close', (why) => { if (b.client === client) down(b, why); });
      client.on('notify', (n) => {
        if (b.client !== client) return;
        if (/^notifications\/(tools|resources|prompts)\/list_changed$/.test(n.method)) { refresh(b).then(() => changed(), () => {}); return; }
        if (n.method === 'notifications/progress' || n.method === 'notifications/message') send({ jsonrpc: '2.0', method: n.method, params: n.params });
      });
      b.info = await client.start(b.decl.startTimeoutMs || DEFAULT_START_MS);
      if (b.client !== client) return;
      await refresh(b);
      if (b.client !== client) return;
      b.status = 'ok'; b.error = ''; b.since = Date.now(); b.fails = 0; b.tries = 0;
      changed();
    } catch (e) {
      if (b.client === client || !b.client) { b.client = client || null; down(b, e.message); }
    }
  }

  let lastStamp = '';
  function reconcile() {
    let want;
    try { want = C.running(root); } catch { return; } // khai báo đang ghi dở: giữ nguyên, thử lại ở nhịp sau
    let touched = false;
    for (const [name, b] of backends) {
      const w = want.find((x) => x.name === name);
      if (!w || w.runFp !== b.fp) {
        backends.delete(name);
        if (b.timer) clearTimeout(b.timer);
        if (b.client) { try { b.client.close(); } catch { /* bỏ qua */ } }
        touched = true;
      } else if (JSON.stringify(w.run) !== JSON.stringify(b.decl)) { b.decl = w.run; touched = true; } // chỉ phần tùy biến đổi: không nối lại
    }
    for (const w of want) {
      if (backends.has(w.name)) continue;
      const b = { name: w.name, decl: w.run, fp: w.runFp, status: 'starting', error: '', since: Date.now(), fails: 0, tries: 0, nextTry: 0, timer: null, client: null, info: null, tools: [], resources: [], templates: [], prompts: [], dropped: [] };
      backends.set(w.name, b);
      touched = true;
      connect(b);
    }
    if (touched) changed(); else writeStatus();
  }
  function watch() {
    if (stopped) return;
    if (external) { const s = C.watchStamp(root); if (s !== lastStamp) { lastStamp = s; reconcile(); } }
    watchLocal().catch(() => {});
  }
  if (external) { lastStamp = C.watchStamp(root); reconcile(); }
  const tick = setInterval(watch, WATCH_MS); if (tick.unref) tick.unref();
  const beat = setInterval(writeStatus, 20000); if (beat.unref) beat.unref();

  const ok = () => [...backends.values()].filter((b) => b.status === 'ok');
  const findTool = (name) => { for (const b of ok()) { const t = exposed(b).find((x) => x.exposed === name); if (t) return { b, t }; } return null; };
  // Tên công cụ thuộc một máy chủ đang hỏng (để lời báo lỗi nói đúng nguyên nhân thay vì "không có công cụ").
  const downOwner = (name) => [...backends.values()].find((b) => b.status !== 'ok' && name.startsWith(`${b.name}_`));
  const errText = (text) => ({ isError: true, content: [{ type: 'text', text }] });
  const failed = (b, e) => {
    if (!(e.transport || e.timeout)) return;
    b.fails++;
    if (b.fails >= FAILS_TO_PAUSE) down(b, `tạm ngắt sau ${FAILS_TO_PAUSE} lần lỗi liên tiếp: ${e.message}`, 'paused');
  };
  async function ask(b, method, params, id) {
    const p = b.client.request(method, params, { timeoutMs: b.decl.timeoutMs || DEFAULT_CALL_MS });
    if (id !== undefined) inflight.set(id, { b, rpcId: p.rpcId });
    try { const r = await p; b.fails = 0; return r; } catch (e) { failed(b, e); throw e; } finally { if (id !== undefined) inflight.delete(id); }
  }

  return {
    runWorker,
    async tools() {
      const local = localTools || await listLocal();
      return { local, all: [...(local || []), ...ok().flatMap((b) => exposed(b).map((x) => x.def))] };
    },
    isLocal: (name) => Boolean((localTools || []).some((t) => t.name === name)),
    afterLocalCall: () => { watchLocal().catch(() => {}); },
    // Gọi công cụ của một máy chủ phía sau. Trả kết quả theo dạng MCP, hoặc null nếu không máy chủ nào có công cụ tên đó.
    async call(name, args, meta, id) {
      const hit = findTool(name);
      if (!hit) {
        const d = downOwner(name);
        return d ? errText(`Máy chủ MCP "${d.name}" đang ${d.status === 'paused' ? 'bị tạm ngắt' : d.status === 'starting' ? 'được nối' : 'hỏng'}, lời gọi này CHƯA chạy: ${d.error || 'chưa nối xong'}. Cổng tự thử lại; các máy chủ khác vẫn dùng được. Xem: node .claude/modules/core/cli/cli.js mcp list`) : null;
      }
      try { return await ask(hit.b, 'tools/call', { name: hit.t.original, arguments: args || {}, ...(meta ? { _meta: meta } : {}) }, id); } catch (e) {
        if (e.rpc) return errText(`Máy chủ MCP "${hit.b.name}" báo lỗi: ${e.message}`);
        return errText(`Máy chủ MCP "${hit.b.name}" không trả lời được, lời gọi này có thể CHƯA chạy: ${e.message}. Các máy chủ khác vẫn dùng được.`);
      }
    },
    resources: () => ok().flatMap((b) => b.resources.map((r) => ({ ...r, name: `${b.name}: ${r.name || r.uri}` }))),
    templates: () => ok().flatMap((b) => b.templates.map((r) => ({ ...r, name: `${b.name}: ${r.name || r.uriTemplate}` }))),
    async readResource(uri, id) {
      const b = ok().find((x) => x.resources.some((r) => r.uri === uri)) || ok().find((x) => x.templates.length);
      if (!b) throw new Error(`không máy chủ nào đang chạy có tài nguyên ${uri}`);
      return ask(b, 'resources/read', { uri }, id);
    },
    prompts: () => ok().flatMap((b) => b.prompts.map((p) => ({ ...p, name: `${b.name}_${p.name}` }))),
    async getPrompt(name, args, id) {
      for (const b of ok()) { const p = b.prompts.find((x) => `${b.name}_${x.name}` === name); if (p) return ask(b, 'prompts/get', { name: p.name, arguments: args || {} }, id); }
      throw new Error(`không có mẫu lời nhắc ${name}`);
    },
    cancel(id, reason) { const f = inflight.get(id); if (f && f.b.client) f.b.client.notify('notifications/cancelled', { requestId: f.rpcId, reason }); },
    status: () => [...backends.values()].map(publicState),
    stop() {
      stopped = true;
      clearInterval(tick); clearInterval(beat);
      for (const t of timers) clearTimeout(t);
      for (const b of backends.values()) { if (b.client) { try { b.client.close(); } catch { /* bỏ qua */ } } }
      backends.clear();
      if (external) { try { fs.rmSync(path.join(P.mcpStateDir(root), `${process.pid}.json`), { force: true }); } catch { /* bỏ qua */ } }
    },
  };
}

module.exports = { create, MARK, BACKOFF, FAILS_TO_PAUSE };
