'use strict';
// spec: CTX-S-002
// Cầu nối giữa kho ngữ nghĩa và cổng: mỗi lần dựng cổng (sau mỗi commit) thì
//   1. dựng lại kho (context.js; dùng lại nếu commit và bộ dựng không đổi),
//   2. sinh các sơ đồ tự sinh của từng dịch vụ và bản đồ cả hệ thành dữ liệu cho trang (cùng khung xem với sơ đồ agent khai),
//   3. so với lần dựng trước để biết sơ đồ nào MỚI hoặc ĐỔI, ghi vào danh sách chờ agent viết giải thích và soát,
//   4. ghi bản Markdown gọn cho agent (docs/portal/_context/<dịch-vụ>.md).
// Mọi thứ ghi ra đều nằm trong docs/portal/_context/ (sinh tự động, dựng lại được). Không ghi gì vào repo của dịch vụ.
const fs = require('fs');
const path = require('path');
const ctx = require('./context');
const auto = require('../../core/context/auto-diagrams');
const mermaid = require('../../adapters/mermaid/render');
const compact = require('../../core/diagrams/compact');

const CONFIG = path.join(__dirname, '..', 'context.config.json');
// Hai công tắc đưa tầng này tới các phiên dịch vụ, mặc định TẮT cho tới khi người dùng bật:
//   notify:    nhắc phiên đang làm dịch vụ khi sơ đồ tự sinh của dịch vụ đó đổi (cần viết giải thích, soát)
//   advertise: tóm tắt đầu phiên nhắc mọi phiên hỏi context_explore trước khi Grep
function config() {
  try { return { notify: false, advertise: false, ...JSON.parse(fs.readFileSync(CONFIG, 'utf8')) }; } catch { return { notify: false, advertise: false }; }
}
const readJson = (file, dflt) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return dflt; } };
function writeIfChanged(file, content) {
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === content) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, file);
  return true;
}
const hashOf = (spec) => require('../diagrams/diagrams').contentHash(spec);

// Dữ liệu một sơ đồ tự sinh cho khung xem (diagram-view.figure): hình, nguồn gốc, phần agent viết đã commit và tình trạng của nó.
function figureData(d, entries) {
  const st = require('./annotations').autoState(entries, d.spec);
  return { id: d.spec.id, title: d.spec.title, tab: 'architecture', type: d.spec.type, sources: d.spec.sources, mermaid: mermaid.render(d.spec), origin: d.origin,
    explain: st.explain, explainStale: st.explainStale, review: st.review, reviewStale: st.reviewStale, hash: hashOf(d.spec), spec: d.spec, detail: d.detail };
}

// Danh sách chờ của một dịch vụ: sơ đồ tự sinh chưa có giải thích khớp hình hoặc chưa được soát ở bản hiện tại, kèm vì sao.
// So với dấu của lần dựng trước để nói rõ "mới" hay "đổi" và đổi bao nhiêu dòng.
function pendingOf(name, figures, commit) {
  const stateFile = path.join(ctx.OUT(), `${name}.state.json`);
  const prev = readJson(stateFile, { diagrams: {} });
  const now = { commit, diagrams: {} };
  const pending = [];
  for (const f of figures) {
    const old = prev.diagrams[f.id];
    const lines = compact.lines(f.spec).map((l) => l.trim());
    const changed = old && old.hash !== f.hash;
    // Ghi nhớ thay đổi gần nhất cho tới khi agent xử lý xong (không mất khi có thêm commit không đổi hình).
    let change = old && old.change ? old.change : null;
    if (!old) change = { kind: 'mới', added: lines.length, removed: 0, commit };
    else if (changed) { const before = new Set(old.lines || []); const after = new Set(lines); change = { kind: 'đổi', added: lines.filter((l) => !before.has(l)).length, removed: (old.lines || []).filter((l) => !after.has(l)).length, commit, addedLines: lines.filter((l) => !before.has(l)).slice(0, 30), removedLines: (old.lines || []).filter((l) => !after.has(l)).slice(0, 30) }; }
    const needExplain = !f.explain || f.explainStale;
    const needReview = !f.review || f.reviewStale;
    if (!needExplain && !needReview) change = null;
    now.diagrams[f.id] = { hash: f.hash, lines, ...(change ? { change } : {}) };
    if (needExplain || needReview) pending.push({ id: f.id, title: f.title, kind: change ? change.kind : 'chờ', added: change ? change.added : 0, removed: change ? change.removed : 0, needExplain, needReview, addedLines: (change && change.addedLines) || [], removedLines: (change && change.removedLines) || [] });
  }
  writeIfChanged(stateFile, JSON.stringify(now));
  writeIfChanged(path.join(ctx.OUT(), `${name}.pending.json`), JSON.stringify({ service: name, commit, pending }));
  return pending;
}

