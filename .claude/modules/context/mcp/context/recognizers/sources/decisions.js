'use strict';
// spec: CTX-S-003
// Bộ nhận dạng NGUỒN: sổ quyết định. Của dịch vụ: docs/agent/DECISIONS.md (mã D-nnn). Của cả hệ: docs/system/decisions.md (mã S-nnn).
const { ID, mdItems, cut } = require('../kit');

const BOOK = {
  service: { rel: 'docs/agent/DECISIONS.md', /* tên logic */ idRe: /^D-\d{3}$/ },
  root: { rel: 'docs/system/decisions.md', idRe: /^S-\d{3}$/ },
};

function run(g, { files, scope, U }) {
  const { idRe } = BOOK[scope];
  const rel = scope === 'service' ? U(BOOK[scope].rel) : BOOK[scope].rel;
  if (!files.has(rel)) return;
  for (const it of mdItems(files.get(rel), idRe)) {
    g.node(ID.doc('dec', g.svc, it.id), 'decision', `${it.id}: ${it.title}`, `${rel}:${it.line}`, { text: it.fields['quyết định'] || it.fields.decision, attrs: { status: cut(it.fields['trạng thái'] || it.fields.status || '', 40) }, body: it.body });
  }
}

module.exports = { id: 'decisions', title: 'Sổ quyết định (D-nnn của dịch vụ, S-nnn của cả hệ)', order: 40, scopes: ['service', 'root'], run };
