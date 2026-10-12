'use strict';
// spec: PORT-S-002
// DẠNG GỌN của một sơ đồ: văn bản để agent ĐỌC và SOÁT, mỗi nút một dòng, mỗi cạnh một dòng, không lặp tên trường như JSON.
// Đây không phải cú pháp sơ đồ và không ghi ngược lại được: ghi vẫn chỉ qua diagram_save với dữ liệu có lược đồ.
// Hàm thuần, tất định, KHÔNG làm mất nút hay cạnh nào so với bản khai báo (có test đếm lại).
const TYPE_LABEL = { flowchart: 'luồng', sequence: 'trình tự', state: 'trạng thái', erd: 'dữ liệu', class: 'lớp' };
const ARROW = { 'solid:forward': '→', 'solid:none': '—', 'solid:both': '↔', 'dotted:forward': '⇢', 'dotted:none': '┄', 'dotted:both': '⇠⇢', 'thick:forward': '⇒', 'thick:none': '═', 'thick:both': '⇔' };
const CARD = { one: '1', 'zero-or-one': '0..1', many: 'n' };
const KIND = { composition: 'chứa', aggregation: 'gồm', inheritance: 'kế thừa', implementation: 'cài đặt', association: 'dùng', dependency: 'phụ thuộc' };

function flowchart(s) {
  const out = [];
  const name = new Map(s.nodes.map((n) => [n.id, n.label]));
  for (const g of s.groups) name.set(g.id, `[${g.label}]`);
  const line = (n) => `  ${n.label}${n.lines.length ? ` | ${n.lines.join(' | ')}` : ''}${n.shape !== 'box' ? ` (${n.shape})` : ''}`;
  for (const g of s.groups) { out.push(`[${g.label}]`); for (const n of s.nodes.filter((x) => x.group === g.id)) out.push(line(n)); }
  const free = s.nodes.filter((x) => !x.group);
  if (free.length) { if (s.groups.length) out.push('(ngoài nhóm)'); for (const n of free) out.push(line(n)); }
  if (s.edges.length) out.push('cạnh:');
  for (const e of s.edges) out.push(`  ${name.get(e.from)} ${ARROW[`${e.line}:${e.arrow}`]} ${name.get(e.to)}${e.label ? `: ${e.label}` : ''}`);
  return out;
}

function sequence(s) {
  const name = new Map(s.participants.map((p) => [p.id, p.label]));
  const out = [`tham gia: ${s.participants.map((p) => p.label + (p.actor ? ' (người)' : '')).join(', ')}`];
  let n = 0;
  const walk = (steps, pad) => {
    for (const st of steps) {
      if (st.message) out.push(`${pad}${++n}. ${name.get(st.message.from)} ${st.message.reply ? '⇠' : '→'} ${name.get(st.message.to)}: ${st.message.text}`);
      else if (st.note) out.push(`${pad}ghi chú (${st.note.over.map((x) => name.get(x)).join(', ')}): ${st.note.text}`);
      else {
        st.alt.branches.forEach((b, i) => { out.push(`${pad}${i ? 'hoặc nếu' : 'nếu'} ${b.when}:`); walk(b.steps, `${pad}  `); });
        if (st.alt.otherwise) { out.push(`${pad}còn lại:`); walk(st.alt.otherwise.steps, `${pad}  `); }
      }
    }
  };
  walk(s.steps, '  ');
  return out;
}

function state(s) {
  const out = [`trạng thái: ${s.states.map((x) => (x.label ? `${x.id} (${x.label})` : x.id)).join(', ')}`];
  if (s.start.length) out.push(`bắt đầu: ${s.start.join(', ')}`);
  if (s.end.length) out.push(`kết thúc: ${s.end.join(', ')}`);
  for (const t of s.transitions) out.push(`  ${t.from} → ${t.to}${t.label ? `: ${t.label}` : ''}`);
  return out;
}

