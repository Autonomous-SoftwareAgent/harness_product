'use strict';
// spec: CTX-S-003
// Bộ nhận dạng NGUỒN: mã nguồn. Đưa kết quả của bộ quét (ctx.facts: tệp, lệnh nhập, khai báo, chỗ nhập động) vào kho; xếp tệp vào lớp đã khai;
// nối tệp với đặc tả qua dấu "spec: MÃ" trong mã; nối tệp với topic (khai ở tờ khai báo) và với bảng (máy đoán theo chữ).
// Không biết ngôn ngữ nào: phần đó là của recognizers/langs/. Lớp và bảng lấy từ các nút đã có trong kho, không đọc lại tài liệu.
const { ID, isTestPath } = require('../kit');

const cleanPath = (p) => String(p).split(/[\s<(]/)[0].replace(/\/+$/, '');
const tail = (id) => id.split(':').slice(2).join(':');

function run(g, { files, facts, infra }) {
  const layers = g.nodesOf('layer').map((n) => ({ id: tail(n.id), paths: ((n.attrs && n.attrs.paths) || []).map(cleanPath).filter(Boolean) }));
  const layerOf = (p) => {
    let best = null; let len = -1; let tie = false;
    for (const l of layers) for (const q of l.paths) if (p === q || p.startsWith(`${q}/`)) { if (q.length > len) { best = l.id; len = q.length; tie = false; } else if (q.length === len && best !== l.id) tie = true; }
    return tie ? null : best;
  };
  for (const f of facts.files) {
    const layer = f.test ? null : layerOf(f.path);
    const id = g.node(ID.file(g.svc, f.path), f.test ? 'test' : 'file', f.path, `${f.path}:1`, { conf: 'ma', text: `${f.lines} dòng${layer ? `, lớp ${layer}` : ''}`, attrs: { lang: f.lang, lines: f.lines, ...(layer ? { layer } : {}) } });
    if (layer) g.edge(id, ID.doc('layer', g.svc, layer), 'thuộc lớp', 'docs/service.yaml');
  }
  for (const i of facts.imports) g.edge(ID.file(g.svc, i.from), ID.file(g.svc, i.to), 'nhập', `${i.from}:${i.line}`, 'ma');
  for (const d of facts.decls) g.edge(ID.file(g.svc, d.file), g.node(ID.sym(g.svc, d.file, d.name), 'symbol', d.name, `${d.file}:${d.line}`, { conf: 'ma', text: `${d.kind} trong ${d.file}` }), 'khai', `${d.file}:${d.line}`, 'ma');
  for (const d of facts.dynamic) g.dark(`${d.file}:${d.line}: ${d.what} (cạnh "nhập" từ dòng này không có trong kho)`);
  // Dấu "// spec: MÃ" trong mã nối tệp với mục đặc tả.
  for (const f of facts.files) {
    files.get(f.path).split('\n').forEach((l, i) => { const m = /(?:\/\/|#)\s*spec:\s*([A-Z][A-Z0-9]*-S-\d{3})/.exec(l); if (m) g.edge(ID.doc('spec', g.svc, m[1]), ID.file(g.svc, f.path), 'cài đặt ở', `${f.path}:${i + 1}`, 'ma'); });
  }
  // Topic: khai trong tờ khai báo infra/services/<dịch-vụ>.json; tệp mã có chuỗi tên topic thì nối "nhắc tới".
  const sheet = `infra/services/${g.svc}.json`;
  const topics = (infra && infra.topics) || [];
  for (const t of topics) { g.node(ID.topic(t), 'topic', t, `${sheet}:1`, { text: `topic Kafka của ${g.svc}` }); g.edge(ID.svc(g.svc), ID.topic(t), 'dùng topic', sheet); }
  const tables = g.nodesOf('table');
  for (const f of facts.files) {
    const text = files.get(f.path);
    for (const t of topics) { const i = text.indexOf(t); if (i >= 0) g.edge(ID.file(g.svc, f.path), ID.topic(t), 'nhắc tới', `${f.path}:${text.slice(0, i).split('\n').length}`, 'ma'); }
    for (const t of tables) {
      const name = t.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const m = new RegExp(`\\b(?:FROM|INTO|UPDATE|JOIN|TABLE(?:\\s+IF\\s+NOT\\s+EXISTS)?)\\s+"?${name}\\b|\\b(?:schema|tables?)\\.${name}\\b|^${name}\\s*=\\s*Table\\(`, 'im').exec(text);
      if (m) g.edge(ID.file(g.svc, f.path), t.id, 'đụng bảng', `${f.path}:${text.slice(0, m.index).split('\n').length}`, 'doan');
    }
  }
  g.put('externals', [...new Set(facts.externals.filter((e) => !isTestPath(e.from)).map((e) => e.name))].sort());
}

module.exports = { id: 'code', title: 'Mã nguồn: tệp, lệnh nhập, khai báo, dấu đặc tả, topic, bảng', order: 60, scopes: ['service'], run };
