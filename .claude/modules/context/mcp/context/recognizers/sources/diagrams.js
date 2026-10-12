'use strict';
// spec: CTX-S-003
// Bộ nhận dạng NGUỒN: sơ đồ khai bằng dữ liệu (docs/diagrams/<mã>.yaml). Ra nút sơ đồ, tệp mã nó vẽ theo, từng mục giải thích và chỗ dễ nhầm.
// Sơ đồ dữ liệu TỰ SINH từ cơ sở dữ liệu còn ra nút bảng và quan hệ khóa ngoại (sự thật đọc từ cơ sở dữ liệu thật).
const yaml = require('../../../../../core/core/lib/yaml-lite');
const specs = require('../../../../../diagrams/core/diagrams/spec');
const { ID } = require('../kit');

function run(g, { files }) {
  const dg = require('../../../../../diagrams/mcp/diagrams/diagrams');
  for (const [p, text] of files) {
    const m = /^docs\/diagrams\/([a-z][a-z0-9-]*)\.yaml$/.exec(p);
    if (!m) continue;
    let spec;
    try { spec = specs.parse(yaml.parse(text)).spec; } catch { spec = null; }
    if (!spec) { g.dark(`${p}: sơ đồ không hợp lệ, không nạp`); continue; }
    const words = dg.elementNames(spec);
    const stale = spec.explain ? spec.explain.basis !== dg.contentHash(spec) : false;
    const explain = spec.explain ? (stale ? 'cũ' : 'khớp') : 'chưa có';
    const id = g.node(ID.doc('dg', g.svc, spec.id), 'diagram', spec.title, `${p}:1`, { text: `sơ đồ ${dg.TYPE_LABEL[spec.type]}, ${spec.generated ? 'tự sinh từ cơ sở dữ liệu' : 'agent khai qua công cụ'}`, attrs: { kind: spec.type, tab: spec.tab, explain }, body: spec.explain ? `${words.join('\n')}\n${spec.explain.meaning}` : words.join('\n') });
    g.edge(ID.svc(g.svc), id, 'có sơ đồ', p);
    for (const s of spec.sources) g.edge(id, ID.file(g.svc, s), 'vẽ theo', p);
    if (spec.explain) {
      const lineOf = (needle) => { const i = text.indexOf(needle); return `${p}:${i < 0 ? 1 : text.slice(0, i).split('\n').length}`; };
      spec.explain.details.forEach((d, i) => g.edge(id, g.node(ID.doc('ex', g.svc, `${spec.id}#${i + 1}`), 'explain', d.term, lineOf(JSON.stringify(d.term)), { text: d.text, conf: 'agent', attrs: stale ? { stale: true } : undefined, body: d.text }), 'giải thích', p, 'agent'));
      spec.explain.pitfalls.forEach((t, i) => g.edge(id, g.node(ID.doc('pit', g.svc, `${spec.id}#${i + 1}`), 'pitfall', t, lineOf(JSON.stringify(t).slice(0, 50)), { conf: 'agent', attrs: stale ? { stale: true } : undefined, body: t }), 'dễ hiểu nhầm', p, 'agent'));
    }
    // Bảng trong sơ đồ dữ liệu TỰ SINH là sự thật đọc từ cơ sở dữ liệu: thành nút bảng của tầng vòng đời.
    if (spec.type === 'erd' && spec.generated) {
      for (const e of spec.entities) {
        const t = g.node(ID.table(g.svc, e.label || e.id), 'table', e.label || e.id, `${p}:1`, { conf: 'ma', text: e.columns.map((c) => `${c.name} ${c.type}${c.keys.length ? ` ${c.keys.join('+')}` : ''}`).join(', '), body: e.columns.map((c) => c.name).join(' ') });
        g.edge(ID.svc(g.svc), t, 'có bảng', p, 'ma');
      }
      const tid = (x) => { const e = spec.entities.find((y) => y.id === x); return ID.table(g.svc, e.label || e.id); };
      for (const r of spec.relations) g.edge(tid(r.to), tid(r.from), 'khóa ngoại tới', p, 'ma');
    }
  }
}

module.exports = { id: 'diagrams', title: 'Sơ đồ khai bằng dữ liệu (docs/diagrams/*.yaml)', order: 20, scopes: ['service'], run };
