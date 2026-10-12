'use strict';
// spec: PORT-S-002
// Lược đồ của bản khai báo sơ đồ: dữ liệu thuần (chuỗi, số, tên trong danh sách cho trước) nói sơ đồ CHỨA GÌ, không nói Mermaid
// viết thế nào. parse(spec) trả { spec (đã điền mặc định), errors: [{path, message}] }; có lỗi thì spec = null.
// Trường lạ bị từ chối ở mọi cấp, nên không có chỗ nào để nhét cú pháp Mermaid thô vào. Không phụ thuộc thư viện ngoài.
const { STYLE_NAMES } = require('../../../core/ports/renderer');

const TYPES = ['flowchart', 'sequence', 'state', 'erd', 'class'];
// Sơ đồ dữ liệu: một thực thể được lưu thế nào (bảng thật, đối tượng nằm trong cột JSON của một bảng, tài liệu của cơ sở dữ liệu dạng tài liệu).
const STORES = ['table', 'json', 'document'];
const KEYS = ['PK', 'FK', 'UK'];
const FROM_CARD = ['one', 'zero-or-one'];
const TO_CARD = ['many', 'one', 'zero-or-one'];
const STEREOTYPES = ['interface', 'abstract', 'module', 'service', 'struct', 'enum'];
const RELATION_KINDS = ['composition', 'aggregation', 'inheritance', 'implementation', 'association', 'dependency'];
const COL_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]{0,59}$/;
const TABS = ['business', 'architecture', 'problems'];
const DIRECTIONS = ['TB', 'LR', 'BT', 'RL'];
const SHAPES = ['box', 'round', 'stadium', 'cylinder', 'diamond', 'circle'];
const LINES = ['solid', 'dotted', 'thick'];
const ARROWS = ['forward', 'none', 'both'];
const SPEC_ID_RE = /^[a-z][a-z0-9-]{0,39}$/;
// Mã của sơ đồ do harness TỰ SINH từ mã (khối context dựng); diagram_save không nhận mã bắt đầu bằng tiền tố này.
const AUTO_PREFIX = 'tu-sinh-';
const EL_ID_RE = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
// Từ là cú pháp của Mermaid: không cho làm mã phần tử, kẻo bản khai báo vô tình thành cú pháp.
const RESERVED = new Set(['end', 'class', 'classdef', 'style', 'state', 'note', 'participant', 'actor', 'as', 'subgraph', 'graph', 'flowchart',
  'direction', 'click', 'default', 'link', 'linkstyle', 'alt', 'else', 'opt', 'loop', 'par', 'and', 'rect', 'over', 'autonumber', 'activate', 'deactivate']);
const MAX = { title: 140, label: 80, line: 80, text: 160, nodes: 40, edges: 80, groups: 12, lines: 6, participants: 12, steps: 80, branches: 6, sources: 20, entities: 30, columns: 40, colType: 40, note: 120, classes: 30, members: 20, member: 100,
  meaning: 700, read: 8, readText: 320, details: 40, term: 90, detailText: 420, pitfalls: 6, pitfallText: 320 };

