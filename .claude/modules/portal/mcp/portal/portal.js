'use strict';
// spec: PORT-S-004
// spec: PORT-S-001
// spec: PORT-S-003
// Cổng HTML cho NGƯỜI đọc: docs/portal/. Trang tổng (index.html) chỉ làm MỘT việc: quét các thư mục đơn vị của dự án
// và liệt kê liên kết tới các trang HTML của từng dịch vụ. Trang tổng không vẽ, không tổng hợp nội dung.
//
//   index.html               trang tổng: mỗi dịch vụ một khối (commit gần nhất + liên kết tới các trang của nó) và mục Lịch sử
//   <dịch-vụ>/index.html     trang ba tab CỦA DỊCH VỤ: bộ sinh riêng generators/<dịch-vụ>/gen-service-page.js nếu có,
//                            không thì khuôn mặc định service-page.js (chỉ dựng khi dịch vụ đã commit docs/service.yaml)
//   <dịch-vụ>/*.html         trang khác do bộ sinh riêng của dịch vụ tạo (ví dụ overview.html); trang tổng tự dẫn liên kết tới
//   <dịch-vụ>/_parts/        mảnh HTML bộ sinh của dịch vụ cung cấp cho trang ba tab (không phải trang, không được liệt kê)
//   history/                 các trang tổng quan cũ, là bản gốc, không sinh lại
//   assets/                  portal.css, portal.js, và mermaid.min.js nếu có ở vendor/
//
// Dịch vụ chỉ giữ Markdown cho agent; toàn bộ HTML nằm trong MỘT cây thư mục này nên liên kết qua lại luôn đúng.
// Nguồn của trang dịch vụ là BẢN ĐÃ COMMIT của repo dịch vụ; cổng dựng lại sau mỗi commit (git hook post-commit) và ở hook Stop.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const core = require('../../../servicedocs/mcp/docs/core');
const sp = require('./service-page');

const { esc } = sp;
const OUT = sp.OUT;
const posix = (p) => p.split(path.sep).join('/');
const SERVICE_RE = /^[a-z][a-z0-9-]{1,40}$/;
const P = require('../../../core/gate/gate-paths');
// Thư mục mcp/: mã công cụ nằm trong các thư mục con theo việc; ở bố cục khối chúng trải trên nhiều khối.
const MCP_DIR = P.codePath(core.BSN_DIR, 'mcp');
// Hỏi mỗi lần dùng: thư viện vẽ là tệp người dùng tự tải, có thể xuất hiện sau khi tiến trình này đã nạp (máy chủ MCP chạy lâu).
const vendorMermaid = () => P.codePath(core.BSN_DIR, 'mcp/vendor/mermaid.min.js');
const GENERATORS = P.generatorsDir(core.BSN_DIR); // bộ sinh riêng của từng dịch vụ (phần của dự án)
const { RENDERER_VERSION } = require('../../../diagrams/adapters/mermaid/render');

// Mọi thư mục con của thư mục chứa đơn vị có tên hợp lệ là một dịch vụ, kể cả dịch vụ chưa có docs.
function scanServices() {
  return P.serviceEntries(core.BSN_DIR).filter((d) => SERVICE_RE.test(d.name)).map((d) => d.name);
}

const ownGenerator = (name) => P.unitGenerator(core.BSN_DIR, name, 'gen-service-page.js');

// Các trang HTML của một dịch vụ trong cổng (chỉ cấp trên cùng của thư mục dịch vụ), nhãn lấy từ <title> của chính trang đó.
function scanPages(name) {
  const dir = path.join(OUT(), name);
  let files = [];
  try { files = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile() && /\.html?$/i.test(e.name)).map((e) => e.name); } catch { return []; }
  files.sort((a, b) => (a === 'index.html' ? -1 : b === 'index.html' ? 1 : a.localeCompare(b)));
  return files.map((file) => {
    let title = '';
    try {
      const fd = fs.openSync(path.join(dir, file), 'r');
      const buf = Buffer.alloc(4096);
      const n = fs.readSync(fd, buf, 0, buf.length, 0);
      fs.closeSync(fd);
      title = ((/<title>([^<]*)<\/title>/i.exec(buf.toString('utf8', 0, n)) || [])[1] || '').replace(/\s*·\s*Cổng [^·]*$/, '').trim();
    } catch { /* không đọc được thì dùng tên tệp */ }
    return { file, title: title || file };
  });
}

function scanHistory() {
  const dir = path.join(OUT(), 'history');
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.html')).sort() : [];
}

