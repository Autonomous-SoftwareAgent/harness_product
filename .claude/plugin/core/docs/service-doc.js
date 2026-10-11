'use strict';
// spec: MCP-S-003
// LÕI của nguồn có cấu trúc docs/service.yaml (S-055): lược đồ, phép kiểm, và bản Markdown gọn cho agent.
// Thuần: việc đọc, ghi trong giao dịch có khóa và chọn dịch vụ là của mcp/service-doc.js.

const SCHEMA = 1;
const SECTIONS = ['meta', 'business', 'architecture', 'progress'];
const SEVERITY = ['low', 'medium', 'high'];
const PROBLEM_STATUS = ['open', 'refining', 'resolved'];
const DEP_KIND = ['service', 'external', 'infra'];
const LAYOUT = ['auto', 'horizontal', 'vertical'];
const DIAGRAM_TYPES = ['flowchart', 'sequence', 'state', 'erd', 'class']; // trùng TYPES của diagram-spec.js (có test giữ)
const ID_RE = /^[a-z][a-z0-9-]{0,39}$/;
const PROBLEM_ID_RE = /^P-\d{3}$/;
const MAX = { title: 140, line: 400, text: 4000, list: 60, nodes: 40, edges: 80 };


// ---------- kiểm lược đồ ----------
// Mỗi hàm kiểm nhận (giá trị, đường dẫn, mảng lỗi). Trường không khai báo là lỗi: không cho dữ liệu lạ lọt vào nguồn.
const str = (max, { required = false } = {}) => (v, at, errs) => {
  if (typeof v !== 'string') return errs.push(`${at}: phải là chuỗi`);
  if (required && !v.trim()) errs.push(`${at}: không được rỗng`);
  if (v.length > max) errs.push(`${at}: dài quá ${max} ký tự (đang ${v.length})`);
};
const oneOf = (values) => (v, at, errs) => { if (!values.includes(v)) errs.push(`${at}: phải là một trong ${values.join('|')}`); };
const id = (v, at, errs) => { if (typeof v !== 'string' || !ID_RE.test(v)) errs.push(`${at}: mã phải dạng chữ thường/số/gạch ngang, bắt đầu bằng chữ`); };
const listOf = (item, max = MAX.list) => (v, at, errs) => {
  if (!Array.isArray(v)) return errs.push(`${at}: phải là danh sách`);
  if (v.length > max) errs.push(`${at}: quá ${max} phần tử`);
  v.forEach((x, i) => item(x, `${at}[${i}]`, errs));
};
const obj = (fields, optional = []) => (v, at, errs) => {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return errs.push(`${at}: phải là đối tượng`);
  for (const k of Object.keys(v)) if (!(k in fields)) errs.push(`${at}.${k}: trường không có trong lược đồ`);
  for (const [k, check] of Object.entries(fields)) {
    if (v[k] === undefined) { if (!optional.includes(k)) errs.push(`${at}.${k}: thiếu`); continue; }
    check(v[k], `${at}.${k}`, errs);
  }
};
const uniqueIds = (what) => (v, at, errs) => {
  if (!Array.isArray(v)) return;
  const seen = new Set();
  for (const x of v) {
    if (!x || typeof x.id !== 'string') continue;
    if (seen.has(x.id)) errs.push(`${at}: ${what} trùng mã '${x.id}'`);
    seen.add(x.id);
  }
};
const all = (...checks) => (v, at, errs) => checks.forEach((c) => c(v, at, errs));

const line = str(MAX.line, { required: true });
const title = str(MAX.title, { required: true });
const text = str(MAX.text);
const lines = listOf(line);

const diagram = all(
  obj({
    id,
    title,
    layout: oneOf(LAYOUT),
    nodes: all(listOf(obj({ id, label: title, group: str(40) }, ['group']), MAX.nodes), uniqueIds('nút')),
    edges: listOf(obj({ from: id, to: id, label: str(60) }, ['label']), MAX.edges),
  }),
  (v, at, errs) => {
    if (!v || !Array.isArray(v.nodes) || !Array.isArray(v.edges)) return;
    if (!v.nodes.length) errs.push(`${at}.nodes: sơ đồ cần ít nhất một nút`);
    const ids = new Set(v.nodes.map((n) => n && n.id));
    v.edges.forEach((e, i) => {
      for (const end of ['from', 'to']) if (e && !ids.has(e[end])) errs.push(`${at}.edges[${i}].${end}: không có nút '${e[end]}'`);
    });
  },
);

