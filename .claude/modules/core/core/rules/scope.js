'use strict';
// spec: HOOK-S-001
// spec: HOOK-S-005
// spec: HOOK-S-009
// LUẬT phạm vi (trước khi phiên ghi một tệp). Giữ phạm vi của phiên theo chuỗi:
//   phiên -> kế hoạch người dùng đã duyệt -> dịch vụ phiên đã đăng ký -> lần sửa.
// - Tệp thuộc một dịch vụ (thư mục con của thư mục dịch vụ, hoặc một đơn vị khai trong units.json): CHỈ được sửa khi dịch vụ đó có
//   trong kế hoạch đã duyệt và phiên đã đăng ký nó (công cụ scope_register). Ngoài ra thì CHẶN, kèm lời nói rõ phải làm gì.
// - Tờ của một đơn vị nằm trong thư mục đơn vị khác (luật unitSheets) là của CHÍNH đơn vị đó: tính cho đơn vị chủ, không tính cho đơn vị chứa nó.
// - Sửa trong external/ (mã bên ngoài chỉ để đọc): hỏi người dùng.
// - Phần dùng chung khác ở gốc (docs/system, docs/handoff, CLAUDE.md, .claude/skills): không thuộc dịch vụ nào, không cần đăng ký.
// - Lần đầu phiên sửa một dịch vụ: kèm lời nhắc nguyên tắc, và cảnh báo nếu phiên khác vừa sửa cùng dịch vụ.
// Chế độ (scope.config.json): enforce là luật trên; legacy là cách cũ (hỏi khi phiên sửa dịch vụ khác dịch vụ đang làm);
// off là không làm gì. Không mở được sổ thì KHÔNG chặn (phép kiểm sức khỏe báo). Lệnh ghi qua shell không đi qua luật này.
const path = require('node:path');
const { deny, ask, note } = require('../../ports/events');
const { ago, ACTIVE_MS } = require('../sessions/table');

// Quyết định cho một lần sửa tệp thuộc dịch vụ `service`, theo kế hoạch đang hiệu lực của phiên. Trả null (cho qua) hoặc chuỗi lý do chặn.
async function denyReason(store, sid, service) {
  const a = await store.activePlan(sid);
  if (!a) return null; // không có sổ: không chặn (phép kiểm sức khỏe báo)
  if (a.closed) return null; // cổng đóng: cổng duyệt tự chặn, không chặn hai lần
  if (a.invalid) return `Kế hoạch người dùng đã duyệt không theo khuôn chuẩn (${a.errors.join('; ')}), nên harness không biết phiên được sửa dịch vụ nào và CHẶN lần sửa trong "${service}". Trình lại kế hoạch theo khuôn, chờ người dùng duyệt, rồi đăng ký bằng công cụ scope_register:\n${store.planExample}`;
  if (!a.plan.services.includes(service)) {
    return `Dịch vụ "${service}" KHÔNG có trong kế hoạch người dùng đã duyệt (kế hoạch #${a.plan.id} nêu: ${a.plan.services.join(', ') || 'không dịch vụ nào, chỉ phần dùng chung'}). ` +
      `Không sửa ở đây. Việc của "${service}" thì ghi yêu cầu vào docs/handoff/, hoặc trình kế hoạch mới có "${service}" trong mục "Dịch vụ" và chờ người dùng duyệt.`;
  }
  if (!a.registered.includes(service)) {
    return `Dịch vụ "${service}" có trong kế hoạch đã duyệt nhưng phiên CHƯA đăng ký. Gọi công cụ scope_register của bsn-docs với services=["${service}"] (hoặc mọi dịch vụ của kế hoạch), rồi sửa lại.`;
  }
  return null;
}

