'use strict';
// spec: CTX-S-001
// KHO NGỮ NGHĨA của harness: một bảng mục lục chung cho mọi dịch vụ, gồm NÚT (một vật có tên) và CẠNH (quan hệ giữa hai vật).
// Ba tầng nằm chung một kho và nối với nhau qua các vật chung (một tệp mã vừa là nút của tầng mã, vừa là nguồn của một sơ đồ):
//   - tầng mã:      tệp, khai báo chính, lệnh nhập                         (context-scan.js đọc từ mã)
//   - tầng vòng đời: dịch vụ, đường dẫn API, topic, bảng, tệp test          (từ mã, infra/services/<dịch-vụ>.json, sơ đồ bảng tự sinh)
//   - tầng ngữ nghĩa: quyết định, vấn đề, mục thiết kế, sơ đồ, giải thích, từ vựng, điều chưa kiểm, handoff  (từ tài liệu có cấu trúc)
// Kho KHÔNG chứa nội dung tài liệu: mỗi nút chỉ giữ tên, một dòng tóm tắt và ĐỊA CHỈ (tệp:dòng) trỏ về bản gốc. Bản gốc là tệp trong repo.
// Kho dựng từ bản ĐÃ COMMIT (HEAD) của từng repo, không dùng model, tất định: cùng commit và cùng mã bộ dựng thì ra cùng kết quả.
// Xóa kho đi thì dựng lại được hoàn toàn. Phần agent viết (từ vựng, quan hệ bổ sung, giải thích và kết quả soát của sơ đồ tự sinh)
// nằm trong repo dịch vụ ở docs/context/ (annotations.js ghi), không nằm ở đây.
// Không viết riêng cho dịch vụ nào; thêm dịch vụ không phải sửa gì.
// CỔNG VÀ BỘ CHUYỂN: tệp này là LÕI. Nó giữ mô hình (nút, cạnh, vùng tối), cách đọc commit, và việc hoàn thiện kho; nó KHÔNG biết
// loại tài liệu, ngôn ngữ hay loại cửa vào nào. Mọi việc nhận dạng nằm ở recognizers/ (mỗi loại một tệp, nạp qua sổ đăng ký recognizers/index.js).
// Thêm một loại tài liệu mới = thêm một tệp ở recognizers/sources/; không sửa tệp này.
// spec: CTX-S-003
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const core = require('../../../servicedocs/mcp/docs/core');
const yaml = require('../../../core/core/lib/yaml-lite');
const specs = require('../../../diagrams/core/diagrams/spec');
const scanner = require('./context-scan');
const registry = require('./recognizers');
const P = require('../../../core/gate/gate-paths');
const { cut, mdItems, ID } = require('./recognizers/kit');
const { CONF, TYPES, ROOT_NAME, create: createModel } = require('../../core/context/graph');
const { Graph, linkMentions, finalize } = createModel({ cut, ID });

const TEXT_EXT = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.mts', '.cts', '.py', '.md', '.yaml', '.yml', '.json', '.sql']);
const MAX_BYTES = 1024 * 1024;
const OUT = () => path.join(core.BSN_DIR, 'docs', 'portal', '_context');

const posix = (p) => p.split(path.sep).join('/');

