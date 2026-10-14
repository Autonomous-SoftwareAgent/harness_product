'use strict';
// spec: HOOK-S-003
// Phần "nghĩ" của việc theo dõi tài liệu, dùng chung cho MỌI dịch vụ: tệp vừa đổi thuộc loại nào, phiên còn nợ gì ở cuối lượt.
// Thuần: trạng thái theo phiên và theo dịch vụ lấy và ghi qua cổng store; phép kiểm đồng bộ nhờ qua cổng jobs.
const path = require('node:path');

const SERVICE_RE = /^[a-z][a-z0-9-]{1,40}$/;
const rel = (root, p) => path.relative(root, path.resolve(root, p)).split(path.sep).join('/');

// Phân loại tệp đã đổi, theo TÊN LOGIC của đường dẫn trong service (ws.unitLogical: phần tại chỗ của đơn vị luôn là docs/..., CLAUDE.md
// dù nó nằm ở gốc đơn vị hay trong .harness/; tên bắt đầu bằng './' là tài liệu riêng của repo trùng tên, không phải mã): 'status' | 'decisions' | 'artifact' | 'ignore' | 'code'
function classify(relPath) {
  if (relPath.startsWith('..') || relPath.startsWith('./')) return 'ignore';
  if (relPath === 'docs/agent/STATUS.md') return 'status'; // tên logic
  if (relPath === 'docs/agent/DECISIONS.md') return 'decisions'; // tên logic
  if (relPath.startsWith('docs/') && relPath.includes('/artifacts/') && relPath.endsWith('.html')) return 'artifact';
  if (relPath.startsWith('docs/') || relPath.startsWith('.claude/')) return 'ignore';
  if (relPath === 'CLAUDE.md' || relPath === 'README.md') return 'ignore'; // tên logic: tệp cửa vào của đơn vị, không phải mã
  if (relPath.startsWith('node_modules/') || relPath.startsWith('.git/')) return 'ignore';
  return 'code';
}

// Dịch vụ `name` có hợp lệ và có thư mục không: trả { name, root } hoặc null.
function serviceOrNull(ws, name) {
  if (!SERVICE_RE.test(String(name || ''))) return null;
  const root = ws.serviceDir(name);
  return ws.exists(root) ? { name, root } : null;
}

// Phiên vừa sửa một tệp của dịch vụ: ghi lại loại tệp để cuối lượt biết còn nợ STATUS hay không. Không bao giờ chặn.
async function track(event, service, { workspace: ws, store }) {
  const file = event.action.file;
  if (!file) return;
  const svc = serviceOrNull(ws, service);
  if (!svc) return;
  const r = rel(svc.root, file);
  const kind = classify(ws.unitLogical(svc.name, r));
  if (kind === 'ignore') return;
  const state = await store.docsState(svc.name, event.session);
  if (kind === 'code') {
    state.code = state.code || [];
    if (!state.code.includes(r)) state.code.push(r);
    state.status = false; // sửa code sau khi đã cập nhật STATUS thì STATUS lại cũ
  } else {
    state[kind] = true;
  }
  await store.saveDocsState(svc.name, event.session, state);
}

// Cuối lượt, cho một dịch vụ: trả lời nhắc (chuỗi) khi (a) đã sửa code mà docs/agent/STATUS.md chưa được cập nhật sau lần sửa cuối, hoặc
// (b) phép kiểm đồng bộ design/spec/impl/code báo lệch. Không có gì thì dọn trạng thái và trả ''. Lượt đã bị giữ một lần thì không nhắc lại.
async function wrapUp(event, service, { workspace: ws, store, jobs }) {
  const svc = serviceOrNull(ws, service);
  if (!svc) return '';
  const state = await store.docsState(svc.name, event.session);
  const codeChanged = state.code && state.code.length > 0;
  const problems = [];

  if (codeChanged && !state.status) {
    const statusRel = ws.unitRel(svc.name, 'docs/agent/STATUS.md');
    const files = state.code.slice(0, 10).join(', ') + (state.code.length > 10 ? ', ...' : '');
    problems.push([
      `Code was changed this session (${files}) but ${statusRel} was not updated afterwards.`,
      `Update ${statusRel} (status table, goals, blocked items, add a log row). Also, if applicable:`,
      '- DECISIONS.md for project-wide decisions; module decisions go through the harness docs tool design_record.',
      '- spec/impl via the harness docs tools (spec_fill, impl_link) so the module docs match the code.',
      `- ${ws.unitRel(svc.name, 'docs/service.yaml')} via the harness docs tools (service_doc_set, problem_record) if the business view, architecture, progress or open problems changed; the human-facing HTML portal (docs/portal) is rebuilt from it automatically.`,
    ].join('\n'));
  }

  const r = await jobs.docsCheck(svc.name);
  await jobs.refreshCodeMap(svc.name); // làm mới code-map từ code (bộ sinh riêng của service); lỗi ở đây không chặn việc kết thúc
  // Trang cho người đọc (cổng docs/portal) KHÔNG làm mới ở đây: cổng chỉ hiện bản đã commit, nên nó dựng lại lúc dịch vụ commit (git hook post-commit).
  if (r.failed) {
    problems.push(`docs check failed. Fix with the harness docs tools (spec_fill / impl_link / design_update, pass service="${svc.name}"), then re-check with docs_check:\n${r.text}`);
  }

  if (!problems.length) {
    await store.clearDocsState(svc.name, event.session);
    return '';
  }
  if (event.again) return ''; // đã nhắc một lần trong lượt này: không lặp vô hạn
  return problems.join('\n\n');
}

module.exports = { SERVICE_RE, rel, classify, serviceOrNull, track, wrapUp };
