'use strict';
// spec: MCP-S-006
// PHẦN XỬ LÝ của máy chủ MCP của harness. Tệp mồi (mcp-server.js) nạp tệp này và NẠP LẠI mỗi khi nó hoặc gateway/ đổi, nên sửa
// ở đây tới mọi phiên đang mở mà không ai phải gõ /mcp. Tệp này nói giao thức MCP với Claude Code và giao việc cho cổng (gateway/hub.js):
//   công cụ cục bộ của harness chạy trong tiến trình mới cho mỗi lời gọi; công cụ, tài nguyên, mẫu lời nhắc của các máy chủ MCP phía sau
//   được gộp vào cùng một danh sách. Không đặt logic công cụ ở đây.
// Mỗi lần nạp lại, các nối tới máy chủ phía sau được dựng lại từ đầu (máy chủ có trạng thái như trình duyệt mất trạng thái): chỉ xảy ra
// khi chính mã của cổng đổi, không xảy ra khi thêm bớt máy chủ hay sửa công cụ.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const P = require('../gate/gate-paths');

const SERVER = { name: 'bsn-docs', version: '3.0.0' };
const broken = (why) => `bsn-docs: mã công cụ của harness đang hỏng hoặc bị treo, lời gọi này CHƯA chạy (không phải lỗi của tham số). Báo người dùng để phiên harness sửa. Chi tiết: ${why}`;
const hashOf = (file) => { try { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); } catch { return ''; } };

function start({ send, dir, bootFile, bootHash }) {
  const root = P.rootFrom(dir);
  const hub = require('./gateway/hub').create({ dir, root, send });
  let loadError = '';

  // Chỉ còn MỘT trường hợp phiên phải nối lại: chính tệp mồi đổi nội dung. Tệp mồi dời chỗ mà nội dung như cũ thì không sao.
  let lastCheck = { at: 0, stale: false };
  function staleNotice() {
    const now = Date.now();
    if (now - lastCheck.at > 5000) {
      const here = hashOf(path.join(dir, 'mcp-server.js')) || hashOf(bootFile);
      lastCheck = { at: now, stale: Boolean(bootHash) && Boolean(here) && here !== bootHash };
    }
    return lastCheck.stale
      ? '\n\nCẢNH BÁO bsn-docs: tệp mồi của máy chủ MCP (mcp-server.js) đã đổi từ khi phiên này nối, nên phiên đang chạy tệp mồi CŨ. ' +
        'Hãy báo người dùng gõ /mcp và nối lại bsn-docs (hoặc mở lại phiên). Kết quả ở trên vẫn là của mã công cụ mới nhất.'
      : '';
  }
  const text = (t, isError) => ({ ...(isError ? { isError: true } : {}), content: [{ type: 'text', text: String(t) + staleNotice() }] });

  async function handle(msg) {
    const { id, method, params } = msg;
    if (id === undefined) { // tin báo từ Claude Code
      if (method === 'notifications/cancelled' && params) hub.cancel(params.requestId, params.reason);
      return;
    }
    const ok = (result) => send({ jsonrpc: '2.0', id, result });
    const fail = (code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });
    if (method === 'initialize') {
      return ok({
        protocolVersion: (params && params.protocolVersion) || '2024-11-05',
        capabilities: { tools: { listChanged: true }, resources: { listChanged: true }, prompts: { listChanged: true }, logging: {} },
        serverInfo: SERVER,
      });
    }
    if (method === 'ping') return ok({});
    if (method === 'logging/setLevel') return ok({});
    if (method === 'tools/list') {
      const { local, all } = await hub.tools();
      if (!local) return fail(-32603, broken(loadError || 'không lấy được danh sách công cụ'));
      return ok({ tools: all });
    }
    if (method === 'tools/call') {
      const name = params && params.name;
      const args = (params && params.arguments) || {};
      await hub.tools().catch(() => {}); // bảo đảm đã biết công cụ nào là cục bộ
      if (!hub.isLocal(name)) {
        const r = await hub.call(String(name || ''), args, params && params._meta, id);
        if (r) return ok(r);
      }
      const out = await hub.runWorker({ op: 'call', name, arguments: args });
      if (out.unknown) return fail(-32602, `Unknown tool: ${name}`);
      if (out.crash !== undefined) return ok(text(broken(out.crash), true));
      hub.afterLocalCall(); // lời gọi vừa rồi đã chạy mã mới nhất; nếu danh sách cũng đổi thì báo ngay, không chờ nhịp
      return ok(text(out.text, out.isError));
    }
    if (method === 'resources/list') return ok({ resources: hub.resources() });
    if (method === 'resources/templates/list') return ok({ resourceTemplates: hub.templates() });
    if (method === 'resources/read') { try { return ok(await hub.readResource(String((params && params.uri) || ''), id)); } catch (e) { return fail(-32002, e.message); } }
    if (method === 'prompts/list') return ok({ prompts: hub.prompts() });
    if (method === 'prompts/get') { try { return ok(await hub.getPrompt(String((params && params.name) || ''), params && params.arguments, id)); } catch (e) { return fail(-32602, e.message); } }
    return fail(-32601, `Method not found: ${method}`);
  }

  // Tệp ngoài thư mục này mà phần xử lý giữ trong bộ nhớ: đổi thì tệp mồi nạp lại cả phần xử lý (không cần /mcp).
  const watch = [require.resolve('../gate/gate-paths'), require.resolve('../adapters/project/mcp-servers')];
  return { handle, stop: () => hub.stop(), loadFailed: (why) => { loadError = `bản mới của phần xử lý không nạp được (${why})`; }, hub, watch };
}

module.exports = { start, SERVER };
