'use strict';
// spec: PORT-S-002
// BỘ CHUYỂN Mermaid cho cổng "bộ vẽ" (ports/renderer.js).
// Bản khai báo sơ đồ (dữ liệu thuần, đã qua core/diagrams/spec.js) -> văn bản Mermaid. Hàm thuần: cùng một bản khai báo luôn ra cùng
// một chuỗi, không đọc đĩa, không gọi mạng. Model KHÔNG BAO GIỜ viết cú pháp Mermaid; mọi quyết định cú pháp nằm ở đây.
// Mọi chuỗi do người viết đều qua escapeLabel: ký tự là cú pháp của Mermaid được đổi thành mã ký tự dạng #số; nên nhãn chứa
// nháy, ngoặc, dấu gạch đứng... không làm vỡ sơ đồ và không chèn được cú pháp.
const INDENT = '    ';
// Phiên bản của bộ vẽ. TĂNG số này mỗi khi cách sinh hình đổi (bố cục, ngắt dòng, màu): cổng thấy số đổi thì vẽ lại và kiểm lại mọi sơ đồ
// của mọi dịch vụ, không phiên nào phải khai lại gì. Bản khai báo chỉ nói sơ đồ CHỨA GÌ; bố cục do tệp này quyết.
const RENDERER_VERSION = 4;
// Giới hạn độ dài một dòng chữ trên hình (ký tự). Dài hơn thì công cụ tự ngắt dòng ở khoảng trắng, để hình không bị kéo rộng.
const WRAP = { edge: 26, message: 28, note: 46 };
const BASE_ESCAPED = '#&"<>';
const PACK = 3; // số nút rời trên một hàng khi xếp lưới trong một tầng
// Tầng có rất nhiều nút rời thì hàng dài hơn, để lưới gần vuông thay vì thành một dải cao (18 nút: hàng 6, thành 3 hàng).
const packOf = (loose) => (loose > 9 ? Math.ceil(Math.sqrt(loose * 1.5)) : PACK);

// Bảng màu cố định (tên do bản khai báo chọn, màu do công cụ quyết). Chữ tối trên nền nhạt nên đọc được ở cả nền sáng lẫn tối.
const { STYLE_NAMES } = require('../../../core/ports/renderer'); // tên màu là một phần của hợp đồng; màu thật do tệp này quyết
const STYLES = {
  gray: 'fill:#eef2f8,stroke:#8d9db5,color:#1b2330',
  green: 'fill:#e2f4e8,stroke:#4b9c69,color:#12301f',
  blue: 'fill:#e3eefc,stroke:#5b8ad6,color:#14284a',
  amber: 'fill:#fdf0d6,stroke:#c08a1e,color:#3a2c0f',
  pink: 'fill:#fbe6f1,stroke:#c2619a,color:#40152c',
  red: 'fill:#fde8e6,stroke:#c7574d,color:#3d1a17',
  teal: 'fill:#dff3f1,stroke:#3d9a91,color:#0f302d',
};

function escapeLabel(s, extra = '') {
  const chars = new Set(BASE_ESCAPED + extra);
  return [...String(s)].map((c) => (chars.has(c) ? `#${c.codePointAt(0)};` : c)).join('');
}

