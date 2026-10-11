'use strict';
// spec: CTX-S-001
// MỘT CỬA HỎI của kho ngữ nghĩa: context_explore. Một câu hỏi, một câu trả lời gom cả ba tầng (mã, vòng đời, ngữ nghĩa), xếp theo điều
// người làm việc cần biết (LÀ GÌ, Ở ĐÂU, CHẠY THẾ NÀO, TEST, VÌ SAO, SƠ ĐỒ, LƯU Ý), không xếp theo đồ thị nào.
// Công cụ là THỦ THƯ: trả tên, một dòng tóm tắt và địa chỉ (tệp:dòng). Muốn đọc nguyên văn thì mở tệp ở địa chỉ đó.
// Khớp bằng CHỮ, theo bậc, dừng ở bậc đầu tiên có kết quả; không dùng model. Tiếng Việt gõ không dấu vẫn khớp.
// Không trả lỗi cho tình huống bình thường (không thấy gì, kho thiếu một phần): trả phần có và nói rõ phần thiếu.
const ctx = require('./graph');
const { capped } = require('../diagrams/compact');
// Bỏ phần đầu "…/<thư mục cha>/<dịch-vụ>/" (thư mục cha khai trong cấu hình dự án, S-063) hoặc "…/<thư mục đơn vị khai riêng>/"
// của một đường dẫn, còn lại đường dẫn trong repo của dịch vụ.
const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function stripUnit(p, units, parents = ['system_service']) {
  const rel = String(p).replace(/\\/g, '/');
  for (const parent of parents) {
    const m = new RegExp(`^(?:.*/)?${escapeRe(parent)}/[^/]+/(.*)$`, 'i').exec(rel);
    if (m) return m[1];
  }
  for (const dir of Object.values(units)) {
    const at = `/${rel}`.toLowerCase().lastIndexOf(`/${dir.toLowerCase()}/`);
    if (at >= 0) return rel.slice(at + dir.length + 1);
  }
  return rel;
}

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0111/g, 'd'); // bỏ dấu thanh, đ -> d
const SECTIONS = [
  ['la-gi', 'LÀ GÌ', ['term', 'flow', 'component', 'layer', 'service']],
  ['o-dau', 'Ở ĐÂU', ['file', 'symbol']],
  ['chay', 'CHẠY THẾ NÀO', ['api', 'entry', 'topic', 'table', 'external']],
  ['test', 'TEST', ['test']],
  ['vi-sao', 'VÌ SAO', ['decision', 'design', 'spec', 'impl']],
  ['so-do', 'SƠ ĐỒ', ['diagram', 'explain']],
  ['luu-y', 'LƯU Ý', ['problem', 'unverified', 'pitfall', 'handoff']],
  ['khac', 'MỤC TÀI LIỆU', ['section']],
];
const SECTION_OF = new Map(SECTIONS.flatMap(([key, , types]) => types.map((t) => [t, key])));
const PER_SECTION = 6;
const MAX_CHARS = 6000;
const STOP = new Set(['la', 'gi', 'o', 'dau', 'the', 'nao', 'cua', 'va', 'cac', 'nhung', 'cho', 'trong', 'khi', 'thi', 'co', 'khong', 'nam', 'duoc', 'mot', 'voi', 'den', 'tu', 've', 'bi', 'se', 'da', 'the', 'a', 'an', 'of', 'in', 'is', 'to', 'how', 'what', 'where', 'ai', 'nao', 'sao', 'vi', 'lam', 'nay', 'do', 'ra', 'vao', 'hay', 'hoac', 'neu', 'tai', 'theo']);

// Gộp kho của mọi dịch vụ và phần chung thành một chỉ mục: nút theo mã, cạnh đi ra và đi vào.
function index(all, service) {
  const graphs = [...Object.values(all.services), all.root].filter(Boolean).filter((g) => !service || g.name === service || g.name === ctx.ROOT_NAME);
  const nodes = new Map(); const out = new Map(); const inn = new Map(); const dark = [];
  for (const g of graphs) {
    for (const n of g.nodes) if (!nodes.has(n.id)) nodes.set(n.id, n);
    for (const d of g.dark || []) dark.push({ svc: g.name, text: d });
  }
  for (const g of graphs) for (const e of g.edges) {
    if (!nodes.has(e.src) || !nodes.has(e.dst)) continue;
    out.set(e.src, [...(out.get(e.src) || []), e]); inn.set(e.dst, [...(inn.get(e.dst) || []), e]);
  }
  return { nodes, out, inn, dark, graphs };
}

