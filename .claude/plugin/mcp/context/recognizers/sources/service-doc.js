'use strict';
// spec: CTX-S-003
// Bộ nhận dạng NGUỒN: bản tổng quan của dịch vụ (docs/service.yaml). Ra nút dịch vụ, luồng nghiệp vụ, điều chưa kiểm, lớp, thành phần,
// thứ dịch vụ phụ thuộc vào, và sổ vấn đề. Tệp thiếu hay hỏng thì vẫn ra nút dịch vụ và ghi vùng tối, không ném lỗi.
const yaml = require('../../../../core/lib/yaml-lite');
const { ID } = require('../kit');

function run(g, { files }) {
  const rel = 'docs/service.yaml';
  const svcId = ID.svc(g.svc);
  if (!files.has(rel)) { g.node(svcId, 'service', g.svc, 'system_service/', { text: 'Chưa có docs/service.yaml' }); return; }
  let doc;
  try { doc = yaml.parse(files.get(rel)); } catch (e) { g.dark(`docs/service.yaml không đọc được: ${e.message}`); g.node(svcId, 'service', g.svc, rel); return; }
  const text = files.get(rel);
  const at = (needle) => { const i = text.indexOf(needle); return `${rel}:${i < 0 ? 1 : text.slice(0, i).split('\n').length}`; };
  g.node(svcId, 'service', doc.title || g.svc, `${rel}:1`, { text: doc.summary, body: `${doc.summary || ''} ${(doc.business && doc.business.goal) || ''}` });
  const b = doc.business || {}; const a = doc.architecture || {};
  for (const f of b.flows || []) g.edge(svcId, g.node(ID.doc('flow', g.svc, f.id), 'flow', f.title, at(`id: "${f.id}"`), { text: (f.steps || []).join(' → '), body: (f.steps || []).join('\n') }), 'có luồng', rel);
  (b.unverified || []).forEach((u, i) => g.edge(svcId, g.node(ID.doc('unv', g.svc, String(i + 1)), 'unverified', u, at(JSON.stringify(u).slice(0, 60)), { body: u }), 'chưa kiểm', rel));
  for (const l of a.layers || []) g.node(ID.doc('layer', g.svc, l.id), 'layer', l.title, at(`id: "${l.id}"`), { text: l.role, attrs: { paths: l.paths || [] }, body: `${l.role} ${(l.paths || []).join(' ')}` });
  for (const c of a.components || []) {
    const id = g.node(ID.doc('comp', g.svc, c.id), 'component', c.title, at(`id: "${c.id}"`), { text: c.role, attrs: { paths: c.paths || [] }, body: `${c.role} ${(c.paths || []).join(' ')}` });
    if (c.layer) g.edge(id, ID.doc('layer', g.svc, c.layer), 'thuộc lớp', rel);
  }
  const depends = [];
  for (const d of a.depends_on || []) {
    const to = d.kind === 'service' ? ID.svc(d.target) : g.node(ID.ext(d.target), 'external', d.target, at(JSON.stringify(d.target)), { text: `${d.kind}: ${d.purpose}` });
    g.edge(svcId, to, 'phụ thuộc vào', rel);
    depends.push({ target: d.target, kind: d.kind, via: d.via, purpose: d.purpose });
  }
  if (depends.length) g.put('depends', depends);
  const provides = (a.provides || []).map((p) => ({ to: p.to, via: p.via, purpose: p.purpose }));
  if (provides.length) g.put('provides', provides);
  for (const p of doc.problems || []) {
    const id = g.node(ID.doc('prob', g.svc, p.id), 'problem', `${p.id}: ${p.title}`, at(`id: "${p.id}"`), { text: `${p.status}, mức ${p.severity}. ${p.detail}`, attrs: { status: p.status, severity: p.severity }, body: `${p.detail}\n${p.refine}\n${(p.refs || []).join(' ')}` });
    g.edge(svcId, id, 'có vấn đề', rel);
  }
  if (doc.title) g.put('title', doc.title);
}

module.exports = { id: 'service-doc', title: 'Bản tổng quan của dịch vụ (docs/service.yaml)', order: 10, scopes: ['service'], run };