// ---------- bộ kiểm nhỏ: mỗi hàm nhận (giá trị, đường dẫn, mảng lỗi) ----------
const push = (errs, path, message) => errs.push({ path, message });
const text = (max, { required = true } = {}) => (v, at, errs) => {
  if (typeof v !== 'string') return push(errs, at, 'phải là chuỗi');
  if (required && !v.trim()) push(errs, at, 'không được rỗng');
  if (/[\r\n]/.test(v)) push(errs, at, 'phải là một dòng (không xuống dòng)');
  if (v.length > max) push(errs, at, `dài quá ${max} ký tự (đang ${v.length})`);
};
const oneOf = (values) => (v, at, errs) => { if (!values.includes(v)) push(errs, at, `phải là một trong: ${values.join(', ')}`); };
const bool = (v, at, errs) => { if (typeof v !== 'boolean') push(errs, at, 'phải là true hoặc false'); };
const elId = (v, at, errs) => {
  if (typeof v !== 'string' || !EL_ID_RE.test(v)) return push(errs, at, 'mã phần tử phải bắt đầu bằng chữ, chỉ gồm chữ, số, gạch dưới (tối đa 40 ký tự)');
  if (RESERVED.has(v.toLowerCase())) push(errs, at, `'${v}' là từ dành riêng của Mermaid, chọn mã khác`);
};
const listOf = (item, max, { min = 0 } = {}) => (v, at, errs) => {
  if (!Array.isArray(v)) return push(errs, at, 'phải là danh sách');
  if (v.length > max) push(errs, at, `quá ${max} phần tử`);
  if (v.length < min) push(errs, at, `cần ít nhất ${min} phần tử`);
  v.forEach((x, i) => item(x, `${at}[${i}]`, errs));
};
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
// fields: { tên: [hàm kiểm, giá trị mặc định | REQUIRED] }. Trường lạ là lỗi.
const REQUIRED = Symbol('bắt buộc');
const obj = (fields) => (v, at, errs) => {
  if (!isObj(v)) return push(errs, at, 'phải là đối tượng');
  for (const k of Object.keys(v)) if (!(k in fields)) push(errs, `${at}.${k}`, 'trường không có trong lược đồ');
  for (const [k, [check, dflt]] of Object.entries(fields)) {
    if (v[k] === undefined) { if (dflt === REQUIRED) push(errs, `${at}.${k}`, 'thiếu'); continue; }
    check(v[k], `${at}.${k}`, errs);
  }
};
// Điền mặc định (sau khi đã hợp lệ) để bộ dựng không phải đoán.
const fill = (fields, v) => {
  const out = {};
  for (const [k, [, dflt]] of Object.entries(fields)) {
    if (v[k] !== undefined) out[k] = v[k];
    else if (dflt !== REQUIRED && dflt !== undefined) out[k] = typeof dflt === 'function' ? dflt() : dflt;
  }
  return out;
};

// Phần giải thích của sơ đồ (bốn mục hiện dưới hình). Chỉ ghi bằng diagram_explain; `basis` là dấu của nội dung sơ đồ lúc viết, do công cụ đặt,
// để biết phần giải thích còn khớp với hình hay đã cũ.
const DETAIL = { term: [text(MAX.term), REQUIRED], text: [text(MAX.detailText), REQUIRED] };
const EXPLAIN = {
  meaning: [text(MAX.meaning), REQUIRED],
  read: [listOf(text(MAX.readText), MAX.read, { min: 1 }), REQUIRED],
  details: [listOf(obj(DETAIL), MAX.details), () => []],
  pitfalls: [listOf(text(MAX.pitfallText), MAX.pitfalls), () => []],
  basis: [text(64), undefined],
};

const COMMON = {
  id: [(v, at, errs) => { if (typeof v !== 'string' || !SPEC_ID_RE.test(v)) push(errs, at, 'mã sơ đồ phải dạng chữ thường/số/gạch ngang, bắt đầu bằng chữ'); }, REQUIRED],
  type: [oneOf(TYPES), REQUIRED],
  title: [text(MAX.title), REQUIRED],
  tab: [oneOf(TABS), 'architecture'],
  sources: [listOf(text(200), MAX.sources), () => []],
  explain: [obj(EXPLAIN), undefined],
};

const GROUP = { id: [elId, REQUIRED], label: [text(MAX.label), REQUIRED], direction: [oneOf(DIRECTIONS), undefined] };
const NODE = {
  id: [elId, REQUIRED], label: [text(MAX.label), REQUIRED], lines: [listOf(text(MAX.line), MAX.lines), () => []],
  style: [oneOf(STYLE_NAMES), 'gray'], shape: [oneOf(SHAPES), 'box'], group: [elId, undefined],
};
const EDGE = { from: [elId, REQUIRED], to: [elId, REQUIRED], label: [text(MAX.label), undefined], line: [oneOf(LINES), 'solid'], arrow: [oneOf(ARROWS), 'forward'] };
const FLOWCHART = {
  ...COMMON,
  direction: [oneOf(DIRECTIONS), 'TB'],
  groups: [listOf(obj(GROUP), MAX.groups), () => []],
  nodes: [listOf(obj(NODE), MAX.nodes, { min: 1 }), REQUIRED],
  edges: [listOf(obj(EDGE), MAX.edges), () => []],
};

