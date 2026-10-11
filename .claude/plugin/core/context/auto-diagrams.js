'use strict';
// spec: CTX-S-002
// SƠ ĐỒ TỰ SINH từ kho ngữ nghĩa (context.js). Mỗi hàm nhận kho của một dịch vụ và trả một BẢN KHAI BÁO đúng lược đồ của diagram-spec.js,
// nên chúng đi qua CÙNG bộ vẽ và CÙNG khung xem với sơ đồ agent khai. Không có gì ở đây biết tên dịch vụ hay ngôn ngữ nào.
// Hàm thuần và tất định: cùng kho luôn ra cùng bản khai báo. Mã sơ đồ tự sinh luôn bắt đầu bằng "tu-sinh-" (diagram_save không nhận mã này).
// Máy vẽ ĐỦ những gì nó đọc được và không phán xét: sơ đồ lớp chỉ đếm lệnh nhập giữa các lớp, không tự kết luận "vi phạm"
// (quy tắc được phép hay không là của từng dịch vụ; agent nói điều đó trong phần giải thích).
const specs = require('../diagrams/spec');

const AUTO_PREFIX = 'tu-sinh-';
const MAX_UNITS = 22; // quá số tệp này thì gom tệp theo thư mục, để hình còn đọc được
const FLAT_EDGES = 36; // dịch vụ chưa khai lớp: số cạnh tối đa trên hình
const MAX_DIRS = 36; // khi đã gom theo thư mục: số thư mục tối đa trên hình; nhiều hơn thì lấy thư mục nông hơn một cấp
const MAX_ENTRY_NODES = 26; // sơ đồ cửa vào: quá số nút này thì gom bớt nhóm (xem interfaces), để hình không cao quá ngưỡng của phép kiểm
const MAX_ENTRY_BUCKETS = 4; // khi gom: mỗi loại cửa vào giữ tối đa bấy nhiêu nút (một tầng 1 đến 4 nút thì nằm trên một hàng)
const elId = (i) => `n${i}`;
const short = (s, n = 76) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const fileOf = (id) => id.split(':').slice(2).join(':');
const STYLE = ['blue', 'amber', 'green', 'teal', 'pink'];

function codeFiles(g) { return g.nodes.filter((n) => n.type === 'file' && n.attrs && n.attrs.lang !== 'khác'); }
function layers(g) { return g.nodes.filter((n) => n.type === 'layer').map((n) => ({ id: n.id.split(':')[2], title: n.name })); }
// Tiền tố thư mục chung của mọi tệp mã (ví dụ "src/ingest/"), bỏ đi cho nhãn ngắn.
function commonDir(paths) {
  if (!paths.length) return '';
  let pre = paths[0].split('/').slice(0, -1);
  for (const p of paths) { const parts = p.split('/'); let i = 0; while (i < pre.length && pre[i] === parts[i]) i++; pre = pre.slice(0, i); }
  return pre.length ? `${pre.join('/')}/` : '';
}

