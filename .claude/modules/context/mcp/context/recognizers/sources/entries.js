'use strict';
// spec: CTX-S-003
// Bộ nhận dạng NGUỒN: cửa vào của dịch vụ. Đưa các cửa vào mà recognizers/entries/ tìm thấy (ctx.facts.entries) vào kho ở MỘT dạng chung:
// nút cửa vào, cạnh "mở" từ dịch vụ, cạnh "khai ở" tới tệp. Không biết loại cửa vào nào: tên nhóm, đơn vị đếm và cách gom lấy từ ctx.entryKinds.
// Cửa vào khai trong tệp test không tính.
const { ID, isTestPath } = require('../kit');

function run(g, { facts, entryKinds }) {
  const used = [];
  for (const kind of entryKinds) {
    const all = facts.entries.filter((e) => e.kind === kind.id && !isTestPath(e.file));
    // Cửa vào ĐOÁN từ mã (weak) nhường cho cửa vào được KHAI rõ trỏ tới cùng đích (target): một cửa không vẽ hai lần.
    const declared = new Set(all.filter((e) => !e.weak && e.target).map((e) => e.target));
    const mine = all.filter((e) => !(e.weak && declared.has(e.target)));
    if (!mine.length) continue;
    const nodeType = kind.nodeType || 'entry';
    used.push({ id: kind.id, label: kind.label, group: kind.group, unit: kind.unit });
    for (const e of mine) {
      const at = `${e.file}:${e.line}`;
      const id = g.node(ID.entry(nodeType, g.svc, kind.id, e.name), nodeType, e.name, at, { conf: 'ma', text: e.text || '', attrs: { kind: kind.id, bucket: kind.bucket ? kind.bucket(e.name, e.file) : e.file } });
      g.edge(ID.svc(g.svc), id, 'mở', at, 'ma');
      g.edge(id, ID.file(g.svc, e.file), 'khai ở', at, 'ma');
    }
  }
  if (used.length) g.put('entryKinds', used);
}

module.exports = { id: 'entries', title: 'Cửa vào của dịch vụ (mọi loại ở recognizers/entries/)', order: 65, scopes: ['service'], run };
