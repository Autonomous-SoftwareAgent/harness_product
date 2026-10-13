'use strict';
// spec: CTX-S-001
// spec: CTX-S-003
// Bộ quét mã cho kho ngữ nghĩa (context.js). Nhận nội dung các tệp của MỘT commit (đường dẫn -> văn bản) và trả các sự thật máy đọc được:
// tệp, lệnh nhập giữa các tệp, khai báo chính, cửa vào, và những chỗ nhập ĐỘNG mà cách đọc chữ này không lần ra (vùng tối).
// Hàm thuần: không đọc đĩa (ngoài việc nạp các bộ nhận dạng), không gọi tiến trình; cùng đầu vào luôn ra cùng kết quả.
// Tệp này KHÔNG biết ngôn ngữ nào và không biết loại cửa vào nào: nó chỉ chạy các bộ ở recognizers/langs/ và recognizers/entries/.
// Thêm ngôn ngữ hay thêm loại cửa vào = thêm một tệp ở đó; tệp này và phần còn lại của harness không đổi.
const path = require('path').posix;
const registry = require('./recognizers');
const { isTestPath } = require('./recognizers/kit');

const SKIP_DIR = /(^|\/)(node_modules|vendor|dist|build|coverage|\.git|__pycache__|\.venv|venv|\.pytest_cache|\.mypy_cache)(\/|$)/;
const MAX_BYTES = 1024 * 1024;

// files: Map<đường dẫn kiểu posix, văn bản>. Trả { files, imports, externals, decls, entries, dynamic } (mọi mảng theo thứ tự tệp đã sắp, tất định).
// entries: [{ file, kind, name, line, ...thuộc tính riêng của loại cửa vào }], kind là id của bộ nhận dạng cửa vào.
function scan(files) {
  const langs = registry.load('lang');
  const kinds = registry.load('entry');
  const langOf = (p) => langs.find((x) => x.ext.includes(path.extname(p)) && !(x.skip && x.skip(p))) || null;
  const readable = [...files.keys()].filter((p) => !SKIP_DIR.test(p) && Buffer.byteLength(files.get(p)) <= MAX_BYTES).sort();
  const code = readable.filter((p) => langOf(p));
  // Lệnh nhập có thể trỏ tới tệp không phải mã (package.json, tệp cấu hình): vẫn là một tệp có thật của commit.
  const has = (p) => files.has(p);
  const state = new Map(langs.map((l) => [l.id, l.prepare ? l.prepare(code.filter((p) => l.ext.includes(path.extname(p)))) : null]));
  const out = { files: [], imports: [], externals: [], decls: [], entries: [], dynamic: [] };
  const entriesOf = (p, text, lang) => { for (const k of kinds) for (const x of k.find(p, text, lang) || []) out.entries.push({ ...x, file: p, kind: k.id }); };
  for (const p of readable) {
    const lang = langOf(p);
    const text = files.get(p);
    // Tệp không phải mã (ví dụ tệp cấu hình JSON) vẫn được đưa cho các bộ nhận dạng cửa vào, với lang = null.
    if (!lang) { entriesOf(p, text, null); continue; }
    const r = lang.scan(p, text, has, state.get(lang.id));
    out.files.push({ path: p, lang: lang.id, lines: text.split('\n').length, test: isTestPath(p) });
    for (const i of r.imports) out.imports.push({ from: p, to: i.to, line: i.line });
    for (const e of r.externals) if (!out.externals.some((x) => x.from === p && x.name === e.name)) out.externals.push({ from: p, name: e.name, line: e.line });
    for (const d of r.decls) out.decls.push({ file: p, name: d.name, kind: d.kind, line: d.line });
    entriesOf(p, text, lang.id);
    for (const d of r.dynamic) out.dynamic.push({ file: p, line: d.line, what: d.what });
  }
  const seen = new Set();
  out.imports = out.imports.filter((i) => { const k = `${i.from}>${i.to}`; if (seen.has(k)) return false; seen.add(k); return true; });
  return out;
}

module.exports = { scan, isTestPath, SKIP_DIR };
