'use strict';
// spec: HOOK-S-003
// spec: PORT-S-003
// spec: HOOK-S-004
// spec: HOOK-S-005
// LÕI của tóm tắt đầu phiên: từ các DỮ KIỆN do bộ chuyển gom sẵn, viết ra tóm tắt ngắn nạp vào ngữ cảnh của model khi mở phiên,
// để phiên biết ngay hiện trạng mà không phải dò. Thuần: không đọc đĩa, không chạy lệnh, không hỏi giờ.
// Dữ kiện `f` (mục nào bộ chuyển không lấy được thì để undefined, dòng tương ứng bị bỏ, không đoán):
//   services   [{ name, yaml: 'missing' | 'unreadable' | { live, high }, modules: có docs/modules không, statusSize: số byte | null }]
//   handoffs   [tên tệp yêu cầu còn mở]
//   others     [{ services: [tên], ageMs }] các phiên khác đang sửa
//   title      { by } | null: tiêu đề của phiên này
//   skillHealth [vấn đề của sổ phiên và luật đủ kiến thức]
//   banned     { rel, hasWords, banForeign: [repo] }
//   publish    câu về bản trên claude.ai, hoặc ''
//   hooks      { rootPush: [chữ], foreign: [repo] }
//   advertise  có nhắc dùng kho ngữ nghĩa không
//   notices    [lời nhắc về sơ đồ tự sinh của từng dịch vụ]
//   scopeMode  chế độ của luật phạm vi
//   toolCount  số công cụ của máy chủ bsn-docs (0 nếu không đếm được)
//   parents    [thư mục chứa đơn vị] theo cấu hình dự án
//   mcpJson    'created' | 'added' | 'broken' khi .mcp.json ở gốc vừa được tạo, vừa thêm mục, hay hỏng; undefined khi đã đúng
//   onboard    câu nói dự án chưa cài đặt gì (chưa có cấu hình, hoặc chưa khai đơn vị nào); undefined khi đã cài
//   mcp        { lines: [chữ], cli } điều cần báo về máy chủ MCP sau cổng của harness; undefined khi không có gì
//   extensions { lines: [chữ], cli } điều cần báo về khối mở rộng; undefined khi không có gì
const { ago } = require('./table');

const STATUS_BIG = 40 * 1024;

function describe(s) {
  const name = s.name;
  const parts = [];
  if (s.yaml === 'missing') parts.push('chưa có docs/service.yaml');
  else if (s.yaml === 'unreadable') parts.push('service.yaml KHÔNG đọc được');
  else { const high = s.yaml.high; parts.push(`${s.yaml.live} vấn đề chưa xong${high ? ` (${high} mức cao)` : ''}`); }
  if (!s.modules) parts.push('chưa dùng tài liệu ba tầng');
  if (s.statusSize === null) parts.push('chưa có STATUS.md');
  else {
    const size = s.statusSize;
    if (size > STATUS_BIG) parts.push(`STATUS.md dài ${Math.round(size / 1024)} KB, nên gọn: node .claude/modules/core/cli/cli.js --service ${name} status-archive`);
  }
  return `${name}: ${parts.join('; ')}`;
}

// Một dòng về danh sách từ cấm của máy. Không in từ nào: phiên tự đọc tệp ở máy.
function bannedLine(b) {
  const rel = b.rel;
  const words = b.hasWords;
  const hooks = { banForeign: b.banForeign };
  if (!words) return `- TỪ CẤM: máy này chưa có danh sách (${rel}) nên đang KHÔNG quét.`;
  const bad = hooks.banForeign && hooks.banForeign.length ? ` Repo có git hook khác nên KHÔNG được quét: ${hooks.banForeign.join(', ')}; báo người dùng.` : '';
  return `- TỪ CẤM: đọc ${rel} (chỉ có ở máy) trước khi viết. Từ trong đó không được vào commit nào (nội dung, tên tệp, lời nhắn); hook chặn ghi, commit và đẩy. Không chép các từ đó ra đâu.${bad}`;
}