// ---------- đọc MỌI tệp văn bản của commit HEAD bằng hai lời gọi git (không đọc thư mục đang sửa dở) ----------
function git(dir, args, input) {
  const r = spawnSync('git', ['-C', dir, ...args], { input, timeout: 60000, windowsHide: true, maxBuffer: 256 * 1024 * 1024 });
  return r.status === 0 && !r.error ? r.stdout : null;
}
function headOf(dir) {
  const top = git(dir, ['rev-parse', '--show-toplevel']);
  if (!top) return null;
  if (path.resolve(top.toString().trim()).toLowerCase() !== path.resolve(dir).toLowerCase()) {
    // Thư mục con của một repo (đơn vị nằm trong repo gốc): lấy commit gần nhất CHẠM tới thư mục đó, để kho chỉ dựng lại khi đơn vị đổi.
    // Thư mục chưa có tệp nào được commit (ví dụ một dịch vụ chưa git init, bị gitignore ở repo gốc) thì không có commit: trả null như trước.
    const last = git(dir, ['log', '-1', '--format=%H', '--', '.']);
    return last && last.toString().trim() ? last.toString().trim() : null;
  }
  const sha = git(dir, ['rev-parse', 'HEAD']);
  return sha ? sha.toString().trim() : null;
}
// keep(path) lọc tệp cần đọc. Trả Map<đường dẫn posix, văn bản>.
function readTree(dir, keep = () => true) {
  const ls = git(dir, ['ls-tree', '-r', '-l', '-z', 'HEAD']);
  const all = new Set(); // mọi tệp git theo dõi ở commit này, kể cả tệp không đọc nội dung
  const out = new Map();
  out.all = all;
  if (!ls) return out;
  const want = [];
  for (const row of ls.toString('utf8').split('\0')) {
    const m = /^\d+ blob ([0-9a-f]+)\s+(\d+)\t(.+)$/.exec(row);
    if (!m) continue;
    const p = m[3];
    all.add(p);
    if (Number(m[2]) > MAX_BYTES || !TEXT_EXT.has(path.posix.extname(p)) || scanner.SKIP_DIR.test(p) || /(^|\/)package-lock\.json$/.test(p) || !keep(p)) continue;
    want.push({ sha: m[1], path: p });
  }
  if (!want.length) return out;
  const buf = git(dir, ['cat-file', '--batch'], want.map((w) => w.sha).join('\n') + '\n');
  if (!buf) return out;
  let at = 0;
  for (const w of want) {
    const nl = buf.indexOf(10, at);
    if (nl < 0) break;
    const head = buf.slice(at, nl).toString('utf8').split(' ');
    const size = Number(head[2]);
    if (head[1] !== 'blob' || !Number.isFinite(size)) break;
    out.set(w.path, buf.slice(nl + 1, nl + 1 + size).toString('utf8').replace(/\r\n/g, '\n'));
    at = nl + 1 + size + 1;
  }
  return out;
}

function recognise(g, scope, ctx) {
  for (const r of registry.load('source')) {
    if (!r.scopes.includes(scope)) continue;
    g.by = r.id;
    try { r.run(g.sink(), { U: (x) => x, L: (x) => x, ...ctx, svc: g.svc, scope }); } catch (e) { g.dark.push(`bộ nhận dạng "${r.id}" (${r.file}) lỗi: ${e.message}`); }
  }
  g.by = 'lõi';
}

// Lời nhắc trong tài liệu: tên tệp có thật và mã mục khác -> cạnh "nhắc tới" (máy đọc chữ, không hiểu nghĩa).
function producer() {
  const h = crypto.createHash('sha256');
  // Các tệp của bộ dựng nằm ở ba khối; hỏi gate-paths chỗ thật của từng tệp theo đường dẫn logic (ghép chuỗi '..' sai ở bố cục khối).
  const root = P.rootFrom(__dirname);
  for (const f of ['mcp/context/context.js', 'mcp/context/context-scan.js', 'mcp/diagrams/diagrams.js', 'core/diagrams/spec.js', 'core/lib/yaml-lite.js']) h.update(fs.readFileSync(P.codePath(root, f)));
  // Mọi bộ nhận dạng cũng là một phần của bộ dựng: thêm hay sửa một tệp ở recognizers/ thì kho dựng lại.
  for (const f of registry.sourceFiles()) { h.update(path.basename(f)); h.update(fs.readFileSync(f)); }
  return h.digest('hex').slice(0, 16);
}

// Tờ khai báo của từng dịch vụ: mỗi dịch vụ một tệp infra/services/<tên>.json, tên tệp là tên dịch vụ.
const infraFile = (name) => `infra/services/${name}.json`;
function readInfra(rootFiles) {
  const out = {};
  for (const [p, text] of rootFiles) {
    const m = /^infra\/services\/([^/]+)\.json$/.exec(p);
    if (!m) continue;
    try { out[m[1]] = JSON.parse(text); } catch { /* tờ hỏng thì bỏ qua dịch vụ đó; infra/bsn.js check mới là nơi báo lỗi */ }
  }
  return out;
}

