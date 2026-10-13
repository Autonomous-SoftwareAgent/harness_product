'use strict';
// spec: HOOK-S-016
// PHẦN CHÊNH giữa hai bản phát hành, cho người đã cài và đã sửa hoặc mở rộng gói: tệp mã nào thêm, sửa, bỏ; tên xuất nào của bề mặt
// công khai thêm, bỏ. Hàm thuần: nhận dữ liệu, trả chữ của tệp CHANGED.md. Lệnh đóng gói gom dữ liệu từ git và sổ tính năng.
//   files:   [{ status: 'A' | 'M' | 'D', path }]   đường dẫn tính từ gốc gói
//   exports: { prev: { tệp: [tên] } | null, cur: { tệp: [tên] } }   prev = null khi bản trước chưa ghi bề mặt công khai
const TITLE = { A: 'Tệp mã thêm', M: 'Tệp mã sửa', D: 'Tệp mã bỏ' };

function exportDiff(prev, cur) {
  const out = [];
  for (const file of [...new Set([...Object.keys(prev || {}), ...Object.keys(cur || {})])].sort()) {
    const a = new Set((prev && prev[file]) || []);
    const b = new Set((cur && cur[file]) || []);
    const removed = [...a].filter((n) => !b.has(n)).sort();
    const added = [...b].filter((n) => !a.has(n)).sort();
    if (removed.length || added.length) out.push({ file, removed, added });
  }
  return out;
}

function render({ prev, cur, files, exports }) {
  const lines = [`# Thay đổi từ bản ${prev} lên bản ${cur}`, '',
    'Tệp này do lệnh đóng gói sinh ra, không ai viết tay. Dùng khi bạn đã sửa mã của gói hoặc viết khối mở rộng dựa vào tên hàm của gói:',
    'tệp nào ở danh sách "sửa" mà bạn cũng đã sửa thì phải gộp; tên nào ở danh sách "bỏ" mà mã của bạn gọi thì phải đổi. Vì sao đổi: RELEASES.md.', ''];
  lines.push('## Tên xuất của bề mặt công khai');
  if (!exports || !exports.prev) lines.push(`Bản ${prev} chưa ghi bề mặt công khai nên không so được tên xuất ở lần này. Từ bản ${cur}, mọi tên bị bỏ hay đổi đều hiện ở đây.`);
  else {
    const d = exportDiff(exports.prev, exports.cur);
    if (!d.length) lines.push('Không tên nào thêm hay bỏ.');
    for (const x of d) {
      lines.push(`- \`${x.file}\``);
      if (x.removed.length) lines.push(`  - BỎ (hoặc đổi tên): ${x.removed.map((n) => `\`${n}\``).join(', ')}`);
      if (x.added.length) lines.push(`  - thêm: ${x.added.map((n) => `\`${n}\``).join(', ')}`);
    }
  }
  for (const st of ['D', 'M', 'A']) {
    const list = (files || []).filter((f) => f.status === st).map((f) => f.path).sort();
    lines.push('', `## ${TITLE[st]} (${list.length})`);
    if (!list.length) lines.push('Không có.');
    for (const p of list) lines.push(`- \`${p}\``);
  }
  return `${lines.join('\n')}\n`;
}

module.exports = { render, exportDiff };
