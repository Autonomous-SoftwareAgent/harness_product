'use strict';
// spec: PORT-S-001
// Trang ba tab MẶC ĐỊNH của một dịch vụ: docs/portal/<dịch-vụ>/index.html (Nghiệp vụ / Kiến trúc kỹ thuật / Vấn đề và tinh chỉnh).
// Trang là CỦA DỊCH VỤ: nội dung lấy từ bản ĐÃ COMMIT của repo dịch vụ (docs/service.yaml, docs/diagrams/*.yaml, STATUS.md,
// DECISIONS.md, traceability.md). Trang tổng (portal.js) không vẽ, không tổng hợp gì; nó chỉ dẫn liên kết tới đây.
// Dịch vụ muốn trang khác hẳn thì đặt bộ sinh riêng ở generators/<dịch-vụ>/gen-service-page.js (portal.js gọi thay khuôn này).
//
// Sơ đồ trong trang có hai nguồn, khuôn này KHÔNG tự bố trí sơ đồ nào:
//   - mảnh HTML do bộ sinh riêng của dịch vụ tạo: docs/portal/<dịch-vụ>/_parts/{business,architecture,problems}.html, nhúng nguyên vào tab cùng tên
//     (mảnh có thể chứa <pre class="mermaid"> của chính bộ sinh; trang vẽ chúng bằng cùng thư viện)
//   - bản khai báo đã commit ở docs/diagrams/*.yaml, công cụ chuyển thành Mermaid (diagrams.js); đặt ở tab ghi trong bản khai báo
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const yaml = require('../../../core/core/lib/yaml-lite');
const core = require('../../../servicedocs/mcp/docs/core');
const serviceDoc = require('../../../servicedocs/mcp/docs/service-doc');
const diagrams = require('../../../diagrams/mcp/diagrams/diagrams');
const view = require('../../../diagrams/adapters/mermaid/view');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const OUT = () => path.join(core.BSN_DIR, 'docs', 'portal');
const TABS = [['business', 'Nghiệp vụ'], ['architecture', 'Kiến trúc kỹ thuật'], ['problems', 'Vấn đề và tinh chỉnh']];
const STATUS_LABEL = { open: 'Đang mở', refining: 'Đang tinh chỉnh', resolved: 'Đã xử lý' };
const SEVERITY_LABEL = { high: 'Cao', medium: 'Vừa', low: 'Thấp' };
const KIND_LABEL = { service: 'Dịch vụ', external: 'Bên ngoài', infra: 'Hạ tầng' };
const kindLabel = (kind, ctx) => (kind === 'service' && ctx && ctx.project ? `Dịch vụ ${ctx.project}` : KIND_LABEL[kind]);
const brandOf = (ctx) => `Cổng ${esc((ctx && ctx.project) || '')}`.trim();

// ---------- thu thập ----------

// Markdown một dòng -> HTML an toàn: thoát mọi thứ, rồi chỉ dựng lại `mã`, **đậm**; liên kết [chữ](đích) giữ phần chữ.
function inline(md) {
  let s = esc(String(md).replace(/\[([^\]]+)\]\([^)]*\)/g, '$1'));
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  return s;
}

function section(text, re) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex((l) => /^## /.test(l) && re.test(l));
  if (start < 0) return [];
  const end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  return lines.slice(start + 1, end < 0 ? undefined : end);
}

function parseStatus(text) {
  if (!text) return null;
  const updated = (/Cập nhật lần cuối:\s*(\d{4}-\d{2}-\d{2})/.exec(text) || [])[1] || '';
  const phase = section(text, /giai đoạn/i).join(' ').trim();
  const goals = section(text, /mục tiêu/i).map((l) => /^- \[([ xX])\]\s*(.*)$/.exec(l)).filter(Boolean).map((m) => ({ done: m[1] !== ' ', text: m[2] }));
  const blocked = section(text, /đang dở|bị chặn|việc tiếp/i).map((l) => /^- (.*)$/.exec(l)).filter(Boolean).map((m) => m[1]);
  return { updated, phase, goals, blocked };
}

