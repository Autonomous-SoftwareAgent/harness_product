'use strict';
// spec: HOOK-S-002
// spec: HOOK-S-009
// LUẬT tệp do công cụ sở hữu (trước khi phiên ghi tệp hoặc chạy lệnh), dùng chung cho mọi service: tệp do công cụ docs SỞ HỮU chỉ được ghi qua công cụ.
//  - docs/modules/<module>/{1-design,2-spec,3-impl}.md : bsn-docs (design_record, design_update, spec_fill, impl_link)
//  - docs/_generated/**                                  : công cụ sinh (docs check, code)
// Chỉ chặn GHI; đọc thì tự do. Với lệnh shell, luật xét các đích ghi thật mà bộ chuyển đã phân tích sẵn (action.shell), không khớp chuỗi con.
// Đây là hàng rào chứ không phải sandbox (lệnh shell lách được); bảo đảm cứng là phát hiện lệch bằng băm trong `docs check`.
const path = require('node:path');
const { deny } = require('../../../core/ports/events');

// Đường dẫn được quy về dạng chung "<UNIT>/<tên đơn vị>/<đường dẫn trong đơn vị>" (đơn vị nằm ở đâu do cấu hình dự án khai, S-063),
// nên các mẫu dưới đây không phụ thuộc bố cục của dự án nào.
const UNIT = '@unit';
const OWNED = [
  { re: /^@unit\/[^/]+\/docs\/modules\/[^/]+\/(1-design|2-spec|3-impl)\.md$/i,
    how: 'Ba tầng design/spec/impl chỉ ghi qua công cụ MCP bsn-docs: design_record và design_update (tầng 1), spec_fill (tầng 2), impl_link (tầng 3); truyền service="<tên service>".' },
  { re: /^@unit\/[^/]+\/docs\/_generated(\/|$)/i,
    how: 'docs/_generated/ do công cụ sinh: chạy `node .claude/modules/core/cli/cli.js --service <tên> check` (traceability) hoặc `... code` (code-map).' },
  { re: /^@unit\/[^/]+\/docs\/service\.yaml$/i,
    how: 'docs/service.yaml là nguồn có cấu trúc của dịch vụ, chỉ ghi qua công cụ MCP bsn-docs: service_doc_set (meta, business, architecture, progress) và problem_record; truyền service="<tên service>".' },
  { re: /^@unit\/[^/]+\/docs\/diagrams(\/|$)/i,
    how: 'docs/diagrams/ chứa bản khai báo sơ đồ, chỉ ghi qua công cụ MCP bsn-docs: diagram_validate (kiểm, xem trước) rồi diagram_save; xóa bằng `node .claude/modules/core/cli/cli.js --service <tên> diagram-remove <id>`.' },
  { re: /^@unit\/[^/]+\/docs\/context(\/|$)/i,
    how: 'docs/context/ chứa phần agent viết cho kho ngữ nghĩa (từ vựng, quan hệ bổ sung, giải thích và kết quả soát của sơ đồ tự sinh), chỉ ghi qua công cụ MCP bsn-docs: context_term, context_relate, diagram_explain, diagram_review; truyền service="<tên service>".' },
  { re: /^docs\/portal\/(?!history(\/|$))/i,
    how: 'docs/portal/ là cổng HTML sinh tự động (trang tổng gom liên kết, trang của từng dịch vụ): sửa nguồn (docs/service.yaml và sơ đồ qua bsn-docs, hoặc bộ sinh ở .claude/plugin/mcp/generators/) rồi chạy `node .claude/modules/core/cli/cli.js portal`, không sửa tay trang đã sinh.' },
];
const MENTIONS_OWNED = /docs[\\/]+modules[\\/]+[^\s'"]+[\\/]+(1-design|2-spec|3-impl)\.md|docs[\\/]+_generated|docs[\\/]+service\.yaml|docs[\\/]+diagrams[\\/]|docs[\\/]+context[\\/]|docs[\\/]+portal[\\/]/i;

// Mermaid viết tay: model không được tự viết cú pháp Mermaid vào tài liệu hay trang HTML. Sơ đồ khai bằng dữ liệu qua bsn-docs
// (diagram_validate, diagram_save); công cụ sinh Mermaid lúc dựng trang. Chỉ xét tệp tài liệu (md, html, yaml, txt), không xét mã.
const DOC_EXT = /\.(md|markdown|html?|ya?ml|txt)$/i;
const MERMAID = /class\s*=\s*["']?[^"'>]*\bmermaid\b|```\s*mermaid\b|^[ \t]*(?:flowchart|graph)[ \t]+(?:TB|TD|BT|LR|RL)\b|^[ \t]*(?:sequenceDiagram|stateDiagram(?:-v2)?|classDiagram|erDiagram)[ \t]*$/im;
const MERMAID_HOW = 'Không tự viết cú pháp Mermaid vào tệp. Khai sơ đồ bằng dữ liệu qua công cụ MCP bsn-docs: diagram_validate (kiểm, xem trước) rồi diagram_save (service="<tên>"); công cụ tự sinh Mermaid khi dựng trang.';
const writesMermaid = (file, text) => DOC_EXT.test(String(file)) && MERMAID.test(String(text || ''));

// Đích của lệnh XÓA/DỜI có thể là thư mục chứa tệp sở hữu (rm -rf svc/docs/modules/core): cũng bị chặn.
const ANCESTOR = /^@unit\/[^/]+\/docs(\/modules(\/[^/]+)?)?$/i;

async function run(event, { workspace: ws }) {
  // Đường dẫn tính từ gốc dự án; tệp thuộc một đơn vị (thư mục con của thư mục cha khai trong cấu hình, hoặc đơn vị khai riêng như infra/)
  // được quy về dạng @unit/<tên>/..., để mọi luật ở trên áp dụng y như nhau cho mọi đơn vị.
  const relToRoot = (abs) => {
    const rel = path.relative(ws.root, abs).split(path.sep).join('/');
    if (rel.startsWith('..') || path.isAbsolute(rel)) return rel;
    const unit = ws.serviceOf(abs);
    if (!unit) return rel;
    const inUnit = path.relative(ws.serviceDir(unit), abs).split(path.sep).join('/');
    return inUnit ? `${UNIT}/${unit}/${inUnit}` : `${UNIT}/${unit}`;
  };
  const ownedMatch = (abs) => {
    const rel = relToRoot(abs);
    if (rel.startsWith('..') || path.isAbsolute(rel)) return null; // ngoài dự án: không thuộc luật này
    return OWNED.find((o) => o.re.test(rel)) || null;
  };
  const ownedTargetMatch = (abs) => {
    const direct = ownedMatch(abs);
    if (direct) return direct;
    const rel = relToRoot(abs);
    if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
    return ANCESTOR.test(rel) ? { how: OWNED[0].how } : null;
  };

  const a = event.action;
  if (a.type === 'run-command') {
    const sh = a.shell;
    if (!sh) return null;
    for (const t of sh.targets) {
      const hit = ownedTargetMatch(ws.resolveToken(t, event.cwd));
      if (hit) return deny(`Lệnh này ghi/xóa/dời tệp do công cụ docs sở hữu (${t}). ${hit.how}`);
    }
    if (sh.inline.some((i) => i.writes && MENTIONS_OWNED.test(i.code)) || (sh.unparsable && MENTIONS_OWNED.test(a.command))) {
      return deny(`Lệnh này có vẻ ghi vào tệp do công cụ docs sở hữu (mã nội tuyến, hoặc lệnh không phân tích được mà nhắc tới chúng). ${OWNED[0].how}`);
    }
    return null;
  }
  if (!a.file) return null;
  const hit = ownedMatch(a.file);
  if (hit) return deny(`Tệp này do công cụ docs sở hữu, không sửa trực tiếp: ${path.relative(ws.root, a.file).split(path.sep).join('/')}. ${hit.how}`);
  const rel = path.relative(ws.root, a.file).split(path.sep).join('/'); // đường dẫn thật cho lời báo (dạng @unit/ chỉ dùng để so mẫu)
  if (!rel.startsWith('..') && !path.isAbsolute(rel) && writesMermaid(a.file, a.text)) return deny(`Nội dung ghi vào ${rel} có cú pháp Mermaid viết tay. ${MERMAID_HOW}`);
  return null;
}

module.exports = { id: 'owned', on: 'before-action', run };
