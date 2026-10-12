'use strict';
// spec: CTX-S-003
// Bộ nhận dạng NGÔN NGỮ: Python. Đọc bằng mẫu văn bản theo từng dòng. Thấy `import a.b`, `from a.b import c`, nhập tương đối, nhập nhiều dòng
// trong ngoặc, khai báo hàm và lớp ở đầu dòng. Tên module trùng nhiều tệp thì không đoán. `import_module`, `__import__` là vùng tối.
const { path } = require('../kit');

// Bảng tên module: mọi hậu tố của đường dẫn (src/ingest/core/x.py -> ingest.core.x, core.x, x); tên trùng nhiều tệp thì bỏ (không đoán).
function prepare(codePaths) {
  const modules = new Map(); const clash = new Set();
  for (const p of codePaths) {
    const parts = p.slice(0, -3).split('/');
    for (let i = 0; i < parts.length; i++) {
      const name = parts.slice(i).join('.');
      if (modules.has(name) && modules.get(name) !== p) clash.add(name); else modules.set(name, p);
    }
  }
  // Tên đầy đủ nhất luôn thắng: chỉ bỏ tên ngắn bị trùng.
  for (const name of clash) modules.delete(name);
  return modules;
}

function scan(file, text, has, modules) {
  const out = { imports: [], externals: [], decls: [], dynamic: [] };
  const pkgDir = path.dirname(file);
  // Tên module có dấu chấm -> tệp. Thử module rồi gói (__init__.py).
  const lookup = (dotted) => modules.get(dotted) || modules.get(`${dotted}.__init__`) || null;
  const relative = (dots, rest) => {
    let dir = pkgDir;
    for (let i = 1; i < dots; i++) dir = path.dirname(dir);
    const base = rest ? path.join(dir, ...rest.split('.')) : dir;
    for (const c of [`${base}.py`, `${base}/__init__.py`]) if (has(c)) return c;
    return null;
  };
  const push = (to, n, name) => { if (to && to !== file) { if (!out.imports.some((i) => i.to === to)) out.imports.push({ to, line: n }); } else if (!to && name) out.externals.push({ name: name.split('.')[0], line: n }); };
  const rows = text.split('\n');
  for (let i = 0; i < rows.length; i++) {
    const n = i + 1;
    let l = rows[i].replace(/#.*$/, '');
    // Lệnh nhập nhiều dòng trong ngoặc: gộp về một dòng, giữ số dòng của dòng đầu.
    if (/^\s*from\s+\S+\s+import\s*\([^)]*$/.test(l)) {
      while (i + 1 < rows.length && !l.includes(')')) { i += 1; l += ` ${rows[i].replace(/#.*$/, '').trim()}`; }
    }
    let m;
    if ((m = /^\s*from\s+(\.*)([\w.]*)\s+import\s+(.+)$/.exec(l))) {
      const names = m[3].replace(/[()]/g, '').split(',').map((x) => x.trim().split(/\s+as\s+/)[0]).filter(Boolean);
      if (m[1]) {
        const base = relative(m[1].length, m[2]);
        let any = false;
        for (const name of names) { const sub = relative(m[1].length, m[2] ? `${m[2]}.${name}` : name); if (sub) { push(sub, n); any = true; } }
        if (!any) push(base, n, m[2] || '.');
      } else {
        let any = false;
        for (const name of names) { const sub = lookup(`${m[2]}.${name}`); if (sub) { push(sub, n); any = true; } }
        if (!any) push(lookup(m[2]), n, m[2]);
      }
    } else if ((m = /^\s*import\s+(.+)$/.exec(l))) {
      for (const part of m[1].split(',')) { const name = part.trim().split(/\s+as\s+/)[0]; if (name) push(lookup(name), n, name); }
    }
    if (/\b(import_module|__import__)\s*\(/.test(l)) out.dynamic.push({ line: n, what: 'nhập theo tên tính lúc chạy' });
    if ((m = /^(?:async\s+)?def\s+([A-Za-z]\w*)/.exec(l))) out.decls.push({ name: m[1], kind: 'function', line: n });
    else if ((m = /^class\s+([A-Za-z]\w*)/.exec(l))) out.decls.push({ name: m[1], kind: 'class', line: n });
  }
  return out;
}

module.exports = { id: 'py', ext: ['.py'], prepare, scan };
