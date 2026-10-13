'use strict';
// spec: CTX-S-001
// spec: CTX-S-003
// LÕI của kho ngữ nghĩa: mô hình nút và cạnh có kiểu, có nguồn, có mức tin cậy; nối các chỗ nhắc tới nhau; chốt kho.
// Thuần: việc đọc bản đã commit, chạy bộ nhận dạng và lưu kho là của mcp/context.js.

// Mức tin cậy của một nút hay cạnh, luôn đi kèm khi trả cho agent.
const CONF = { khai: 'công cụ khai', ma: 'máy đọc từ mã', agent: 'agent khai kèm bằng chứng', doan: 'chưa kiểm (máy đoán theo chữ)' };
// Loại nút và mục của câu trả lời mà nó thuộc về (context-query.js xếp theo các mục này).
const TYPES = {
  service: 'dịch vụ', file: 'tệp mã', test: 'tệp test', symbol: 'khai báo', api: 'đường dẫn API', entry: 'cửa vào', topic: 'topic', table: 'bảng', external: 'bên ngoài',
  layer: 'lớp', component: 'thành phần', flow: 'luồng nghiệp vụ', term: 'từ vựng', design: 'mục thiết kế', spec: 'đặc tả', impl: 'cài đặt',
  decision: 'quyết định', problem: 'vấn đề', unverified: 'chưa kiểm với hệ thống thật', diagram: 'sơ đồ', explain: 'giải thích sơ đồ', pitfall: 'dễ hiểu nhầm',
  handoff: 'handoff', section: 'mục tài liệu',
};
const ROOT_NAME = '_he'; // phần chung của cả hệ (repo gốc): quyết định, handoff, hạ tầng