const SECTION_CHECK = {
  meta: obj({ title, summary: str(MAX.line) }),
  business: obj({
    goal: text,
    users: listOf(obj({ who: title, need: line })),
    value: lines,
    flows: all(listOf(obj({ id, title, steps: lines })), uniqueIds('luồng')),
    out_of_scope: lines,
    unverified: lines,
  }),
  architecture: obj({
    summary: text,
    layers: all(listOf(obj({ id, title, role: line, paths: listOf(str(200, { required: true })) })), uniqueIds('lớp')),
    components: all(listOf(obj({ id, title, layer: str(40), role: line, paths: listOf(str(200, { required: true })) }, ['layer'])), uniqueIds('thành phần')),
    depends_on: listOf(obj({ target: title, kind: oneOf(DEP_KIND), via: str(MAX.title), purpose: line })),
    provides: listOf(obj({ to: title, via: str(MAX.title), purpose: line })),
    diagrams: all(listOf(diagram, 12), uniqueIds('sơ đồ')), // trường CŨ: vẫn nhận để nguồn đã ghi còn hợp lệ, nhưng không còn được vẽ (sơ đồ mới: diagrams.js)
    decisions: listOf(obj({ id: str(40, { required: true }), title })),
    // Loại sơ đồ KHÔNG áp dụng cho dịch vụ này (mỗi dịch vụ cần đủ mọi loại; loại nào không áp dụng thì ghi lý do ở đây, lý do hiện trên trang).
    diagram_na: listOf(obj({ type: oneOf(DIAGRAM_TYPES), reason: line }), DIAGRAM_TYPES.length),
  }, ['diagrams', 'diagram_na']),
  progress: obj({ done: lines, doing: lines, next: lines }),
};

const problem = obj({
  id: (v, at, errs) => { if (typeof v !== 'string' || !PROBLEM_ID_RE.test(v)) errs.push(`${at}: mã vấn đề phải dạng P-001`); },
  title,
  severity: oneOf(SEVERITY),
  status: oneOf(PROBLEM_STATUS),
  found: str(10, { required: true }),
  updated: str(10, { required: true }),
  detail: text,
  refine: text,
  refs: listOf(str(200, { required: true }), 20),
});

function validate(doc) {
  const errs = [];
  obj({
    schema: (v, at, e) => { if (v !== SCHEMA) e.push(`${at}: phải là ${SCHEMA}`); },
    service: (v, at, e) => { if (typeof v !== 'string' || !/^[a-z][a-z0-9-]{1,40}$/.test(v)) e.push(`${at}: tên dịch vụ không hợp lệ`); },
    title,
    summary: str(MAX.line),
    updated: str(10, { required: true }),
    business: SECTION_CHECK.business,
    architecture: SECTION_CHECK.architecture,
    problems: all(listOf(problem, 300), uniqueIds('vấn đề')),
    progress: SECTION_CHECK.progress,
  })(doc, 'service.yaml', errs);
  // lớp của thành phần phải là lớp đã khai báo
  const arch = doc && doc.architecture;
  if (arch && Array.isArray(arch.layers) && Array.isArray(arch.components)) {
    const layerIds = new Set(arch.layers.map((l) => l && l.id));
    arch.components.forEach((c, i) => {
      if (c && c.layer && !layerIds.has(c.layer)) errs.push(`service.yaml.architecture.components[${i}].layer: không có lớp '${c.layer}'`);
    });
  }
  return errs;
}