// Trang "Bản đồ cả hệ" (ban-do-he.html): sơ đồ do harness tự sinh từ kho ngữ nghĩa (dịch vụ, topic, hạ tầng dùng chung).
// Là một trang riêng để trang tổng vẫn chỉ làm một việc: dẫn liên kết.
function systemPage(system, hasMermaid) {
  const brand = `Cổng ${esc(require('../../../core/gate/gate-paths').projectConfig(core.BSN_DIR).name)}`;
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Bản đồ cả hệ · ${brand}</title>
<link rel="stylesheet" href="assets/portal.css">
</head>
<body data-prefix="">
<header class="top">
  <a class="brand" href="index.html">← ${brand}</a>
  <span class="main"></span>
  <button id="theme" type="button" class="ghost" aria-label="Đổi giao diện sáng/tối">◐</button>
</header>
<main>
<h1>Bản đồ cả hệ</h1>
<p class="lead">Các dịch vụ, topic và hạ tầng dùng chung, cùng quan hệ phụ thuộc giữa chúng. Harness tự vẽ từ <code>docs/service.yaml</code> của từng dịch vụ và tờ khai báo triển khai của dự án (nếu có) sau mỗi commit; không ai khai sơ đồ này.</p>
${require('../../../diagrams/adapters/mermaid/view').figure(system, { caption: false, noExplainHint: true })}
</main>
<footer class="foot">Sinh tự động từ kho ngữ nghĩa của harness. Không sửa tay.</footer>
${hasMermaid ? '<script src="assets/mermaid.min.js"></script>\n' : ''}<script src="assets/portal.js"></script>
</body>
</html>
`;
}

function indexPage(services, history, hasMermaid, system) {
  // Tên dự án và nơi chứa đơn vị theo cấu hình dự án.
  const P = require('../../../core/gate/gate-paths');
  const cfg = P.projectConfig(core.BSN_DIR);
  const proj = { name: cfg.name, where: cfg.units.parents.length ? cfg.units.parents.map((p) => `${p}/`).join(', ') : '.claude/project/project.json' };
  const map = system ? '<p><a href="ban-do-he.html">Bản đồ cả hệ</a> <span class="muted small">các dịch vụ, topic và hạ tầng dùng chung (tự sinh)</span></p>' : '';
  const blocks = services.map((s) => `<section class="svc" id="${esc(s.name)}">
  <h2>${s.pages.length ? `<a href="${esc(s.name)}/${esc(s.pages[0].file)}">${esc(s.name)}</a>` : esc(s.name)}</h2>
  <p class="chips"><code>${esc(require('../../../core/gate/gate-paths').serviceRel(core.BSN_DIR, s.name))}/</code> ${sp.commitLine(s.commit)}</p>
  ${s.pages.length ? `<ul>${s.pages.map((p) => `<li><a href="${esc(s.name)}/${esc(p.file)}">${esc(p.title)}</a> <span class="muted small">${esc(p.file)}</span></li>`).join('')}</ul>` : '<p class="muted">Chưa có trang.</p>'}
</section>`).join('\n');
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cổng ${esc(proj.name)}</title>
<link rel="stylesheet" href="assets/portal.css">
</head>
<body data-prefix="">
<header class="top">
  <a class="brand" href="index.html">Cổng ${esc(proj.name)}</a>
  <span class="main"></span>
  <button id="theme" type="button" class="ghost" aria-label="Đổi giao diện sáng/tối">◐</button>
</header>
<main>
<h1>Hệ ${esc(proj.name)}</h1>
<p class="lead">Trang tổng chỉ dẫn đường: mỗi dịch vụ trong <code>${esc(proj.where)}</code> một khối, kèm liên kết tới các trang của dịch vụ đó. Nội dung và sơ đồ nằm ở trang của từng dịch vụ.</p>
${blocks || `<p class="muted">Chưa có dịch vụ nào trong ${esc(proj.where)}.</p>`}
${map}
<h2 id="history">Lịch sử</h2>
${history.length ? `<ul class="plain">${history.map((f) => `<li><a href="history/${esc(f)}">${esc(f.replace(/\.html$/, ''))}</a></li>`).join('')}</ul>` : '<p class="muted">Chưa có bản lịch sử nào.</p>'}
</main>
<footer class="foot">Sinh tự động bằng <code>node .claude/modules/core/cli/cli.js portal</code>: quét <code>${esc(proj.where)}</code> và <code>docs/portal/&lt;dịch-vụ&gt;/</code>. Không sửa tay. ${esc(healthLine())}</footer>
<script src="assets/portal.js"></script>
</body>
</html>
`;
}

// Một dòng cho chân trang tổng: bộ vẽ phiên bản mấy, lần kiểm sơ đồ gần nhất ra sao.
function healthLine() {
  const h = readHealth();
  const c = h.check;
  if (!c) return `Bộ vẽ sơ đồ phiên bản ${RENDERER_VERSION}; sơ đồ chưa được kiểm bằng trình duyệt.`;
  const when = String(h.checkedAt || '').slice(0, 16).replace('T', ' ');
  if (c.skipped) return `Bộ vẽ sơ đồ phiên bản ${RENDERER_VERSION}; lần kiểm ${when} bị bỏ qua (${c.reason}).`;
  const drawn = c.pages.reduce((n, p) => n + p.drawn, 0); const declared = c.pages.reduce((n, p) => n + p.declared, 0);
  const big = c.pages.reduce((n, p) => n + (p.oversize || []).length, 0);
  return `Bộ vẽ sơ đồ phiên bản ${RENDERER_VERSION}; kiểm bằng trình duyệt lúc ${when} (giờ UTC): ${drawn}/${declared} sơ đồ vẽ được${big ? `, ${big} sơ đồ quá lớn` : ''}${needsCheck() ? '; bộ vẽ đã đổi sau lần kiểm này' : ''}.`;
}

function writeIfChanged(file, content) {
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === content) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, file);
  return true;
}

