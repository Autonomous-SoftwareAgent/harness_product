'use strict';
// spec: CTX-S-003
// Bộ nhận dạng NGUỒN: tờ yêu cầu giữa các phiên (docs/handoff/<ngày>-<từ>-to-<đến>-<việc>.md), chỉ có ở phần chung của cả hệ.
const { ID } = require('../kit');

function run(g, { files }) {
  for (const [p, text] of files) {
    const m = /^docs\/handoff\/(\d{4}-\d{2}-\d{2}-.+)\.md$/.exec(p);
    if (!m) continue;
    const field = (re) => ((re.exec(text) || [])[1] || '').trim();
    g.node(ID.doc('handoff', g.svc, m[1]), 'handoff', m[1], `${p}:1`, { text: field(/^Cần gì:\s*(.*)$/m), attrs: { status: field(/^Trạng thái:\s*(\S+)/m), to: field(/Đến:\s*(.*)$/m) }, body: text });
  }
}

module.exports = { id: 'handoffs', title: 'Tờ yêu cầu giữa các phiên (docs/handoff/)', order: 45, scopes: ['root'], run };
