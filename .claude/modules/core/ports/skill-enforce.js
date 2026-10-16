'use strict';
// spec: HOOK-S-010
// HỢP ĐỒNG ĐIỀU KIỆN ÉP CỦA SKILL ĐƠN VỊ: dạng tệp, không có mã chạy ngoài việc đọc chuỗi (hàm thuần). Hai bộ chuyển dùng chung dạng này mà không nhập nhau:
// bộ chuyển công cụ (adapters/hosts) ghi và bỏ nó khi sinh tệp cho công cụ; bộ chuyển dự án (adapters/project) đọc nó để gộp vào bảng nối skill.
//
// Điều kiện ép nằm trong frontmatter của <đơn vị>/.harness/skills/<tên>/SKILL.md, MỘT dòng mỗi trường:
//   harness-files: ["^src/adapters/"]            mẫu đường dẫn (biểu thức chính quy) TÍNH TỪ GỐC ĐƠN VỊ; chuỗi trần cũng được
//   harness-reads: ["docs/agent/CONVENTIONS.md"] tài liệu phải đọc thêm (đường dẫn trong đơn vị)
// Hai dòng này là của harness: tệp cho công cụ không có chúng.
const FRONT_RE = /^---\n([\s\S]*?)\n---\n?/;
const ENFORCE_KEYS = ['harness-files', 'harness-reads'];
const norm = (t) => String(t).replace(/\r\n/g, '\n');

// Phần frontmatter của một tệp: { fields: Map(khóa -> chuỗi), raw, body }. Không có frontmatter thì fields rỗng, body là cả tệp.
function front(text) {
  const t = norm(text);
  const m = FRONT_RE.exec(t);
  if (!m) return { fields: new Map(), raw: '', body: t };
  const fields = new Map();
  for (const line of m[1].split('\n')) { const k = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line); if (k) fields.set(k[1], k[2].trim()); }
  return { fields, raw: m[1], body: t.slice(m[0].length) };
}

// Giá trị một trường dạng danh sách trên một dòng: mảng JSON, hoặc một chuỗi trần (một phần tử).
function listValue(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return [];
  if (s.startsWith('[')) { try { const a = JSON.parse(s); return Array.isArray(a) ? a.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()) : []; } catch { return []; } }
  return [s.replace(/^["']|["']$/g, '')];
}

// Điều kiện ép khai trong SKILL.md: { files, reads, bad }. Mẫu không dịch được thì vào `bad` và không vào `files`.
function enforceOf(text) {
  const { fields } = front(text);
  const files = []; const bad = [];
  for (const p of listValue(fields.get('harness-files'))) { try { new RegExp(p, 'i'); files.push(p); } catch { bad.push(p); } }
  return { files, reads: listValue(fields.get('harness-reads')), bad };
}

// Bản cho công cụ: bỏ các dòng harness-* khỏi frontmatter (Claude Code chỉ cần name và description).
function stripEnforce(text) {
  const t = norm(text);
  const m = FRONT_RE.exec(t);
  if (!m) return t;
  const kept = m[1].split('\n').filter((l) => !ENFORCE_KEYS.some((k) => l.startsWith(`${k}:`)));
  return `---\n${kept.join('\n')}\n---\n${t.slice(m[0].length)}`;
}

module.exports = { FRONT_RE, ENFORCE_KEYS, front, listValue, enforceOf, stripEnforce };
