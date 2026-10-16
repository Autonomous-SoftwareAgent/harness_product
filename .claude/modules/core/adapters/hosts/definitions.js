'use strict';
// spec: HOOK-S-010
// ĐỊNH NGHĨA CHUNG của một đơn vị: skill và note mà bộ chuyển đọc được từ hai nguồn. Hàm thuần.
//   origin 'native'   do team viết sẵn ở chỗ công cụ tự nạp (ví dụ <đơn vị>/.claude/skills/<tên>/SKILL.md); harness chỉ ĐỌC, không bao giờ ghi lại
//   origin 'harness'  viết ở <đơn vị>/.harness/skills/<tên>/SKILL.md hay <đơn vị>/.harness/notes/<tên>.md; harness SINH ra tệp công cụ từ đây
// Mỗi tên chỉ có MỘT nguồn gốc: trùng tên thì bản của team thắng (họ là chủ sở hữu), bản của harness bị che và được báo.
// Nhờ vậy không có hai bản chép của cùng một thứ và không có vòng lặp đọc-ghi.
//
// Điều kiện ÉP của một skill (tệp nào phải mở skill trước, tài liệu nào phải đọc thêm) nằm ngay trong frontmatter của SKILL.md, một dòng mỗi trường:
//   harness-files: ["^src/adapters/"]            mẫu đường dẫn (biểu thức chính quy) TÍNH TỪ GỐC ĐƠN VỊ; chuỗi trần cũng được
//   harness-reads: ["docs/agent/CONVENTIONS.md"] tài liệu phải đọc thêm (đường dẫn trong đơn vị)
// Hai dòng này là của harness: bộ chuyển KHÔNG chép chúng sang tệp của công cụ.
const NAME_RE = /^[a-z][a-z0-9-]*$/;
// Dạng khai điều kiện ép là một hợp đồng dùng chung với bộ chuyển dự án (hai bộ chuyển không nhập nhau): ports/skill-enforce.js.
const { FRONT_RE, ENFORCE_KEYS, front, enforceOf, stripEnforce } = require('../../ports/skill-enforce');
const norm = (t) => String(t).replace(/\r\n/g, '\n');

// { kind, name, text, src }[] -> { defs, shadowed }
// defs: bộ định nghĩa hợp nhất, sắp theo loại rồi tên; shadowed: [{ name, src, by }] bản của harness bị bản native che.
function merge(native, harness) {
  const byName = new Map();
  const shadowed = [];
  const keyOf = (d) => `${d.kind || 'skill'}:${d.name}`;
  for (const d of native || []) if (NAME_RE.test(d.name) && !byName.has(keyOf(d))) byName.set(keyOf(d), { kind: 'skill', ...d, origin: 'native' });
  for (const d of harness || []) {
    if (!NAME_RE.test(d.name)) continue;
    const key = keyOf(d);
    if (byName.has(key)) { shadowed.push({ name: d.name, src: d.src, by: byName.get(key).src }); continue; }
    byName.set(key, { kind: 'skill', ...d, origin: 'harness' });
  }
  return { defs: [...byName.values()].sort((a, b) => String(a.kind).localeCompare(String(b.kind)) || a.name.localeCompare(b.name)), shadowed };
}

function enforceProblems(enforce) {
  const out = [];
  if (enforce == null) return out;
  if (typeof enforce !== 'object' || Array.isArray(enforce)) return ['enforce phải là { files: [...], reads: [...] }'];
  for (const k of ['files', 'reads']) {
    const v = enforce[k];
    if (v == null) continue;
    if (!Array.isArray(v) || v.some((x) => typeof x !== 'string' || !x.trim() || /[\r\n]/.test(x))) out.push(`enforce.${k} phải là danh sách chuỗi một dòng`);
  }
  for (const p of Array.isArray(enforce.files) ? enforce.files : []) { try { new RegExp(p, 'i'); } catch { out.push(`enforce.files: mẫu "${p}" không phải biểu thức chính quy hợp lệ`); } }
  return out;
}

// Kiểm một định nghĩa trước khi ghi (host_define dùng). `kind`: 'skill' (mặc định) hoặc 'note'. Trả danh sách vấn đề (rỗng = hợp lệ).
function problems({ name, description, body, kind = 'skill', enforce, paths }) {
  const out = [];
  if (!['skill', 'note'].includes(kind)) return [`kind phải là skill hoặc note, không phải "${kind}"`];
  if (!NAME_RE.test(String(name || ''))) out.push(`tên ${kind} chỉ gồm chữ thường, số, gạch ngang, bắt đầu bằng chữ`);
  if (kind === 'note' && name === 'harness') out.push('tên "harness" dành cho tệp nhắc cửa vào do harness sinh');
  const d = String(description || '');
  if (kind === 'skill') {
    if (!d.trim()) out.push('thiếu mô tả (description): một dòng nói skill dùng khi nào');
    if (/[\r\n]/.test(d)) out.push('mô tả phải nằm trên MỘT dòng');
    if (d.length > 400) out.push('mô tả dài quá 400 ký tự');
    out.push(...enforceProblems(enforce));
  } else {
    if (enforce != null) out.push('note không ép được (chỉ nhắc khi chạm tệp); bỏ enforce');
    const ps = Array.isArray(paths) ? paths : [];
    if (!ps.length || ps.some((p) => typeof p !== 'string' || !p.trim() || /[\r\n"]/.test(p))) out.push('note cần paths: danh sách mẫu đường dẫn kiểu glob (một dòng, không có dấu nháy kép) để biết nạp khi chạm tệp nào');
  }
  const b = String(body || '');
  if (!b.trim()) out.push('thiếu nội dung (body)');
  if (b.length > 30000) out.push('nội dung dài quá 30000 ký tự');
  if (/^---\s*$/m.test(b)) out.push('nội dung không được có dòng chỉ gồm "---" (sẽ làm hỏng frontmatter)');
  return out;
}

// Dựng nội dung SKILL.md. Thuần: cùng đầu vào cho cùng đầu ra.
function skillText({ name, description, body, enforce }) {
  const lines = [`name: ${name}`, `description: ${String(description).trim()}`];
  if (enforce && Array.isArray(enforce.files) && enforce.files.length) lines.push(`harness-files: ${JSON.stringify(enforce.files)}`);
  if (enforce && Array.isArray(enforce.reads) && enforce.reads.length) lines.push(`harness-reads: ${JSON.stringify(enforce.reads)}`);
  return `---\n${lines.join('\n')}\n---\n${String(body).replace(/\r\n/g, '\n').replace(/\s+$/, '')}\n`;
}

// Dựng nội dung một note: frontmatter `paths:` (danh sách YAML) rồi nội dung. Claude Code nạp rule này khi phiên chạm tệp khớp.
function noteText({ paths, body }) {
  const list = (paths || []).map((p) => `  - "${String(p).trim()}"`).join('\n');
  return `---\npaths:\n${list}\n---\n${String(body).replace(/\r\n/g, '\n').replace(/\s+$/, '')}\n`;
}

// Đọc ngược một note đã ghi: { paths, body } (để đổi tên mà không mất nội dung).
function readNote(text) {
  const t = norm(text);
  const m = FRONT_RE.exec(t);
  const paths = m ? [...m[1].matchAll(/^\s*-\s*"?([^"\n]+?)"?\s*$/gm)].map((x) => x[1]) : [];
  return { paths, body: m ? t.slice(m[0].length) : t };
}

module.exports = { NAME_RE, ENFORCE_KEYS, merge, front, enforceOf, stripEnforce, problems, skillText, noteText, readNote };
