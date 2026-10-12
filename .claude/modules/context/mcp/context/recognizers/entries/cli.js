'use strict';
// spec: CTX-S-003
// Bộ nhận dạng CỬA VÀO: lệnh dòng lệnh. Một tệp là điểm chạy khi nó đọc đối số dòng lệnh. Đọc bằng mẫu văn bản:
//   JavaScript: tệp có `process.argv`; lệnh con là chuỗi được so bằng `===` với một biến tên cmd, command, mode, sub, action,
//               hoặc đứng sau `case`, hoặc là tên trong một dòng khai của bảng lệnh (`on('tên', ...)` đứng đầu dòng).
//               Không thấy lệnh con nào thì cả tệp là một cửa vào.
//   Python:     tệp có `sys.argv` hoặc `argparse`; lệnh con là tên trong `add_parser('tên')`.
// Không thấy lệnh con lấy từ bảng tra hay tên dựng lúc chạy. Cờ (--x) không tính là lệnh.
const { path } = require('../kit');

function find(file, text, lang) {
  const out = [];
  const base = path.basename(file);
  const seen = new Set();
  const add = (cmd, line) => { if (seen.has(cmd)) return; seen.add(cmd); out.push({ name: `${base} ${cmd}`, line }); };
  // Dòng chú thích không tính (một tệp chỉ NHẮC tới process.argv trong chú thích không phải điểm chạy).
  const rows = text.split('\n').map((l) => (/^\s*(\/\/|\*|\/\*)/.test(l) ? '' : l));
  if (lang === 'js') {
    if (!rows.some((l) => /\bprocess\.argv\b/.test(l))) return out;
    rows.forEach((l, i) => {
      // Chỉ nhận biến đứng một mình: `h.command === 'x'` (thuộc tính của vật khác) và `typeof mode === 'string'` không phải lệnh con.
      for (const m of l.matchAll(/(?<!typeof\s+)(?<![.\w$])(?:cmd|command|mode|sub|action)\s*===\s*(['"])([a-z][a-z0-9-]*)\1/g)) add(m[2], i + 1);
      for (const m of l.matchAll(/\bcase\s+(['"])([a-z][a-z0-9-]*)\1\s*:/g)) add(m[2], i + 1);
      // Bảng lệnh: dòng khai `on('tên', ...)` hoặc `on(['tên-a', 'tên-b'], ...)` đứng đầu dòng.
      const t = /^on\(\s*(\[[^\]]+\]|(['"])[a-z][a-z0-9-]*\2)/.exec(l);
      if (t) for (const m of t[1].matchAll(/(['"])([a-z][a-z0-9-]*)\1/g)) add(m[2], i + 1);
    });
    if (!out.length) out.push({ name: base, line: rows.findIndex((l) => /\bprocess\.argv\b/.test(l)) + 1 });
  } else if (lang === 'py') {
    if (!/\bsys\.argv\b|\bargparse\b/.test(text)) return out;
    rows.forEach((l, i) => { for (const m of l.replace(/#.*$/, '').matchAll(/\badd_parser\(\s*(['"])([a-z][a-z0-9_-]*)\1/g)) add(m[2], i + 1); });
    if (!out.length) out.push({ name: base, line: rows.findIndex((l) => /\bsys\.argv\b|\bargparse\b/.test(l)) + 1 });
  }
  return out;
}

module.exports = { id: 'cli', label: 'lệnh dòng lệnh', group: 'Cửa vào: lệnh dòng lệnh (đọc từ mã)', unit: 'lệnh', order: 30, find };
