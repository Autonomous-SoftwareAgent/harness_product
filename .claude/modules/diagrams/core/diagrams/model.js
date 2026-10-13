'use strict';
// spec: PORT-S-002
// Phép tính thuần trên bản khai báo sơ đồ: dấu của nội dung, tên các phần tử trên hình, dạng chuẩn để lưu, độ phủ năm loại.
// Không đọc ghi đĩa: bên gọi (mcp/diagrams.js) lo việc lưu trong giao dịch có khóa.
const crypto = require('node:crypto');
const specs = require('./spec');

// Dấu của HÌNH: chỉ tính thứ người đọc thấy trên hình. Không tính phần giải thích, cách sinh (`generated`) và danh sách tệp nguồn
// (`sources`): dời hay đổi tên tệp mã không đổi nét nào của hình, nên không được làm phần giải thích bị báo "có thể đã cũ".
function contentHash(spec) {
  const { explain, generated, sources, ...content } = spec;
  return crypto.createHash('sha256').update(JSON.stringify(content)).digest('hex').slice(0, 16);
}
// Dấu theo cách tính trước bản 1.5.0 (có tính `sources`): phần giải thích viết trước đó ghi dấu này, vẫn phải được nhận là khớp.
function legacyHash(spec) {
  const { explain, generated, ...content } = spec;
  return crypto.createHash('sha256').update(JSON.stringify(content)).digest('hex').slice(0, 16);
}
const basisMatches = (spec, basis) => basis === contentHash(spec) || basis === legacyHash(spec);
// Phần giải thích có CŨ so với hình không. `earlier`: các bản trước của chính sơ đồ này (ví dụ đọc từ lịch sử git), chỉ được hỏi khi dấu
// không khớp thẳng. Giải thích còn khớp khi nó được viết cho một bản trước mà HÌNH của bản đó giống hệt hình hiện tại (bản đó chỉ khác
// đường dẫn tệp nguồn). Không chứng minh được thì coi là cũ.
function explainStale(spec, earlier) {
  if (!spec || !spec.explain) return false;
  const basis = spec.explain.basis;
  if (basisMatches(spec, basis)) return false;
  const list = typeof earlier === 'function' ? earlier() : (earlier || []);
  return !list.some((old) => old && basisMatches(old, basis) && samePicture(old, spec));
}
// Hai bản có CÙNG HÌNH không. Cùng dấu thì cùng hình. Khác dấu vẫn tính là cùng hình khi mọi chỗ khác nhau chỉ là một đường dẫn tệp viết
// trên hình được thêm hay bớt thư mục đứng trước (`cli/session.js` thành `core/cli/session.js`): đó là mã dời chỗ, không phải hình đổi ý.
// Khác bất cứ thứ gì khác (thêm bớt nút, cạnh, đổi chữ, đổi tên tệp) thì là hình khác.
const PATH_TOKEN = /[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+/g;
function samePicture(a, b) {
  if (contentHash(a) === contentHash(b)) return true;
  const split = (spec) => {
    const { explain, generated, sources, ...content } = spec;
    const tokens = [];
    const frame = JSON.stringify(content).replace(PATH_TOKEN, (t) => { tokens.push(t); return '\u0000'; });
    return { frame, tokens };
  };
  const x = split(a); const y = split(b);
  if (x.frame !== y.frame || x.tokens.length !== y.tokens.length) return false;
  return x.tokens.every((t, i) => { const u = y.tokens[i]; return t === u || u.endsWith(`/${t}`) || t.endsWith(`/${u}`); });
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
module.exports = { contentHash, legacyHash, basisMatches, explainStale, samePicture, elementNames, termMatches, canonical, coverage, TYPE_LABEL };