const PARTICIPANT = { id: [elId, REQUIRED], label: [text(MAX.label), REQUIRED], actor: [bool, false] };
const MESSAGE = { from: [elId, REQUIRED], to: [elId, REQUIRED], text: [text(MAX.text), REQUIRED], reply: [bool, false] };
const NOTE = { over: [listOf(elId, 2, { min: 1 }), REQUIRED], text: [text(MAX.text), REQUIRED] };
// Một bước là đúng MỘT trong: message, note, alt. alt chỉ một cấp (bước trong nhánh không được là alt).
const step = (allowAlt) => (v, at, errs) => {
  if (!isObj(v)) return push(errs, at, 'phải là đối tượng');
  const keys = Object.keys(v);
  if (keys.length !== 1 || !['message', 'note', 'alt'].includes(keys[0])) return push(errs, at, 'mỗi bước phải có đúng một trong: message, note, alt');
  if (keys[0] === 'message') return obj(MESSAGE)(v.message, `${at}.message`, errs);
  if (keys[0] === 'note') return obj(NOTE)(v.note, `${at}.note`, errs);
  if (!allowAlt) return push(errs, `${at}.alt`, 'alt không được lồng trong alt');
  const inner = listOf(step(false), MAX.steps, { min: 1 });
  obj({
    branches: [listOf(obj({ when: [text(MAX.text), REQUIRED], steps: [inner, REQUIRED] }), MAX.branches, { min: 1 }), REQUIRED],
    otherwise: [obj({ steps: [inner, REQUIRED] }), undefined],
  })(v.alt, `${at}.alt`, errs);
};
const SEQUENCE = {
  ...COMMON,
  autonumber: [bool, false],
  participants: [listOf(obj(PARTICIPANT), MAX.participants, { min: 1 }), REQUIRED],
  steps: [listOf(step(true), MAX.steps, { min: 1 }), REQUIRED],
};

// Sơ đồ trạng thái: states (mã là chữ hiện trên hình, label nếu muốn chữ khác), start/end là danh sách mã, transitions có nhãn tùy chọn.
const STATE = { id: [elId, REQUIRED], label: [text(MAX.label), undefined], style: [oneOf(STYLE_NAMES), undefined] };
const TRANSITION = { from: [elId, REQUIRED], to: [elId, REQUIRED], label: [text(MAX.label), undefined] };
const STATE_DIAGRAM = {
  ...COMMON,
  direction: [oneOf(DIRECTIONS), undefined],
  states: [listOf(obj(STATE), MAX.nodes, { min: 1 }), REQUIRED],
  start: [listOf(elId, MAX.nodes), () => []],
  end: [listOf(elId, MAX.nodes), () => []],
  transitions: [listOf(obj(TRANSITION), MAX.edges), () => []],
};

// Sơ đồ dữ liệu: thực thể (bảng hoặc đối tượng), cột, quan hệ khai từ phía "một" (from) sang phía "nhiều" (to).
// `generated` do công cụ diagram_generate đặt khi sơ đồ được đọc từ cơ sở dữ liệu thật; diagram_save không nhận trường này.
const colName = (v, at, errs) => { if (typeof v !== 'string' || !COL_NAME_RE.test(v)) push(errs, at, 'tên cột phải bắt đầu bằng chữ hoặc gạch dưới, chỉ gồm chữ, số, gạch dưới'); };
const COLUMN = { type: [text(MAX.colType), REQUIRED], name: [colName, REQUIRED], keys: [listOf(oneOf(KEYS), KEYS.length), () => []], note: [text(MAX.note), undefined] };
const ENTITY = { id: [elId, REQUIRED], label: [text(MAX.label), undefined], store: [oneOf(STORES), 'table'], columns: [listOf(obj(COLUMN), MAX.columns), () => []] };
const ERD_RELATION = { from: [elId, REQUIRED], to: [elId, REQUIRED], from_card: [oneOf(FROM_CARD), 'one'], to_card: [oneOf(TO_CARD), 'many'], label: [text(MAX.label), REQUIRED] };
// reader: bộ đọc nguồn (hiện có 'postgres'); command: lệnh tạo bảng của dịch vụ dạng danh sách đối số (không qua shell); url_env/url_format:
// biến môi trường và khuôn địa chỉ để lệnh đó nối vào cơ sở dữ liệu tạm; tables: chỉ lấy các bảng này (bỏ trống = mọi bảng);
// basis: dấu của các tệp nguồn (`sources`) lúc sinh, để biết mã khai cấu trúc bảng đã đổi sau đó hay chưa.
const READERS = ['postgres'];
const GENERATED = {
  reader: [oneOf(READERS), REQUIRED], command: [listOf(text(600), 12, { min: 1 }), REQUIRED], url_env: [text(60), REQUIRED], url_format: [text(200), REQUIRED],
  tables: [listOf(text(63), MAX.entities), () => []], basis: [text(64), REQUIRED],
};
const ERD = {
  ...COMMON,
  direction: [oneOf(DIRECTIONS), undefined],
  entities: [listOf(obj(ENTITY), MAX.entities, { min: 1 }), REQUIRED],
  relations: [listOf(obj(ERD_RELATION), MAX.edges), () => []],
  generated: [obj(GENERATED), undefined],
};