// Một dòng thông báo cho phiên đang làm dịch vụ (dùng ở hook). Rỗng nếu không có gì chờ hoặc thông báo đang tắt.
function noticeFor(name, { force = false } = {}) {
  if (!force && !config().notify) return '';
  const p = readJson(path.join(ctx.OUT(), `${name}.pending.json`), null);
  if (!p || !p.pending.length) return '';
  const parts = p.pending.map((x) => `${x.id} (${x.kind === 'đổi' ? `đổi: +${x.added} dòng, -${x.removed} dòng` : x.kind === 'mới' ? 'mới' : 'chưa xong'}; cần ${[x.needExplain ? 'giải thích' : '', x.needReview ? 'soát' : ''].filter(Boolean).join(' và ')})`);
  return `Sơ đồ tự sinh của ${name} chờ bạn: ${parts.join('; ')}. Đọc bằng diagram_get, ghi bằng diagram_explain và diagram_review (skill diagrams).`;
}

// Bản Markdown gọn cho agent đọc lướt đầu phiên: kho có gì, các sơ đồ tự sinh ở dạng gọn, cách hỏi.
function agentMd(g, figures) {
  const by = {};
  for (const n of g.nodes) by[n.type] = (by[n.type] || 0) + 1;
  const out = [`<!-- SINH TỰ ĐỘNG từ kho ngữ nghĩa (commit ${String(g.commit).slice(0, 7)} của ${g.name}). Không sửa tay. -->`, `# ${g.title} (${g.name}): kho ngữ nghĩa`, '',
    'Hỏi kho bằng công cụ `context_explore` (một từ, một mã, một tên tệp, hoặc một câu) trước khi Grep. Bản này chỉ để đọc lướt.', '',
    `Kho có: ${Object.entries(by).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${n} ${ctx.TYPES[t]}`).join(', ')}; ${g.edges.length} quan hệ.`];
  if (g.externals && g.externals.length) out.push(`Thư viện ngoài được nhập trong mã: ${g.externals.join(', ')}.`);
  if (g.dark.length) out.push('', '## Vùng tối (kho không thấy)', ...g.dark.map((d) => `- ${d}`));
  for (const f of figures) out.push('', `## ${f.title}`, '```', compact.compact(f.spec, { origin: f.origin }), ...(f.detail ? [`${f.detail.title}:`, ...f.detail.lines.map((l) => `  ${l}`)] : []), '```');
  return `${out.join('\n')}\n`;
}

// Gọi một lần ở đầu mỗi lần dựng cổng. Lỗi của kho không làm hỏng cổng: ghi vào notes và trả phần dựng được.
function prepare(notes = []) {
  let all;
  try { all = ctx.buildAll(); } catch (e) { notes.push(`kho ngữ nghĩa không dựng được: ${e.message}`); return { all: null, figures: () => [], system: null, pending: () => [] }; }
  const figs = new Map(); const pend = new Map();
  for (const [name, g] of Object.entries(all.services)) {
    try {
      const list = auto.forService(g).map((d) => figureData(d, g.auto));
      figs.set(name, list);
      pend.set(name, pendingOf(name, list, g.commit));
      writeIfChanged(path.join(ctx.OUT(), `${name}.md`), agentMd(g, list));
    } catch (e) { notes.push(`sơ đồ tự sinh của ${name} lỗi: ${e.message}`); figs.set(name, []); }
  }
  let system = null;
  try { const s = auto.forSystem(all); if (s) system = figureData(s, []); } catch (e) { notes.push(`bản đồ cả hệ lỗi: ${e.message}`); }
  return { all, figures: (name) => figs.get(name) || [], system, pending: (name) => pend.get(name) || [] };
}

module.exports = { prepare, noticeFor, config, pendingOf, agentMd, figureData, CONFIG };