// Mô hình cần hai thứ của hợp đồng với bộ nhận dạng: cách cắt chữ (`cut`) và cách đặt mã nút (`ID`). Hợp đồng đó nằm cùng bộ nhận dạng
// (mcp/recognizers/kit.js), nên cửa vào đưa vào đây khi lắp ráp; lõi không nhập ngược ra ngoài.
function create({ cut, ID }) {
// ---------- mô hình: nút và cạnh có kiểu, có nguồn, có mức tin cậy ----------
// CHỈ THÊM, KHÔNG GHI ĐÈ: một nút đã có thì giữ nguyên; bộ nhận dạng đến sau khai cùng mã nút mà KHÁC loại hoặc khác tên
// thì kho giữ bản đầu và ghi va chạm vào vùng tối (trước đây việc này im lặng). Cùng mã, cùng loại, cùng tên là đồng thuận, không phải va chạm.
class Graph {
  constructor(svc) { this.svc = svc; this.nodes = new Map(); this.edges = []; this.keys = new Set(); this.dark = []; this.bodies = new Map(); this.meta = {}; this.by = 'lõi'; this.owner = new Map(); }
  // body: nguyên văn để tìm lời nhắc tới tệp và mã mục khác; KHÔNG lưu vào kho.
  node(id, type, name, source, { text = '', conf = 'khai', attrs, body } = {}) {
    if (!TYPES[type]) throw new Error(`kho: loại nút lạ '${type}'`);
    if (!source) throw new Error(`kho: nút ${id} thiếu nguồn`);
    if (!this.nodes.has(id)) {
      const n = { id, type, name: cut(name, 160), svc: this.svc, source, conf };
      if (text) n.text = cut(text, 220);
      if (attrs && Object.keys(attrs).length) n.attrs = attrs;
      this.nodes.set(id, n);
      this.owner.set(id, this.by);
    } else {
      const old = this.nodes.get(id);
      if (this.owner.get(id) !== this.by && (old.type !== type || old.name !== cut(name, 160))) {
        this.dark.push(`va chạm mã nút ${id}: bộ nhận dạng "${this.owner.get(id)}" đã khai (${TYPES[old.type]}: ${old.name}); bản của "${this.by}" (${TYPES[type]}: ${cut(name, 160)}, nguồn ${source}) bị bỏ, không ghi đè`);
      }
    }
    if (body) this.bodies.set(id, `${this.bodies.get(id) || ''}\n${body}`);
    return id;
  }
  edge(src, dst, type, source, conf = 'khai') {
    const k = `${src}|${dst}|${type}`;
    if (src === dst || this.keys.has(k)) return;
    this.keys.add(k);
    this.edges.push({ src, dst, type, conf, source });
  }
  // Thông tin đi kèm kho của một dịch vụ (ví dụ danh sách phụ thuộc, thư viện ngoài). Cùng luật: khóa đã có thì giữ bản đầu, ghi va chạm.
  put(key, value) {
    if (key in this.meta) { this.dark.push(`va chạm thông tin "${key}": bộ nhận dạng "${this.metaBy[key]}" đã ghi; bản của "${this.by}" bị bỏ, không ghi đè`); return; }
    this.meta[key] = value; (this.metaBy = this.metaBy || {})[key] = this.by;
  }
  // BỒN NHẬN đưa cho bộ nhận dạng: chỉ có lệnh THÊM và lệnh ĐỌC bản sao. Không có lệnh sửa hay xóa.
  sink() {
    const g = this;
    return Object.freeze({
      svc: g.svc,
      node: (...a) => g.node(...a),
      edge: (...a) => g.edge(...a),
      dark: (msg) => { g.dark.push(String(msg)); },
      put: (k, v) => g.put(k, v),
      has: (id) => g.nodes.has(id),
      nodesOf: (type) => [...g.nodes.values()].filter((n) => n.type === type).map((n) => Object.freeze({ ...n })),
    });
  }
}

// Chạy mọi bộ nhận dạng nguồn của một phạm vi ('service' hoặc 'root'), theo thứ tự `order`. Một bộ ném lỗi thì các bộ khác vẫn chạy,
// và lỗi lộ ra ở vùng tối (portal-status in vùng tối), không làm hỏng cả kho.
function linkMentions(g, scopes) {
  const filePaths = [...g.nodes.values()].filter((n) => n.type === 'file' || n.type === 'test').map((n) => n.name).sort((a, b) => b.length - a.length);
  const idRe = /\b([A-Z][A-Z0-9]*-[DS]-\d{3}|P-\d{3}|[DS]-\d{3})\b/g;
  for (const [id, body] of g.bodies) {
    const src = g.nodes.get(id);
    for (const p of filePaths) if (body.includes(p)) g.edge(id, ID.file(g.svc, p), 'nhắc tới', src.source, 'ma');
    for (const m of body.matchAll(idRe)) {
      const code = m[1];
      const candidates = /^P-/.test(code) ? [ID.doc('prob', g.svc, code)]
        : /^[A-Z][A-Z0-9]*-D-/.test(code) ? [ID.doc('design', g.svc, code)]
          : /^[A-Z][A-Z0-9]*-S-\d/.test(code) && !/^S-/.test(code) ? [ID.doc('spec', g.svc, code)]
            : /^S-/.test(code) ? [ID.doc('dec', ROOT_NAME, code)] : scopes.map((s) => ID.doc('dec', s, code));
      for (const c of candidates) g.edge(id, c, 'nhắc tới', src.source, 'ma');
    }
  }
}

// Cạnh có đầu mút không tồn tại: BỎ và ghi vào vùng tối (một tham chiếu treo là lỗi cần lộ ra, không tự tạo nút cho đủ).
function finalize(g, known = new Set()) {
  const has = (id) => g.nodes.has(id) || known.has(id);
  const edges = [];
  for (const e of g.edges) {
    if (has(e.src) && has(e.dst)) edges.push(e);
    else if (e.type !== 'nhắc tới') g.dark.push(`bỏ cạnh "${e.type}" ${e.src} → ${e.dst}: ${has(e.src) ? e.dst : e.src} không có trong kho (nguồn ${e.source})`);
  }
  const nodes = [...g.nodes.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  edges.sort((a, b) => `${a.src}|${a.dst}|${a.type}`.localeCompare(`${b.src}|${b.dst}|${b.type}`));
  return { nodes, edges, dark: [...new Set(g.dark)].sort() };
}

// Dấu của chính bộ dựng: sửa bộ dựng thì mọi kho dựng lại, không dùng lại kho cũ sinh bởi logic cũ.
  return { Graph, linkMentions, finalize };
}

module.exports = { create, CONF, TYPES, ROOT_NAME };