// 1. Phụ thuộc giữa các module, khai theo DẠNG TẦNG để hình gọn: mỗi lớp đã khai là một tầng (tệp ngoài mọi lớp là một tầng riêng);
// lệnh nhập TRONG một tầng vẽ từng cạnh tệp -> tệp; lệnh nhập GIỮA hai tầng gộp thành một cạnh tầng -> tầng kèm số lượng.
// Cạnh tệp -> tệp giữa hai tầng không vẽ (vẽ ra thì hình rộng gấp mấy lần màn hình); danh sách đủ nằm ở dạng gọn và ở context_explore.
function moduleDeps(g) {
  // Tệp rỗng chỉ để đánh dấu gói (ví dụ __init__.py một dòng, không nhập gì, không ai nhập) không mang thông tin: bỏ khỏi hình.
  const touched = new Set(g.edges.filter((e) => e.type === 'nhập').flatMap((e) => [e.src, e.dst]));
  const files = codeFiles(g).filter((f) => ((f.attrs && f.attrs.lines) || 0) > 2 || touched.has(f.id));
  if (!files.length) return null;
  // Nhãn bỏ phần thư mục chung của các tệp thuộc lớp (ví dụ "src/ingest/"); tệp nằm ngoài phần đó giữ đường dẫn đủ.
  const layered = files.filter((f) => f.attrs && f.attrs.layer);
  const base = commonDir((layered.length ? layered : files).map((f) => f.name));
  const relOf = (name) => (name.startsWith(base) ? name.slice(base.length) : name);
  // Mỗi tệp một nút khi dịch vụ nhỏ. Dịch vụ lớn thì gom theo thư mục, và lấy thư mục NÔNG dần (ít cấp hơn) cho tới khi số đơn vị vừa hình.
  const dirOf = (name, depth) => { const parts = relOf(name).split('/'); return parts.length > 1 ? `${parts.slice(0, Math.min(depth, parts.length - 1)).join('/')}/` : parts[0]; };
  const maxDepth = Math.max(1, ...files.map((f) => relOf(f.name).split('/').length - 1));
  let depth = 0; // 0 = từng tệp
  if (files.length > MAX_UNITS) { depth = maxDepth; while (depth > 1 && new Set(files.map((f) => `${(f.attrs && f.attrs.layer) || ''}|${dirOf(f.name, depth)}`)).size > MAX_DIRS) depth -= 1; }
  const byDir = depth > 0;
  const unitOf = (name) => (byDir ? dirOf(name, depth) : relOf(name));
  const ls = layers(g);
  const NONE = '';
  const units = new Map();
  for (const f of files) {
    const layer = (f.attrs && f.attrs.layer) || NONE;
    const key = `${layer}|${unitOf(f.name)}`; // một thư mục có tệp ở hai lớp thì thành hai đơn vị, mỗi tầng một cái
    if (!units.has(key)) units.set(key, { key, name: unitOf(f.name), layer, files: [], lines: 0 });
    const x = units.get(key); x.files.push(f.name); x.lines += (f.attrs && f.attrs.lines) || 0;
  }
  const list = [...units.values()].sort((p, q) => p.key.localeCompare(q.key));
  const keyOfFile = new Map(files.map((f) => [f.name, `${(f.attrs && f.attrs.layer) || NONE}|${unitOf(f.name)}`]));
  const index = new Map(list.map((u, i) => [u.key, i]));
  const order = [...ls.map((l) => l.id), NONE].filter((id) => list.some((u) => u.layer === id));
  const gid = (layer) => (layer ? `g_${layer.replace(/[^A-Za-z0-9]/g, '_')}` : 'g_ngoai');
  const groups = order.map((id) => ({ id: gid(id), label: short(id ? `Lớp: ${ls.find((l) => l.id === id).title}` : 'Ngoài các lớp đã khai (điểm nối, cấu hình)') }));
  const nodes = list.map((u, i) => ({ id: elId(i), label: short(u.name), lines: [u.files.length > 1 ? `${u.files.length} tệp, ${u.lines} dòng` : `${u.lines} dòng`], style: u.layer ? STYLE[order.indexOf(u.layer) % STYLE.length] : 'gray', group: gid(u.layer) }));
  const inner = new Map(); const cross = new Map(); const edges = [];
  for (const e of g.edges.filter((x) => x.type === 'nhập')) {
    const ka = keyOfFile.get(fileOf(e.src)); const kb = keyOfFile.get(fileOf(e.dst));
    if (!ka || !kb || ka === kb) continue;
    const ua = units.get(ka); const ub = units.get(kb);
    if (ua.layer === ub.layer) { const k = `${ka}>${kb}`; inner.set(k, (inner.get(k) || 0) + 1); }
    else cross.set(`${ua.layer}>${ub.layer}`, (cross.get(`${ua.layer}>${ub.layer}`) || 0) + 1);
  }
  // Cạnh trong một tầng: từng tệp thì không cần nhãn; gom theo thư mục thì ghi số lệnh nhập. Quá nhiều cạnh thì giữ những cạnh đậm nhất.
  // Dịch vụ chưa khai lớp nào: không có tầng để gom, nên chỉ vẽ những cạnh đậm nhất cho hình còn đọc được (danh sách đủ đi kèm bên dưới).
  const flat = !ls.length;
  const room = (flat ? Math.min(FLAT_EDGES, specs.MAX.edges) : specs.MAX.edges) - cross.size;
  const innerList = [...inner.entries()].sort((p, q) => q[1] - p[1] || p[0].localeCompare(q[0]));
  const dropped = Math.max(0, innerList.length - room);
  for (const [k, v] of innerList.slice(0, room).sort((p, q) => p[0].localeCompare(q[0]))) { const [x, y] = k.split('>'); edges.push({ from: elId(index.get(x)), to: elId(index.get(y)), ...(byDir ? { label: `${v} lệnh nhập` } : {}) }); }
  for (const [k, v] of [...cross.entries()].sort()) { const [x, y] = k.split('>'); edges.push({ from: gid(x), to: gid(y), label: `${v} lệnh nhập`, line: 'thick' }); }
  if (list.length > specs.MAX.nodes || edges.length > specs.MAX.edges) return null;
  // Danh sách ĐỦ lệnh nhập theo từng tệp (kể cả giữa hai tầng, thứ hình đã gộp): đi kèm dạng gọn để agent soát với mã.
  const rel = (name) => (name.startsWith(base) ? name.slice(base.length) : name);
  const bySrc = new Map();
  for (const e of g.edges.filter((x) => x.type === 'nhập')) { const a = fileOf(e.src); const b = fileOf(e.dst); if (keyOfFile.has(a) && keyOfFile.has(b)) bySrc.set(a, [...(bySrc.get(a) || []), rel(b)]); }
  const detail = [...bySrc.entries()].sort().map(([a, list]) => `${rel(a)} nhập: ${list.sort().join(', ')}`);
  if (dropped) detail.unshift(`(hình chỉ vẽ ${room} cạnh đậm nhất trong một tầng, bỏ ${dropped} cạnh thưa; danh sách dưới đây vẫn đủ)`);
  return { __detail: { title: 'Mọi lệnh nhập giữa các tệp mã (máy đọc từ mã)', lines: detail }, id: `${AUTO_PREFIX}phu-thuoc-module`, type: 'flowchart', title: `Phụ thuộc giữa các ${byDir ? 'thư mục' : 'tệp'} mã (theo lệnh nhập)`, tab: 'architecture', direction: flat ? 'LR' : 'TB', groups: flat ? [] : groups, nodes: flat ? nodes.map(({ group, ...n }) => n) : nodes, edges };
}