// Dấu vân tay của mọi đầu vào, để biết cổng có cũ không mà không phải dựng lại: commit đang đứng (và số tệp chưa commit) của từng
// repo, mã của bộ dựng, và các trang/mảnh do bộ sinh riêng của dịch vụ tạo. Tính SAU khi dựng nên trang do chính cổng ghi cũng ổn định.
// Mọi tệp mã quyết định hình vẽ ra sao: bộ dựng dùng chung, bộ sinh riêng của từng dịch vụ, thư viện Mermaid.
function toolFiles() {
  // Mọi tệp mã dưới mcp/ (kể cả bộ sinh riêng), trừ test và thư viện tải về; thứ tự cố định để dấu ổn định.
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      if (e.isDirectory()) { if (!['test', 'vendor', 'node_modules'].includes(e.name)) walk(path.join(dir, e.name)); } else if (e.name.endsWith('.js')) files.push(path.join(dir, e.name));
    }
  };
  const mcpDirs = P.codeDirs(core.BSN_DIR, 'mcp');
  for (const d of mcpDirs) walk(d);
  // Bộ sinh riêng nằm ngoài mcp/ ở bố cục khối (phần của dự án).
  if (fs.existsSync(GENERATORS) && !mcpDirs.some((d) => P.inside(GENERATORS, d))) walk(GENERATORS);
  for (const d of P.trustedGeneratorDirs(core.BSN_DIR)) walk(d);
  // Bộ vẽ và hợp đồng sơ đồ nằm ngoài mcp/: sửa chúng cũng là đổi cách vẽ.
  for (const d of ['adapters/mermaid', 'core/diagrams']) for (const dir of P.codeDirs(core.BSN_DIR, d)) walk(dir);
  files.push(vendorMermaid());
  return files;
}
// Dấu của riêng BỘ VẼ (nội dung tệp, không phải thời điểm sửa). Dấu này đổi nghĩa là cách vẽ có thể đã đổi: mọi sơ đồ phải được kiểm lại.
function toolFingerprint() {
  const h = crypto.createHash('sha256');
  h.update(`renderer|${RENDERER_VERSION}\n`);
  for (const f of toolFiles()) { try { h.update(`${path.relative(MCP_DIR, f)}|`); h.update(fs.readFileSync(f)); h.update('\n'); } catch { h.update('không có\n'); } }
  return h.digest('hex');
}

function fingerprint() {
  const h = crypto.createHash('sha256');
  const stat = (label, file) => { try { const st = fs.statSync(file); h.update(`${label}|${st.size}|${Math.floor(st.mtimeMs)}\n`); } catch { h.update(`${label}|không có\n`); } };
  const repo = (label, dir) => { const c = sp.repoInfo(dir); h.update(`${label}|${c ? `${c.sha}|${c.dirty}` : 'chưa có commit'}\n`); };
  repo('(gốc)', core.BSN_DIR);
  for (const name of scanServices()) {
    repo(name, core.dirOf(name));
    for (const p of scanPages(name)) stat(`${name}/${p.file}`, path.join(OUT(), name, p.file));
    for (const [tab] of sp.TABS) stat(`${name}/_parts/${tab}.html`, path.join(OUT(), name, '_parts', `${tab}.html`));
    stat(`${name}/gen-service-page.js`, ownGenerator(name));
  }
  h.update(`history|${scanHistory().join(',')}\n`);
  for (const f of toolFiles()) stat(path.relative(MCP_DIR, f), f);
  h.update(`renderer|${RENDERER_VERSION}\n`);
  stat('.health.json', healthFile());
  return h.digest('hex');
}

const buildInfo = () => path.join(OUT(), '.build.json');
// Sổ sức khỏe của cổng: kết quả lần kiểm sơ đồ bằng trình duyệt gần nhất và lỗi dựng gần nhất. Chỉ harness đọc; không phiên nào được nhắc về nó.
const healthFile = () => path.join(OUT(), '.health.json');
const readHealth = () => { try { return JSON.parse(fs.readFileSync(healthFile(), 'utf8')); } catch { return {}; } };
function writeHealth(patch) {
  fs.mkdirSync(OUT(), { recursive: true });
  const tmp = `${healthFile()}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify({ ...readHealth(), ...patch }, null, 2)}\n`);
  fs.renameSync(tmp, healthFile());
}
// Bộ vẽ đã đổi kể từ lần kiểm sơ đồ gần nhất?
const needsCheck = () => readHealth().toolFingerprint !== toolFingerprint();
// Ghi kết quả một lần kiểm bằng trình duyệt (diagram-check.run()).
function recordCheck(r) {
  writeHealth({ toolFingerprint: toolFingerprint(), renderer: RENDERER_VERSION, checkedAt: new Date().toISOString(),
    check: r.skipped ? { skipped: true, reason: r.reason } : { ok: r.ok, pages: r.pages } });
}
const readBuild = () => { try { return JSON.parse(fs.readFileSync(buildInfo(), 'utf8')); } catch { return {}; } };

