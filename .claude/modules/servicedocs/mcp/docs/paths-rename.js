'use strict';
// spec: MCP-S-002
// ĐỔI ĐƯỜNG DẪN MÃ HÀNG LOẠT trong tài liệu do công cụ sở hữu của MỘT đơn vị, khi mã của đơn vị đó dời chỗ: tầng hiện thực
// (`code`, `tests`), nguồn của sơ đồ (`sources`), bằng chứng của từ vựng và quan hệ, mã nút của kho (`file:<đơn vị>:<đường dẫn>`), tham
// chiếu trong sổ vấn đề. Bảng đổi là { "<đường dẫn cũ>": "<đường dẫn mới>" }, cả hai tính từ thư mục của đơn vị, kiểu posix, và chỉ
// đổi ĐÚNG đường dẫn của một tệp (không đổi theo tiền tố thư mục, không đổi chữ trong câu). Mọi tệp ghi trong MỘT giao dịch có khóa của
// bộ máy tài liệu, nên nhật ký cam kết và sao lưu như mọi lần ghi bằng công cụ.
//   cli.js --service <đơn vị> paths-rename <bảng.json> [--apply]
const fs = require('node:fs');
const path = require('node:path');
const E = require('../../../core/adapters/storage/unit-docs');
const P = require('../../../core/gate/gate-paths');

// Tệp do công cụ sở hữu mà trong đó có đường dẫn mã (tính từ docs/ của đơn vị). _generated/ không tính: phép kiểm sinh lại.
function ownedFiles(docs) {
  const out = [];
  const walk = (dir, keep) => {
    let names = [];
    try { names = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of names) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, keep); else if (keep(e.name)) out.push(p);
    }
  };
  walk(path.join(docs, 'modules'), (n) => n === '3-impl.md');
  walk(path.join(docs, 'diagrams'), (n) => /\.ya?ml$/.test(n));
  walk(path.join(docs, 'context'), (n) => /\.ya?ml$/.test(n));
  if (fs.existsSync(path.join(docs, 'service.yaml'))) out.push(path.join(docs, 'service.yaml'));
  return out.sort();
}

// Ký tự đứng sát một đường dẫn tệp trong các tệp này: đầu dòng, dấu cách, dấu nháy, dấu phẩy, dấu hai chấm (mã nút), ngoặc.
const BEFORE = '(^|[\\s"\'`,:(\\[])';
const AFTER = '(?=$|[\\s"\'`,:)#\\]])';
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function rewrite(text, map) {
  const olds = Object.keys(map).sort((a, b) => b.length - a.length);
  if (!olds.length) return { text, n: 0 };
  const re = new RegExp(`${BEFORE}(${olds.map(esc).join('|')})${AFTER}`, 'gm');
  let n = 0;
  const out = text.replace(re, (all, pre, old) => { n++; return pre + map[old]; });
  return { text: out, n };
}

function run(map, { apply = false } = {}) {
  if (!map || typeof map !== 'object' || Array.isArray(map)) throw new Error('bảng đổi phải là một đối tượng { "cũ": "mới" }');
  const bad = Object.entries(map).filter(([a, b]) => typeof b !== 'string' || !a || !b || /\\|^\/|^\.\.?\//.test(a + b));
  if (bad.length) throw new Error(`đường dẫn trong bảng phải tính từ thư mục đơn vị, kiểu posix: ${bad.slice(0, 3).map(([a]) => a).join(', ')}`);
  const missing = Object.values(map).filter((to) => !fs.existsSync(path.join(E.ROOT, ...to.split('/'))));
  if (missing.length) throw new Error(`đường dẫn mới không có tệp thật (${missing.length}): ${missing.slice(0, 5).join(', ')}`);
  const lines = [];
  const work = () => {
    let total = 0;
    // Giữ dấu của phần giải thích sơ đồ: khối sơ đồ ghi lại dấu theo cách tính không phụ thuộc đường dẫn TRƯỚC khi đường dẫn đổi,
    // trong cùng giao dịch. Khối sơ đồ tắt thì không có gì để giữ.
    if (apply) { const f = P.provided(E.BSN_DIR, 'diagramRestamp'); if (f) require(f).restampRaw(); }
    for (const file of ownedFiles(E.DOCS)) {
      const r = rewrite(E.readText(file), map);
      if (!r.n) continue;
      total += r.n;
      lines.push(`${path.relative(E.ROOT, file).split(path.sep).join('/')}: ${r.n} chỗ`);
      if (apply) E.writeText(file, r.text);
    }
    return total;
  };
  const total = apply ? E.transaction('paths_rename', work) : work();
  return [`${apply ? 'Đã đổi' : 'Sẽ đổi (chưa ghi; thêm --apply)'} ${total} chỗ trong ${lines.length} tệp.`, ...lines.map((l) => `  ${l}`)].join('\n');
}

module.exports = { run, rewrite, ownedFiles };