// 2. Các lớp đã khai và số lệnh nhập đi giữa chúng. Tệp không thuộc lớp nào gom vào một nút riêng.
function layerDeps(g) {
  const ls = layers(g);
  const files = codeFiles(g);
  if (!ls.length || !files.length) return null;
  const NONE = '(ngoài các lớp)';
  const of = new Map(files.map((f) => [f.id, (f.attrs && f.attrs.layer) || NONE]));
  const names = [...ls.map((l) => l.id), NONE].filter((id) => [...of.values()].includes(id));
  const idx = new Map(names.map((n, i) => [n, i]));
  const count = new Map();
  for (const e of g.edges.filter((x) => x.type === 'nhập')) {
    const a = of.get(e.src); const b = of.get(e.dst);
    if (!a || !b || a === b) continue;
    count.set(`${a}>${b}`, (count.get(`${a}>${b}`) || 0) + 1);
  }
  const nodes = names.map((n, i) => {
    const mine = files.filter((f) => of.get(f.id) === n).map((f) => f.name).sort();
    const l = ls.find((x) => x.id === n);
    return { id: elId(i), label: short(l ? l.title : 'Ngoài các lớp đã khai'), lines: [`${mine.length} tệp`, ...mine.slice(0, 4).map((p) => short(p, 70)), ...(mine.length > 4 ? [`… và ${mine.length - 4} tệp nữa`] : [])].slice(0, 6), style: l ? STYLE[i % STYLE.length] : 'gray' };
  });
  const edges = [...count.entries()].sort().map(([k, v]) => { const [a, b] = k.split('>'); return { from: elId(idx.get(a)), to: elId(idx.get(b)), label: `${v} lệnh nhập`, line: v >= 5 ? 'thick' : 'solid' }; });
  return { id: `${AUTO_PREFIX}cac-lop`, type: 'flowchart', title: 'Các lớp đã khai và lệnh nhập giữa chúng', tab: 'architecture', direction: 'TB', sources: ['docs/service.yaml'], groups: [], nodes, edges };
}