// Tệp NGOÀI thư mục của đơn vị mà đơn vị khai để kho đọc thêm (units.json, trường `reads`). Đọc bản ĐÃ COMMIT ở repo gốc.
// Trong kho, tệp mang đường dẫn tương đối tính từ thư mục của đơn vị, nên luôn bắt đầu bằng "../": nhìn là biết tệp nằm ngoài đơn vị.
// Tệp chưa commit, quá lớn hay không phải văn bản thì bỏ qua. Trả Map<đường dẫn trong kho, văn bản>.
function readExtra(name) {
  const out = new Map();
  const unit = P.serviceRel(core.BSN_DIR, name);
  for (const rel of P.unitReads(core.BSN_DIR, name)) {
    if (!TEXT_EXT.has(path.posix.extname(rel))) continue;
    const buf = git(core.BSN_DIR, ['show', `HEAD:${rel}`]);
    if (!buf || buf.length > MAX_BYTES) continue;
    out.set(path.posix.relative(unit, rel), buf.toString('utf8').replace(/\r\n/g, '\n'));
  }
  return out;
}
// Dấu của các tệp đọc thêm: chúng đổi thì kho của đơn vị dựng lại, dù thư mục của đơn vị không có commit mới.
function extraKey(name) {
  const extra = readExtra(name);
  if (!extra.size) return '';
  const h = crypto.createHash('sha256');
  for (const [p, text] of [...extra.entries()].sort()) { h.update(p); h.update(text); }
  return `+doc-them:${h.digest('hex').slice(0, 12)}`;
}

// GHI CHÉP TẠI CHỖ: đơn vị khai ghi chép không vào git thì phần tại chỗ của nó (<đơn vị>/.harness/) không có trong commit nào. Đọc phần
// đó từ đĩa và chồng lên cây của commit; mã vẫn chỉ đọc từ commit. Trả Map<đường dẫn posix trong đơn vị, văn bản>.
function readLocal(dir, layout) {
  const out = new Map();
  const walk = (d) => {
    let entries = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const abs = path.join(d, e.name);
      if (e.isDirectory()) { walk(abs); continue; }
      const p = path.relative(dir, abs).split(path.sep).join('/');
      if (!TEXT_EXT.has(path.posix.extname(p))) continue;
      try { if (fs.statSync(abs).size <= MAX_BYTES) out.set(p, fs.readFileSync(abs, 'utf8').replace(/\r\n/g, '\n')); } catch { /* tệp vừa mất */ }
    }
  };
  walk(path.join(dir, ...layout.localRel.split('/')));
  return out;
}
// Dấu của phần tại chỗ: nó đổi thì kho của đơn vị dựng lại dù không có commit mới. Đơn vị không ở chế độ tại chỗ thì ''.
function localKey(name) {
  const layout = P.unitLayout(core.BSN_DIR, name);
  if (!layout.local) return '';
  const h = crypto.createHash('sha256');
  for (const [p, text] of readLocal(core.dirOf(name), layout)) { h.update(p); h.update(text); }
  return `+tai-cho:${h.digest('hex').slice(0, 12)}`;
}

function buildService(name, infra) {
  const dir = core.dirOf(name);
  const layout = P.unitLayout(core.BSN_DIR, name);
  const files = readTree(dir);
  if (layout.local) for (const [p, text] of readLocal(dir, layout)) { files.set(p, text); files.all.add(p); }
  for (const [p, text] of readExtra(name)) { files.set(p, text); files.all.add(p); }
  const g = new Graph(name);
  const facts = scanner.scan(files);
  // U: tên logic của phần tại chỗ -> đường dẫn thật trong đơn vị; L: chiều ngược ('' khi tệp không thuộc phần tại chỗ). Bộ nhận dạng
  // tìm ghi chép của đơn vị qua hai hàm này, nên đúng cho cả bố cục gom trong .harness/.
  const U = (logical) => P.unitRealRel(layout, logical);
  const L = (real) => P.unitLogicalRel(layout, real);
  recognise(g, 'service', { files, infra: infra[name] || null, allInfra: infra, facts, entryKinds: registry.load('entry'), U, L });
  linkMentions(g, [name]);
  // Tệp có thật trong commit nhưng không phải mã (tệp cấu hình, script triển khai) mà có cạnh trỏ tới: thành nút tệp, không để cạnh treo.
  for (const e of g.edges) for (const end of [e.src, e.dst]) {
    const m = new RegExp(`^file:${name}:(.+)$`).exec(end);
    if (m && !g.nodes.has(end) && files.all.has(m[1])) g.node(end, 'file', m[1], `${m[1]}:1`, { text: 'tệp không phải mã nguồn', attrs: { lang: 'khác' } });
  }
  const known = new Set(Object.keys(infra).map(ID.svc));
  for (const id of g.keys) if (/\|dec:_he:/.test(id)) known.add(id.split('|')[1]);
  const out = finalize(g, known);
  const m = g.meta;
  return { ...out, facts: { files: facts.files.length, imports: facts.imports.length, entries: facts.entries.length, dynamic: facts.dynamic.length }, externals: m.externals || [], depends: m.depends || [], provides: m.provides || [],
    entryKinds: m.entryKinds || [], auto: m.auto || [], infra: infra[name] || null, title: m.title || name };
}