function build() {
  return core.store.withLock(core.BSN_DIR, 'portal', () => {
    const out = OUT();
    const names = scanServices();
    const hasMermaid = fs.existsSync(vendorMermaid());
    const pages = new Map([['assets/portal.css', sp.CSS], ['assets/portal.js', sp.JS]]);
    const notes = [];
    const own = [];

    // 1. Trang của từng dịch vụ (việc của dịch vụ: bộ sinh riêng, hoặc khuôn ba tab mặc định từ bản đã commit).
    // Kho ngữ nghĩa: dựng lại theo commit, sinh sơ đồ tự sinh và danh sách chờ agent (context-portal.js). Lỗi của kho không làm hỏng cổng.
    const kho = require('../../../context/mcp/context/context-portal').prepare(notes);
    const collected = names.map((name) => ({ ...sp.collectService(name), auto: kho.figures(name) }));
    const withPage = collected.filter((s) => fs.existsSync(ownGenerator(s.name)) || s.hasSource);
    const ctx = { services: withPage.map((s) => ({ name: s.name, title: s.title })), mermaid: hasMermaid, project: require('../../../core/gate/gate-paths').projectConfig(core.BSN_DIR).name };
    for (const s of withPage) {
      if (fs.existsSync(ownGenerator(s.name))) {
        try {
          require(ownGenerator(s.name)).generate({ service: s, ctx, out: path.join(out, s.name) });
          own.push(`${s.name}/index.html`); // trang do bộ sinh riêng ghi: không dọn như trang cũ của cổng
        } catch (e) { notes.push(`bộ sinh trang của ${s.name} lỗi: ${e.message}`); }
      } else pages.set(`${s.name}/index.html`, sp.render(s, ctx));
    }

    if (kho.system) pages.set('ban-do-he.html', systemPage(kho.system, hasMermaid));
    let changed = 0;
    for (const [rel, content] of pages) if (writeIfChanged(path.join(out, rel), content)) changed++;
    if (hasMermaid) {
      const dest = path.join(out, 'assets', 'mermaid.min.js');
      if (!fs.existsSync(dest) || fs.statSync(dest).size !== fs.statSync(vendorMermaid()).size) { fs.copyFileSync(vendorMermaid(), dest); changed++; }
      pages.set('assets/mermaid.min.js', null);
    }
    for (const rel of own) pages.set(rel, null);

    // 2. Dọn trang mà lần dựng TRƯỚC của chính cổng đã ghi nhưng nay không còn (trang tổng hợp cũ, trang của dịch vụ không còn nguồn).
    //    Chỉ xóa tệp có tên trong danh sách của lần dựng trước: trang do bộ sinh riêng của dịch vụ tạo không bao giờ bị đụng.
    for (const rel of readBuild().pages || []) {
      if (pages.has(rel) || rel === 'index.html' || rel.startsWith('history/') || path.isAbsolute(rel) || rel.split('/').includes('..')) continue;
      try { fs.unlinkSync(path.join(out, rel)); changed++; } catch { /* đã mất */ }
      // dịch vụ đã bị xóa hẳn: dọn luôn thư mục trang của nó nếu đã rỗng (rmdir không xóa thư mục còn tệp)
      const parent = path.dirname(path.join(out, rel));
      if (parent !== out) { try { fs.rmdirSync(parent); } catch { /* còn tệp khác */ } }
    }
    for (const name of names) { try { fs.rmdirSync(path.join(out, name)); } catch { /* còn trang, hoặc chưa có thư mục */ } }

    // 3. Trang tổng: quét lại thư mục trang của từng dịch vụ SAU khi các trang đã được ghi.
    const services = names.map((name, i) => ({ name, commit: collected[i].commit, pages: scanPages(name) }));
    if (writeIfChanged(path.join(out, 'index.html'), indexPage(services, scanHistory(), hasMermaid, kho.system))) changed++;
    pages.set('index.html', null);

    fs.writeFileSync(buildInfo(), `${JSON.stringify({ at: new Date().toISOString(), fingerprint: fingerprint(), renderer: RENDERER_VERSION, pages: [...pages.keys()] }, null, 2)}\n`);
    if (readHealth().buildError) writeHealth({ buildError: null });
    const links = services.reduce((n, s) => n + s.pages.length, 0);
    const summary = `Cổng: ${posix(path.relative(core.BSN_DIR, out))}/index.html. ${services.length} dịch vụ, ${links} liên kết tới trang dịch vụ ` +
      `(${services.filter((s) => !s.pages.length).map((s) => `${s.name}: chưa có trang`).join('; ') || 'dịch vụ nào cũng có trang'}), ${changed} tệp đổi.` +
      `${hasMermaid ? '' : ' Chưa có thư viện Mermaid (vendor/mermaid.min.js): sơ đồ khai báo hiện dạng chữ.'}${notes.length ? ` LỖI: ${notes.join('; ')}` : ''}`;
    return { out, changed, pages: [...pages.keys()], services, summary, notes };
  });
}

