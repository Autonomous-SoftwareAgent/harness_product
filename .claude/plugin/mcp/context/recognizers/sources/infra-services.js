'use strict';
// spec: CTX-S-003
// Bộ nhận dạng NGUỒN: tờ khai báo của từng dịch vụ ở infra/services/<tên>.json (S-023), chỉ ở phần chung của cả hệ.
// Mỗi tờ ra một nút dịch vụ kèm cổng local và bản đang ghim.
const { ID } = require('../kit');

function run(g, { allInfra }) {
  for (const [name, s] of Object.entries(allInfra || {})) {
    g.node(ID.svc(name), 'service', name, `infra/services/${name}.json:1`, { text: `cổng local ${s.port && s.port.local}, bản ghim ${String(s.commit || '').slice(0, 7)}`, attrs: { pinned: s.commit || '', port: (s.port && s.port.local) || null } });
  }
}

module.exports = { id: 'infra-services', title: 'Tờ khai báo dịch vụ (infra/services/*.json)', order: 55, scopes: ['root'], run };