// Sơ đồ lớp: kiểu, module hay giao diện trong mã; quan hệ khai bằng nghĩa (kind), không khai ký hiệu mũi tên.
const CLASS = { id: [elId, REQUIRED], label: [text(MAX.label), undefined], stereotype: [oneOf(STEREOTYPES), undefined], members: [listOf(text(MAX.member), MAX.members), () => []], style: [oneOf(STYLE_NAMES), 'gray'] };
const CLASS_RELATION = { from: [elId, REQUIRED], to: [elId, REQUIRED], kind: [oneOf(RELATION_KINDS), 'dependency'], label: [text(MAX.label), undefined] };
const CLASS_DIAGRAM = {
  ...COMMON,
  direction: [oneOf(DIRECTIONS), 'TB'],
  classes: [listOf(obj(CLASS), MAX.classes, { min: 1 }), REQUIRED],
  relations: [listOf(obj(CLASS_RELATION), MAX.edges), () => []],
};

const fillStep = (s) => {
  if (s.message) return { message: fill(MESSAGE, s.message) };
  if (s.note) return { note: { over: [...s.note.over], text: s.note.text } };
  const alt = { branches: s.alt.branches.map((b) => ({ when: b.when, steps: b.steps.map(fillStep) })) };
  if (s.alt.otherwise) alt.otherwise = { steps: s.alt.otherwise.steps.map(fillStep) };
  return { alt };
};

const formatErrors = (errors) => errors.map((e) => `${e.path}: ${e.message}`);

// ---------- tham chiếu: mọi mã được nhắc tới phải có thật, không trùng ----------
function dupes(items, at, what, errs) {
  const seen = new Set();
  items.forEach((x, i) => { if (seen.has(x.id)) push(errs, `${at}[${i}].id`, `${what} trùng mã '${x.id}'`); seen.add(x.id); });
  return seen;
}

function checkRefs(spec, errs) {
  if (spec.type === 'flowchart') {
    const groups = dupes(spec.groups, 'groups', 'nhóm', errs);
    const nodes = dupes(spec.nodes, 'nodes', 'nút', errs);
    for (const g of groups) if (nodes.has(g)) push(errs, 'groups', `mã '${g}' vừa là nhóm vừa là nút`);
    spec.nodes.forEach((n, i) => { if (n.group && !groups.has(n.group)) push(errs, `nodes[${i}].group`, `không có nhóm '${n.group}'`); });
    for (const g of spec.groups) if (!spec.nodes.some((n) => n.group === g.id)) push(errs, 'groups', `nhóm '${g.id}' không có nút nào`);
    spec.edges.forEach((e, i) => {
      for (const end of ['from', 'to']) if (!nodes.has(e[end]) && !groups.has(e[end])) push(errs, `edges[${i}].${end}`, `không có nút hay nhóm '${e[end]}'`);
    });
    return;
  }
  if (spec.type === 'state') {
    const states = dupes(spec.states, 'states', 'trạng thái', errs);
    for (const k of ['start', 'end']) spec[k].forEach((id, i) => { if (!states.has(id)) push(errs, `${k}[${i}]`, `không có trạng thái '${id}'`); });
    spec.transitions.forEach((t, i) => {
      for (const end of ['from', 'to']) if (!states.has(t[end])) push(errs, `transitions[${i}].${end}`, `không có trạng thái '${t[end]}'`);
    });
    return;
  }
  if (spec.type === 'erd' || spec.type === 'class') {
    const erd = spec.type === 'erd';
    const items = erd ? spec.entities : spec.classes;
    const ids = dupes(items, erd ? 'entities' : 'classes', erd ? 'thực thể' : 'lớp', errs);
    spec.relations.forEach((r, i) => {
      for (const end of ['from', 'to']) if (!ids.has(r[end])) push(errs, `relations[${i}].${end}`, `không có ${erd ? 'thực thể' : 'lớp'} '${r[end]}'`);
    });
    if (erd) spec.entities.forEach((e, i) => {
      const seen = new Set();
      e.columns.forEach((c, j) => { if (seen.has(c.name)) push(errs, `entities[${i}].columns[${j}].name`, `cột trùng tên '${c.name}'`); seen.add(c.name); });
    });
    if (spec.tab !== 'architecture') push(errs, 'tab', 'sơ đồ dữ liệu và sơ đồ lớp thuộc tab architecture');
    return;
  }
  const people = dupes(spec.participants, 'participants', 'người tham gia', errs);
  const walk = (steps, at) => steps.forEach((s, i) => {
    const here = `${at}[${i}]`;
    if (s.message) for (const end of ['from', 'to']) if (!people.has(s.message[end])) push(errs, `${here}.message.${end}`, `không có người tham gia '${s.message[end]}'`);
    if (s.note) s.note.over.forEach((p, j) => { if (!people.has(p)) push(errs, `${here}.note.over[${j}]`, `không có người tham gia '${p}'`); });
    if (s.alt) {
      s.alt.branches.forEach((b, j) => walk(b.steps, `${here}.alt.branches[${j}].steps`));
      if (s.alt.otherwise) walk(s.alt.otherwise.steps, `${here}.alt.otherwise.steps`);
    }
  });
  walk(spec.steps, 'steps');
}