function compose(f) {
  const lines = ['Tóm tắt đầu phiên của harness (sinh tự động, chỉ để định hướng; chi tiết đọc trong docs của dịch vụ):'];
  const svcs = f.services;
  const hooks = f.hooks;
  lines.push(`- Dịch vụ (${svcs.length}): ${svcs.map((s) => describe(s)).join(' | ') || 'chưa có'}`);
  const open = f.handoffs;
  lines.push(open.length ? `- Yêu cầu còn mở trong docs/handoff (${open.length}): ${open.join(', ')}` : '- Yêu cầu còn mở trong docs/handoff: không có');
  if (f.others) {
    const others = f.others;
    if (others.length) {
      lines.push(`- Phiên Claude Code khác đang sửa: ${others.map((o) => `${o.services.join('+')} (${ago(o.ageMs)})`).join(', ')}. Tránh làm cùng dịch vụ; nếu buộc phải làm thì báo người dùng trước.`);
    }
  }
  // Phiên chưa có tên do người dùng đặt thì phiên khác khó nhận ra nó đang làm gì (bảng phiên: node .claude/modules/core/cli/session.js list).
  if (f.title !== undefined) {
    const t = f.title;
    if (!t || t.by !== 'người dùng đặt') lines.push('- Phiên chưa có tên: khi rõ làm dịch vụ nào, nhờ người dùng đặt tên phiên theo dịch vụ. Trước khi nhắn phiên khác: node .claude/modules/core/cli/session.js for <dịch-vụ>.');
  }
  // Dự án chưa khai cách tổ chức: harness chưa biết đơn vị nào, nên việc đầu tiên là chạy skill onboard.
  if (f.mcpJson) {
    lines.push(f.mcpJson === 'broken'
      ? '- .mcp.json ở gốc dự án KHÔNG đọc được nên máy chủ MCP bsn-docs không chạy. Báo người dùng sửa tệp đó.'
      : `- Harness vừa ${f.mcpJson === 'created' ? 'tạo' : 'thêm mục bsn-docs vào'} .mcp.json ở gốc dự án: báo người dùng gõ /mcp (hoặc mở lại phiên) để có công cụ bsn-docs.`);
  }
  if (f.onboard) lines.push(`- CHƯA CÀI ĐẶT DỰ ÁN: ${f.onboard}. Việc đầu tiên: mở skill onboard và làm theo (đọc dự án, trình kế hoạch tổ chức, được duyệt thì ghi .claude/project/project.json, rồi chạy node .claude/modules/core/cli/cli.js doctor). Trong lúc chưa cài đặt, cổng duyệt kế hoạch vẫn chặn sửa tệp khi chưa duyệt.`);
  const where = f.parents && f.parents.length ? `Dịch vụ nằm trong ${f.parents.map((p) => `${p}/`).join(', ')}` : 'Đơn vị khai trong .claude/project/project.json';
  lines.push(`- Bản cho người đọc: docs/portal/index.html (trang ba tab của từng dịch vụ, CHỈ hiện nội dung đã commit). ${where}; docs trong dịch vụ là Markdown cho agent. Skill: services (mở TRƯỚC khi sửa một dịch vụ; hook CHẶN ghi khi thiếu skill hoặc chưa đọc CLAUDE.md, STATUS.md của dịch vụ), service-docs, diagrams (không tự viết Mermaid), service-page, new-service.`);
  // Sổ phiên và luật đủ kiến thức: có vấn đề nghĩa là luật đang KHÔNG chặn, nên phải nói ra.
  if (f.skillHealth) {
    const bad = f.skillHealth;
    if (bad.length) lines.push(`- SKILL health: ${bad.join('; ')}. Báo người dùng (xem: node .claude/modules/core/cli/session.js skills).`);
  }
  if (f.banned) { const b = bannedLine(f.banned); if (b) lines.push(b); }
  // Khối mở rộng của dự án hay đơn vị: chưa xác nhận thì không chạy; chỉ người dùng xác nhận, ngoài phiên Claude.
  if (f.extensions && f.extensions.lines.length) {
    const x = f.extensions;
    lines.push(`- KHỐI MỞ RỘNG: ${x.lines.join('; ')}. Báo người dùng; xem: node ${x.cli} extension list. Xác nhận (người dùng tự chạy trong terminal, phiên Claude không chạy được): node ${x.cli} extension trust <khóa>.`);
  }
  // Cổng MCP: máy chủ chưa xác nhận thì không chạy; máy chủ hỏng bị bỏ qua, các máy chủ khác và công cụ tài liệu vẫn chạy.
  if (f.mcp && f.mcp.lines.length) lines.push(`- MÁY CHỦ MCP: ${f.mcp.lines.join('; ')}. Xem: node ${f.mcp.cli} mcp list. Xác nhận một máy chủ: ghi mã của nó vào kế hoạch trình người dùng, được duyệt thì chạy node ${f.mcp.cli} mcp trust <tên>.`);
  // Bản trên claude.ai cũ hơn cổng trên máy: chỉ nhắc khi đã có gói chuẩn bị (máy tự dựng và dò sau mỗi commit). Đẩy vẫn do người dùng ra lệnh.
  if (f.publish) lines.push(`- ${f.publish}`);
  if (hooks.rootPush && hooks.rootPush.length) lines.push(`- REPO GỐC KHÔNG BAO GIỜ ĐẨY nhưng: ${hooks.rootPush.join('; ')}. Báo người dùng; kiểm: node .claude/modules/core/cli/install-git-hooks.js --check .`);
  if (hooks.foreign.length) lines.push(`- Repo đã có hook post-commit KHÁC nên cổng không tự dựng lại lúc commit: ${hooks.foreign.join(', ')}. Báo người dùng; cách gộp: node .claude/modules/core/cli/install-git-hooks.js --check <repo>.`);
  // Lời nhắc dùng kho ngữ nghĩa chỉ hiện khi đã bật cho mọi phiên.
  if (f.advertise) lines.push('- TÌM HIỂU MỘT VIỆC: gọi công cụ context_explore TRƯỚC khi Grep/Glob (một từ, một mã như P-003, một tên tệp, "POST /x", hoặc một câu; thêm impact=[tệp] để hỏi sửa tệp đó chạm tới gì). Nó trả tóm tắt kèm địa chỉ tệp:dòng từ kho ngữ nghĩa của cả hệ (mã, API, bảng, test, quyết định, sơ đồ, vấn đề). Kho dựng từ bản đã commit; chuỗi trong thân hàm và mã chưa commit thì vẫn Grep.');
  for (const t of f.notices || []) lines.push(`- ${t}`);
  // Luật phạm vi theo kế hoạch: nhắc khuôn và bước đăng ký; chế độ khác enforce thì nói rõ là đang không chặn.
  if (f.scopeMode) {
    const m = f.scopeMode;
    lines.push(m === 'enforce'
      ? '- PHẠM VI: kế hoạch theo khuôn "## Kế hoạch" (skill services); duyệt xong gọi scope_register; sửa ngoài kế hoạch bị CHẶN.'
      : `- PHẠM VI: chế độ "${m}", harness đang KHÔNG chặn sửa ngoài kế hoạch. Báo người dùng nếu không phải chủ ý.`);
  }
  // Số công cụ ĐẾM từ danh sách thật của máy chủ lúc phiên mở. Đây là nơi DUY NHẤT nêu con số: tài liệu và skill không viết cứng nó
  // (test docs-consistency cấm), nên thêm hay bớt công cụ không phải sửa tệp hướng dẫn nào.
  const toolCount = f.toolCount;
  lines.push(`- MCP bsn-docs phải có ${toolCount ? `${toolCount} công cụ` : 'đủ công cụ'} (có service_doc_set, problem_record, diagram_validate, diagram_save, diagram_explain, diagram_list, diagram_get, diagram_generate, diagram_review, context_explore, context_term, context_relate, portal_build). Thiếu, hoặc kết quả có "CẢNH BÁO bsn-docs", nghĩa là phiên đang chạy máy chủ cũ: báo người dùng gõ /mcp để nối lại.`);
  lines.push('- Quy trình: tổng hợp yêu cầu, trình kế hoạch, DỪNG chờ người dùng duyệt rồi mới sửa. Một phiên làm một dịch vụ.');
  return lines.join('\n');
}

module.exports = { STATUS_BIG, describe, bannedLine, compose };