// 3. Cửa vào/ra của dịch vụ, dạng tầng: các loại cửa vào (mỗi loại một tầng), dịch vụ, rồi topic, bảng và thứ nó phụ thuộc.
// Hàm này KHÔNG biết loại cửa vào nào (S-051): tên tầng, đơn vị đếm và cách gom do bộ nhận dạng ở recognizers/entries/ khai, đi theo kho
// (g.entryKinds và thuộc tính kind, bucket của nút). Thêm một loại cửa vào thì hình tự có thêm một tầng, không sửa gì ở đây.
function interfaces(g) {
  const svc = g.nodes.find((n) => n.type === 'service');
  const kinds = (g.entryKinds || []).map((k) => ({ ...k, list: g.nodes.filter((n) => n.attrs && n.attrs.kind === k.id && (n.type === 'api' || n.type === 'entry')) })).filter((k) => k.list.length);
  const topics = g.nodes.filter((n) => n.type === 'topic');
  const tables = g.nodes.filter((n) => n.type === 'table');
  const deps = g.depends || [];
  if (!svc || (!kinds.length && !topics.length && !tables.length && !deps.length)) return null;
  // Ba mức chi tiết, lấy mức đầu tiên vừa hình (danh sách đủ vẫn ở context_explore):
  //   'full'   mỗi nhóm của một loại cửa vào một nút;
  //   'top'    mỗi loại giữ MAX_ENTRY_BUCKETS - 1 nhóm đông nhất, phần còn lại gộp một nút;
  //   'coarse' mỗi loại cửa vào MỘT nút.
  // Từ ba loại cửa vào trở lên thì bộ vẽ xếp các tầng cửa vào chồng lên nhau (chúng cùng trỏ vào dịch vụ), nên hình cao theo TỔNG số nút:
  // khi đó mỗi nút chỉ liệt kê 4 dòng thay vì 6, và lúc phải gom thì mỗi loại giữ 3 nút (đã đo trên trang thật: 2993px khi không làm vậy).
  const many = kinds.length >= 3;
  const rows = many ? 4 : 6;
  const keep = many ? MAX_ENTRY_BUCKETS - 1 : MAX_ENTRY_BUCKETS;
  const build = (level) => {
    const coarse = level === 'coarse';
    const nodes = []; const edges = []; const groups = [];
    let i = 0;
    const add = (group, label, lines, style, shape) => { const id = elId(i++); nodes.push({ id, label: short(label), lines: lines.slice(0, 6).map((x) => short(x)), style, shape: shape || 'box', group }); return id; };
    for (const k of kinds) {
      const gid = `g_${k.id.replace(/[^A-Za-z0-9]/g, '_')}`;
      groups.push({ id: gid, label: short(k.group) });
      const by = new Map();
      for (const n of k.list) { const key = coarse ? k.label : (n.attrs.bucket || k.label); by.set(key, [...(by.get(key) || []), n.name]); }
      let buckets = [...by.entries()];
      if (level === 'top' && buckets.length > keep) {
        buckets.sort((p, q) => q[1].length - p[1].length || (p[0] < q[0] ? -1 : 1));
        const rest = buckets.slice(keep - 1);
        buckets = [...buckets.slice(0, keep - 1), [`${rest.length} nhóm còn lại`, rest.flatMap((r) => r[1])]];
      }
      for (const [head, list] of buckets.sort((p, q) => (p[0] < q[0] ? -1 : p[0] > q[0] ? 1 : 0))) add(gid, `${head} (${list.length} ${k.unit})`, list.length > rows ? [...list.sort().slice(0, rows - 1), `… và ${list.length - rows + 1} ${k.unit} nữa`] : list.sort(), 'teal');
    }
    nodes.push({ id: 'svc', label: short(svc.name), style: 'blue', shape: 'round' });
    for (const k of kinds) edges.push({ from: `g_${k.id.replace(/[^A-Za-z0-9]/g, '_')}`, to: 'svc', label: `${k.list.length} ${k.unit}`, line: 'thick' });
    if (topics.length || tables.length) {
      groups.push({ id: 'g_data', label: 'Dữ liệu và sự kiện' });
      if (tables.length) add('g_data', `${tables.length} bảng (đọc từ cơ sở dữ liệu)`, tables.map((t) => t.name).sort(), 'green', 'cylinder');
      for (const t of topics) add('g_data', t.name, ['topic Kafka (khai ở infra)'], 'amber', 'stadium');
      edges.push({ from: 'svc', to: 'g_data', line: 'thick' });
    }
    if (deps.length) {
      groups.push({ id: 'g_dep', label: 'Phụ thuộc vào (khai trong service.yaml)' });
      for (const d of deps) add('g_dep', d.target, [d.kind === 'service' ? 'dịch vụ BSN' : d.kind === 'infra' ? 'hạ tầng' : 'bên ngoài', d.via || ''].filter(Boolean), 'gray');
      edges.push({ from: 'svc', to: 'g_dep', line: 'thick' });
    }
    return { nodes, edges, groups };
  };
  let made = build('full');
  if (made.nodes.length > MAX_ENTRY_NODES) made = build('top');
  if (made.nodes.length > MAX_ENTRY_NODES) made = build('coarse');
  if (made.nodes.length > specs.MAX.nodes) return null;
  // Danh sách ĐỦ mọi cửa vào theo loại (hình đã gom và cắt bớt dòng): đi kèm dạng gọn để agent soát với mã.
  const detail = kinds.flatMap((k) => [`${k.label} (${k.list.length}):`, ...k.list.map((n) => `  ${n.name} · ${n.source}`).sort()]);
  return { ...(detail.length ? { __detail: { title: 'Mọi cửa vào máy đọc được từ mã', lines: detail } } : {}), id: `${AUTO_PREFIX}cua-vao-ra`, type: 'flowchart', title: 'Cửa vào và cửa ra của dịch vụ', tab: 'architecture', direction: 'TB', groups: made.groups, nodes: made.nodes, edges: made.edges };
}