function parse(input) {
  const errors = [];
  if (!isObj(input)) return { spec: null, errors: [{ path: 'spec', message: 'phải là đối tượng' }] };
  if (!TYPES.includes(input.type)) return { spec: null, errors: [{ path: 'spec.type', message: `phải là một trong: ${TYPES.join(', ')}` }] };
  const fields = { flowchart: FLOWCHART, sequence: SEQUENCE, state: STATE_DIAGRAM, erd: ERD, class: CLASS_DIAGRAM }[input.type];
  obj(fields)(input, 'spec', errors);
  if (errors.length) return { spec: null, errors };
  const spec = fill(fields, input);
  spec.sources = [...spec.sources];
  if (spec.explain) spec.explain = { ...fill(EXPLAIN, spec.explain), read: [...spec.explain.read], details: (spec.explain.details || []).map((d) => fill(DETAIL, d)), pitfalls: [...(spec.explain.pitfalls || [])] };
  if (spec.type === 'flowchart') {
    spec.groups = spec.groups.map((g) => fill(GROUP, g));
    spec.nodes = spec.nodes.map((n) => ({ ...fill(NODE, n), lines: [...(n.lines || [])] }));
    spec.edges = spec.edges.map((e) => fill(EDGE, e));
  } else if (spec.type === 'state') {
    spec.states = spec.states.map((x) => fill(STATE, x));
    spec.start = [...spec.start];
    spec.end = [...spec.end];
    spec.transitions = spec.transitions.map((t) => fill(TRANSITION, t));
  } else if (spec.type === 'erd') {
    spec.entities = spec.entities.map((e) => ({ ...fill(ENTITY, e), columns: (e.columns || []).map((c) => ({ ...fill(COLUMN, c), keys: [...(c.keys || [])] })) }));
    spec.relations = spec.relations.map((r) => fill(ERD_RELATION, r));
    if (spec.generated) spec.generated = { ...fill(GENERATED, spec.generated), command: [...spec.generated.command], tables: [...(spec.generated.tables || [])] };
  } else if (spec.type === 'class') {
    spec.classes = spec.classes.map((c) => ({ ...fill(CLASS, c), members: [...(c.members || [])] }));
    spec.relations = spec.relations.map((r) => fill(CLASS_RELATION, r));
  } else {
    spec.participants = spec.participants.map((p) => fill(PARTICIPANT, p));
    spec.steps = spec.steps.map(fillStep);
  }
  checkRefs(spec, errors);
  return errors.length ? { spec: null, errors } : { spec, errors };
}

// Kiểm riêng một phần giải thích (chưa có basis). Trả danh sách lỗi dạng chuỗi.
function checkExplain(input) {
  const errors = [];
  obj(EXPLAIN)(input, 'explain', errors);
  if (isObj(input) && input.basis !== undefined) push(errors, 'explain.basis', 'do công cụ đặt, không truyền vào');
  return formatErrors(errors);
}

module.exports = { parse, formatErrors, checkExplain, fillExplain: (e) => ({ ...fill(EXPLAIN, e), read: [...e.read], details: (e.details || []).map((d) => fill(DETAIL, d)), pitfalls: [...(e.pitfalls || [])] }), TYPES, TABS, DIRECTIONS, SHAPES, LINES, ARROWS, STORES, KEYS, FROM_CARD, TO_CARD, STEREOTYPES, RELATION_KINDS, READERS, EL_ID_RE, RESERVED, SPEC_ID_RE, AUTO_PREFIX, MAX };