// Trạng thái cho người và phiên harness xem (lệnh portal-status). Không sửa gì.
function status() {
  const b = readBuild(); const h = readHealth();
  const lines = [`Bộ vẽ sơ đồ: phiên bản ${RENDERER_VERSION}${b.renderer && b.renderer !== RENDERER_VERSION ? ` (cổng đang dựng bằng phiên bản ${b.renderer}: sẽ vẽ lại ở lần dựng kế tiếp)` : ''}.`];
  lines.push(`Cổng: dựng lần cuối ${b.at || 'chưa dựng'}; ${isStale() ? 'ĐANG CŨ so với nguồn (sẽ tự dựng lại ở lần dựng kế tiếp; dựng ngay: node .claude/modules/core/cli/cli.js portal)' : 'đang mới nhất'}.`);
  if (h.buildError) lines.push(`LỖI DỰNG gần nhất (${h.buildError.at}): ${h.buildError.message}`);
  const c = h.check;
  if (!c) lines.push('Kiểm sơ đồ bằng trình duyệt: chưa chạy lần nào.');
  else if (c.skipped) lines.push(`Kiểm sơ đồ bằng trình duyệt: lần gần nhất (${h.checkedAt}) BỎ QUA: ${c.reason}.`);
  else {
    lines.push(`Kiểm sơ đồ bằng trình duyệt (${h.checkedAt})${needsCheck() ? ', BỘ VẼ ĐÃ ĐỔI SAU LẦN KIỂM NÀY' : ''}:`);
    for (const p of c.pages) {
      lines.push(`  ${p.ok ? 'đạt ' : 'HỎNG'} ${p.page}: ${p.drawn}/${p.declared} vẽ được${p.failed.length ? `; lỗi: ${p.failed.join(', ')}` : ''}`);
      for (const x of p.oversize || []) lines.push(`       quá lớn: ${x.id} ${x.width}x${x.height}px (nên tách hoặc khai theo dạng tầng)`);
    }
  }
  // Phần giải thích và bố cục, đọc từ bản ĐÃ COMMIT của từng dịch vụ.
  for (const name of scanServices()) {
    const svc = sp.collectService(name);
    const ds = svc.diagrams.filter((d) => !d.error);
    // Đủ bộ: mỗi dịch vụ cần đủ mọi loại sơ đồ (dịch vụ chưa có service.yaml lẫn sơ đồ nào thì chưa đòi).
    if (ds.length || svc.doc) {
      const cov = sp.coverageOf(svc);
      const missing = cov.filter((c) => c.missing).map((c) => c.label); const na = cov.filter((c) => c.na).map((c) => c.label);
      lines.push(`${name}: bộ sơ đồ ${cov.length} loại: ${missing.length ? `CÒN THIẾU ${missing.join(', ')}` : 'đủ'}${na.length ? ` (không áp dụng: ${na.join(', ')})` : ''}.`);
    }
    if (!ds.length) continue;
    const missing = ds.filter((d) => !d.explain).map((d) => d.id); const stale = ds.filter((d) => d.explainStale).map((d) => d.id);
    lines.push(`${name}: ${ds.length} sơ đồ; giải thích: ${ds.length - missing.length - stale.length} còn khớp${missing.length ? `, THIẾU ${missing.length} (${missing.join(', ')})` : ''}${stale.length ? `, ĐÃ CŨ ${stale.length} (${stale.join(', ')})` : ''}.`);
  }
  // Phiên Claude Code đang mở và dịch vụ chúng đang làm (ghép sổ phiên của Claude Code với sổ phạm vi của harness).
  try { lines.push(require('../../../core/hooks/sessions-lib').tableText(core.BSN_DIR, { background: true })); } catch (e) { lines.push(`Bảng phiên: không đọc được (${e.message}).`); }
  // Kho ngữ nghĩa và sơ đồ tự sinh: kho của từng dịch vụ, sơ đồ nào còn chờ agent viết giải thích hoặc soát, sơ đồ nào bị báo sai.
  try {
    const kho = require('../../../context/mcp/context/context');
    const kp = require('../../../context/mcp/context/context-portal');
    const all = kho.loadAll();
    if (!all) lines.push('Kho ngữ nghĩa: chưa dựng (dựng cùng cổng).');
    else {
      const cfg = kp.config();
      lines.push(`Kho ngữ nghĩa: thông báo cho phiên dịch vụ ${cfg.notify ? 'ĐANG BẬT' : 'đang tắt'}; lời nhắc dùng context_explore ở đầu phiên ${cfg.advertise ? 'ĐANG BẬT' : 'đang tắt'} (.claude/project/context.config.json).`);
      for (const [name, g] of Object.entries(all.services)) {
        const p = (() => { try { return JSON.parse(fs.readFileSync(path.join(kho.OUT(), `${name}.pending.json`), 'utf8')).pending; } catch { return []; } })();
        const wrong = (g.auto || []).filter((a) => a.review && a.review.verdict === 'sai').map((a) => `${a.id}: ${a.review.note}`);
        lines.push(`  ${name}: ${g.nodes.length} nút, ${g.edges.length} quan hệ, ${g.dark.length} vùng tối; sơ đồ tự sinh chờ agent: ${p.length ? p.map((x) => `${x.id} (${x.kind})`).join(', ') : 'không có'}${wrong.length ? `; BỊ BÁO SAI: ${wrong.join(' | ')}` : ''}.`);
      }
    }
  } catch (e) { lines.push(`Kho ngữ nghĩa: không đọc được (${e.message}).`); }
  lines.push(publishLine() || `Bản trên claude.ai: khớp cổng trên máy${(() => { const p = publishState().published; return p ? ` (đẩy lần cuối ${String(p.at).slice(0, 16).replace('T', ' ')} UTC)` : ''; })()}.`);
  // Hồ sơ kế hoạch và commit trong sổ phiên: chỉ in khi chuỗi băm bị đứt (có dòng bị sửa hay xóa sau khi ghi).
  try {
    const P = require('../../../core/gate/gate-paths');
    if (fs.existsSync(P.ledgerPath(core.BSN_DIR))) {
      const L = require('../../../core/adapters/storage/ledger-db');
      const db = L.open(core.BSN_DIR);
      if (db) {
        try { for (const c of L.verifyChain(db).filter((x) => x.broken)) lines.push(`Hồ sơ trong sổ phiên: CHUỖI BĂM BỊ ĐỨT ở ${c.table} (dòng ${c.broken}). Báo người dùng.`); } finally { try { db.close(); } catch { /* bỏ qua */ } }
      }
    }
  } catch { /* bỏ qua */ }
  return lines.join('\n');
}