function erd(s) {
  const out = [];
  const name = new Map(s.entities.map((e) => [e.id, e.label || e.id]));
  for (const e of s.entities) {
    const cols = e.columns.map((c) => `${c.name} ${c.type}${c.keys.length ? ` ${c.keys.join('+')}` : ''}${c.note ? ` (${c.note})` : ''}`);
    out.push(`${name.get(e.id)}${e.store !== 'table' ? ` [${e.store === 'json' ? 'trong cột JSON' : 'tài liệu'}]` : ''}: ${cols.join(' | ') || '(không khai cột)'}`);
  }
  for (const r of s.relations) out.push(`  ${name.get(r.from)} ${CARD[r.from_card]}—${CARD[r.to_card]} ${name.get(r.to)} (${r.label})`);
  return out;
}

function klass(s) {
  const out = [];
  const name = new Map(s.classes.map((c) => [c.id, c.label || c.id]));
  for (const c of s.classes) out.push(`${name.get(c.id)}${c.stereotype ? ` <${c.stereotype}>` : ''}: ${c.members.join(' | ') || '(không khai thành viên)'}`);
  for (const r of s.relations) out.push(`  ${name.get(r.from)} ${KIND[r.kind]} ${name.get(r.to)}${r.label ? `: ${r.label}` : ''}`);
  return out;
}

const BODY = { flowchart, sequence, state, erd, class: klass };
// Số phần tử của sơ đồ, để dòng đầu nói ngay cỡ của nó và để test đếm lại.
function counts(s) {
  if (s.type === 'flowchart') return { nodes: s.nodes.length, edges: s.edges.length };
  if (s.type === 'state') return { nodes: s.states.length, edges: s.transitions.length };
  if (s.type === 'erd') return { nodes: s.entities.length, edges: s.relations.length };
  if (s.type === 'class') return { nodes: s.classes.length, edges: s.relations.length };
  let n = 0; const walk = (steps) => steps.forEach((x) => { if (x.message) n++; if (x.alt) { x.alt.branches.forEach((b) => walk(b.steps)); if (x.alt.otherwise) walk(x.alt.otherwise.steps); } });
  walk(s.steps);
  return { nodes: s.participants.length, edges: n };
}

// lines(spec): các dòng nội dung (không có dòng đầu). compact(spec, { origin }): văn bản đủ, dòng đầu là mã, loại, nguồn gốc, cỡ.
const lines = (spec) => BODY[spec.type](spec);
function compact(spec, { origin } = {}) {
  const c = counts(spec);
  const from = origin || (spec.generated ? `tự sinh từ ${spec.generated.reader}` : 'agent khai qua công cụ');
  return [`${spec.id} · ${TYPE_LABEL[spec.type]} · ${from} · ${c.nodes} nút, ${c.edges} cạnh · ${spec.title}`, ...lines(spec)].join('\n');
}

// So hai bản của cùng một sơ đồ: chỉ trả các dòng THÊM và BỚT (để agent soát phần đổi, không đọc lại cả hình).
function diff(before, after) {
  const a = new Set(lines(before).map((l) => l.trim())); const b = new Set(lines(after).map((l) => l.trim()));
  const added = [...b].filter((l) => !a.has(l)); const removed = [...a].filter((l) => !b.has(l));
  return { added, removed, text: [...added.map((l) => `+ ${l}`), ...removed.map((l) => `- ${l}`)].join('\n') || '(không đổi dòng nào)' };
}

// Cắt một văn bản theo trần ký tự, ở ranh giới dòng, và nói rõ còn bao nhiêu.
function capped(text, max, more) {
  if (text.length <= max) return text;
  const kept = []; let n = 0;
  const all = text.split('\n');
  for (const l of all) { if (n + l.length + 1 > max) break; kept.push(l); n += l.length + 1; }
  return `${kept.join('\n')}\n… (cắt: còn ${all.length - kept.length} dòng${more ? `; ${more}` : ''})`;
}

module.exports = { compact, lines, counts, diff, capped, TYPE_LABEL };
