'use strict';
// spec: CTX-S-001
// Phần AGENT VIẾT cho kho ngữ nghĩa, lưu trong repo của dịch vụ ở docs/context/ (do công cụ sở hữu, hook chặn sửa tay):
//   glossary.yaml   từ vựng nghiệp vụ: lời người nói ứng với vật nào trong mã, kèm bằng chứng (tệp:dòng)
//   relations.yaml  quan hệ máy KHÔNG đọc ra được từ mã (nhập động, tuân thủ lúc chạy), mỗi cái kèm bằng chứng
//   auto.yaml       phần giải thích và kết quả soát của các sơ đồ TỰ SINH (mã bắt đầu bằng "tu-sinh-")
// Mọi mục đều phải trỏ được về tệp có thật; mục không có bằng chứng bị từ chối. Kho (context.js) đọc ba tệp này từ bản ĐÃ COMMIT.
const fs = require('fs');
const path = require('path');
const core = require('../../../servicedocs/mcp/docs/core');
const yaml = require('../../../core/core/lib/yaml-lite');
const specs = require('../../../diagrams/core/diagrams/spec');
const ctx = require('./context');
const auto = require('../../core/context/auto-diagrams');

const dir = () => path.join(core.ROOT, 'docs', 'context');
const fileOf = (name) => path.join(dir(), `${name}.yaml`);
const serviceName = () => core.serviceName();
const today = () => new Date().toISOString().slice(0, 10);
const MAX = { term: 80, means: 400, also: 12, kind: 40, note: 300, evidence: 8 };

function read(name, empty) {
  const p = fileOf(name);
  if (!core.fileExists(p)) return empty;
  try { return yaml.parse(core.readText(p)); } catch (e) { throw new Error(`docs/context/${name}.yaml của ${serviceName()} không đọc được (${e.message}); khôi phục bằng git.`); }
}
function write(name, doc) { core.makeDir(dir()); core.writeText(fileOf(name), yaml.stringify(doc)); }