function isStale() {
  try { return readBuild().fingerprint !== fingerprint(); } catch { return true; }
}

// Dùng ở hook Stop: chỉ dựng lại khi đầu vào đổi. Trả { built, summary } hoặc { built:false }.
function buildIfStale() {
  if (!isStale()) return { built: false };
  const r = build();
  return { built: true, summary: r.summary, changed: r.changed };
}


// Dấu NỘI DUNG của gói publish: băm mọi tệp sẽ gửi, sau khi bỏ những chỗ đổi theo từng commit mà không đổi điều người đọc thấy về hệ:
// dòng "theo commit <mã> (ngày): lời nhắn", nhãn "N tệp chưa commit", ngày ghi ở chân trang publish. Nhờ đó một commit không làm đổi nội dung trang
// thì bản trên claude.ai KHÔNG bị coi là cũ. Thay đổi chỉ nằm ở các chỗ đó bị bỏ qua có chủ ý.
const VOLATILE = [
  /<span class="muted small">theo commit <code>[^<]*<\/code>[^<]*<\/span>/g,
  /<span class="chip warn">\d+ tệp chưa commit, chưa lên cổng<\/span>/g,
  /Bản publish ngày \d{4}-\d{2}-\d{2}/g,
];
function contentHash(files) {
  const h = crypto.createHash('sha256');
  for (const rel of Object.keys(files).sort()) {
    h.update(`${rel}\n`);
    if (/\.html$/.test(rel)) { let t = fs.readFileSync(files[rel], 'utf8'); for (const re of VOLATILE) t = t.replace(re, ''); h.update(t); } else h.update(fs.readFileSync(files[rel]));
    h.update('\n');
  }
  return h.digest('hex').slice(0, 32);
}

// Bản để publish lên claude.ai (Artifact): trang tổng viết lại theo khuôn của Artifact (không có doctype/html/head/body, CSS và JS
// nằm ngay trong trang), không có mục Lịch sử. Các trang của dịch vụ đi kèm nguyên trạng, nên liên kết qua lại vẫn chạy.
// Trả { page, files } để phiên Claude gọi công cụ Artifact; hàm này không gửi gì ra ngoài.
// Sau khi dựng gói, hàm DÒ BA LƯỢT trên đúng các tệp sẽ gửi (publish-scan.js) và ghi kết quả cạnh gói; phiên chỉ được đẩy khi kết quả sạch
// và gói còn khớp cổng hiện tại (publishState). built: kết quả của build() vừa chạy, để không dựng hai lần.
function publishBundle({ built } = {}) {
  const r = built || build();
  const out = OUT();
  const local = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  const main = local.slice(local.indexOf('<main>') + 6, local.indexOf('<h2 id="history">'));
  const stamp = new Date().toISOString().slice(0, 10);
  const brand = `Cổng ${esc(require('../../../core/gate/gate-paths').projectConfig(core.BSN_DIR).name)}`;
  const html = `<title>${brand}</title>
<style>${sp.CSS}</style>
<header class="top">
  <a class="brand" href="index.html">${brand}</a>
  <span class="main"></span>
  <button id="theme" type="button" class="ghost" aria-label="Đổi giao diện sáng/tối">◐</button>
</header>
<main>${main}</main>
<footer class="foot">Bản publish ngày ${stamp}, là bản sao của cổng cục bộ <code>docs/portal/</code>. Một phiên Claude đẩy bản mới sau mỗi commit khi gói đã dò sạch.</footer>
<script>${sp.JS}</script>
`;
  const page = path.join(out, '_publish', 'index.html');
  writeIfChanged(page, html);
  const files = {};
  for (const rel of ['assets/portal.css', 'assets/portal.js', ...(fs.existsSync(path.join(out, 'assets', 'mermaid.min.js')) ? ['assets/mermaid.min.js'] : [])]) files[rel] = posix(path.join(out, rel));
  for (const s of r.services) for (const p of s.pages) files[`${s.name}/${p.file}`] = posix(path.join(out, s.name, p.file));
  if (fs.existsSync(path.join(out, 'ban-do-he.html'))) files['ban-do-he.html'] = posix(path.join(out, 'ban-do-he.html')); // trang tổng có liên kết tới trang này
  // Dấu của lần chuẩn bị bản publish: portal-status so với cổng hiện tại để biết bản trên claude.ai có cũ hơn bản trên máy không.
  const scanner = require('./publish-scan');
  const scan = scanner.scanBundle(core.BSN_DIR, { 'index.html': page, ...files });
  fs.writeFileSync(path.join(out, '_publish', '.bundle.json'), `${JSON.stringify({ at: new Date().toISOString(), fingerprint: readBuild().fingerprint || '', content: contentHash({ 'index.html': page, ...files }), scan: { ok: scan.ok, problems: scan.problems, scanned: scan.scanned, allowed: scan.allowed, passes: scan.passes } }, null, 2)}\n`);
  return { page: posix(page), files, summary: r.summary, scan, report: scanner.report(scan) };
}

