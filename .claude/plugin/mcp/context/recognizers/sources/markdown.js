'use strict';
// spec: CTX-S-003
// Bộ nhận dạng NGUỒN: Markdown viết tự do. Kho chỉ biết TIÊU ĐỀ mục (ba cấp đầu) và dòng của nó; nội dung không vào kho.
const { ID } = require('../kit');

const LIST = {
  service: ['CLAUDE.md', 'README.md', 'docs/agent/STATUS.md', 'docs/agent/CONVENTIONS.md'],
  root: ['CLAUDE.md', 'infra/README.md', 'docs/system/services.md', 'docs/system/harness-product.md'],
};

function run(g, { files, scope }) {
  for (const p of LIST[scope]) {
    if (!files.has(p)) continue;
    files.get(p).split('\n').forEach((l, i) => {
      const m = /^(#{1,3})\s+(.+)$/.exec(l);
      if (m) g.node(ID.doc('sec', g.svc, `${p}#${i + 1}`), 'section', m[2].replace(/[`*]/g, ''), `${p}:${i + 1}`, { conf: 'doan', text: `mục trong ${p} (văn bản tự do, công cụ chỉ biết tiêu đề)` });
    });
  }
}

module.exports = { id: 'markdown', title: 'Markdown viết tự do (chỉ tiêu đề mục)', order: 50, scopes: ['service', 'root'], run };