function parseDecisions(text) {
  if (!text) return [];
  const out = [];
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  lines.forEach((l, i) => {
    const m = /^## (D-\d{3}):\s*(.*)$/.exec(l);
    if (!m) return;
    const body = [];
    for (let j = i + 1; j < lines.length && !/^## /.test(lines[j]); j++) body.push(lines[j]);
    const field = (re) => ((body.map((b) => re.exec(b)).find(Boolean) || [])[1] || '').trim();
    out.push({ id: m[1], title: m[2].trim(), status: field(/^- Trạng thái:\s*(.*)$/), date: field(/^- Ngày:\s*(.*)$/), decision: field(/^- Quyết định:\s*(.*)$/) });
  });
  return out;
}

// ---------- đọc từ git: cổng CHỈ hiện nội dung ĐÃ COMMIT ----------
// Mỗi dịch vụ là một repo riêng và commit độc lập; cổng phản ánh commit mới nhất (HEAD) của từng repo, không đọc tệp đang sửa trên đĩa.
// Việc đang dở chỉ lên cổng khi repo đó commit. Tệp chưa commit được ĐẾM để gắn nhãn, nội dung của chúng không được đọc.
function git(dir, args) {
  const r = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', timeout: 15000, windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  return r.status === 0 && !r.error ? r.stdout : null;
}

// Thông tin commit của MỘT dịch vụ: thư mục là gốc của một repo, hoặc một thư mục con đã có tệp được commit trong repo chứa nó. null nếu chưa có commit hay không phải repo.
function repoInfo(dir) {
  const top = git(dir, ['rev-parse', '--show-toplevel']);
  if (top === null) return null;
  // Thư mục con của một repo (đơn vị nằm trong repo gốc): chỉ tính commit và tệp dở CỦA thư mục đó. Chưa có commit nào chạm tới nó thì null.
  const nested = path.resolve(top.trim()).toLowerCase() !== path.resolve(dir).toLowerCase();
  const only = nested ? ['--', '.'] : [];
  const line = git(dir, ['log', '-1', '--format=%H%x09%h%x09%cI%x09%s', ...only]);
  if (!line || !line.trim()) return null;
  const [sha, short, date, ...subject] = line.trim().split('\t');
  const dirty = (git(dir, ['status', '--porcelain', ...only]) || '').split('\n').filter(Boolean).length;
  return { sha, short, date: date.slice(0, 10), subject: subject.join('\t'), dirty };
}

const show = (dir, rel) => git(dir, ['show', `HEAD:./${rel}`]); // "./": tính từ thư mục của dịch vụ, đúng cả khi nó là thư mục con trong repo

// Bảng theo dõi ba tầng đã commit (docs/_generated/traceability.md) -> tóm tắt theo module.
function parseTraceability(text) {
  if (!text) return [];
  const out = [];
  let cur = null;
  for (const l of text.replace(/\r\n/g, '\n').split('\n')) {
    const h = /^## (.+)$/.exec(l);
    if (h) { cur = { module: h[1].trim(), total: 0, done: 0, deviated: 0, issues: 0 }; out.push(cur); continue; }
    if (!cur || !/^\|\s*[A-Z][A-Z0-9]*-D-\d{3}\s*\|/.test(l)) continue;
    const c = l.split('|').map((x) => x.trim());
    cur.total++;
    if (c[6] === 'done') cur.done++;
    if (c[6] === 'deviated') cur.deviated++;
    cur.issues += Number(c[8]) || 0;
  }
  return out.filter((m) => m.total);
}

// Sơ đồ đã commit của dịch vụ: docs/diagrams/<id>.yaml -> [{ id, title, tab, mermaid } | { id, error }].
function committedDiagrams(src) {
  const names = src.list('docs/diagrams').filter((n) => n.endsWith('.yaml'));
  return names.sort().map((n) => diagrams.fromText(path.basename(n, '.yaml'), src.show(`docs/diagrams/${n}`) || ''));
}

// NGUỒN GHI CHÉP của một đơn vị, hỏi bằng TÊN LOGIC: bản đã commit (HEAD) của repo đơn vị, hoặc đĩa khi đơn vị khai ghi chép tại chỗ
// (không vào git). Chỗ thật của từng tệp do bố cục của đơn vị quyết (gate-paths).
//   show(tên logic) -> văn bản | null;  list(thư mục logic) -> [tên tệp];  real(tên logic) -> đường dẫn thật trong đơn vị
function unitSource(name, dir) {
  const P = require('../../../core/gate/gate-paths');
  const layout = P.unitLayout(core.BSN_DIR, name);
  const real = (logical) => P.unitRealRel(layout, logical);
  const abs = (logical) => path.join(dir, ...real(logical).split('/'));
  if (layout.local) {
    return { local: true, real,
      show: (logical) => { try { return fs.readFileSync(abs(logical), 'utf8'); } catch { return null; } },
      list: (logical) => { try { return fs.readdirSync(abs(logical)); } catch { return []; } } };
  }
  return { local: false, real,
    show: (logical) => show(dir, real(logical)),
    list: (logical) => (git(dir, ['ls-tree', '--name-only', 'HEAD', `${real(logical)}/`]) || '').split('\n').map((n) => path.posix.basename(n.trim())).filter(Boolean) };
}

function collectService(name) {
  const dir = core.dirOf(name);
  const s = { name, doc: null, docError: null, status: null, decisions: [], check: null, modules: [], diagrams: [], hasDetail: false, parts: {}, commit: repoInfo(dir) };
  const src = unitSource(name, dir);
  s.docsRel = src.real('docs');
  // Ghi chép tại chỗ: trang dựng từ đĩa, kể cả khi repo của đơn vị chưa có commit nào.
  if (src.local) s.commit = { ...(s.commit || { sha: '', short: '', date: '', subject: '', dirty: 0 }), local: true };
  if (s.commit) {
    const y = src.show('docs/service.yaml');
    if (y !== null) {
      try {
        s.doc = yaml.parse(y);
        const errs = serviceDoc.validate(s.doc);
        if (errs.length) { s.docError = `service.yaml không hợp lệ: ${errs.slice(0, 3).join('; ')}`; s.doc = null; }
      } catch (e) { s.docError = e.message; s.doc = null; }
    }
    s.hasSource = y !== null;
    s.status = parseStatus(src.show('docs/agent/STATUS.md'));
    s.decisions = parseDecisions(src.show('docs/agent/DECISIONS.md'));
    s.diagrams = committedDiagrams(src);
    const trace = src.show('docs/_generated/traceability.md');
    if (trace !== null) {
      s.modules = parseTraceability(trace);
      s.check = { issues: s.modules.reduce((n, m) => n + m.issues, 0) };
    }
  }
  s.title = (s.doc && s.doc.title) || name;
  s.summary = (s.doc && s.doc.summary) || (s.status && s.status.phase) || '';
  s.updated = (s.doc && s.doc.updated) || (s.status && s.status.updated) || '';
  s.problems = s.doc ? s.doc.problems : [];
  s.openProblems = s.problems.filter((p) => p.status !== 'resolved').length;
  s.hasDetail = fs.existsSync(path.join(OUT(), name, 'overview.html'));
  for (const [tab] of TABS) {
    const part = path.join(OUT(), name, '_parts', `${tab}.html`);
    if (fs.existsSync(part)) s.parts[tab] = fs.readFileSync(part, 'utf8');
  }
  return s;
}

// ---------- khung trang ----------
// ctx: { services: [{ name, title }] các dịch vụ CÓ trang (cho ô chuyển dịch vụ), mermaid: có thư viện Mermaid trong assets hay không }
function page({ title, body, ctx, current }) {
  const opts = ctx.services.map((s) => `<option value="${esc(s.name)}"${s.name === current ? ' selected' : ''}>${esc(s.title)}</option>`).join('');
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · ${brandOf(ctx)}</title>
<link rel="stylesheet" href="../assets/portal.css">
</head>
<body data-prefix="../">
<header class="top">
  <a class="brand" href="../index.html">← ${brandOf(ctx)}</a>
  <span class="main"></span>
  <label class="switch">Dịch vụ
    <select id="svc-switch" aria-label="Chuyển sang dịch vụ"><option value="">Chọn…</option>${opts}</select>
  </label>
  <button id="theme" type="button" class="ghost" aria-label="Đổi giao diện sáng/tối">◐</button>
</header>
<main>
${body}
</main>
<footer class="foot">Trang của dịch vụ, sinh từ bản đã commit của repo dịch vụ. Không sửa tay; sửa nguồn (công cụ harness) rồi commit.</footer>
${ctx.mermaid ? '<script src="../assets/mermaid.min.js"></script>\n' : ''}<script src="../assets/portal.js"></script>
</body>
</html>
`;
}

const chip = (cls, text) => `<span class="chip ${cls}">${esc(text)}</span>`;
const list = (xs, f = inline) => (xs.length ? `<ul>${xs.map((x) => `<li>${f(x)}</li>`).join('')}</ul>` : '<p class="muted">Chưa ghi.</p>');
const table = (heads, rows) => (rows.length
  ? `<div class="scroll"><table><thead><tr>${heads.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
  : '<p class="muted">Chưa ghi.</p>');
const paths = (xs) => xs.map((p) => `<code>${esc(p)}</code>`).join(' ');
const para = (t) => String(t).split(/\n{2,}/).map((p) => `<p>${inline(p).replace(/\n/g, '<br>')}</p>`).join('');

function checkChip(s) {
  if (!s.commit) return chip('neutral', 'Chưa có commit');
  if (!s.check) return chip('neutral', 'Chưa dùng tài liệu ba tầng');
  return s.check.issues ? chip('bad', `Tài liệu ba tầng: ${s.check.issues} vấn đề đồng bộ`) : chip('good', 'Tài liệu ba tầng: đồng bộ');
}

// Dòng nói rõ trang đang phản ánh commit nào, và có bao nhiêu tệp đang sửa chưa lên cổng.
function commitLine(c) {
  if (!c) return '<span class="muted small">chưa có commit nào</span>';
  if (c.local) return '<span class="muted small">ghi chép tại chỗ của đơn vị, đọc từ đĩa (không qua commit)</span>';
  return `<span class="muted small">theo commit <code>${esc(c.short)}</code> (${esc(c.date)}): ${esc(c.subject.length > 90 ? `${c.subject.slice(0, 90)}…` : c.subject)}</span>` +
    (c.dirty ? chip('warn', `${c.dirty} tệp chưa commit, chưa lên cổng`) : '');
}

// Một sơ đồ: văn bản Mermaid do công cụ sinh, đặt trong khung xem chung (diagram-view.js: nút thu phóng, kích thước thật, phần giải thích).
// Chưa có thư viện thì người đọc vẫn thấy văn bản sơ đồ kèm lời giải thích, không phải ô trống.
function figure(d) {
  if (d.error) return `<p class="callout warn" id="dg-${esc(d.id)}">Sơ đồ <code>${esc(d.id)}</code> không dựng được: ${esc(d.error)}</p>`;
  return view.figure(d);
}
// Mảnh HTML do bộ sinh riêng của dịch vụ tạo cho một tab (đã được người dùng duyệt): nhúng nguyên, không vẽ lại.
const ownPart = (s, tab) => (s.parts[tab] ? `<div class="svc-part">${s.parts[tab]}</div>` : '');
// Sơ đồ dữ liệu và sơ đồ lớp có mục riêng trong tab Kiến trúc (typedSection), nên không lẫn vào danh sách chung.
const OWN_SECTION = ['erd', 'class'];
const figures = (s, tab) => s.diagrams.filter((d) => (d.error ? tab === 'architecture' : d.tab === tab && !OWN_SECTION.includes(d.type))).map(figure).join('\n');

// ---------- đủ bộ sơ đồ: mỗi dịch vụ cần đủ mọi loại (thiếu thì trang nói rõ, không chặn gì) ----------
const diagramNa = (s) => (s.doc && s.doc.architecture && s.doc.architecture.diagram_na) || [];
const coverageOf = (s) => diagrams.coverage(s.diagrams.filter((d) => !d.error), diagramNa(s));
function coverageHtml(s) {
  const cov = coverageOf(s);
  const chips = cov.map((c) => (c.count ? chip('good', `${c.label}: ${c.count}`) : c.na ? chip('neutral', `${c.label}: không áp dụng`) : chip('bad', `${c.label}: CHƯA CÓ`))).join('');
  const missing = cov.filter((c) => c.missing).length;
  return `<p class="chips" id="bo-so-do"><span class="muted small">Bộ sơ đồ (${cov.length} loại):</span>${chips}${missing ? `<span class="muted small">còn thiếu ${missing} loại</span>` : ''}</p>`;
}
const TYPED = {
  erd: { title: 'Dữ liệu', what: 'sơ đồ dữ liệu', intro: 'Dịch vụ lưu gì, ở bảng nào, bảng nào nối với bảng nào, khóa nào chống trùng.',
    how: 'Cơ sở dữ liệu quan hệ thì sinh từ cơ sở dữ liệu thật bằng <code>diagram_generate</code>; phần mô hình nằm trong cột JSON hay trong mã thì khai bằng <code>diagram_save</code> (<code>type: erd</code>).' },
  class: { title: 'Kiểu và giao diện', what: 'sơ đồ lớp', intro: 'Các kiểu, module và giao diện trong mã, và quan hệ giữa chúng (chứa, cài đặt, dùng).',
    how: 'Khai bằng <code>diagram_save</code> (<code>type: class</code>).' },
};
// Mục riêng của một loại sơ đồ trong tab Kiến trúc. draw(d) vẽ một sơ đồ; heading/sub là thẻ tiêu đề của trang gọi.
function typedSection(s, type, { draw = figure, heading = 'h3', sub = 'h4' } = {}) {
  const t = TYPED[type];
  const ds = s.diagrams.filter((d) => !d.error && d.type === type);
  const na = diagramNa(s).find((x) => x.type === type);
  const body = ds.length ? ds.map((d) => `<${sub}>${esc(d.title)}</${sub}>\n${draw(d)}`).join('\n')
    : na ? `<p class="muted">Không áp dụng cho dịch vụ này: ${inline(na.reason)}</p>`
      : `<p class="callout warn">Chưa có ${t.what}. ${t.how}</p>`;
  return `<${heading} id="sec-${type}">${t.title}</${heading}>\n<p class="muted">${t.intro}</p>\n${body}`;
}
const typedSections = (s, opts) => OWN_SECTION.map((type) => typedSection(s, type, opts)).join('\n');

// Mục "Sơ đồ tự sinh từ mã": harness quét mã sau mỗi commit và vẽ; không ai khai. s.auto do context-portal.js chuẩn bị.
const AUTO_INTRO = 'Harness tự quét mã của bản đã commit và vẽ các sơ đồ dưới đây; không ai khai chúng. Máy chỉ thấy lệnh nhập viết rõ trong mã: nhập theo tên tính lúc chạy và lời gọi qua mạng không có trên hình. Agent viết phần giải thích và soát lại với mã.';
function autoSection(s, { heading = 'h3', sub = 'h4', draw } = {}) {
  const list = s.auto || [];
  if (!list.length) return '';
  const fig = draw || ((d) => view.figure(d, { caption: false }));
  return `<${heading} id="sec-auto">Sơ đồ tự sinh từ mã</${heading}>\n<p class="muted">${AUTO_INTRO}</p>\n${list.map((d) => `<${sub}>${esc(d.title)}</${sub}>\n${fig(d)}`).join('\n')}`;
}

// ---------- trang ba tab của dịch vụ ----------
function businessTab(s) {
  if (!s.doc) return noSource(s);
  const b = s.doc.business;
  return `${b.goal ? `<h3>Mục tiêu</h3>${para(b.goal)}` : ''}
<h3>Người dùng và nhu cầu</h3>${table(['Ai', 'Cần gì'], b.users.map((u) => [inline(u.who), inline(u.need)]))}
<h3>Giá trị mang lại</h3>${list(b.value)}
<h3>Luồng chính</h3>${b.flows.length ? b.flows.map((f) => `<div class="flow" id="flow-${esc(f.id)}"><h4>${inline(f.title)}</h4><ol>${f.steps.map((x) => `<li>${inline(x)}</li>`).join('')}</ol></div>`).join('') : '<p class="muted">Chưa ghi.</p>'}
<h3>Ngoài phạm vi</h3>${list(b.out_of_scope)}
<h3>Chưa kiểm với hệ thống thật</h3>
${b.unverified.length ? `<div class="callout warn"><p>Các điều dưới đây mới là giả định theo tài liệu hoặc mô phỏng, chưa thử với hệ thống thật:</p>${list(b.unverified)}</div>` : '<p class="muted">Chưa ghi.</p>'}`;
}

function architectureTab(s, ctx) {
  const names = new Set(ctx.services.map((x) => x.name));
  const svcLink = (label) => (names.has(label) ? `<a href="../${esc(label)}/index.html#architecture">${esc(label)}</a>` : esc(label));
  const modules = s.modules.length ? `<h3>Tài liệu ba tầng theo module</h3>
${table(['Module', 'Số mục', 'Đã làm xong', 'Lệch spec', 'Vấn đề đồng bộ'], s.modules.map((m) => [`<code>${esc(m.module)}</code>`, String(m.total), String(m.done), String(m.deviated), m.issues ? chip('bad', String(m.issues)) : chip('good', '0')]))}
<p class="muted small">Chi tiết cho agent: <code>${esc(s.name)}/${esc(s.docsRel || 'docs')}/modules/&lt;module&gt;/{1-design,2-spec,3-impl}.md</code>.</p>` : '';
  const detail = s.hasDetail ? `<p class="callout"><a href="overview.html">Mở trang chi tiết kỹ thuật</a> (sinh từ mã thật của dịch vụ: luồng xử lý, bảng mã, kết quả test).</p>` : '';
  // Sơ đồ do bộ sinh riêng của dịch vụ tạo (HTML/CSS của chính nó, đã được người dùng duyệt): nhúng nguyên, không vẽ lại.
  const own = ownPart(s, 'architecture');
  const drawn = `${coverageHtml(s)}${own}${figures(s, 'architecture')}\n${typedSections(s, { draw: (d) => view.figure(d, { caption: false }) })}\n${autoSection(s)}`;
  if (!s.doc) return `${noSource(s)}${detail}${drawn}${modules}${decisionList(s)}`;
  const a = s.doc.architecture;
  return `${detail}${a.summary ? para(a.summary) : ''}
${drawn}
<h3>Các lớp</h3>${table(['Lớp', 'Vai trò', 'Nằm ở'], a.layers.map((l) => [`<strong>${inline(l.title)}</strong><br><code class="id">${esc(l.id)}</code>`, inline(l.role), paths(l.paths)]))}
<h3>Thành phần</h3>${table(['Thành phần', 'Lớp', 'Vai trò', 'Nằm ở'], a.components.map((c) => [`<strong>${inline(c.title)}</strong><br><code class="id">${esc(c.id)}</code>`, esc(c.layer || ''), inline(c.role), paths(c.paths)]))}
<h3>Phụ thuộc vào</h3>${table(['Bên kia', 'Loại', 'Qua', 'Để làm gì'], a.depends_on.map((d) => [svcLink(d.target), esc(kindLabel(d.kind, ctx)), esc(d.via), inline(d.purpose)]))}
<h3>Cung cấp cho</h3>${table(['Bên dùng', 'Qua', 'Cung cấp gì'], a.provides.map((p) => [svcLink(p.to), esc(p.via), inline(p.purpose)]))}
${modules}
${a.decisions.length ? `<h3>Quyết định liên quan</h3><ul>${a.decisions.map((d) => `<li>${s.decisions.some((x) => x.id === d.id) ? `<a href="#${esc(d.id)}">${esc(d.id)}</a>` : `<code>${esc(d.id)}</code>`}: ${inline(d.title)}</li>`).join('')}</ul>` : ''}
${decisionList(s)}`;
}

// Quyết định của dịch vụ (docs/agent/DECISIONS.md), nằm ngay trong trang dịch vụ; mỗi mã là một neo #D-nnn.
function decisionList(s) {
  if (!s.decisions.length) return '';
  return `<h3>Quyết định của dịch vụ (${s.decisions.length})</h3>
${table(['Mã', 'Quyết định', 'Trạng thái', 'Ngày'], s.decisions.map((d) => [`<span id="${d.id}">${d.id}</span>`, `<details><summary>${inline(d.title)}</summary>${d.decision ? `<p>${inline(d.decision)}</p>` : ''}</details>`, inline(d.status.split(/[;.]/)[0]), esc(d.date)]))}`;
}

function problemsTab(s) {
  const st = s.status;
  const fromStatus = st && (st.goals.length || st.blocked.length) ? `<h3>Theo STATUS.md của dịch vụ</h3>
${st.goals.length ? `<p>Mục tiêu: ${st.goals.filter((g) => g.done).length}/${st.goals.length} đã xong.</p><ul class="checks">${st.goals.map((g) => `<li class="${g.done ? 'done' : 'todo'}">${inline(g.text)}</li>`).join('')}</ul>` : ''}
${st.blocked.length ? `<details${s.doc ? '' : ' open'}><summary>Việc đang dở hoặc bị chặn (${st.blocked.length})</summary>${list(st.blocked)}</details>` : ''}` : '';
  if (!s.doc) return `${noSource(s)}${fromStatus}`;
  const pg = s.doc.progress;
  const live = s.problems.filter((p) => p.status !== 'resolved');
  const closed = s.problems.filter((p) => p.status === 'resolved');
  const card = (p) => `<article class="problem" id="${p.id}">
<h4><a href="#${p.id}">${p.id}</a> ${inline(p.title)}</h4>
<p class="chips">${chip(`st-${p.status}`, STATUS_LABEL[p.status])}${chip(`sev-${p.severity}`, `Mức độ: ${SEVERITY_LABEL[p.severity]}`)}<span class="muted small">phát hiện ${esc(p.found)} · cập nhật ${esc(p.updated)}</span></p>
${p.detail ? `<h5>Vấn đề</h5>${para(p.detail)}` : ''}${p.refine ? `<h5>Tinh chỉnh</h5>${para(p.refine)}` : ''}
${p.refs.length ? `<p class="small">Tham chiếu: ${p.refs.map((r) => `<code>${esc(r)}</code>`).join(' ')}</p>` : ''}</article>`;
  return `<h3>Tiến độ</h3>
<div class="cols">
  <div><h4>Đã xong (${pg.done.length})</h4>${list(pg.done)}</div>
  <div><h4>Đang làm (${pg.doing.length})</h4>${list(pg.doing)}</div>
  <div><h4>Tiếp theo (${pg.next.length})</h4>${list(pg.next)}</div>
</div>
<h3>Vấn đề chưa xong (${live.length})</h3>
${live.length ? live.map(card).join('\n') : '<p class="muted">Không có vấn đề nào đang mở.</p>'}
<h3>Đã xử lý (${closed.length})</h3>
${closed.length ? closed.map(card).join('\n') : '<p class="muted">Chưa có.</p>'}
${fromStatus}`;
}

function noSource(s) {
  return `<p class="callout warn">${s.docError
    ? `Nguồn có cấu trúc của dịch vụ đang lỗi nên không hiển thị được: ${esc(s.docError)}`
    : `Bản đã commit của dịch vụ này chưa có nguồn có cấu trúc <code>${esc(s.name)}/${esc(s.docsRel || 'docs')}/service.yaml</code>, nên phần này chưa có nội dung. Agent ghi bằng công cụ <code>bsn-docs</code> (<code>service_doc_set</code>, <code>problem_record</code>) với <code>service="${esc(s.name)}"</code>.`}</p>`;
}

// Tên các tab của MỘT đơn vị: tab đầu lấy tên đơn vị tự khai (service.yaml: first_tab, ghi bằng service_doc_set section=meta), không thì "Nghiệp vụ" (P-004).
const tabsOf = (s) => TABS.map(([k, label]) => [k, k === 'business' && s.doc && s.doc.first_tab ? esc(s.doc.first_tab) : label]);
function render(s, ctx) {
  const panels = { business: `${businessTab(s)}${ownPart(s, 'business')}${figures(s, 'business')}`, architecture: architectureTab(s, ctx), problems: `${problemsTab(s)}${ownPart(s, 'problems')}${figures(s, 'problems')}` };
  const body = `<h1>${esc(s.title)}</h1>
${s.summary ? `<p class="lead">${inline(s.summary)}</p>` : ''}
<p class="chips">${checkChip(s)}${s.doc ? chip(s.openProblems ? 'warn' : 'good', `${s.openProblems} vấn đề chưa xong`) : chip('neutral', 'Chưa có service.yaml')}${s.updated ? `<span class="muted small">docs cập nhật ${esc(s.updated)}</span>` : ''}</p>
<p class="chips">${commitLine(s.commit)}</p>
<div class="tabs" role="tablist" aria-label="Phần của trang">${tabsOf(s).map(([k, label]) => `<a role="tab" id="tab-${k}" href="#${k}" aria-controls="${k}">${label}</a>`).join('')}</div>
${tabsOf(s).map(([k, label]) => `<section class="panel" id="${k}" role="tabpanel" aria-labelledby="tab-${k}"><h2>${label}</h2>${panels[k]}</section>`).join('\n')}`;
  return page({ title: s.title, body, ctx, current: s.name });
}

// ---------- CSS / JS dùng chung của cổng (portal.js ghi ra assets/) ----------
const CSS = `:root{--bg:#f7f8fa;--surface:#fff;--text:#1b2330;--muted:#5d6b7e;--line:#dfe4ec;--accent:#1f5fbf;--accent-bg:#e8f0fd;
--good:#17663a;--good-bg:#e2f4e8;--warn:#8a5300;--warn-bg:#fdf1d8;--bad:#a8261d;--bad-bg:#fde7e4;--code:#eef1f6;
--n0:#eef2f8;--n0s:#9fb0c8;--n1:#e3eefc;--n1s:#5b8ad6;--n2:#e4f5ea;--n2s:#4b9c69;--n3:#fdf0d6;--n3s:#c08a1e;--n4:#f3e8fb;--n4s:#9461c2;--n5:#fde8e6;--n5s:#c7574d}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#12161d;--surface:#1a2029;--text:#e6ebf2;--muted:#9aa7b8;--line:#2c3542;--accent:#7fb0ff;--accent-bg:#1d2c47;
--good:#7bd69b;--good-bg:#16301f;--warn:#f0c26a;--warn-bg:#3a2c0f;--bad:#ff9a8f;--bad-bg:#3d1a17;--code:#232b37;
--n0:#232b37;--n0s:#56657a;--n1:#1d2c47;--n1s:#5b8ad6;--n2:#16301f;--n2s:#4b9c69;--n3:#3a2c0f;--n3s:#c08a1e;--n4:#2d2140;--n4s:#9461c2;--n5:#3d1a17;--n5s:#c7574d;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#12161d;--surface:#1a2029;--text:#e6ebf2;--muted:#9aa7b8;--line:#2c3542;--accent:#7fb0ff;--accent-bg:#1d2c47;
--good:#7bd69b;--good-bg:#16301f;--warn:#f0c26a;--warn-bg:#3a2c0f;--bad:#ff9a8f;--bad-bg:#3d1a17;--code:#232b37;
--n0:#232b37;--n0s:#56657a;--n1:#1d2c47;--n1s:#5b8ad6;--n2:#16301f;--n2s:#4b9c69;--n3:#3a2c0f;--n3s:#c08a1e;--n4:#2d2140;--n4s:#9461c2;--n5:#3d1a17;--n5s:#c7574d;color-scheme:dark}
*{box-sizing:border-box}
html{scroll-padding-top:120px}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
a:focus-visible,button:focus-visible,select:focus-visible,summary:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:4px}
code{background:var(--code);padding:.1em .35em;border-radius:4px;font:.88em ui-monospace,SFMono-Regular,Consolas,"Liberation Mono",monospace;overflow-wrap:anywhere}
.top{position:sticky;top:0;z-index:10;display:flex;flex-wrap:wrap;align-items:center;gap:8px 18px;padding:10px 16px;background:var(--surface);border-bottom:1px solid var(--line)}
.brand{font-weight:700;color:var(--text);margin-right:6px}
.main{display:flex;flex-wrap:wrap;gap:2px 4px;flex:1 1 auto}
.main a{padding:6px 10px;border-radius:6px;color:var(--text)}
.main a[aria-current="page"]{background:var(--accent-bg);color:var(--accent);font-weight:600}
.switch{display:flex;align-items:center;gap:6px;font-size:.9rem;color:var(--muted)}
select,button.ghost{font:inherit;color:var(--text);background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:5px 8px}
button.ghost{cursor:pointer;line-height:1}
main{max-width:1120px;margin:0 auto;padding:16px 16px 48px}
.crumbs{font-size:.9rem;color:var(--muted);margin-bottom:8px}.crumbs .sep{margin:0 6px}
h1{font-size:1.8rem;line-height:1.25;margin:.3em 0 .4em}
h2{font-size:1.3rem;margin:1.6em 0 .5em}h3{font-size:1.08rem;margin:1.5em 0 .4em}h4{font-size:1rem;margin:1em 0 .3em}h5{font-size:.9rem;margin:.9em 0 .2em;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
.lead{font-size:1.05rem;color:var(--muted);max-width:75ch}p{max-width:80ch}.muted{color:var(--muted)}.small{font-size:.86rem}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;margin:18px 0}
.card{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:16px}.card h2{margin:0 0 2px;font-size:1.2rem}
.chips{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.chip{display:inline-block;font-size:.8rem;padding:2px 9px;border-radius:999px;border:1px solid var(--line);background:var(--surface);white-space:nowrap}
.chip.good,.chip.st-resolved{color:var(--good);background:var(--good-bg);border-color:transparent}
.chip.warn,.chip.st-refining,.chip.sev-medium{color:var(--warn);background:var(--warn-bg);border-color:transparent}
.chip.bad,.chip.st-open,.chip.sev-high{color:var(--bad);background:var(--bad-bg);border-color:transparent}
.chip.neutral,.chip.sev-low{color:var(--muted)}
.tablinks{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:.92rem;margin-bottom:0}
.tabs{position:sticky;top:53px;z-index:5;display:flex;flex-wrap:wrap;gap:4px;margin:18px 0 0;padding-top:6px;background:var(--bg);border-bottom:1px solid var(--line)}
.tabs a{padding:9px 14px;border:1px solid transparent;border-bottom:none;border-radius:8px 8px 0 0;color:var(--muted);font-weight:600}
.tabs a[aria-selected="true"]{background:var(--surface);border-color:var(--line);color:var(--text);margin-bottom:-1px}
.panel{background:var(--surface);border:1px solid var(--line);border-top:none;border-radius:0 0 10px 10px;padding:4px 18px 20px}
.js .panel[hidden]{display:none}.js .panel>h2{position:absolute;left:-9999px}
.scroll{overflow-x:auto;max-width:100%}
table{border-collapse:collapse;width:100%;font-size:.94rem;margin:.4em 0}
th,td{text-align:left;vertical-align:top;padding:8px 10px;border-bottom:1px solid var(--line)}
th{font-size:.82rem;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);white-space:nowrap}
.callout{border:1px solid var(--line);border-left:4px solid var(--accent);background:var(--surface);border-radius:6px;padding:10px 14px;max-width:none}
.callout.warn{border-left-color:var(--warn);background:var(--warn-bg)}.callout.bad{border-left-color:var(--bad);background:var(--bad-bg)}
.callout p{margin:.2em 0}.callout ul{margin:.3em 0}
.cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px}
.cols>div{border:1px solid var(--line);border-radius:8px;padding:2px 14px 8px}
.problem{border:1px solid var(--line);border-radius:8px;padding:4px 14px 10px;margin:10px 0}.problem:target{border-color:var(--accent);box-shadow:0 0 0 2px var(--accent-bg)}
.flow{border-left:3px solid var(--line);padding-left:14px;margin:10px 0}
ul.checks{list-style:none;padding-left:0}ul.checks li{padding-left:26px;position:relative;margin:4px 0}
ul.checks li::before{position:absolute;left:0;content:"☐";color:var(--muted)}ul.checks li.done::before{content:"☑";color:var(--good)}
ul.plain{list-style:none;padding:0}ul.plain li{padding:6px 0;border-bottom:1px solid var(--line)}
details>summary{cursor:pointer}
.filters{display:flex;flex-wrap:wrap;gap:10px 18px;align-items:center;margin:14px 0}.filters label{display:flex;align-items:center;gap:6px;font-size:.92rem}
code.id{white-space:nowrap}td:first-child{min-width:8.5em}
.foot{max-width:1120px;margin:0 auto;padding:16px;color:var(--muted);font-size:.84rem;border-top:1px solid var(--line)}
@media (max-width:640px){h1{font-size:1.45rem}.panel{padding:4px 12px 16px}.tabs{top:0;position:static}.top{position:static}html{scroll-padding-top:12px}}
@media print{.top,.tabs,.filters,.foot,#theme{display:none}.panel[hidden]{display:block!important}.js .panel>h2{position:static}}
:root{--accent-soft:var(--accent-bg);--body:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
.svc-part{margin:16px 0}
.svc{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:14px 16px;margin:14px 0}
.svc h2{margin:0 0 4px;font-size:1.2rem}.svc ul{margin:.5em 0 0;padding-left:1.2em}.svc li{margin:4px 0}
` + view.CSS;

const JS = `(function(){
  var root=document.documentElement,prefix=document.body.getAttribute('data-prefix')||'';
  root.classList.add('js');
  // giao diện sáng/tối: mặc định theo hệ điều hành; nút bấm ghi nhớ lựa chọn (nếu trình duyệt cho lưu)
  try{var t=localStorage.getItem('bsn-theme');if(t)root.setAttribute('data-theme',t);}catch(e){}
  var tb=document.getElementById('theme');
  if(tb)tb.addEventListener('click',function(){
    var dark=root.getAttribute('data-theme')?root.getAttribute('data-theme')==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;
    var next=dark?'light':'dark';root.setAttribute('data-theme',next);
    try{localStorage.setItem('bsn-theme',next);}catch(e){}
  });
  // tab: mỗi tab là một liên kết #mã; mở đúng tab theo địa chỉ, kể cả khi địa chỉ trỏ vào một mục nằm trong tab (vd. #P-001)
  var panels=[].slice.call(document.querySelectorAll('.panel')),tabs=[].slice.call(document.querySelectorAll('.tabs a'));
  function tabOf(hash){
    var id=decodeURIComponent((hash||'').replace(/^#/,''));if(!id)return null;
    var el=document.getElementById(id);
    while(el&&!(el.classList&&el.classList.contains('panel')))el=el.parentNode;
    return el&&el.id?el.id:null;
  }
  function show(id,scrollTo){
    if(!panels.length)return;
    if(!id)id=panels[0].id;
    panels.forEach(function(p){p.hidden=p.id!==id;});
    tabs.forEach(function(a){var on=a.getAttribute('href')==='#'+id;a.setAttribute('aria-selected',on?'true':'false');a.tabIndex=on?0:-1;});
    if(scrollTo){var el=document.getElementById(scrollTo);if(el&&el.scrollIntoView)el.scrollIntoView();}
  }
  function sync(){var h=location.hash,id=tabOf(h),target=decodeURIComponent(h.replace(/^#/,''));show(id,id&&target!==id?target:null);}
  if(panels.length){
    sync();window.addEventListener('hashchange',sync);
    tabs.forEach(function(a,i){a.addEventListener('keydown',function(ev){
      var d=ev.key==='ArrowRight'?1:ev.key==='ArrowLeft'?-1:0;if(!d)return;ev.preventDefault();
      var n=tabs[(i+d+tabs.length)%tabs.length];n.focus();location.hash=n.getAttribute('href');
    });});
  }
  // chuyển dịch vụ, giữ nguyên tab đang xem
  var sw=document.getElementById('svc-switch');
  if(sw)sw.addEventListener('change',function(){
    if(!sw.value)return;var cur=tabOf(location.hash);
    location.href=prefix+encodeURIComponent(sw.value)+'/index.html'+(cur?'#'+cur:'');
  });
})();
` + view.JS;

module.exports = { render, collectService, figure, autoSection, AUTO_INTRO, coverageHtml, coverageOf, typedSection, typedSections, TYPED, OWN_SECTION, problemsTab, decisionList, repoInfo, git, show, commitLine, chip, esc, inline, parseStatus, parseDecisions, parseTraceability, TABS, tabsOf, CSS, JS, OUT };