// ---------- khớp câu hỏi, theo bậc ----------
function match(ix, q) {
  const nq = norm(q).trim();
  const all = [...ix.nodes.values()];
  const tail = (id) => norm(id.split(':').slice(2).join(':'));
  const exactOf = (t) => all.filter((n) => norm(n.name) === t || tail(n.id) === t || norm(n.id) === t || norm(n.name).split(':')[0] === t || ((n.type === 'file' || n.type === 'test') && norm(n.name).endsWith(`/${t}`)));
  const words = [...new Set(nq.split(/[^a-z0-9_./#{}-]+/).map((w) => w.replace(/^[.,;:!?]+|[.,;:!?]+$/g, '')).filter((w) => w.length >= 2 && !STOP.has(w)))];
  // Bậc 1: cả câu hỏi là đúng mã hay đúng tên của một vật; hoặc trong câu có một từ là đúng tên một vật (tên tệp, tên bảng, mã mục).
  let exact = exactOf(nq);
  const named = [];
  if (!exact.length) for (const w of words) if (w.length >= 3) { const got = exactOf(w); if (got.length && got.length <= 8) { exact = [...exact, ...got.filter((n) => !exact.includes(n))]; named.push(w); } }
  // Bậc 2: bảng từ vựng nghiệp vụ.
  const terms = all.filter((n) => n.type === 'term' && [n.name, ...((n.attrs && n.attrs.also) || [])].some((t) => { const nt = norm(t); return nt === nq || nq.includes(nt) || (nq.length >= 4 && nt.includes(nq)); }));
  if (terms.length) {
    const refs = terms.flatMap((t) => (ix.out.get(t.id) || []).filter((e) => e.type === 'là').map((e) => ix.nodes.get(e.dst)));
    return { tier: 2, why: 'khớp bảng từ vựng', seeds: [...new Set([...terms, ...refs, ...exact])] };
  }
  if (!words.length) return exact.length ? { tier: 1, why: 'đúng mã hoặc đúng tên', seeds: exact } : { tier: 0, why: 'câu hỏi không có từ nào để khớp', seeds: [] };
  // Bậc 3: mọi từ CÓ NGHĨA VỚI KHO đều có trong tên hoặc tóm tắt của mục. Từ không xuất hiện ở đâu trong kho (từ nối của câu hỏi như
  // "sửa", "chạm") bị bỏ qua và được nói rõ, thay vì làm cả câu trượt.
  const hay = all.map((n) => [n, norm(n.name), norm(n.text)]);
  const live = words.filter((w) => hay.some(([, name, text]) => name.includes(w) || text.includes(w)));
  const dropped = words.filter((w) => !live.includes(w));
  const score = (name, text) => { let s = 0; for (const w of live) { if (name.includes(w)) s += 3; else if (text.includes(w)) s += 1; else return 0; } return s; };
  const hit = live.length ? hay.map(([n, name, text]) => [score(name, text), n]).filter(([s]) => s > 0).sort((a, b) => b[0] - a[0] || a[1].id.localeCompare(b[1].id)).map(([, n]) => n) : [];
  const note = dropped.length ? `; bỏ qua từ không có trong kho: ${dropped.join(', ')}` : '';
  // Khớp đúng tên vẫn kèm vài mục có chứa từ đó (một tên ngắn như 'refund' thường còn là hàm, đường dẫn, mục thiết kế khác).
  if (exact.length) return { tier: 1, why: `đúng mã hoặc đúng tên${named.length ? ` (${named.join(', ')})` : ''}${hit.length ? ', kèm các mục có chứa các từ đó' : ''}`, seeds: [...exact, ...hit.filter((n) => !exact.includes(n)).slice(0, 12)] };
  if (hit.length) return { tier: 3, why: `mọi từ (${live.join(', ')}) có trong tên hoặc tóm tắt${note}`, seeds: hit.slice(0, 24), cut: hit.length > 24 ? hit.length : 0 };
  // Bậc 4: không khớp chắc. Chỉ gợi ý để hỏi lại, không dùng để kết luận.
  const loose = hay.map(([n, name, text]) => [live.filter((w) => name.includes(w) || text.includes(w)).length, n]).filter(([s]) => s > 0).sort((a, b) => b[0] - a[0] || a[1].id.localeCompare(b[1].id)).slice(0, 6).map(([, n]) => n);
  return { tier: 4, why: live.length ? `không mục nào chứa đủ các từ (${live.join(', ')}); dưới đây chỉ là GỢI Ý để hỏi lại, không dùng để kết luận` : `không từ nào của câu hỏi (${words.join(', ').slice(0, 80)}) có trong kho`, seeds: loose };
}

const where = (n) => (n.svc === ctx.ROOT_NAME ? n.source : `${n.svc}/${n.source}`);
function line(n, note) {
  const conf = n.conf !== 'khai' ? ` · ${ctx.CONF[n.conf]}` : '';
  const stale = n.attrs && n.attrs.stale ? ' · CÓ THỂ ĐÃ CŨ' : '';
  const text = n.text && n.type !== 'file' && n.type !== 'test' && n.type !== 'symbol' ? ` — ${n.text.length > 120 ? `${n.text.slice(0, 119)}…` : n.text}` : '';
  return `  ${n.name}${text}${note ? ` (${note})` : ''} · ${where(n)}${conf}${stale}`;
}

// Từ các nút khớp, lấy thêm hàng xóm MỘT bước theo những quan hệ có nghĩa, rồi xếp vào các mục.
// Chống nhiễu: chỉ mở rộng từ FOCUS nút khớp tốt nhất; hàng xóm được xếp theo số nút khớp cùng trỏ tới nó (thứ nhiều mục cùng nhắc thì
// lên đầu); việc "tệp này còn khai gì, ai nhắc tới nó" chỉ làm cho tệp mà người hỏi gọi đúng tên, không làm cho tệp chỉ là hàng xóm.
const FOCUS = 8;
const OUT_EDGES = ['cài đặt ở', 'kiểm bằng', 'vẽ theo', 'bằng chứng ở', 'khai ở', 'là', 'giải thích', 'dễ hiểu nhầm', 'đặc tả của', 'cài đặt của', 'đụng bảng', 'khóa ngoại tới', 'nhắc tới'];
function gather(ix, seeds) {
  const picked = new Map(); // id -> { node, note, rank, votes }
  seeds.forEach((n, i) => picked.set(n.id, { node: n, note: '', rank: i, votes: 0, seed: true }));
  const vote = (n, note) => {
    if (!n || n.type === 'section' || n.type === 'service') return;
    const p = picked.get(n.id);
    if (p) { p.votes += 1; return; }
    picked.set(n.id, { node: n, note, rank: 1000, votes: 1, seed: false });
  };
  const focus = seeds.slice(0, FOCUS);
  for (const s of focus) {
    for (const e of ix.out.get(s.id) || []) if (OUT_EDGES.includes(e.type) && !(e.type === 'nhắc tới' && ix.nodes.get(e.dst).type === 'test')) vote(ix.nodes.get(e.dst), e.type);
    for (const e of ix.inn.get(s.id) || []) {
      const d = ix.nodes.get(e.src);
      if (['giải thích', 'dễ hiểu nhầm', 'là', 'đặc tả của', 'cài đặt của', 'khóa ngoại tới'].includes(e.type)) vote(d, '');
      else if (e.type === 'khai' && d.type === 'file') vote(d, 'khai ở đây');
      else if (['nhắc tới', 'vẽ theo', 'cài đặt ở', 'kiểm bằng', 'khai ở', 'bằng chứng ở', 'đụng bảng'].includes(e.type) && !(e.type === 'nhắc tới' && (d.type === 'test' || d.type === 'file'))) vote(d, `${e.type} mục này`);
    }
  }
  // Tệp mã mà người hỏi gọi đúng tên: đường dẫn API khai ở đó, bảng nó đụng, test nhập nó.
  const named = focus.filter((n) => n.type === 'file');
  for (const f of named) {
    for (const e of ix.inn.get(f.id) || []) { const d = ix.nodes.get(e.src); if (e.type === 'nhập' && d.type === 'test') vote(d, `nhập ${f.name}`); }
    for (const e of ix.out.get(f.id) || []) if (e.type === 'nhắc tới' && ix.nodes.get(e.dst).type === 'topic') vote(ix.nodes.get(e.dst), `${f.name} nhắc tới`);
  }
  // Tệp mã được nhiều mục khớp cùng trỏ tới (thường là nơi cài đặt): thêm các test nhập thẳng nó.
  const hot = [...picked.values()].filter((p) => p.node.type === 'file' && !p.seed).sort((a, b) => b.votes - a.votes).slice(0, 3);
  for (const h of hot) for (const e of ix.inn.get(h.node.id) || []) { const d = ix.nodes.get(e.src); if (e.type === 'nhập' && d.type === 'test') vote(d, `nhập ${h.node.name}`); }
  const files = new Set([...named.map((n) => n.id), ...hot.map((h) => h.node.id)]);
  // Nút khớp trước (theo thứ hạng khớp), rồi hàng xóm theo số phiếu.
  const ordered = [...picked.values()].sort((a, b) => (a.seed === b.seed ? (a.seed ? a.rank - b.rank : b.votes - a.votes || a.node.id.localeCompare(b.node.id)) : a.seed ? -1 : 1));
  ordered.forEach((p, i) => { p.rank = i; });
  return { picked, files };
}

function render(ix, m, q, { section } = {}) {
  const head = [`context_explore "${q}" · khớp bậc ${m.tier}: ${m.why}`];
  if (!m.seeds.length) {
    head.push('Kho không có mục nào khớp. Kho chỉ biết tới mức tệp và khai báo chính của bản ĐÃ COMMIT; chuỗi trong thân hàm và mã chưa commit thì phải tìm bằng Grep.');
    return head.join('\n');
  }
  const { picked, files } = gather(ix, m.seeds);
  const by = new Map(SECTIONS.map(([k]) => [k, []]));
  for (const p of [...picked.values()].sort((a, b) => a.rank - b.rank)) by.get(SECTION_OF.get(p.node.type)).push(p);
  const out = [...head];
  for (const [key, title] of SECTIONS) {
    const items = by.get(key);
    if (!items.length || (section && section !== key)) continue;
    const limit = section === key ? 40 : PER_SECTION;
    out.push(`${title} (${items.length})`);
    for (const p of items.slice(0, limit)) out.push(line(p.node, p.note));
    if (items.length > limit) out.push(`  … còn ${items.length - limit} mục; xem đủ: gọi lại với section="${key}"`);
  }
  // Ai nhập các tệp tìm được (chỉ đếm, để biết tầm ảnh hưởng); chi tiết: hỏi với impact.
  const importers = [...files].map((f) => [ix.nodes.get(f).name, (ix.inn.get(f) || []).filter((e) => e.type === 'nhập').length]).filter(([, n]) => n > 0).slice(0, 5);
  if (importers.length && !section) out.push(`AI NHẬP NÓ  ${importers.map(([f, n]) => `${f}: ${n} tệp`).join('; ')}  (chi tiết: gọi với impact=[tệp])`);
  const svcs = new Set([...picked.values()].map((p) => p.node.svc));
  const dark = ix.dark.filter((d) => svcs.has(d.svc) && [...files].some((f) => d.text.startsWith(`${ix.nodes.get(f).name}:`)));
  if (dark.length) { out.push('VÙNG TỐI (kho không thấy)'); for (const d of dark.slice(0, 4)) out.push(`  ${d.svc}/${d.text}`); }
  if (m.cut) out.push(`(có ${m.cut} mục khớp, chỉ dùng 24 mục khớp nhất; hỏi cụ thể hơn để thu hẹp)`);
  out.push('Mỗi dòng là tóm tắt và địa chỉ; đọc nguyên văn thì mở tệp ở địa chỉ đó. "Không thấy" trong kho không có nghĩa là "không có".');
  return capped(out.join('\n'), MAX_CHARS, 'hỏi lại với section=<mục> để xem một mục');
}

// Đường nối ngắn nhất giữa hai vật (đi theo cạnh ở cả hai chiều, tối đa 6 bước).
function pathBetween(ix, a, b, q, to) {
  const start = new Set(a.seeds.map((n) => n.id)); const goal = new Set(b.seeds.map((n) => n.id));
  if (!start.size || !goal.size) return `context_explore "${q}" → "${to}": ${!start.size ? `không khớp được "${q}"` : `không khớp được "${to}"`} trong kho, nên không tìm được đường nối.`;
  const prev = new Map([...start].map((id) => [id, null]));
  let frontier = [...start]; let found = null;
  for (let depth = 0; depth < 6 && frontier.length && !found; depth++) {
    const next = [];
    for (const id of frontier) {
      const steps = [...(ix.out.get(id) || []).map((e) => [e.dst, e, '→']), ...(ix.inn.get(id) || []).map((e) => [e.src, e, '←'])];
      for (const [other, e, dir] of steps) {
        if (prev.has(other) || ix.nodes.get(other).type === 'service') continue; // không đi tắt qua nút dịch vụ (cái gì cũng nối với nó)
        prev.set(other, { from: id, e, dir });
        if (goal.has(other)) { found = other; break; }
        next.push(other);
      }
      if (found) break;
    }
    frontier = next;
  }
  if (!found) return `context_explore "${q}" → "${to}": không có đường nối trong 6 bước. Có thể hai vật không liên quan, hoặc quan hệ đi qua thứ kho không thấy (lời gọi động, gọi qua mạng).`;
  const chain = [];
  for (let id = found; prev.get(id); id = prev.get(id).from) chain.unshift(prev.get(id));
  const out = [`context_explore "${q}" → "${to}" · đường nối ngắn nhất, ${chain.length} bước`, line(ix.nodes.get(chain.length ? chain[0].from : found))];
  let cur = chain.length ? chain[0].from : found;
  for (const s of chain) {
    const other = s.e.src === cur ? s.e.dst : s.e.src;
    out.push(`    ${s.dir === '→' ? `— ${s.e.type} →` : `← ${s.e.type} —`}  (${ctx.CONF[s.e.conf]}; ${s.e.source})`);
    out.push(line(ix.nodes.get(other)));
    cur = other;
  }
  return out.join('\n');
}

// Ảnh hưởng của việc sửa một hay nhiều tệp: ai nhập (trực tiếp và gián tiếp), đường dẫn API, test, sơ đồ, đặc tả, tài liệu nhắc tới.
function impactOf(ix, paths, service, units, parents) {
  const out = [`context_explore impact · ${paths.length} tệp`];
  const unknown = [];
  const targets = [];
  for (const p of paths) {
    const rel = stripUnit(p, units, parents);
    const hit = [...ix.nodes.values()].filter((n) => (n.type === 'file' || n.type === 'test') && (!service || n.svc === service) && (n.name === rel || n.name.endsWith(`/${rel}`)));
    if (hit.length) targets.push(...hit); else unknown.push(p);
  }
  if (unknown.length) out.push(`Không có trong kho (tệp mới chưa commit, hoặc không phải mã): ${unknown.join(', ')}`);
  if (!targets.length) return out.join('\n');
  const ids = new Set(targets.map((n) => n.id));
  const direct = new Set(); const indirect = new Set();
  for (const id of ids) for (const e of ix.inn.get(id) || []) if (e.type === 'nhập' && !ids.has(e.src)) direct.add(e.src);
  let frontier = [...direct];
  for (let d = 0; d < 4 && frontier.length; d++) { const next = []; for (const id of frontier) for (const e of ix.inn.get(id) || []) if (e.type === 'nhập' && !ids.has(e.src) && !direct.has(e.src) && !indirect.has(e.src)) { indirect.add(e.src); next.push(e.src); } frontier = next; }
  const reach = new Set([...ids, ...direct, ...indirect]);
  const names = (set, type) => [...set].map((id) => ix.nodes.get(id)).filter((n) => !type || n.type === type).map((n) => n.name).sort();
  const list = (title, items, max = 12) => { if (items.length) out.push(`${title} (${items.length})`, ...items.slice(0, max).map((x) => `  ${x}`), ...(items.length > max ? [`  … còn ${items.length - max}`] : [])); };
  if (!direct.size) out.push('Không tệp nào trong kho nhập các tệp này bằng lệnh nhập viết rõ (có thể chúng là điểm vào, hoặc được nạp theo cách kho không thấy).');
  list('TỆP MÃ NHẬP TRỰC TIẾP', names(direct, 'file'));
  list('TỆP MÃ NHẬP GIÁN TIẾP (qua tệp khác)', names(indirect, 'file'), 8);
  list('TEST CHẠM TỚI (trực tiếp hoặc gián tiếp)', [...names(direct, 'test'), ...names(indirect, 'test')]);
  const related = (types, edgeTypes, scope) => { const got = new Map(); for (const id of scope) for (const e of ix.inn.get(id) || []) { const n = ix.nodes.get(e.src); if (types.includes(n.type) && edgeTypes.includes(e.type)) got.set(n.id, n); } return [...got.values()].sort((a, b) => a.id.localeCompare(b.id)); };
  list('ĐƯỜNG DẪN API khai ở các tệp này', related(['api'], ['khai ở'], ids).map((n) => `${n.name} · ${where(n)}`));
  list('CỬA VÀO KHÁC khai ở các tệp này', related(['entry'], ['khai ở'], ids).map((n) => `${n.name} · ${where(n)}`));
  list('SƠ ĐỒ vẽ theo các tệp này (phần giải thích cần xem lại sau khi sửa)', related(['diagram'], ['vẽ theo'], ids).map((n) => `${n.name} · ${where(n)}`));
  list('ĐẶC TẢ cài đặt ở các tệp này', related(['spec'], ['cài đặt ở'], ids).map((n) => `${n.name} · ${where(n)}`));
  list('TÀI LIỆU nhắc tới các tệp này', related(['decision', 'design', 'problem', 'handoff', 'explain', 'pitfall', 'component', 'layer', 'term'], ['nhắc tới', 'bằng chứng ở'], ids).map((n) => `[${ctx.TYPES[n.type]}] ${n.name} · ${where(n)}`));
  const tables = new Map(); for (const id of ids) for (const e of ix.out.get(id) || []) if (e.type === 'đụng bảng') tables.set(e.dst, ix.nodes.get(e.dst));
  list('BẢNG các tệp này đụng tới (máy đoán theo chữ)', [...tables.values()].map((n) => n.name));
  const dark = ix.dark.filter((d) => [...reach].some((id) => d.text.startsWith(`${ix.nodes.get(id).name}:`)));
  list('VÙNG TỐI trên đường ảnh hưởng (kho không thấy)', dark.map((d) => `${d.svc}/${d.text}`), 5);
  out.push('Danh sách dựng từ lệnh nhập đọc được trong bản ĐÃ COMMIT. Lời gọi động, gọi qua mạng (HTTP, Kafka) và mã chưa commit không có ở đây.');
  return capped(out.join('\n'), MAX_CHARS);
}

// Cửa hỏi. q: một từ hoặc một câu; to: vật thứ hai (tìm đường nối); impact: danh sách tệp vừa sửa; service: chỉ hỏi trong một dịch vụ; section: xem đủ một mục.
// `all` là kho đã dựng (mọi dịch vụ và phần chung); `units` là { tên đơn vị ngoài: thư mục tính từ gốc }; `parents` là các thư mục chứa
// đơn vị (cấu hình dự án, S-063). Bên gọi đưa vào.
function explore({ q, to, impact, service, section } = {}, { all, units = {}, parents } = {}) {
  const data = all;
  const ix = index(data, service);
  if (!ix.nodes.size) return 'Kho ngữ nghĩa chưa có gì (chưa có dịch vụ nào có commit). Tìm bằng Glob/Grep.';
  if (Array.isArray(impact) && impact.length) return impactOf(ix, impact, service, units, parents);
  if (typeof q !== 'string' || !q.trim()) return 'Cần `q` (một từ hoặc một câu), hoặc `impact` (danh sách tệp vừa sửa).';
  if (section && !SECTIONS.some(([k]) => k === section)) return `section phải là một trong: ${SECTIONS.map(([k, t]) => `${k} (${t})`).join(', ')}`;
  const m = match(ix, q);
  if (typeof to === 'string' && to.trim()) return pathBetween(ix, m, match(ix, to), q, to);
  return render(ix, m, q, { section });
}

module.exports = { explore, match, index, norm, SECTIONS, MAX_CHARS, PER_SECTION };
