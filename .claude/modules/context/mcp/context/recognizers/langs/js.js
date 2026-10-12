'use strict';
// spec: CTX-S-003
// Bộ nhận dạng NGÔN NGỮ: JavaScript và TypeScript. Đọc bằng mẫu văn bản theo từng dòng, không phân tích cú pháp.
// Thấy: require/import có đường dẫn viết rõ, khai báo hàm, lớp, hằng được xuất. KHÔNG thấy: lời gọi qua biến, nhập theo tên dựng lúc chạy
// (ghi vào `dynamic` để lõi báo là vùng tối), hàm nào gọi hàm nào.
const { path, lineOf, codeLines } = require('../kit');

const EXT = ['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.mts', '.cts'];

function scan(file, text, has) {
  const out = { imports: [], externals: [], decls: [], dynamic: [] };
  const resolve = (spec) => {
    const base = path.normalize(path.join(path.dirname(file), spec));
    for (const c of [base, ...EXT.map((e) => base + e), ...EXT.map((e) => `${base}/index${e}`)]) if (has(c)) return c;
    // TypeScript kiểu ESM viết "./x.js" trong lệnh nhập trong khi tệp nguồn là x.ts (hoặc .tsx, .mts).
    const m = /^(.*)\.(?:c|m)?js$/.exec(base);
    if (m) for (const e of ['.ts', '.tsx', '.mts', '.cts']) if (has(m[1] + e)) return m[1] + e;
    return null;
  };
  const add = (spec, n) => {
    if (spec.startsWith('.')) { const to = resolve(spec); if (to) out.imports.push({ to, line: n }); else out.dynamic.push({ line: n, what: `không thấy tệp '${spec}'` }); }
    else out.externals.push({ name: spec.startsWith('node:') ? spec : spec.split('/').slice(0, spec.startsWith('@') ? 2 : 1).join('/'), line: n });
  };
  for (const { l, n } of codeLines(text, (t) => t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'))) {
    for (const m of l.matchAll(/\brequire\(\s*(['"])([^'"]+)\1\s*\)/g)) add(m[2], n);
    for (const m of l.matchAll(/\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g)) add(m[2], n);
    for (const m of l.matchAll(/^\s*(?:import|export)\b[^'"]*?\bfrom\s+(['"])([^'"]+)\1/g)) add(m[2], n);
    for (const m of l.matchAll(/^\s*import\s+(['"])([^'"]+)\1/g)) add(m[2], n);
    if (/\b(?:require|import)\(\s*[^'")\s]/.test(l)) out.dynamic.push({ line: n, what: 'nhập theo tên tính lúc chạy' });
    let m;
    if ((m = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/.exec(l))) out.decls.push({ name: m[1], kind: 'function', line: n });
    else if ((m = /^(?:export\s+)?(?:default\s+)?class\s+([A-Za-z_$][\w$]*)/.exec(l))) out.decls.push({ name: m[1], kind: 'class', line: n });
    else if ((m = /^export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/.exec(l))) out.decls.push({ name: m[1], kind: 'const', line: n });
    else if ((m = /^(?:module\.)?exports\.([A-Za-z_$][\w$]*)\s*=/.exec(l))) out.decls.push({ name: m[1], kind: 'export', line: n });
  }
  // module.exports = { a, b: c, ... } (có thể nhiều dòng): tên được xuất là khai báo chính của tệp.
  const ex = /^module\.exports\s*=\s*\{([\s\S]*?)\}\s*;?\s*$/m.exec(text);
  if (ex) {
    const at = lineOf(text, ex.index);
    for (const part of ex[1].split(',')) {
      const name = (/^\s*(?:\.\.\.)?([A-Za-z_$][\w$]*)/.exec(part.replace(/\/\/.*$/gm, '')) || [])[1];
      if (name && !out.decls.some((d) => d.name === name && d.kind === 'export')) {
        const known = out.decls.find((d) => d.name === name);
        if (known) known.exported = true; else out.decls.push({ name, kind: 'export', line: at });
      }
    }
  }
  return out;
}

module.exports = { id: 'js', ext: EXT, skip: (p) => /\.min\.js$/.test(p), scan };