// 4. Bản đồ cả hệ (trang tổng): các dịch vụ, topic và quan hệ phụ thuộc giữa chúng.
function systemMap(all) {
  const names = Object.keys(all.services).sort();
  if (!names.length) return null;
  const nodes = []; const edges = []; const idOf = new Map();
  names.forEach((n, i) => { idOf.set(n, `s${i}`); const g = all.services[n]; const inf = g.infra || {}; nodes.push({ id: `s${i}`, label: short(g.title || n), lines: [n, inf.port ? `cổng local ${inf.port.local}` : 'chưa có trong infra', inf.database ? `cơ sở dữ liệu ${inf.database.name}` : ''].filter(Boolean), style: 'blue', shape: 'round' }); });
  let t = 0; const topicId = new Map();
  for (const n of names) for (const node of all.services[n].nodes.filter((x) => x.type === 'topic')) {
    if (!topicId.has(node.name)) { topicId.set(node.name, `t${t++}`); nodes.push({ id: topicId.get(node.name), label: short(node.name), style: 'amber', shape: 'stadium' }); }
    edges.push({ from: idOf.get(n), to: topicId.get(node.name), line: 'dotted' });
  }
  let x = 0; const extId = new Map();
  for (const n of names) for (const d of all.services[n].depends || []) {
    if (d.kind === 'service' && idOf.has(d.target)) { edges.push({ from: idOf.get(n), to: idOf.get(d.target), label: short(d.via || 'gọi', 26) }); continue; }
    if (d.kind !== 'infra') continue;
    if (!extId.has(d.target)) { extId.set(d.target, `x${x++}`); nodes.push({ id: extId.get(d.target), label: short(d.target), style: 'gray', shape: 'cylinder' }); }
    edges.push({ from: idOf.get(n), to: extId.get(d.target) });
  }
  if (nodes.length > specs.MAX.nodes || edges.length > specs.MAX.edges) return null;
  return { id: `${AUTO_PREFIX}ban-do-he`, type: 'flowchart', title: 'Bản đồ cả hệ: dịch vụ, topic và hạ tầng dùng chung', tab: 'architecture', direction: 'LR', groups: [], nodes, edges };
}

const SERVICE_DIAGRAMS = [moduleDeps, layerDeps, interfaces];
// Mọi sơ đồ tự sinh của một dịch vụ: [{ spec (đã qua lược đồ), origin }]. Sơ đồ không dựng được (quá lớn, thiếu dữ liệu) thì bỏ qua, không bịa.
function forService(g) {
  const out = [];
  for (const make of SERVICE_DIAGRAMS) {
    const made = make(g);
    if (!made) continue;
    const { __detail: detail, ...raw } = made;
    const r = specs.parse(raw);
    if (!r.spec) throw new Error(`sơ đồ tự sinh ${raw.id} không qua lược đồ: ${specs.formatErrors(r.errors).slice(0, 3).join('; ')}`);
    out.push({ spec: r.spec, origin: 'tự sinh từ mã', detail: detail || null });
  }
  return out;
}
function forSystem(all) {
  const raw = systemMap(all);
  if (!raw) return null;
  const r = specs.parse(raw);
  if (!r.spec) throw new Error(`bản đồ cả hệ không qua lược đồ: ${specs.formatErrors(r.errors).slice(0, 3).join('; ')}`);
  return { spec: r.spec, origin: 'tự sinh từ mã và infra' };
}

module.exports = { forService, forSystem, moduleDeps, layerDeps, interfaces, systemMap, AUTO_PREFIX };
