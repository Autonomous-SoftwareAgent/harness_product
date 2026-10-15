'use strict';
// spec: HOOK-S-010
// ĐỊNH NGHĨA CHUNG của một đơn vị: skill (và sau này rule) mà bộ chuyển đọc được từ hai nguồn. Hàm thuần.
//   origin 'native'   do team viết sẵn ở chỗ công cụ tự nạp (ví dụ <đơn vị>/.claude/skills/<tên>/SKILL.md); harness chỉ ĐỌC, không bao giờ ghi lại
//   origin 'harness'  viết ở <đơn vị>/.harness/skills/<tên>/SKILL.md; harness SINH ra tệp công cụ từ đây
// Mỗi tên chỉ có MỘT nguồn gốc: trùng tên thì bản của team thắng (họ là chủ sở hữu), bản của harness bị che và được báo.
// Nhờ vậy không có hai bản chép của cùng một thứ và không có vòng lặp đọc-ghi.
const NAME_RE = /^[a-z][a-z0-9-]*$/;

// { name, text, origin, src }[] -> { defs, shadowed }
// defs: bộ định nghĩa hợp nhất, sắp theo tên; shadowed: [{ name, src, by }] bản của harness bị bản native che.
function merge(native, harness) {
  const byName = new Map();
  const shadowed = [];
  for (const d of native || []) if (NAME_RE.test(d.name) && !byName.has(`${d.kind || 'skill'}:${d.name}`)) byName.set(`${d.kind || 'skill'}:${d.name}`, { kind: 'skill', ...d, origin: 'native' });
  for (const d of harness || []) {
    if (!NAME_RE.test(d.name)) continue;
    const key = `${d.kind || 'skill'}:${d.name}`;
    if (byName.has(key)) { shadowed.push({ name: d.name, src: d.src, by: byName.get(key).src }); continue; }
    byName.set(key, { kind: 'skill', ...d, origin: 'harness' });
  }
  return { defs: [...byName.values()].sort((a, b) => a.name.localeCompare(b.name)), shadowed };
}

// Kiểm một định nghĩa skill trước khi ghi (công cụ host_define dùng). Trả danh sách vấn đề (rỗng = hợp lệ).
function problems({ name, description, body }) {
  const out = [];
  if (!NAME_RE.test(String(name || ''))) out.push('tên skill chỉ gồm chữ thường, số, gạch ngang, bắt đầu bằng chữ');
  const d = String(description || '');
  if (!d.trim()) out.push('thiếu mô tả (description): một dòng nói skill dùng khi nào');
  if (/[\r\n]/.test(d)) out.push('mô tả phải nằm trên MỘT dòng');
  if (d.length > 400) out.push('mô tả dài quá 400 ký tự');
  const b = String(body || '');
  if (!b.trim()) out.push('thiếu nội dung (body)');
  if (b.length > 30000) out.push('nội dung dài quá 30000 ký tự');
  if (/^---\s*$/m.test(b)) out.push('nội dung không được có dòng chỉ gồm "---" (sẽ làm hỏng frontmatter)');
  return out;
}

// Dựng nội dung SKILL.md từ ba phần. Thuần: cùng đầu vào cho cùng đầu ra.
function skillText({ name, description, body }) {
  return `---\nname: ${name}\ndescription: ${String(description).trim()}\n---\n${String(body).replace(/\r\n/g, '\n').replace(/\s+$/, '')}\n`;
}

module.exports = { NAME_RE, merge, problems, skillText };
