'use strict';
// spec: LEDG-S-001
// LUẬT ghi sổ phiên. Không bao giờ chặn; chỉ ghi lại điều phiên đã nạp để luật đủ kiến thức (skill.js) đối chiếu.
//   after-action   (mọi công cụ): ghi lời gọi công cụ; mở skill = đã mở skill; đọc SKILL.md = đã mở skill;
//                  đọc tài liệu bắt buộc của một dịch vụ (CLAUDE.md, STATUS.md) = đã đọc.
//   user-prompt    người dùng gõ /<tên-skill> = đã mở skill (không có sự kiện công cụ nào cho trường hợp này).
//   session-start  ghi phiên; nguồn "compact" hoặc "clear" thì sang đợt mới (những gì nạp trước đó không còn tính).
// Chỉ ghi tên công cụ và tên dịch vụ, KHÔNG ghi tham số hay nội dung (tránh bí mật lọt vào sổ).
const K = require('./lib/knowledge');
const N = require('./lib/mcp-names');

async function run(event, { workspace: ws, store }) {
  const sid = event.session;
  if (!sid) return null;
  await store.ledger(async (book) => {
    const agent = event.agent;
    if (event.kind === 'session-start') {
      if (event.source === 'compact' || event.source === 'clear') await book.bumpEpoch(sid);
      else await book.touch(sid);
      await book.prune();
      return;
    }
    if (event.kind === 'user-prompt') {
      const m = /^\/([a-z][a-z0-9-]*)(?:\s|$)/.exec(event.prompt);
      if (m && ws.skillExists(m[1])) await book.addSkill({ sid, skill: m[1], via: 'slash' });
      return;
    }
    if (event.kind === 'after-action') {
      const a = event.action;
      const tool = a.tool;
      if (!tool) return;
      let service = '';
      if (a.type === 'open-skill') {
        const skill = a.name.replace(/^\//, '');
        if (ws.skillExists(skill)) await book.addSkill({ sid, agent, skill, via: 'tool' });
      }
      if (a.file) {
        const svc = ws.serviceOf(a.file);
        if (ws.isService(svc)) service = svc;
        if (a.type === 'read-file') {
          // Chuyển phiên: phiên nhận vừa đọc tờ bàn giao của nó thì ghi nhận, để lời nhắc dừng và phiên giao biết đã tới nơi.
          if (!agent) { try { ws.transferRead(a.file, sid); } catch { /* không ghi nhận được: lời nhắc còn lặp, không hỏng gì */ } }
          const skill = K.skillOfFile(ws, a.file);
          if (skill) await book.addSkill({ sid, agent, skill, via: 'read' });
          const map = K.loadMap(ws);
          const doc = map && K.docOfFile(ws, map, a.file);
          if (doc) await book.addDoc({ sid, agent, service: doc.service, doc: doc.doc });
        }
      }
      if (a.type === 'call-tool' && N.isOwn(a.server, N.prefixOf(ws)) && typeof a.args.service === 'string' && ws.isService(a.args.service)) service = a.args.service;
      await book.addTool({ sid, agent, tool, service });
    }
  }, undefined);
  return null;
}

module.exports = { id: 'ledger', on: ['session-start', 'user-prompt', 'after-action'], run };