// ---------- Markdown gọn cho agent ----------
function renderAgentMd(doc) {
  const out = [];
  const bullets = (xs, f = (x) => x) => xs.map((x) => `- ${f(x)}`);
  const sec = (head, body) => { if (body.length) out.push('', head, ...body); };
  const b = doc.business;
  const a = doc.architecture;
  out.push('<!-- GENERATED từ docs/service.yaml bằng bsn-docs. Không sửa tay; ghi nguồn bằng service_doc_set / problem_record. -->');
  out.push(`# ${doc.title} (${doc.service})`, '');
  if (doc.summary) out.push(doc.summary, '');
  out.push(`Cập nhật: ${doc.updated}. Bản cho người đọc: BSN_/docs/portal/${doc.service}/index.html (sinh từ cùng nguồn).`);

  out.push('', '## Nghiệp vụ');
  if (b.goal) out.push('', `Mục tiêu: ${b.goal}`);
  sec('Người dùng và nhu cầu:', bullets(b.users, (u) => `${u.who}: ${u.need}`));
  sec('Giá trị mang lại:', bullets(b.value));
  for (const f of b.flows) sec(`Luồng ${f.id}: ${f.title}`, f.steps.map((s, i) => `${i + 1}. ${s}`));
  sec('Ngoài phạm vi:', bullets(b.out_of_scope));
  sec('CHƯA kiểm với hệ thống thật:', bullets(b.unverified));

  out.push('', '## Kiến trúc kỹ thuật');
  if (a.summary) out.push('', a.summary);
  sec('Lớp:', bullets(a.layers, (l) => `${l.id} (${l.title}): ${l.role}${l.paths.length ? ` [${l.paths.join(', ')}]` : ''}`));
  sec('Thành phần:', bullets(a.components, (c) => `${c.id} (${c.title})${c.layer ? ` @${c.layer}` : ''}: ${c.role}${c.paths.length ? ` [${c.paths.join(', ')}]` : ''}`));
  sec('Phụ thuộc vào:', bullets(a.depends_on, (d) => `${d.target} (${d.kind}${d.via ? `, qua ${d.via}` : ''}): ${d.purpose}`));
  sec('Cung cấp cho:', bullets(a.provides, (p) => `${p.to}${p.via ? ` (qua ${p.via})` : ''}: ${p.purpose}`));
  for (const d of a.diagrams || []) {
    const label = new Map(d.nodes.map((n) => [n.id, n.label]));
    sec(`Sơ đồ ${d.id}: ${d.title}`, d.edges.length
      ? bullets(d.edges, (e) => `${label.get(e.from)} -> ${label.get(e.to)}${e.label ? `: ${e.label}` : ''}`)
      : bullets(d.nodes, (n) => n.label));
  }
  sec('Loại sơ đồ không áp dụng:', bullets(a.diagram_na || [], (d) => `${d.type}: ${d.reason}`));
  sec('Quyết định liên quan:', bullets(a.decisions, (d) => `${d.id}: ${d.title}`));

  out.push('', '## Vấn đề và tinh chỉnh');
  const pg = doc.progress;
  sec('Đã xong:', bullets(pg.done));
  sec('Đang làm:', bullets(pg.doing));
  sec('Tiếp theo:', bullets(pg.next));
  const live = doc.problems.filter((p) => p.status !== 'resolved');
  const closed = doc.problems.filter((p) => p.status === 'resolved');
  const fmt = (p) => {
    const rows = [`- ${p.id} [${p.status}, ${p.severity}] ${p.title} (phát hiện ${p.found})`];
    if (p.detail) rows.push(`  Vấn đề: ${p.detail.replace(/\n/g, '\n  ')}`);
    if (p.refine) rows.push(`  Tinh chỉnh: ${p.refine.replace(/\n/g, '\n  ')}`);
    if (p.refs.length) rows.push(`  Tham chiếu: ${p.refs.join(', ')}`);
    return rows.join('\n');
  };
  sec(`Vấn đề chưa xong (${live.length}):`, live.map(fmt));
  sec(`Đã xử lý (${closed.length}):`, closed.map((p) => `- ${p.id} ${p.title}${p.refine ? `: ${p.refine.split('\n')[0]}` : ''}`));
  if (!doc.problems.length) out.push('', 'Chưa ghi vấn đề nào.');
  return `${out.join('\n')}\n`;
}


module.exports = { SCHEMA, SECTIONS, SEVERITY, PROBLEM_STATUS, DEP_KIND, LAYOUT, DIAGRAM_TYPES, ID_RE, PROBLEM_ID_RE, MAX, str, oneOf, id, listOf, obj, uniqueIds, all, line, title, text, lines, diagram, SECTION_CHECK, problem, validate, renderAgentMd };
