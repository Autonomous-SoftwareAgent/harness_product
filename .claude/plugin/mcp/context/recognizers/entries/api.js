'use strict';
// spec: CTX-S-003
// Bộ nhận dạng CỬA VÀO: đường dẫn API (HTTP). Đọc bằng mẫu văn bản: `app.get('/x')`, bảng đường dẫn viết thành bộ trong mảng,
// `{ method, path }`, và decorator `@app.get("/x")` của Python. Không thấy đường dẫn dựng lúc chạy.
const { codeLines } = require('../kit');

const HTTP = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'];
const verb = (m) => (/^(all|any)$/i.test(m) ? 'ANY' : m.toUpperCase());

// Bảng đường dẫn viết thành bộ ba trong mảng, kiểu máy chủ tự khai không qua framework:
//   ['GET', '/health']   ['GET', /^\/health$/, '/health']   ['POST', /^\/(ipn|return)\/[\w-]+$/, '/$1/{gateway}']
// Chuỗi thì lấy nguyên. Biểu thức chính quy thì đổi về đường dẫn: nhóm chỉ gồm các từ (a|b) tách thành từng đường dẫn,
// đoạn còn ký tự đặc biệt thành {tham-số}. Có tên mẫu ở phần tử thứ ba thì dùng tên đó ($1 thay bằng từng từ của nhóm đầu).
function regexPaths(src, name) {
  if (!src.startsWith('^') || !src.endsWith('$')) return [];
  const segs = src.slice(1, -1).replace(/\\\//g, '/').split('/').slice(1);
  if (!segs.length) return [];
  let alts = null; let paths = [''];
  for (const seg of segs) {
    const lit = seg.replace(/\\([.\-_])/g, '$1');
    const g = /^\(((?:\?:)?[\w-]+(?:\|[\w-]+)+)\)$/.exec(seg);
    let opts;
    if (/^[\w.~-]*$/.test(lit)) opts = [lit];
    else if (g) { opts = g[1].replace(/^\?:/, '').split('|'); if (!alts) alts = opts; }
    else opts = ['{tham-số}'];
    paths = paths.flatMap((p) => opts.map((o) => `${p}/${o}`));
    if (paths.length > 16) return [];
  }
  if (name) return /\$1/.test(name) ? (alts || []).map((a) => name.replace(/\$1/g, a)) : (/\$\d/.test(name) ? paths : [name]);
  return paths;
}
function tupleRoutes(line) {
  const out = [];
  const M = `(['"])(${HTTP.join('|')}|all|any)\\1`;
  for (const r of line.matchAll(new RegExp(`\\[\\s*${M}\\s*,\\s*(['"\`])(\\/[^'"\`]*)\\3`, 'gi'))) out.push({ method: verb(r[2]), path: r[4] });
  for (const r of line.matchAll(new RegExp(`\\[\\s*${M}\\s*,\\s*\\/((?:\\\\.|\\[[^\\]]*\\]|[^/\\\\\\n])+)\\/[a-z]*\\s*(?:,\\s*(['"\`])(\\/[^'"\`]*)\\4)?`, 'gi'))) {
    for (const p of regexPaths(r[3], r[5])) out.push({ method: verb(r[2]), path: p });
  }
  return out;
}

function find(file, text, lang) {
  const out = [];
  const add = (method, p, line) => out.push({ name: `${method} ${p}`, line, method, path: p });
  if (lang === 'js') {
    for (const { l, n } of codeLines(text, (t) => t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'))) {
      for (const r of l.matchAll(new RegExp(`\\b[A-Za-z_$][\\w$.]*\\.(${HTTP.join('|')}|all)\\(\\s*(['"\`])(\\/[^'"\`]*)\\2`, 'g'))) add(r[1] === 'all' ? 'ANY' : r[1].toUpperCase(), r[3], n);
      for (const r of tupleRoutes(l)) add(r.method, r.path, n);
      for (const r of l.matchAll(/\bmethod:\s*(['"])([A-Za-z]+)\1\s*,\s*path:\s*(['"`])(\/[^'"`]*)\3/g)) add(r[2].toUpperCase(), r[4], n);
      for (const r of l.matchAll(/\bpath:\s*(['"`])(\/[^'"`]*)\1\s*,\s*method:\s*(['"])([A-Za-z]+)\3/g)) add(r[4].toUpperCase(), r[2], n);
    }
  } else if (lang === 'py') {
    text.split('\n').forEach((row, i) => {
      const l = row.replace(/#.*$/, '');
      for (const r of l.matchAll(new RegExp(`@\\w[\\w.]*\\.(${HTTP.join('|')}|route|api_route)\\(\\s*(['"])(\\/[^'"]*)\\2`, 'g'))) add(['route', 'api_route'].includes(r[1]) ? 'ANY' : r[1].toUpperCase(), r[3], i + 1);
    });
  }
  return out;
}

// Trên sơ đồ cửa vào, đường dẫn gom theo đoạn đầu (riêng /internal/x và /v1/x thì lấy hai đoạn).
function bucket(name) {
  const p = name.split(' ')[1] || '';
  const parts = p.split('/').filter(Boolean);
  return `/${parts.slice(0, parts[0] === 'internal' || /^vd+$/.test(parts[0] || '') ? 2 : 1).join('/')}`;
}

module.exports = { id: 'api', label: 'đường dẫn API', group: 'Cửa vào: đường dẫn API (đọc từ mã)', unit: 'đường dẫn', order: 10, nodeType: 'api', find, bucket };
