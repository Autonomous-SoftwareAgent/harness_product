'use strict';
// spec: MCP-S-003
// Nguồn có cấu trúc của MỘT dịch vụ: <dịch-vụ>/docs/service.yaml. Đây là nguồn duy nhất cho hai thứ sinh ra:
//   - <dịch-vụ>/docs/_generated/overview.md : bản Markdown gọn cho AI agent đọc
//   - docs/portal/<dịch-vụ>/index.html : trang ba tab cho người đọc (khuôn mặc định service-page.js)
// Ba phần khớp ba tab: business (nghiệp vụ), architecture (kiến trúc kỹ thuật), problems + progress (vấn đề và tinh chỉnh).
// Tệp chỉ ghi qua công cụ (MCP bsn-docs: service_doc_set, problem_record), trong giao dịch có khóa của core; hook
// guard-owned chặn sửa tay. Mọi lần ghi đều kiểm lược đồ trước; sai thì ném lỗi và không ghi gì.
const path = require('path');
const core = require('./core');
const yaml = require('../../../core/core/lib/yaml-lite');
const { SCHEMA, SECTIONS, SEVERITY, PROBLEM_STATUS, DEP_KIND, LAYOUT, DIAGRAM_TYPES, ID_RE, PROBLEM_ID_RE, MAX, str, oneOf, id, listOf, obj, uniqueIds, all, line, title, text, lines, diagram, SECTION_CHECK, problem, validate, renderAgentMd: renderAgentMdPure } = require('../../core/docs/service-doc');
const renderAgentMd = (doc) => renderAgentMdPure(doc, { rootName: path.basename(path.resolve(core.BSN_DIR)) });

const file = () => core.at('docs/service.yaml');
const agentMd = () => core.at('docs/_generated/overview.md');
const serviceName = () => core.serviceName();
const today = () => new Date().toISOString().slice(0, 10);

function empty(service = serviceName()) {
  return {
    schema: SCHEMA,
    service,
    title: service,
    summary: '',
    updated: today(),
    business: { goal: '', users: [], value: [], flows: [], out_of_scope: [], unverified: [] },
    architecture: { summary: '', layers: [], components: [], depends_on: [], provides: [], decisions: [] },
    problems: [],
    progress: { done: [], doing: [], next: [] },
  };
}

// ---------- đọc / ghi ----------
// Trả null khi dịch vụ chưa có nguồn. Tệp có mà hỏng thì NÉM LỖI (không coi như chưa có, kẻo ghi đè mất nội dung).
function load() {
  const p = file();
  if (!core.fileExists(p)) return null;
  let doc;
  try {
    doc = yaml.parse(core.readText(p));
  } catch (e) {
    throw new Error(`${core.rel('docs/service.yaml')} của ${serviceName()} không đọc được (${e.message}). Tệp chỉ ghi qua công cụ bsn-docs; khôi phục bằng git hoặc bản sao lưu.`);
  }
  return doc;
}

function save(doc) {
  doc.updated = today();
  const errs = validate(doc);
  if (errs.length) throw new Error(`service.yaml không hợp lệ, KHÔNG ghi:\n  - ${errs.slice(0, 20).join('\n  - ')}${errs.length > 20 ? `\n  ... còn ${errs.length - 20} lỗi` : ''}`);
  if (doc.service !== serviceName()) throw new Error(`service.yaml ghi service='${doc.service}' nhưng đang ở dịch vụ '${serviceName()}'`);
  core.makeDir(path.dirname(agentMd()));
  core.writeText(file(), yaml.stringify(doc));
  core.writeText(agentMd(), renderAgentMd(doc));
}

function setSection({ section, value }) {
  if (!SECTIONS.includes(section)) throw new Error(`section phải là một trong: ${SECTIONS.join(', ')}`);
  const errs = [];
  SECTION_CHECK[section](value, section, errs);
  if (errs.length) throw new Error(`Giá trị của '${section}' không hợp lệ, KHÔNG ghi:\n  - ${errs.slice(0, 20).join('\n  - ')}`);
  const doc = load() || empty();
  if (section === 'meta') { Object.assign(doc, { title: value.title, summary: value.summary }); if (value.first_tab) doc.first_tab = value.first_tab; else delete doc.first_tab; }
  else doc[section] = value;
  save(doc);
  return `Đã ghi phần '${section}' của ${doc.service} vào ${core.rel('docs/service.yaml')} và sinh lại ${core.rel('docs/_generated/overview.md')}. ${core.LAYOUT.local ? 'Trang của dịch vụ cập nhật ở lần dựng cổng kế tiếp (ghi chép tại chỗ, không qua commit).' : 'Trang của dịch vụ cập nhật sau khi repo dịch vụ commit.'}`;
}

function problemRecord({ id: pid, title: t, severity, status, detail, refine, refs }) {
  const doc = load() || empty();
  let p = pid ? doc.problems.find((x) => x.id === pid) : null;
  if (pid && !p) throw new Error(`Không có vấn đề ${pid} trong ${doc.service}. Bỏ 'id' để tạo mới.`);
  if (!p) {
    if (!t) throw new Error('Tạo vấn đề mới cần title');
    const n = Math.max(0, ...doc.problems.map((x) => Number(x.id.slice(2)))) + 1;
    p = { id: `P-${String(n).padStart(3, '0')}`, title: '', severity: 'medium', status: 'open', found: today(), updated: today(), detail: '', refine: '', refs: [] };
    doc.problems.push(p);
  }
  for (const [k, v] of Object.entries({ title: t, severity, status, detail, refine, refs })) if (v !== undefined) p[k] = v;
  p.updated = today();
  save(doc);
  return `Đã ghi vấn đề ${p.id} (${p.status}, ${p.severity}) của ${doc.service}.`;
}

function get() {
  const doc = load();
  if (!doc) return `Dịch vụ ${serviceName()} chưa có ${core.rel('docs/service.yaml')}. Tạo bằng service_doc_set (section: meta, business, architecture, progress) và problem_record.`;
  const errs = validate(doc);
  return `${yaml.stringify(doc)}${errs.length ? `\nKHÔNG HỢP LỆ:\n  - ${errs.join('\n  - ')}` : ''}`;
}

// Dùng trong docs check: [] nếu chưa có nguồn hoặc hợp lệ.
function checkErrors() {
  let doc;
  try { doc = load(); } catch (e) { return [`[service.yaml] ${e.message}`]; }
  if (!doc) return [];
  const errs = validate(doc);
  if (doc.service !== serviceName()) errs.push(`service.yaml ghi service='${doc.service}' nhưng nằm trong dịch vụ '${serviceName()}'`);
  if (!errs.length && (!core.fileExists(agentMd()) || core.readText(agentMd()) !== renderAgentMd(doc))) {
    errs.push(`${core.rel('docs/_generated/overview.md')} không khớp ${core.rel('docs/service.yaml')} (sửa tay? ghi lại bằng service_doc_set)`);
  }
  return errs.map((e) => `[service.yaml] ${e}`);
}

const tx = (reason, fn) => (...args) => core.transaction(reason, () => fn(...args));

module.exports = {
  SCHEMA, SECTIONS, SEVERITY, PROBLEM_STATUS, DEP_KIND, LAYOUT, DIAGRAM_TYPES,
  empty, validate, renderAgentMd, checkErrors, file, agentMd,
  load: tx('service_doc_get', load),
  get: tx('service_doc_get', get),
  setSection: tx('service_doc_set', setSection),
  problemRecord: tx('problem_record', problemRecord),
};