// Tình trạng của bản publish: gói chuẩn bị lần cuối (kèm kết quả dò), bản đã đẩy lần cuối, và có được đẩy lúc này không.
//   ready: gói đã dò ba lượt sạch VÀ còn khớp cổng hiện tại. stale: bản trên claude.ai khác cổng hiện tại (hoặc chưa ghi lần đẩy nào).
function publishState() {
  const read = (name) => { try { return JSON.parse(fs.readFileSync(path.join(OUT(), '_publish', name), 'utf8')); } catch { return null; } };
  const bundle = read('.bundle.json'); const published = read('.published.json');
  const current = (() => { try { return readBuild().fingerprint || ''; } catch { return ''; } })();
  let fresh = Boolean(bundle && current && bundle.fingerprint === current);
  // Cổng được dựng lại sau khi gói chuẩn bị (ví dụ phép kiểm sơ đồ chạy nền vừa ghi kết quả) mà NỘI DUNG các tệp của gói không đổi thì gói vẫn còn khớp:
  // so lại dấu nội dung của các tệp đang nằm trên đĩa với dấu ghi lúc dò (gặp ở lần tự publish thật đầu tiên, 2026-10-11).
  if (!fresh && bundle && bundle.content) { try { const f = publishBundleFiles(); fresh = contentHash({ 'index.html': f.page, ...f.files }) === bundle.content; } catch { /* không đọc được: coi là không còn khớp */ } }
  const clean = Boolean(bundle && bundle.scan && bundle.scan.ok);
  // Cũ hay chưa: so dấu NỘI DUNG của gói đang có với dấu của bản đã đẩy. Chưa có đủ hai dấu (gói chưa chuẩn bị lại sau khi cổng đổi,
  // hoặc bản ghi kiểu cũ) thì so theo dấu vân tay của cổng như trước: sai về phía "cũ".
  const content = fresh && bundle.content ? bundle.content : '';
  const stale = !published ? true : (content && published.content ? published.content !== content : !(current && published.fingerprint === current));
  return { bundle, published, current, content, fresh, clean, ready: fresh && clean, stale };
}