const oneLine = (v, max, what, errs, { required = true } = {}) => {
  if (typeof v !== 'string') return errs.push(`${what}: phải là chuỗi`);
  if (required && !v.trim()) errs.push(`${what}: không được rỗng`);
  if (/[\r\n]/.test(v)) errs.push(`${what}: phải là một dòng`);
  if (v.length > max) errs.push(`${what}: dài quá ${max} ký tự (đang ${v.length})`);
};
// Bằng chứng: tệp phải có thật trong dịch vụ và dòng phải nằm trong tệp.
function checkEvidence(file, line, what, errs) {
  if (typeof file !== 'string' || !file.trim()) return errs.push(`${what}: thiếu tệp bằng chứng`);
  const abs = path.resolve(core.ROOT, file);
  const rel = path.relative(core.ROOT, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return errs.push(`${what}: tệp bằng chứng phải nằm trong dịch vụ (${file})`);
  if (!fs.existsSync(abs)) return errs.push(`${what}: không có tệp ${file} trong ${serviceName()}`);
  if (!Number.isInteger(line) || line < 1) return errs.push(`${what}: dòng phải là số nguyên từ 1`);
  const n = fs.readFileSync(abs, 'utf8').split('\n').length;
  if (line > n) errs.push(`${what}: ${file} chỉ có ${n} dòng (đang ghi dòng ${line})`);
}
// Nút của kho mà mục này trỏ tới phải có thật (kho dựng từ bản đã commit). Chưa có kho thì báo rõ.
function knownNodes() {
  const all = ctx.loadAll();
  const g = all && all.services[serviceName()];
  if (!g) return null;
  const ids = new Set(g.nodes.map((n) => n.id));
  for (const n of (all.root && all.root.nodes) || []) ids.add(n.id);
  return ids;
}
const fail = (what, errs) => { if (errs.length) throw new Error(`${what} không hợp lệ, KHÔNG ghi:\n  - ${errs.join('\n  - ')}`); };

// ---------- từ vựng nghiệp vụ ----------
function term({ term: t, means, also = [], refs = [], evidence = [] }) {
  const errs = [];
  oneLine(t, MAX.term, 'term', errs); oneLine(means, MAX.means, 'means', errs);
  if (!Array.isArray(also) || also.length > MAX.also) errs.push(`also: danh sách tối đa ${MAX.also} cách gọi khác`); else also.forEach((x, i) => oneLine(x, MAX.term, `also[${i}]`, errs));
  if (!Array.isArray(evidence) || !evidence.length) errs.push('evidence: cần ít nhất một bằng chứng {file, line} (từ vựng không có chỗ chứng minh trong mã hay tài liệu thì không ghi)');
  else if (evidence.length > MAX.evidence) errs.push(`evidence: tối đa ${MAX.evidence}`);
  else evidence.forEach((e, i) => checkEvidence(e && e.file, e && e.line, `evidence[${i}]`, errs));
  const known = knownNodes();
  if (!Array.isArray(refs)) errs.push('refs: phải là danh sách mã nút của kho');
  else if (refs.length && !known) errs.push('refs: chưa có kho ngữ nghĩa để đối chiếu (dựng bằng `node .claude/modules/core/cli/cli.js portal`), hoặc bỏ refs');
  else for (const r of refs) if (!known.has(r)) errs.push(`refs: không có nút '${r}' trong kho (tìm mã nút bằng context_explore)`);
  fail('Mục từ vựng', errs);
  const doc = read('glossary', { schema: 1, terms: [] });
  const key = t.trim().toLowerCase();
  const item = { term: t.trim(), means, also, refs, evidence: evidence.map((e) => ({ file: e.file, line: e.line })), updated: today() };
  const i = doc.terms.findIndex((x) => x.term.toLowerCase() === key);
  if (i >= 0) doc.terms[i] = item; else doc.terms.push(item);
  doc.terms.sort((a, b) => a.term.localeCompare(b.term, 'vi'));
  write('glossary', doc);
  return `Đã ${i >= 0 ? 'cập nhật' : 'ghi'} từ vựng "${item.term}" của ${serviceName()} (${evidence.length} bằng chứng, trỏ tới ${refs.length} nút). Vào kho sau khi repo dịch vụ commit.`;
}
function termRemove({ term: t }) {
  const doc = read('glossary', { schema: 1, terms: [] });
  const n = doc.terms.length;
  doc.terms = doc.terms.filter((x) => x.term.toLowerCase() !== String(t || '').trim().toLowerCase());
  if (doc.terms.length === n) throw new Error(`Không có từ vựng "${t}" trong ${serviceName()}.`);
  write('glossary', doc);
  return `Đã xóa từ vựng "${t}" của ${serviceName()}.`;
}

// ---------- quan hệ bổ sung: thứ máy không đọc ra được ----------
function relate({ from, to, kind, file, line, note = '' }) {
  const errs = [];
  oneLine(kind, MAX.kind, 'kind', errs); oneLine(note, MAX.note, 'note', errs, { required: false });
  const known = knownNodes();
  if (!known) errs.push('chưa có kho ngữ nghĩa để đối chiếu mã nút (dựng bằng `node .claude/modules/core/cli/cli.js portal`)');
  else for (const [k, v] of [['from', from], ['to', to]]) if (typeof v !== 'string' || !known.has(v)) errs.push(`${k}: không có nút '${v}' trong kho (tìm mã nút bằng context_explore)`);
  if (from === to) errs.push('from và to phải khác nhau');
  checkEvidence(file, line, 'bằng chứng', errs);
  fail('Quan hệ bổ sung', errs);
  const doc = read('relations', { schema: 1, relations: [] });
  const item = { from, to, kind: kind.trim(), file, line, note, updated: today() };
  const i = doc.relations.findIndex((x) => x.from === from && x.to === to && x.kind === item.kind);
  if (i >= 0) doc.relations[i] = item; else doc.relations.push(item);
  doc.relations.sort((a, b) => `${a.from}|${a.to}|${a.kind}`.localeCompare(`${b.from}|${b.to}|${b.kind}`));
  write('relations', doc);
  return `Đã ${i >= 0 ? 'cập nhật' : 'ghi'} quan hệ "${item.kind}" ${from} → ${to} của ${serviceName()} (bằng chứng ${file}:${line}). Trong kho, cạnh này mang nhãn "agent khai kèm bằng chứng". Vào kho sau khi repo dịch vụ commit.`;
}

// ---------- sơ đồ tự sinh: giải thích và kết quả soát ----------
// Bản khai báo hiện tại của một sơ đồ tự sinh (dựng từ kho của commit đang đứng). null nếu không có.
function autoSpec(id) {
  const all = ctx.loadAll();
  const g = all && all.services[serviceName()];
  if (!g) return null;
  const d = auto.forService(g).find((x) => x.spec.id === id);
  return d ? d.spec : null;
}
const isAuto = (id) => typeof id === 'string' && id.startsWith(auto.AUTO_PREFIX);
function autoEntry(doc, id) {
  let e = doc.diagrams.find((x) => x.id === id);
  if (!e) { e = { id }; doc.diagrams.push(e); doc.diagrams.sort((a, b) => a.id.localeCompare(b.id)); }
  return e;
}
function autoExplain({ id, explain: input }) {
  const spec = autoSpec(id);
  if (!spec) throw new Error(`Không có sơ đồ tự sinh '${id}' trong kho của ${serviceName()} (xem danh sách bằng diagram_list; kho dựng từ bản đã commit).`);
  const dg = require('../../../diagrams/mcp/diagrams/diagrams');
  const errs = specs.checkExplain(input);
  if (!errs.length) {
    const names = dg.elementNames(spec);
    (input.details || []).forEach((d, i) => { if (!dg.termMatches(d.term, names)) errs.push(`explain.details[${i}].term: '${d.term}' không khớp phần tử nào trên hình`); });
  }
  fail('Phần giải thích', errs);
  const doc = read('auto', { schema: 1, diagrams: [] });
  autoEntry(doc, id).explain = { ...specs.fillExplain(input), basis: dg.contentHash(spec) };
  write('auto', doc);
  return `Đã ghi phần giải thích cho sơ đồ tự sinh '${id}' của ${serviceName()}. Hình đổi sau một commit thì phần này bị đánh dấu "có thể đã cũ". Lên trang sau khi repo dịch vụ commit.`;
}
// Kết quả soát: agent đối chiếu hình với mã rồi xác nhận "đúng", hoặc báo "sai" kèm chỗ sai (thành việc cho phiên harness sửa bộ quét).
function review({ id, verdict, note = '' }) {
  const errs = [];
  if (!['đúng', 'sai'].includes(verdict)) errs.push('verdict: phải là "đúng" hoặc "sai"');
  oneLine(note, MAX.note, 'note', errs, { required: verdict === 'sai' });
  const spec = isAuto(id) ? autoSpec(id) : null;
  if (!spec) errs.push(`id: '${id}' không phải sơ đồ tự sinh đang có của ${serviceName()} (sơ đồ agent khai thì sửa thẳng bằng diagram_save)`);
  fail('Kết quả soát', errs);
  const doc = read('auto', { schema: 1, diagrams: [] });
  autoEntry(doc, id).review = { verdict, note, basis: require('../../../diagrams/mcp/diagrams/diagrams').contentHash(spec), at: today() };
  write('auto', doc);
  return verdict === 'đúng'
    ? `Đã ghi: sơ đồ tự sinh '${id}' của ${serviceName()} được soát là ĐÚNG với mã ở bản này.`
    : `Đã ghi: sơ đồ tự sinh '${id}' của ${serviceName()} bị báo SAI: ${note}. Bộ quét thuộc harness: việc sửa do phiên harness làm (mục này hiện trong portal-status).`;
}

// Tình trạng phần agent viết của MỘT sơ đồ tự sinh so với hình hiện tại: { explain, explainStale, review, reviewStale }.
function autoState(entries, spec) {
  const e = (entries || []).find((x) => x.id === spec.id) || {};
  const basis = require('../../../diagrams/mcp/diagrams/diagrams').contentHash(spec);
  return { explain: e.explain || null, explainStale: !!e.explain && e.explain.basis !== basis, review: e.review || null, reviewStale: !!e.review && e.review.basis !== basis };
}

// docs check: ba tệp phải đọc được và đúng dạng công cụ ghi.
function checkErrors() {
  const out = [];
  for (const name of ['glossary', 'relations', 'auto']) {
    const p = fileOf(name);
    if (!core.fileExists(p)) continue;
    const text = core.readText(p);
    try { if (yaml.stringify(yaml.parse(text)) !== text) out.push(`[context] docs/context/${name}.yaml không đúng dạng công cụ ghi (sửa tay?)`); } catch (e) { out.push(`[context] docs/context/${name}.yaml: ${e.message}`); }
  }
  return out;
}

const tx = (reason, fn) => (...args) => core.transaction(reason, () => fn(...args));
module.exports = {
  isAuto, autoSpec, autoState, checkErrors, dir, fileOf,
  term: tx('context_term', term), termRemove: tx('context_term', termRemove), relate: tx('context_relate', relate),
  autoExplain: tx('diagram_explain', autoExplain), review: tx('diagram_review', review),
};
