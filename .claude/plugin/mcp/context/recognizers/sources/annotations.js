'use strict';
// spec: CTX-S-003
// Bộ nhận dạng NGUỒN: phần agent ghi, đã commit trong repo dịch vụ ở docs/context/ (annotations.js của máy chủ ghi): từ vựng nghiệp vụ,
// quan hệ máy không đọc ra, và phần giải thích cùng kết quả soát của sơ đồ tự sinh. Mọi thứ ở đây mang nhãn "agent khai kèm bằng chứng".
const yaml = require('../../../../core/lib/yaml-lite');
const { ID } = require('../kit');

function run(g, { files }) {
  const read = (rel) => { if (!files.has(rel)) return null; try { return yaml.parse(files.get(rel)); } catch (e) { g.dark(`${rel} không đọc được: ${e.message}`); return null; } };
  const gl = read('docs/context/glossary.yaml');
  for (const t of (gl && gl.terms) || []) {
    const id = g.node(ID.doc('term', g.svc, t.term.toLowerCase()), 'term', t.term, 'docs/context/glossary.yaml:1', { text: t.means, conf: 'agent', attrs: { also: t.also || [] }, body: `${t.means}\n${(t.also || []).join('\n')}` });
    for (const r of t.refs || []) g.edge(id, r, 'là', 'docs/context/glossary.yaml', 'agent');
    for (const e of t.evidence || []) g.edge(id, ID.file(g.svc, e.file), 'bằng chứng ở', `${e.file}:${e.line}`, 'agent');
  }
  const rl = read('docs/context/relations.yaml');
  for (const r of (rl && rl.relations) || []) g.edge(r.from, r.to, r.kind, `${r.file}:${r.line}`, 'agent');
  const auto = read('docs/context/auto.yaml');
  if (auto && auto.diagrams) g.put('auto', auto.diagrams);
}

module.exports = { id: 'annotations', title: 'Phần agent ghi (docs/context/: từ vựng, quan hệ, soát sơ đồ tự sinh)', order: 70, scopes: ['service'], run };