// Giao việc đẩy cho MỘT phiên: gọi ở cuối lượt của mọi phiên. Trả { due: true } đúng một lần cho mỗi nội dung của cổng, cho phiên đầu tiên
// hỏi; phiên khác hỏi trong lúc đó nhận { due: false }. Phiên nhận việc mà không đẩy được (không có công cụ, bị từ chối quyền) thì sau CLAIM_MS
// phiên khác được nhận lại. Chỉ giao khi bản trên claude.ai cũ hơn cổng VÀ gói đã dò ba lượt sạch, còn khớp cổng.
const CLAIM_MS = 10 * 60 * 1000;
function claimPublish(sid, now = Date.now()) {
  if (!sid) return { due: false, why: 'không có mã phiên' };
  const s = publishState();
  if (!s.stale) return { due: false, why: 'khớp' };
  if (!s.ready || !s.content) return { due: false, why: s.bundle && s.fresh && !s.clean ? 'gói bị giữ' : 'gói chưa sẵn sàng' };
  const file = path.join(OUT(), '_publish', '.claim.json');
  const read = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };
  const c = read();
  if (c && c.content === s.content) {
    if (c.sid === sid) return { due: false, why: 'phiên này đã được giao' };
    if (now - Number(c.at || 0) < CLAIM_MS) return { due: false, why: 'phiên khác đang đẩy' };
  }
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify({ content: s.content, sid, at: now })}\n`);
  fs.renameSync(tmp, file);
  const mine = read();
  return mine && mine.sid === sid ? { due: true, files: s.bundle.scan.scanned } : { due: false, why: 'phiên khác vừa nhận' };
}

// Sau khi đẩy: dò ba lượt trên BẢN TẢI VỀ từ claude.ai (thư mục `dir`, cùng tên tệp với gói), so từng tệp đi kèm với bản trên máy,
// và kiểm mọi liên kết của trang tổng có tệp. Trả { ok, text }.
function verifyPublished(dir) {
  const b = publishBundleFiles();
  const names = ['index.html', ...Object.keys(b.files)];
  const got = Object.fromEntries(names.map((n) => [n, path.join(dir, ...n.split('/'))]));
  const missing = names.filter((n) => !fs.existsSync(got[n]));
  if (missing.length) return { ok: false, text: `Thiếu tệp trong bản tải về: ${missing.join(', ')}` };
  const scanner = require('./publish-scan');
  const scan = scanner.scanBundle(core.BSN_DIR, got);
  const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
  const diff = Object.keys(b.files).filter((n) => sha(got[n]) !== sha(b.files[n]));
  const index = fs.readFileSync(got['index.html'], 'utf8');
  const links = [...new Set([...index.matchAll(/href="([^"#:]+)"/g)].map((m) => m[1]))];
  const dead = links.filter((l) => !fs.existsSync(path.join(dir, ...l.split('/'))));
  const ok = scan.ok && !diff.length && !dead.length;
  return { ok, text: [scanner.report(scan), `Tệp đi kèm giống bản trên máy từng byte: ${Object.keys(b.files).length - diff.length}/${Object.keys(b.files).length}${diff.length ? `; KHÁC: ${diff.join(', ')}` : ''}`, `Liên kết ở trang tổng: ${links.length}; không có tệp: ${dead.length ? dead.join(', ') : 'không'}`, ok ? 'BẢN TRÊN CLAUDE.AI ĐẠT.' : 'BẢN TRÊN CLAUDE.AI KHÔNG ĐẠT: báo người dùng.'].join('\n') };
}
// Danh sách tệp của gói đang có trên đĩa (không dựng lại, không dò): { page, files }.
function publishBundleFiles() {
  const out = OUT();
  const files = {};
  for (const rel of ['assets/portal.css', 'assets/portal.js', 'assets/mermaid.min.js']) if (fs.existsSync(path.join(out, rel))) files[rel] = posix(path.join(out, rel));
  for (const name of scanServices()) for (const p of scanPages(name)) files[`${name}/${p.file}`] = posix(path.join(out, name, p.file));
  if (fs.existsSync(path.join(out, 'ban-do-he.html'))) files['ban-do-he.html'] = posix(path.join(out, 'ban-do-he.html'));
  return { page: posix(path.join(out, '_publish', 'index.html')), files };
}
// Phiên gọi SAU KHI đẩy xong: ghi lại bản vừa đẩy. Từ chối khi gói chưa sạch hoặc không còn khớp cổng (khi đó thứ vừa đẩy không phải gói đã dò).
function markPublished({ note } = {}) {
  const s = publishState();
  if (!s.ready) return { ok: false, text: `KHÔNG ghi: ${!s.bundle ? 'chưa có gói nào được chuẩn bị' : !s.fresh ? 'gói không còn khớp cổng hiện tại (cổng đã đổi sau khi chuẩn bị)' : 'gói chưa qua ba lượt dò'}. Chạy lại: node .claude/modules/core/cli/cli.js portal-publish` };
  const rec = { at: new Date().toISOString(), fingerprint: s.current, content: s.content, scanned: s.bundle.scan.scanned, ...(note ? { note: String(note).slice(0, 200) } : {}) };
  fs.writeFileSync(path.join(OUT(), '_publish', '.published.json'), `${JSON.stringify(rec, null, 2)}\n`);
  return { ok: true, text: `Đã ghi: bản trên claude.ai là bản của cổng lúc ${rec.at} (${rec.scanned} tệp đã dò ba lượt sạch).` };
}
// Một dòng cho portal-status và cho tóm tắt đầu phiên. Trả chuỗi rỗng khi bản trên claude.ai còn khớp cổng (không có gì để nhắc).
function publishLine() {
  const s = publishState();
  if (!s.stale) return '';
  const since = s.published ? `đẩy lần cuối ${String(s.published.at).slice(0, 10)}` : 'chưa ghi lần đẩy nào';
  const hits = s.bundle && s.bundle.scan ? s.bundle.scan.passes.reduce((n, p) => n + p.hits.length, 0) + s.bundle.scan.problems.length : 0;
  const gate = !s.bundle ? 'chưa có gói chuẩn bị' : !s.fresh ? 'gói chuẩn bị đã cũ so với cổng' : s.clean ? 'gói đã dò ba lượt SẠCH, sẵn sàng' : `gói BỊ GIỮ: ${hits} chỗ bị báo hoặc chưa quét đủ`;
  return `Bản trên claude.ai CŨ hơn cổng trên máy (${since}); ${gate}. Commit là publish theo: phiên được hook cuối lượt giao thì đẩy ngay; đẩy tay: node .claude/modules/core/cli/cli.js portal-publish`;
}

// Gỡ bản ghi "đã đẩy" khi nó được ghi nhầm (ví dụ chạy portal-published mà chưa đẩy). Sau khi gỡ, harness lại coi bản trên claude.ai là cũ:
// sai về phía an toàn. Không đụng gì tới bản trên claude.ai.
function unmarkPublished() {
  const f = path.join(OUT(), '_publish', '.published.json');
  if (!fs.existsSync(f)) return { ok: true, text: 'Không có bản ghi "đã đẩy" nào để gỡ.' };
  fs.unlinkSync(f);
  return { ok: true, text: 'Đã gỡ bản ghi "đã đẩy". Harness lại coi bản trên claude.ai là cũ hơn cổng trên máy.' };
}
// Bản ngắn cho tóm tắt đầu phiên (có trần độ dài). Chưa có gói chuẩn bị nào thì không nhắc gì.
function publishBrief() {
  const s = publishState();
  if (!s.stale || !s.bundle) return '';
  return `CLAUDE.AI: bản publish cũ hơn cổng trên máy; gói ${s.ready ? 'đã dò ba lượt SẠCH: hook cuối lượt sẽ giao một phiên đẩy' : 'BỊ GIỮ hoặc đã cũ (cli.js portal-publish), báo người dùng'}.`;
}

module.exports = { claimPublish, verifyPublished, contentHash, CLAIM_MS, publishBundle, publishState, markPublished, publishLine, publishBrief, unmarkPublished, build, buildIfStale, isStale, fingerprint, toolFingerprint, needsCheck, recordCheck, writeHealth, readHealth, status, scanServices, scanPages, indexPage, OUT };
