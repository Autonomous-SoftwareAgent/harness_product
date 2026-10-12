'use strict';
// spec: HOOK-S-010
// Lệnh dòng lệnh của khối context (S-064), góp vào bảng lệnh của cli.js qua khóa `commands` trong modules/context.json.
const fs = require('fs');

function register(on, { argv, cmd, arg, si, core }) {
  on('context', () => {
    // Hỏi kho ngữ nghĩa (cùng kết quả với công cụ MCP context_explore).
    //   context "<câu hỏi>" [--to "<vật thứ hai>"] [--section <mục>]      context --impact <tệp> [<tệp>...]
    const rest = argv.slice(1);
    const opt = (name) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : undefined; };
    const svc = si >= 0 ? core.serviceName() : undefined;
    if (rest[0] === '--impact') console.log(require('../../mcp/context/context-query').explore({ impact: rest.slice(1), service: svc }));
    else console.log(require('../../mcp/context/context-query').explore({ q: rest[0], to: opt('--to'), section: opt('--section'), service: svc }));
  });
  on('context-build', () => {
    // Dựng lại kho ngữ nghĩa của mọi dịch vụ từ bản đã commit (thường không cần gọi: cổng tự dựng sau mỗi commit). --force: bỏ kho đã lưu.
    const r = require('../../mcp/context/context').buildAll({ force: argv.includes('--force') });
    for (const g of [...Object.values(r.services), r.root]) console.log(`${g.name}: ${g.nodes.length} nút, ${g.edges.length} cạnh, ${g.dark.length} vùng tối${r.built.includes(g.name) ? ' (vừa dựng lại)' : ''}`);
  });
  on(['context-term', 'context-relate', 'diagram-review'], () => {
    // Cùng đường ghi với các công cụ MCP context_term / context_relate / diagram_review, nhận dữ liệu từ một tệp JSON.
    if (!arg || !fs.existsSync(arg)) throw new Error(`Dùng: cli.js --service <tên> ${cmd} <tệp.json>`);
    const data = JSON.parse(fs.readFileSync(arg, 'utf8'));
    const notes = require('../../mcp/context/annotations');
    console.log(cmd === 'context-term' ? (data.remove ? notes.termRemove(data) : notes.term(data)) : cmd === 'context-relate' ? notes.relate(data) : notes.review(data));
  });
}

module.exports = { register };