// Ngắt một câu thành các dòng không dài quá n ký tự, chỉ ngắt ở khoảng trắng (từ dài hơn n đứng riêng một dòng). Thuần và tất định.
function wrapWords(text, n) {
  const out = [];
  let cur = '';
  for (const w of String(text).split(' ')) {
    if (cur && cur.length + 1 + w.length > n) { out.push(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) out.push(cur);
  return out.length ? out : [''];
}
// Thoát từng dòng rồi mới nối bằng thẻ xuống dòng, nên thẻ không bao giờ đến từ chữ của người viết.
const wrapped = (text, n, extra = '') => wrapWords(text, n).map((l) => escapeLabel(l, extra)).join('<br/>');

const SHAPE = {
  box: (t) => `["${t}"]`,
  round: (t) => `("${t}")`,
  stadium: (t) => `(["${t}"])`,
  cylinder: (t) => `[("${t}")]`,
  diamond: (t) => `{"${t}"}`,
  circle: (t) => `(("${t}"))`,
};

const LINK = {
  solid: { forward: '-->', none: '---', both: '<-->' },
  dotted: { forward: '-.->', none: '-.-', both: '<-.->' },
  thick: { forward: '==>', none: '===', both: '<==>' },
};

function nodeLine(n, indent) {
  const label = [n.label, ...n.lines].map((s) => escapeLabel(s)).join('<br/>');
  return `${indent}${n.id}${SHAPE[n.shape](label)}`;
}

// classDef + class cho các màu thật sự được dùng, theo thứ tự bảng màu.
function styleLines(items) {
  const lines = [];
  for (const name of STYLE_NAMES) {
    const ids = items.filter((x) => x.style === name).map((x) => x.id);
    if (!ids.length) continue;
    lines.push(`${INDENT}classDef s_${name} ${STYLES[name]}`);
    lines.push(`${INDENT}class ${ids.join(',')} s_${name}`);
  }
  return lines;
}

// Bố cục của sơ đồ luồng do công cụ quyết, từ cấu trúc của bản khai báo (trường direction chỉ là gợi ý của người khai):
//  - Không có nhóm: giữ hướng đã khai.
//  - Có nhóm và mọi cạnh đi giữa hai nhóm đều nối NHÓM với NHÓM (dạng "tầng"): các tầng xếp từ trên xuống, bên trong mỗi tầng đi
//    từ trái sang phải. Mermaid chỉ giữ hướng riêng của một nhóm khi không nút nào trong nhóm nối thẳng ra ngoài nhóm.
//  - Có nhóm và có cạnh nối nút ở hai nhóm khác nhau: giữ hướng đã khai, trừ sơ đồ lớn (từ 3 nhóm và hơn 10 nút) khai chiều ngang
//    thì đổi sang trên xuống, vì chiều ngang kéo hình rộng gấp nhiều lần màn hình (đã đo: 3423px so với 1619px).
function layoutOf(spec) {
  if (!spec.groups.length) return { direction: spec.direction, inner: null, kind: 'tự do' };
  const groupOf = new Map(spec.nodes.map((n) => [n.id, n.group || '']));
  const crossNode = spec.edges.filter((e) => groupOf.has(e.from) && groupOf.has(e.to) && groupOf.get(e.from) !== groupOf.get(e.to)).length;
  const leavesGroup = spec.edges.some((e) => (groupOf.has(e.from) !== groupOf.has(e.to)) && groupOf.get(groupOf.has(e.from) ? e.from : e.to) !== '');
  if (!crossNode && !leavesGroup) {
    // Một tầng tỏa ra (hoặc nhận vào) từ 3 tầng khác trở lên thì các tầng đó đứng cạnh nhau trong cùng một hàng và hình rộng gấp mấy lần
    // màn hình (đã đo: 2792px). Khi đó xếp các tầng từ trái sang phải, trong mỗi tầng từ trên xuống: các tầng cùng hàng chồng lên nhau.
    // Ước lượng bề rộng (tính bằng số cột nút) của hai cách xếp, không cần vẽ thử: xếp hạng các tầng theo đường đi dài nhất,
    // rồi so "tầng xếp dọc" (rộng = hạng đông nhất) với "tầng xếp ngang" (rộng = tổng bề rộng các hạng). Chỉ đổi sang ngang khi
    // cách dọc rộng quá 5 cột VÀ cách ngang hẹp hơn; sơ đồ nhỏ và sơ đồ dạng chuỗi giữ nguyên cách dọc.
    // Đơn vị xếp hạng: mỗi tầng, và mỗi nút đứng ngoài mọi tầng (cỡ 1). Cạnh tạo vòng thì bỏ qua khi xếp hạng.
    const ids = [...spec.groups.map((g) => g.id), ...spec.nodes.filter((n) => !n.group).map((n) => n.id)];
    const size = new Map(ids.map((id) => [id, Math.max(1, spec.nodes.filter((n) => n.group === id).length)]));
    const next = new Map(ids.map((id) => [id, new Set()]));
    const reaches = (a, b, seen = new Set()) => a === b || [...next.get(a)].some((x) => !seen.has(x) && (seen.add(x), reaches(x, b, seen)));
    const between = [];
    for (const e of spec.edges) if (size.has(e.from) && size.has(e.to) && e.from !== e.to && !reaches(e.to, e.from)) { next.get(e.from).add(e.to); between.push(e); }
    const rank = new Map(ids.map((id) => [id, 0]));
    for (let i = 0; i < ids.length; i++) for (const e of between) if (rank.get(e.to) < rank.get(e.from) + 1) rank.set(e.to, rank.get(e.from) + 1);
    const byRank = new Map();
    for (const id of ids) byRank.set(rank.get(id), [...(byRank.get(rank.get(id)) || []), id]);
    // Bề rộng ước lượng theo điểm ảnh (hệ số lấy từ phép đo thật: một nút rộng khoảng 9px mỗi ký tự cộng 110px lề và khoảng cách).
    // Trong một tầng: phần có cạnh nối chiếm `depth` hạng; nút rời thì thư viện dồn vào một hạng (xem packOf: quá PACK nút rời thì xếp lưới).
    const shape = (id) => {
      const mine = spec.nodes.filter((n) => (n.group || n.id) === id);
      const set = new Set(mine.map((n) => n.id));
      const intra = spec.edges.filter((e) => set.has(e.from) && set.has(e.to) && e.from !== e.to);
      const linked = new Set(intra.flatMap((e) => [e.from, e.to]));
      const d = new Map([...linked].map((x) => [x, 1]));
      for (let i = 0; i < linked.size; i++) for (const e of intra) if (d.get(e.to) < d.get(e.from) + 1 && d.get(e.from) < linked.size) d.set(e.to, d.get(e.from) + 1);
      const depth = Math.max(0, ...d.values());
      const loose = mine.length - linked.size;
      const per = packOf(loose);
      const perTB = Math.max(PACK + 1, per);
      const chars = mine.reduce((n, x) => n + Math.max(x.label.length, ...x.lines.map((l) => l.length)), 0) / Math.max(1, mine.length);
      const node = Math.min(chars, 60) * 9 + 110;
      return {
        down: Math.max(depth, loose > PACK ? per : loose ? 1 : 0) * node + 60, // tầng xếp dọc, trong tầng đi ngang
        across: ((depth ? Math.ceil(linked.size / depth) : 0) + Math.ceil(loose / perTB)) * node + 60, // tầng xếp ngang, trong tầng đi dọc: nút rời nối thành cột
      };
    };
    const shapes = new Map(ids.map((id) => [id, shape(id)]));
    const rows = [...byRank.values()];
    const wide = Math.max(0, ...rows.map((row) => row.reduce((n, id) => n + shapes.get(id).down, 0)));
    const flat = rows.reduce((n, row) => n + Math.max(...row.map((id) => shapes.get(id).across)), 0) + 80 * Math.max(0, rows.length - 1);
    if (wide > 1800 && flat < wide) return { direction: 'LR', inner: 'TB', kind: 'tầng' };
    return { direction: 'TB', inner: 'LR', kind: 'tầng' };
  }
  const horizontal = spec.direction === 'LR' || spec.direction === 'RL';
  if (horizontal && spec.groups.length >= 3 && spec.nodes.length > 10) return { direction: 'TB', inner: null, kind: 'nhóm, đổi sang dọc' };
  return { direction: spec.direction, inner: null, kind: 'nhóm' };
}

// Nhóm được in ở chỗ nút đầu tiên của nhóm xuất hiện.
function renderFlowchart(spec) {
  const layout = layoutOf(spec);
  const out = [`flowchart ${layout.direction}`];
  const groups = new Map(spec.groups.map((g) => [g.id, g]));
  const emitted = new Set();
  for (const n of spec.nodes) {
    if (!n.group) { out.push(nodeLine(n, INDENT)); continue; }
    if (emitted.has(n.group)) continue;
    emitted.add(n.group);
    const g = groups.get(n.group);
    out.push(`${INDENT}subgraph ${g.id}["${escapeLabel(g.label)}"]`);
    const inner = g.direction || layout.inner;
    if (inner) out.push(`${INDENT}${INDENT}direction ${inner}`);
    for (const m of spec.nodes.filter((x) => x.group === g.id)) out.push(nodeLine(m, INDENT + INDENT));
    out.push(`${INDENT}end`);
  }
  // Dạng tầng: trong một tầng, các nút KHÔNG nối với nút nào cùng tầng bị thư viện xếp thành một cột dài. Từ 4 nút như vậy trở lên thì
  // nối chúng bằng cạnh vô hình thành các hàng PACK nút, để tầng thành một lưới. Tầng có tới 3 nút rời thì giữ nguyên như trước.
  const pack = [];
  if (layout.kind === 'tầng') {
    const groupOf = new Map(spec.nodes.map((n) => [n.id, n.group || '']));
    const linked = new Set();
    for (const e of spec.edges) if (groupOf.has(e.from) && groupOf.has(e.to) && groupOf.get(e.from) === groupOf.get(e.to)) { linked.add(e.from); linked.add(e.to); }
    for (const g of spec.groups) {
      const loose = spec.nodes.filter((n) => n.group === g.id && !linked.has(n.id)).map((n) => n.id);
      const down = (g.direction || layout.inner) === 'TB';
      if (down ? loose.length < 2 : loose.length <= PACK) continue;
      const per = down ? Math.max(PACK + 1, packOf(loose.length)) : packOf(loose.length);
      for (let i = 0; i < loose.length; i += per) { const row = loose.slice(i, i + per); if (row.length > 1) pack.push(`${INDENT}${row.join(' ~~~ ')}`); }
    }
  }
  if (spec.edges.length || pack.length) out.push('');
  out.push(...pack);
  for (const e of spec.edges) {
    const label = e.label ? `|"${wrapped(e.label, WRAP.edge, '|')}"|` : ''; // "|" bao nhãn cạnh nên cũng thoát
    out.push(`${INDENT}${e.from} ${LINK[e.line][e.arrow]}${label} ${e.to}`);
  }
  const classes = styleLines(spec.nodes);
  if (classes.length) out.push('', ...classes);
  return out.join('\n');
}

// Trong sơ đồ trình tự, ";" kết thúc câu lệnh nên cũng phải thoát.
const escapeText = (s) => escapeLabel(s, ';');

function renderStep(out, step, depth) {
  const pad = INDENT.repeat(depth);
  if (step.message) {
    const arrow = step.message.reply ? '-->>' : '->>';
    out.push(`${pad}${step.message.from}${arrow}${step.message.to}: ${wrapped(step.message.text, WRAP.message, ';')}`);
    return;
  }
  if (step.note) {
    out.push(`${pad}Note over ${step.note.over.join(',')}: ${wrapped(step.note.text, WRAP.note, ';')}`);
    return;
  }
  // alt: nhánh đầu mở khối, các nhánh sau là else, `otherwise` là else trống, một end đóng cả khối.
  const { branches, otherwise } = step.alt;
  branches.forEach((b, i) => {
    out.push(`${pad}${i === 0 ? 'alt' : 'else'} ${escapeText(b.when)}`);
    for (const inner of b.steps) renderStep(out, inner, depth + 1);
  });
  if (otherwise) {
    out.push(`${pad}else`);
    for (const inner of otherwise.steps) renderStep(out, inner, depth + 1);
  }
  out.push(`${pad}end`);
}

function renderSequence(spec) {
  const out = ['sequenceDiagram'];
  if (spec.autonumber) out.push(`${INDENT}autonumber`);
  for (const p of spec.participants) out.push(`${INDENT}${p.actor ? 'actor' : 'participant'} ${p.id} as ${escapeText(p.label)}`);
  for (const s of spec.steps) renderStep(out, s, 1);
  return out.join('\n');
}

// Sơ đồ trạng thái: mã trạng thái là chữ hiện trên hình, trừ khi có nhãn riêng. ":" ngăn cách nhãn chuyển tiếp nên cũng thoát.
const escapeState = (s) => escapeLabel(s, ';:');

function renderState(spec) {
  const out = ['stateDiagram-v2'];
  if (spec.direction) out.push(`${INDENT}direction ${spec.direction}`);
  for (const s of spec.states) if (s.label) out.push(`${INDENT}state "${escapeLabel(s.label)}" as ${s.id}`);
  for (const s of spec.start) out.push(`${INDENT}[*] --> ${s}`);
  for (const t of spec.transitions) out.push(`${INDENT}${t.from} --> ${t.to}${t.label ? `: ${escapeState(t.label)}` : ''}`);
  for (const s of spec.end) out.push(`${INDENT}${s} --> [*]`);
  const classes = styleLines(spec.states); // trạng thái không khai màu thì không có dòng nào, hình giữ như cũ
  if (classes.length) out.push('', ...classes);
  return out.join('\n');
}

// ---------- sơ đồ dữ liệu (erDiagram) ----------
// Kiểu cột của Mermaid là MỘT từ và không nhận dấu phẩy, dấu chấm (đã thử với Mermaid thật): khoảng trắng và dấu phẩy thành gạch dưới
// ("double precision" -> double_precision, "numeric(12, 2)" -> "numeric(12_2)"), ký tự lạ bị bỏ. Chuẩn hóa ở ĐÂY (một chỗ duy nhất),
// không trông vào người khai hay bộ đọc cơ sở dữ liệu.
function erdType(type) {
  const t = String(type).trim().replace(/\s*,\s*/g, '_').replace(/\s+/g, '_').replace(/[^A-Za-z0-9_()[\]-]/g, '');
  return /^[A-Za-z_]/.test(t) ? t : `t_${t}`;
}
const escapeBraces = (s) => escapeLabel(s, '{}');
// Chữ thêm sau tên thực thể để người đọc biết nó được lưu thế nào (bảng thật thì không thêm gì).
const STORE_SUFFIX = { table: '', json: ' · trong cột JSON', document: ' · tài liệu' };
const ERD_FROM = { one: '||', 'zero-or-one': '|o' };
const ERD_TO = { one: '||', 'zero-or-one': 'o|', many: 'o{' };

// Quan hệ luôn khai từ phía "một" (from) sang phía "nhiều" (to), nên người khai không phải nghĩ đầu nào của ký hiệu quay về đâu.
function renderErd(spec) {
  const out = ['erDiagram'];
  if (spec.direction) out.push(`${INDENT}direction ${spec.direction}`);
  for (const e of spec.entities) {
    const label = `${e.label || e.id}${STORE_SUFFIX[e.store]}`;
    out.push(`${INDENT}${e.id}${label === e.id ? '' : `["${escapeBraces(label)}"]`} {`);
    for (const c of e.columns) {
      const keys = c.keys.length ? ` ${c.keys.join(', ')}` : '';
      const note = c.note ? ` "${escapeBraces(c.note)}"` : '';
      out.push(`${INDENT}${INDENT}${erdType(c.type)} ${c.name}${keys}${note}`);
    }
    out.push(`${INDENT}}`);
  }
  if (spec.relations.length) out.push('');
  for (const r of spec.relations) out.push(`${INDENT}${r.from} ${ERD_FROM[r.from_card]}--${ERD_TO[r.to_card]} ${r.to} : "${escapeBraces(r.label)}"`);
  return out.join('\n');
}

// ---------- sơ đồ lớp (classDiagram) ----------
// Quan hệ khai bằng nghĩa ("from chứa to", "from cài đặt to"); đầu mũi tên của Mermaid quay về đâu là việc của bảng này.
const CLASS_RELATION = {
  composition: (from, to) => `${from} *-- ${to}`,
  aggregation: (from, to) => `${from} o-- ${to}`,
  inheritance: (from, to) => `${to} <|-- ${from}`,
  implementation: (from, to) => `${to} <|.. ${from}`,
  association: (from, to) => `${from} --> ${to}`,
  dependency: (from, to) => `${from} ..> ${to}`,
};

function renderClass(spec) {
  const out = ['classDiagram'];
  if (spec.direction !== 'TB') out.push(`${INDENT}direction ${spec.direction}`);
  for (const c of spec.classes) {
    const head = `${INDENT}class ${c.id}${c.label ? `["${escapeBraces(c.label)}"]` : ''}`;
    // Mermaid báo lỗi cú pháp với cặp ngoặc nhọn rỗng (đã thử), nên lớp không có gì bên trong thì in không ngoặc.
    if (!c.stereotype && !c.members.length) { out.push(head); continue; }
    out.push(`${head} {`);
    if (c.stereotype) out.push(`${INDENT}${INDENT}<<${c.stereotype}>>`);
    for (const m of c.members) out.push(`${INDENT}${INDENT}${escapeBraces(m)}`);
    out.push(`${INDENT}}`);
  }
  if (spec.relations.length) out.push('');
  for (const r of spec.relations) out.push(`${INDENT}${CLASS_RELATION[r.kind](r.from, r.to)}${r.label ? ` : ${escapeLabel(r.label, '{}:;')}` : ''}`);
  // classDiagram không nhận dòng `class a,b kiểu` của sơ đồ luồng; phải dùng cssClass.
  const styled = [];
  for (const name of STYLE_NAMES) {
    const ids = spec.classes.filter((x) => x.style === name).map((x) => x.id);
    if (ids.length) styled.push(`${INDENT}classDef s_${name} ${STYLES[name]}`, `${INDENT}cssClass "${ids.join(',')}" s_${name}`);
  }
  if (styled.length) out.push('', ...styled);
  return out.join('\n');
}

const RENDER = { flowchart: renderFlowchart, sequence: renderSequence, state: renderState, erd: renderErd, class: renderClass };
const render = (spec) => RENDER[spec.type](spec);

module.exports = { render, renderFlowchart, renderSequence, renderState, renderErd, renderClass, erdType, CLASS_RELATION, escapeLabel, wrapWords, layoutOf, STYLE_NAMES, STYLES, RENDERER_VERSION, WRAP };