async function run(event, { workspace: ws, store }) {
  const abs = event.action.file;
  if (!abs) return null;
  if (!ws.inside(abs) || ws.norm(abs) === ws.norm(ws.root)) return null; // ngoài dự án: không thuộc luật này

  const mode = ws.scopeMode();
  if (mode === 'off') return null;

  const fromRoot = path.relative(ws.root, abs);
  const posixRel = fromRoot.split(path.sep).join('/');
  // Thư mục chỉ đọc do dự án khai (luật readOnlyDirs; ví dụ một thư mục mã bên ngoài để tham khảo).
  const readOnly = (ws.policy('readOnlyDirs') || []).find((d) => posixRel.toLowerCase() === d.toLowerCase() || posixRel.toLowerCase().startsWith(`${d.toLowerCase()}/`));
  // "Tờ của một đơn vị" nằm trong thư mục đơn vị khác (luật unitSheets; ví dụ deploy/services/<đơn-vị>.json) thuộc đơn vị chủ.
  const owner = ws.sheetOwner(abs);
  const decl = owner ? [posixRel, owner] : null;
  // Dịch vụ của tệp: tờ thuộc đơn vị chủ của nó; còn lại theo thư mục.
  const top = decl ? decl[1] : ws.serviceOf(abs);
  const isService = decl ? true : (top !== '' && ws.isService(top));
  const at = top && !decl ? ws.serviceRel(top) : '';
  if (!isService && !readOnly) return null;

  if (readOnly) return ask(`${readOnly}/ là thư mục dự án khai là chỉ để đọc (mã bên ngoài để tham khảo): ${abs}. Sửa ở đây thường là nhầm chỗ.`);

  // Dịch vụ phiên đã sửa tệp (mới nhất trước), đọc từ sổ. Chế độ legacy coi dịch vụ sửa gần đây nhất là dịch vụ phiên đang làm.
  let touched = []; let home = '';
  try {
    touched = (await store.editsOf(event.session)).filter((e) => e.edits > 0).map((e) => e.service);
    home = touched[0] || '';
  } catch { /* không có sổ = coi như phiên chưa sửa dịch vụ nào */ }

  if (mode === 'enforce') {
    let why = null;
    try { why = await denyReason(store, event.session, top); } catch { /* lỗi nội bộ: không chặn */ }
    if (why) return deny(`${why} (Tệp: ${abs})`);
  } else if (decl) {
    // legacy: tờ khai báo của dịch vụ khác dịch vụ phiên đang làm thì hỏi người dùng.
    if (home && ws.caseKey(home) !== ws.caseKey(top)) {
      return ask(`Tờ khai báo ${decl[0]} là của dịch vụ "${top}" (mỗi dịch vụ tự ghi commit mình muốn chạy). ` +
        `Phiên này đang làm "${home}". Việc của "${top}" nên để phiên của nó làm, hoặc ghi yêu cầu vào docs/handoff/. Cho phép nếu người dùng đã bảo ghim hộ.`);
    }
  } else if (home && home !== top) {
    // legacy: một phiên một dịch vụ một lúc; người dùng đồng ý thì lần sửa chạy và luật theo dõi chuyển dịch vụ đang làm sang `top`.
    return ask(`Nguyên tắc: một phiên một dịch vụ. Phiên này đang làm "${home}", giờ lại sửa "${top}" (${abs}). ` +
      `Việc của "${top}" nên làm ở một phiên riêng (mở ở gốc dự án và giao việc cho "${top}"), hoặc ghi yêu cầu vào docs/handoff/. ` +
      `Cho phép nghĩa là phiên CHUYỂN sang làm "${top}": từ đó sửa "${top}" không bị hỏi nữa, còn quay lại "${home}" thì bị hỏi lại.`);
  }
  if (decl) return null;

  if (!touched.includes(top)) {
    // Lần đầu phiên này sửa dịch vụ: nhắc nguyên tắc, và cảnh báo nếu có phiên khác vừa sửa cùng dịch vụ (dễ ghi đè nhau ở tệp thường).
    let clash = '';
    try {
      const peers = (await store.recentOthers(event.session, ACTIVE_MS)).filter((s) => s.services.includes(top));
      if (peers.length) {
        clash = ` CẢNH BÁO: có ${peers.length} phiên Claude Code khác cũng đang sửa "${top}" (gần nhất ${ago(peers[0].ageMs)}). ` +
          `Hai phiên cùng sửa một dịch vụ dễ ghi đè nhau ở tệp thường (mã, STATUS.md). Hãy báo người dùng trước khi sửa tiếp; ` +
          `tài liệu ba tầng và ${ws.unitRel(top, 'docs/service.yaml')} ghi qua bsn-docs thì có khóa nên không mất cập nhật.`;
      }
    } catch { /* không đọc được thì không cảnh báo */ }
    // Skill riêng của đơn vị nằm trong phần tại chỗ của nó; công cụ chủ không tự nạp chỗ đó nên phải nêu ra.
    const own = ws.unitSkills(top);
    const ownNote = own.length ? ` Đơn vị này có skill riêng: ${own.join(', ')} (đọc bằng công cụ Read: ${at}/.harness/skills/<tên>/SKILL.md) khi làm đúng loại việc đó.` : '';
    return note(`Bạn đang sửa dịch vụ "${top}" từ phiên mở ở gốc dự án. Theo CLAUDE.md gốc: một phiên làm một dịch vụ. ` +
      `Làm theo ${at}/${ws.unitRel(top, 'CLAUDE.md')} (quy tắc riêng, thiết kế ba lớp), ${at}/${ws.unitRel(top, 'docs/agent/STATUS.md')} và skill ở .claude/skills/ (chỉ đường chung, mở trước: services; tài liệu: service-docs; sơ đồ: diagrams, không tự viết Mermaid; trang trên cổng: service-page). ` +
      `Sửa xong thì cập nhật STATUS và tài liệu bằng công cụ bsn-docs (service="${top}"). Việc đụng dịch vụ khác thì ghi docs/handoff/, đừng tự sửa.${ownNote}${clash}`);
  }
  return null;
}

module.exports = { id: 'scope', on: 'before-action', run, denyReason };
