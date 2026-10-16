'use strict';
// spec: HOOK-S-010
// ĐIỀU KIỆN ÉP CỦA SKILL ĐƠN VỊ, gộp vào bảng nối skill của dự án.
// Skill riêng của một đơn vị khai điều kiện ép ngay trong frontmatter của <đơn vị>/.harness/skills/<tên>/SKILL.md (xem definitions.js). Khi hook
// chặn theo skill đọc bảng nối, phần này được GỘP vào cuối `files` của bảng ở gốc dự án, với mẫu đường dẫn đã ghép tiền tố thư mục đơn vị.
// Hai điều bảo vệ: đơn vị chỉ THÊM yêu cầu (không bao giờ bớt hay đổi dòng nào của bảng gốc); mẫu hỏng thì bỏ dòng đó, không làm hỏng bảng.
const fs = require('node:fs');
const path = require('node:path');
const P = require('../../gate/gate-paths');
const enforceFmt = require('../../ports/skill-enforce');

const esc = (s) => String(s).replace(/[.+?^${}()|[\]\\]/g, '\\$&');
const readText = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } };

// Mọi điều kiện ép khai ở các đơn vị: [{ unit, skill, files, reads, bad, generated }]. Chỉ liệt kê skill CÓ khai harness-files hoặc harness-reads.
function collect(root) {
  const out = [];
  let entries = [];
  try { entries = P.serviceEntries(root); } catch { return out; }
  for (const { name, dir } of entries) {
    for (const skill of P.unitSkills(root, name)) {
      const text = readText(path.join(dir, P.UNIT_EXT_DIR, 'skills', skill, 'SKILL.md'));
      if (text === null) continue;
      const e = enforceFmt.enforceOf(text);
      if (!e.files.length && !e.reads.length && !e.bad.length) continue;
      out.push({ unit: name, skill, files: e.files, reads: e.reads, bad: e.bad, generated: fs.existsSync(path.join(dir, '.claude', 'skills', skill, 'SKILL.md')) });
    }
  }
  return out;
}

// Dòng của bảng nối: mẫu tính từ gốc dự án = tiền tố thư mục đơn vị + mẫu của skill (bỏ dấu ^ đầu mẫu).
function rows(root, found) {
  const out = [];
  for (const x of found) {
    if (!x.files.length) continue; // chỉ có reads: không có mẫu tệp thì không có gì để gắn
    let rel = '';
    try { rel = String(P.serviceRel(root, x.unit)).split(path.sep).join('/').replace(/\/+$/, ''); } catch { continue; }
    for (const p of x.files) out.push({ pattern: `^${esc(rel)}/${String(p).replace(/^\^/, '')}`, skill: x.skill, reads: x.reads });
  }
  return out;
}

// Bảng nối ở gốc + phần của các đơn vị. Không có bảng gốc (null) thì giữ null: hook chặn theo skill vẫn là "không cấu hình".
function merge(root, raw) {
  if (!raw || typeof raw !== 'object') return raw;
  const extra = rows(root, collect(root));
  if (!extra.length) return raw;
  return { ...raw, files: [...(Array.isArray(raw.files) ? raw.files : []), ...extra] };
}

module.exports = { collect, rows, merge };
