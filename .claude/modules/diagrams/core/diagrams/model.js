'use strict';
// spec: PORT-S-002
// Phép tính thuần trên bản khai báo sơ đồ (S-055): dấu của nội dung, tên các phần tử trên hình, dạng chuẩn để lưu, độ phủ năm loại.
// Không đọc ghi đĩa: bên gọi (mcp/diagrams.js) lo việc lưu trong giao dịch có khóa.
const crypto = require('node:crypto');
const specs = require('./spec');

// Dấu của NỘI DUNG sơ đồ (không tính phần giải thích): phần giải thích ghi lại dấu này lúc viết; hình đổi thì dấu lệch và trang báo "có thể đã cũ".
function contentHash(spec) {
  const { explain, generated, ...content } = spec; // `generated` là cách sinh, không phải nội dung của hình
  return crypto.createHash('sha256').update(JSON.stringify(content)).digest('hex').slice(0, 16);
}

// Tên các phần tử có trên hình, để kiểm mục "Chi tiết" của phần giải thích nói về thứ có thật trong sơ đồ.
function elementNames(spec) {
  const names = [];
  const add = (...xs) => { for (const x of xs) if (x) names.push(String(x).toLowerCase()); };
  if (spec.type === 'flowchart') { for (const n of spec.nodes) add(n.id, n.label, ...n.lines); for (const g of spec.groups) add(g.id, g.label); for (const e of spec.edges) add(e.label); }
  else if (spec.type === 'state') { for (const s of spec.states) add(s.id, s.label); for (const t of spec.transitions) add(t.label); }
  else if (spec.type === 'erd') { for (const e of spec.entities) { add(e.id, e.label); for (const c of e.columns) add(c.name, `${e.id}.${c.name}`); } for (const r of spec.relations) add(r.label); }
  else if (spec.type === 'class') { for (const c of spec.classes) add(c.id, c.label, ...c.members); for (const r of spec.relations) add(r.label); }
  else {
    for (const p of spec.participants) add(p.id, p.label);
    const walk = (steps) => steps.forEach((s) => { if (s.message) add(s.message.text); if (s.note) add(s.note.text); if (s.alt) { s.alt.branches.forEach((b) => { add(b.when); walk(b.steps); }); if (s.alt.otherwise) walk(s.alt.otherwise.steps); } });
    walk(spec.steps);
  }
  return names;
}
// Một mục chi tiết hợp lệ khi tên của nó chứa tên một phần tử trên hình (hoặc ngược lại), hoặc là số thứ tự bước ("Bước 3", "3", "①").
function termMatches(term, names) {
  const t = term.toLowerCase();
  if (/^(bước\s*)?[0-9①-⑳]/.test(t)) return true;
  return names.some((n) => t === n || (n.length >= 2 && (t.includes(n) || (t.length >= 3 && n.includes(t)))));
}

// Thứ tự trường chuẩn của tệp lưu (để docs check so được "đúng dạng công cụ ghi"): đi lại qua bộ kiểm lược đồ.
const canonical = (spec) => specs.parse(JSON.parse(JSON.stringify(spec))).spec;

const TYPE_LABEL = { flowchart: 'luồng', sequence: 'trình tự', state: 'trạng thái', erd: 'dữ liệu', class: 'lớp' };
// items: [{ type }] các sơ đồ đang có; na: [{ type, reason }] loại dịch vụ đã khai là không áp dụng (service.yaml: architecture.diagram_na).
// Trả một dòng cho mỗi loại: { type, label, count, na (lý do hoặc null), missing }.
function coverage(items, na = []) {
  return specs.TYPES.map((type) => {
    const count = items.filter((d) => d.type === type).length;
    const reason = (na.find((x) => x && x.type === type) || {}).reason || null;
    return { type, label: TYPE_LABEL[type], count, na: count ? null : reason, missing: !count && !reason };
  });
}
module.exports = { contentHash, elementNames, termMatches, canonical, coverage, TYPE_LABEL };
