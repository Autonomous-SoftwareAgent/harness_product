'use strict';
// spec: CTX-S-003
// Bộ nhận dạng NGUỒN: tài liệu ba tầng của từng phần (docs/modules/<phần>/{1-design,2-spec,3-impl}.md). Ra mục thiết kế, đặc tả, cài đặt,
// và nối đặc tả với tệp mã, tệp test được ghi trong tầng cài đặt.
const { ID, mdItems, listField } = require('../kit');

function run(g, { files }) {
  const idRe = /^[A-Z][A-Z0-9]*-[DS]-\d{3}$/;
  for (const [p, text] of files) {
    const m = /^docs\/modules\/([^/]+)\/(1-design|2-spec|3-impl)\.md$/.exec(p);
    if (!m) continue;
    const kind = { '1-design': 'design', '2-spec': 'spec', '3-impl': 'impl' }[m[2]];
    for (const it of mdItems(text, idRe)) {
      const f = it.fields;
      const id = g.node(ID.doc(kind, g.svc, it.id), kind, `${it.id}: ${it.title}`, `${p}:${it.line}`, { text: kind === 'design' ? f.decision || f.rationale : kind === 'spec' ? f.requirement || f.contract : `${f.status || ''} ${f.deviation ? `lệch: ${f.deviation}` : ''}`, attrs: { module: m[1], status: f.status || '' }, body: it.body });
      if (kind === 'spec') g.edge(id, ID.doc('design', g.svc, it.id.replace('-S-', '-D-')), 'đặc tả của', p);
      if (kind === 'impl') {
        g.edge(id, ID.doc('spec', g.svc, it.id), 'cài đặt của', p);
        for (const c of listField(f.code)) g.edge(ID.doc('spec', g.svc, it.id), ID.file(g.svc, c), 'cài đặt ở', p);
        for (const c of listField(f.tests)) g.edge(ID.doc('spec', g.svc, it.id), ID.file(g.svc, c), 'kiểm bằng', p);
      }
    }
  }
}

module.exports = { id: 'layered', title: 'Tài liệu ba tầng (docs/modules/*/1-design, 2-spec, 3-impl)', order: 30, scopes: ['service'], run };
