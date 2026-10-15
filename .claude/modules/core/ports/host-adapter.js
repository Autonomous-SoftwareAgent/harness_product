'use strict';
// spec: HOOK-S-010
// HỢP ĐỒNG BỘ CHUYỂN CÔNG CỤ (host). Định nghĩa gốc của một đơn vị (skill, tệp cửa vào) viết MỘT lần ở <đơn vị>/.harness/, trung lập với công cụ;
// mỗi công cụ (Claude Code, sau này Codex, Opencode...) có một bộ chuyển biến định nghĩa đó thành tệp công cụ ấy tự nạp. Lõi không biết tên công cụ nào:
// thêm công cụ là thêm một tệp ở adapters/hosts/ và một dòng ở bảng đăng ký, không sửa gì khác.
//
// Bộ chuyển là hàm thuần (không đọc ghi đĩa): nhận bản mô tả các đơn vị, trả danh sách tệp cần có. Việc đọc đĩa, ghi có kiểm dấu băm và loại khỏi git
// do adapters/hosts/sync.js làm chung cho mọi bộ chuyển.
//
//   adapter.name                      tên công cụ ('claude')
//   adapter.capabilities              bảng năng lực: { skills, rules, hooks, mcp, commands }, mỗi mục là { level, where, note }
//                                     level: 'native' (công cụ tự nạp ở chỗ đơn vị), 'root' (chỉ nạp ở nơi mở phiên), 'none' (không có)
//   adapter.plan(units)               units: [{ name, dir, skills: [{ name, text }], entry: { rel, exists } }]
//                                     trả [{ unit, rel, text, kind, exclude }]: rel tính từ thư mục đơn vị, kind: 'skill' | 'rule'
//                                     exclude: mẫu để loại khỏi git của đơn vị (đường dẫn kiểu .gitignore)
const LEVELS = ['native', 'root', 'none'];
const CAPS = ['skills', 'rules', 'hooks', 'mcp', 'commands'];

// Kiểm một bộ chuyển đúng hợp đồng. Trả danh sách vấn đề (rỗng = đạt).
function problems(adapter) {
  const out = [];
  if (!adapter || typeof adapter.name !== 'string' || !/^[a-z][a-z0-9-]*$/.test(adapter.name)) return ['thiếu tên hợp lệ'];
  if (typeof adapter.plan !== 'function') out.push('thiếu plan(units)');
  const caps = adapter.capabilities || {};
  for (const c of CAPS) {
    if (!caps[c]) { out.push(`bảng năng lực thiếu mục ${c}`); continue; }
    if (!LEVELS.includes(caps[c].level)) out.push(`năng lực ${c}: level phải là ${LEVELS.join(', ')}`);
    if (typeof caps[c].note !== 'string' || !caps[c].note) out.push(`năng lực ${c}: thiếu note`);
  }
  return out;
}

module.exports = { LEVELS, CAPS, problems };