function buildRoot(rootFiles, infra) {
  const g = new Graph(ROOT_NAME);
  g.node(ID.svc(ROOT_NAME), 'service', `Cả hệ ${P.projectConfig(core.BSN_DIR).name}`, 'docs/system/services.md:1', { text: 'Phần chung: quyết định, handoff, hạ tầng' });
  recognise(g, 'root', { files: rootFiles, infra: null, allInfra: infra, facts: null, entryKinds: [] });
  linkMentions(g, [ROOT_NAME]);
  return { ...finalize(g, new Set()), infra };
}

// infra/ có thể là MỘT REPO GIT RIÊNG nằm trong thư mục gốc (kho deploy) và bị gitignore ở repo gốc. Khi đó tờ khai báo và README
// của nó được đọc từ commit của chính repo đó (đường dẫn trong repo: services/<tên>.json), và hiện trong kho dưới tên infra/... như cũ.
// Không có repo riêng thì đọc từ cây của repo gốc như trước. Trả mã commit của repo infra (hoặc '').
function mergeInfraRepo(rootFiles) {
  const dir = path.join(core.BSN_DIR, 'infra');
  if (!fs.existsSync(path.join(dir, '.git'))) return '';
  const commit = headOf(dir);
  if (!commit) return '';
  const sub = readTree(dir);
  for (const p of [...rootFiles.keys()]) if (p.startsWith('infra/')) rootFiles.delete(p);
  for (const p of [...rootFiles.all]) if (p.startsWith('infra/')) rootFiles.all.delete(p);
  for (const [p, text] of sub) rootFiles.set(`infra/${p}`, text);
  for (const p of sub.all) rootFiles.all.add(`infra/${p}`);
  return commit;
}

// Dựng (hoặc dùng lại) kho của mọi dịch vụ và của phần chung. Ghi docs/portal/_context/<tên>.json. Trả { services: {tên: kho}, root, built: [tên đã dựng lại] }.
function buildAll({ force = false } = {}) {
  fs.mkdirSync(OUT(), { recursive: true });
  const prod = producer();
  const built = [];
  const rootFiles = readTree(core.BSN_DIR, (p) => p === 'CLAUDE.md' /* gốc dự án */ || p.startsWith('docs/system/') || p.startsWith('docs/handoff/') || p.startsWith('infra/'));
  const infraCommit = mergeInfraRepo(rootFiles);
  const infra = readInfra(rootFiles);
  const infraKey = crypto.createHash('sha256').update(JSON.stringify(infra)).digest('hex').slice(0, 12);
  const load = (name, commit, make, extra = '') => {
    const file = path.join(OUT(), `${name}.json`);
    const key = `${commit}${extra}:${prod}:${infraKey}`;
    if (!force && fs.existsSync(file)) { try { const old = JSON.parse(fs.readFileSync(file, 'utf8')); if (old.key === key) return old; } catch { /* dựng lại */ } }
    const fresh = { name, commit, key, ...make() };
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(fresh));
    fs.renameSync(tmp, file);
    built.push(name);
    return fresh;
  };
  const services = {};
  for (const name of core.listAllServices()) {
    const local = localKey(name);
    const commit = headOf(core.dirOf(name)) || (local ? 'tai-cho' : null); // ghi chép tại chỗ: đơn vị chưa có commit nào vẫn có kho
    if (!commit) continue;
    services[name] = load(name, commit, () => buildService(name, infra), extraKey(name) + local);
  }
  const rootCommit = (headOf(core.BSN_DIR) || 'chua-co-commit') + (infraCommit ? `+infra:${infraCommit}` : '');
  const root = load(ROOT_NAME, rootCommit, () => buildRoot(rootFiles, infra));
  return { services, root, built };
}

// Đọc kho đã dựng (không dựng lại). null nếu chưa có.
function loadAll() {
  if (!fs.existsSync(OUT())) return null;
  const out = { services: {}, root: null };
  for (const f of fs.readdirSync(OUT()).filter((x) => x.endsWith('.json')).sort()) {
    let g;
    try { g = JSON.parse(fs.readFileSync(path.join(OUT(), f), 'utf8')); } catch { continue; }
    if (g.name === ROOT_NAME) out.root = g; else if (g.name) out.services[g.name] = g;
  }
  return out.root || Object.keys(out.services).length ? out : null;
}

module.exports = { buildAll, loadAll, buildService, buildRoot, readTree, headOf, producer, mdItems, Graph, finalize, recognise, ID, CONF, TYPES, ROOT_NAME, OUT, cut, posix };
