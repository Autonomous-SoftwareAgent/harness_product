'use strict';
// spec: MCP-S-002
// spec: MCP-S-003
// spec: MCP-S-004
// Core of the 3-layer docs system: design (1) -> spec (2) -> impl (3).
// Everything is plain Markdown with `## ID: title` blocks and `- key: value` fields,
// so humans can read it and this module can parse, scaffold and verify it.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ---------- service root ----------
// Công cụ này dùng chung cho mọi service và nằm ở BSN_/.claude/plugin/mcp. "Gốc" ở đây là thư mục của MỘT service (nơi có docs/),
// chọn bằng tham số `service` của từng lời gọi (withService), hoặc mặc định theo BSN_SERVICE, BSN_ROOT, cwd, rồi payment-hub.
const BSN_DIR = path.resolve(__dirname, '..', '..', '..', '..');
const P = require('../../gate/gate-paths');
const SERVICES_DIR = P.servicesDir(BSN_DIR); // dịch vụ nằm trong BSN_/system_service/; đơn vị ngoài (infra) khai ở .claude/plugin/units.json
const dirOf = (name) => P.serviceDir(BSN_DIR, name);
const SERVICE_RE = /^[a-z][a-z0-9-]{1,40}$/;

let ROOT;
let DOCS;
let MODULES;
let GENERATED;

function setRoot(root) {
  ROOT = path.resolve(root);
  DOCS = path.join(ROOT, 'docs');
  MODULES = path.join(DOCS, 'modules');
  GENERATED = path.join(DOCS, '_generated');
}

// Tên dịch vụ của gốc đang chọn. Gốc là thư mục của một đơn vị khai ở units.json thì lấy TÊN ĐƠN VỊ (tên có thể khác tên thư mục: harness nằm ở
// .claude/plugin); ngược lại lấy tên thư mục (dịch vụ trong system_service/, hoặc gốc tùy ý do test đặt).
function serviceName() {
  const unit = P.serviceOf(BSN_DIR, ROOT);
  return unit && path.resolve(dirOf(unit)).toLowerCase() === ROOT.toLowerCase() ? unit : path.basename(ROOT);
}

function serviceRoot(name) {
  if (!SERVICE_RE.test(String(name))) throw new Error(`Tên service '${name}' không hợp lệ (chữ thường, số, dấu gạch ngang)`);
  const dir = dirOf(name);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new Error(`Service '${name}' không tồn tại trong ${SERVICES_DIR}`);
  return dir;
}

const serviceDirs = () => P.serviceEntries(BSN_DIR);

function listServices() {
  return serviceDirs()
    .filter((d) => fs.existsSync(path.join(d.dir, 'docs', 'modules')))
    .map((d) => d.name)
    .sort();
}

// Mọi dịch vụ (kể cả dịch vụ chưa dùng tài liệu ba tầng): thư mục có docs/agent hoặc docs/modules. Dùng cho cổng HTML và tóm tắt đầu phiên.
function listAllServices() {
  return serviceDirs()
    .filter((d) => ['agent', 'modules'].some((x) => fs.existsSync(path.join(d.dir, 'docs', x))))
    .map((d) => d.name)
    .sort();
}

function defaultRoot() {
  if (process.env.BSN_SERVICE) return serviceRoot(process.env.BSN_SERVICE);
  if (process.env.BSN_ROOT) return path.resolve(process.env.BSN_ROOT);
  const top = P.serviceOf(BSN_DIR, process.cwd());
  if (top && SERVICE_RE.test(top) && fs.existsSync(path.join(dirOf(top), 'docs', 'modules'))) return dirOf(top);
  const def = defaultUnit();
  if (!def) throw new Error('Cần truyền `service`: dự án chưa khai đơn vị mặc định (defaultUnit trong .claude/plugin/project.json).');
  return serviceRoot(def);
}
// Đơn vị mặc định khi lời gọi không truyền `service` (cấu hình dự án, S-063; BSN_ khai payment-hub). '' = luôn phải truyền.
function defaultUnit() { return P.projectConfig(BSN_DIR).defaultUnit; }

// Chạy fn với gốc là service đã chọn rồi trả gốc cũ. Đồng bộ nên không có hai lời gọi xen vào nhau trong một tiến trình.
function withService(name, fn) {
  const prev = ROOT;
  setRoot(name ? serviceRoot(name) : defaultRoot());
  try {
    return fn();
  } finally {
    if (prev) setRoot(prev);
  }
}

try {
  setRoot(defaultRoot());
} catch {
  setRoot(BSN_DIR); // chưa chọn được service: mọi công cụ vẫn phải truyền `service`
}

// ---------- giao dịch: đọc và ghi trong cùng một khóa, cam kết mọi tệp của một thao tác như MỘT đơn vị ----------
// Mỗi thao tác công cụ (design_record, spec_fill, impl_link, docs_check...) chạy trong transaction(): giữ khóa `docs-<service>`,
// đọc đĩa MỚI NHẤT (kể cả thay đổi vừa có của phiên khác), gom mọi ghi vào bộ đệm, rồi cam kết tất cả một lần (nguyên tử, có sao lưu
// và hoàn tác). Thao tác ném lỗi thì không ghi gì. Nhờ đọc rồi ghi ngay trong khóa nên hai phiên không thể ghi đè cập nhật của nhau.
const store = require('../../adapters/storage/docs-store');
const { DESIGN_FIELDS, SPEC_FIELDS, IMPL_FIELDS, DESIGN_STATUS, IMPL_STATUS, INACTIVE_DESIGN, ID_RE, hash, norm, oneLine, pad, num, list, parseDoc, serialize, designHash, specHash, find, addStubs, HASH_EXT, markerHint, ENTRY_SECTIONS, formatCheck, normalizeTasks } = require('../../core/docs/tiers');

let TX = null; // { writes: Map(đường dẫn tuyệt đối -> nội dung), dirs: [thư mục mới tạo] } khi đang trong một thao tác
const lockName = () => `docs-${serviceName()}`;

const readText = (p) => (TX && TX.writes.has(p) ? TX.writes.get(p) : fs.readFileSync(p, 'utf8'));
const fileExists = (p) => (TX && TX.writes.has(p)) || fs.existsSync(p);

function makeDir(p) {
  if (fs.existsSync(p)) return;
  const created = []; // mọi thư mục tổ tiên sẽ được tạo mới, từ sâu nhất lên
  for (let cur = p; !fs.existsSync(cur); cur = path.dirname(cur)) created.push(cur);
  fs.mkdirSync(p, { recursive: true });
  if (TX) TX.dirs.push(...created); // hủy giao dịch thì dọn các thư mục rỗng đã tạo (từ sâu lên), khỏi để lại module mồ côi
}

function transaction(reason, fn) {
  if (TX) return fn(); // lồng nhau: dùng chung giao dịch ngoài cùng
  return store.withLock(BSN_DIR, lockName(), () => {
    TX = { writes: new Map(), dirs: [] };
    try {
      const result = fn();
      const changes = [];
      for (const [p, content] of TX.writes) {
        if (!fs.existsSync(p) || fs.readFileSync(p, 'utf8') !== content) changes.push({ path: p, content });
      }
      if (changes.length) store.commit(BSN_DIR, changes, { reason, service: serviceName(), lock: lockName() });
      return result;
    } catch (err) {
      for (const d of TX.dirs) { try { fs.rmdirSync(d); } catch { /* không rỗng hoặc đã mất */ } }
      throw err;
    } finally {
      TX = null;
    }
  });
}

function writeText(p, content) {
  if (TX) TX.writes.set(p, content);
  else transaction('ghi tệp', () => TX.writes.set(p, content));
}

const SCAN_EXT = new Set(['.js', '.ts', '.tsx', '.jsx', '.mjs', '.cjs', '.py', '.go', '.java', '.cs', '.rs', '.kt', '.sql', '.sh', '.ps1', '.yml', '.yaml', '.vue', '.html', '.css']);
// `external` holds reference projects (not BSN code); the rest are generated or vendored folders.
const SCAN_SKIP = new Set(['node_modules', '.git', 'docs', '.claude', 'external', 'dist', 'build', 'coverage', 'vendor', '.venv', '__pycache__', 'target', '.next']);

// ---------- small helpers ----------
const today = () => new Date().toISOString().slice(0, 10);

// ---------- module files ----------
const FILES = {
  design: { file: '1-design.md', order: DESIGN_FIELDS },
  spec: { file: '2-spec.md', order: SPEC_FIELDS },
  impl: { file: '3-impl.md', order: IMPL_FIELDS },
};
const modDir = (m) => path.join(MODULES, m);

function listModules() {
  if (!fs.existsSync(MODULES)) return [];
  return fs.readdirSync(MODULES, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
}

function loadModule(name) {
  const dir = modDir(name);
  if (!fs.existsSync(dir)) throw new Error(`Module '${name}' không tồn tại. Module hiện có: ${listModules().join(', ') || '(chưa có)'}`);
  const mod = { name, dir };
  for (const [kind, { file }] of Object.entries(FILES)) {
    const p = path.join(dir, file);
    if (!fileExists(p)) throw new Error(`Thiếu ${path.relative(ROOT, p)}`);
    mod[kind] = parseDoc(readText(p));
  }
  mod.prefix = mod.design.front.prefix;
  if (!mod.prefix) throw new Error(`${name}/1-design.md thiếu 'prefix' trong frontmatter`);
  return mod;
}

function saveModule(mod, kinds = ['design', 'spec', 'impl']) {
  for (const kind of kinds) {
    writeText(path.join(mod.dir, FILES[kind].file), serialize(mod[kind], FILES[kind].order));
  }
}

function ensureModule(name, prefix) {
  if (!/^[a-z][a-z0-9-]{1,30}$/.test(name)) throw new Error(`Tên module '${name}' không hợp lệ (chữ thường, số, dấu gạch ngang; 2-31 ký tự)`);
  if (fs.existsSync(modDir(name))) {
    const mod = loadModule(name);
    if (prefix && prefix !== mod.prefix) throw new Error(`Module '${name}' đã có prefix '${mod.prefix}', không thể đổi thành '${prefix}'`);
    return mod;
  }
  prefix = prefix || name.replace(/[^a-z0-9]/g, '').slice(0, 4).toUpperCase();
  if (!/^[A-Z][A-Z0-9]{1,5}$/.test(prefix)) throw new Error(`Prefix '${prefix}' không hợp lệ (2-6 ký tự in hoa/số, bắt đầu bằng chữ)`);
  for (const m of listModules()) {
    if (loadModule(m).prefix === prefix) throw new Error(`Prefix '${prefix}' đã được module '${m}' dùng`);
  }
  makeDir(modDir(name)); // chỉ thư mục module: HTML cho người đọc nằm ở cổng BSN_/docs/portal, không có artifacts/ trong dịch vụ
  const titles = {
    design: `# ${name} - Design (tầng 1)\n\nVì sao và cái gì: quyết định nghiệp vụ và kỹ thuật của module. Chỉ ghi qua tool \`design_record\` / \`design_update\`.`,
    spec: `# ${name} - Spec (tầng 2)\n\nDesign được tách thành yêu cầu, contract, tiêu chí nghiệm thu và task. Khung tự sinh từ design; điền qua tool \`spec_fill\`.`,
    impl: `# ${name} - Implementation (tầng 3)\n\nĐã code gì, ở đâu, lệch spec chỗ nào. Ghi qua tool \`impl_link\`.`,
  };
  const mod = { name, dir: modDir(name), prefix };
  for (const kind of Object.keys(FILES)) {
    mod[kind] = { front: kind === 'design' ? { module: name, prefix } : { module: name }, pre: titles[kind], blocks: [] };
  }
  saveModule(mod);
  return mod;
}

// Create missing spec/impl stubs for every design decision. Idempotent.
function syncModule(mod) {
  const created = addStubs(mod);
  if (created.length) saveModule(mod, ['spec', 'impl']);
  return created;
}

// ---------- code scan: chú thích đánh dấu đặc tả, dạng "spec:" theo sau là <PREFIX>-S-<ba chữ số> ----------
// (Không viết một mã ví dụ đầy đủ ở đây: chính tệp này cũng được quét khi harness là một đơn vị, và mã ví dụ sẽ bị báo là mã mồ côi.)
const hasMarker = (abs, sid) => { try { return new RegExp(`\\bspec:\\s*${sid}\\b`).test(fs.readFileSync(abs, 'utf8')); } catch { return false; } };
function entryWarnings() {
  let text;
  try { text = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8'); } catch { return ['[CLAUDE.md] dịch vụ chưa có tệp cửa vào CLAUDE.md (bổ sung khung: node .claude/plugin/cli/new-service.js <tên>)']; }
  const heads = text.split(/\r?\n/).filter((l) => /^## /.test(l)).map((l) => l.slice(3).trim());
  const out = ENTRY_SECTIONS.filter((s) => !heads.some((h) => h.startsWith(s))).map((s) => `[CLAUDE.md] thiếu mục bắt buộc "## ${s}" (khuôn tệp cửa vào: Phạm vi, Đọc gì khi nào, Quy tắc riêng, Lệnh thường dùng; skill services)`);
  const at = heads.findIndex((h) => h.startsWith('Đọc gì khi nào'));
  if (at >= 0 && !/docs\/agent\/STATUS\.md/.test(text)) out.push('[CLAUDE.md] mục "Đọc gì khi nào" chưa trỏ tới docs/agent/STATUS.md');
  return out;
}
function scanCode() {
  const refs = new Map(); // id -> Set(relative file)
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (SCAN_SKIP.has(e.name) || (dir === ROOT && e.name === 'tools')) continue;
        walk(path.join(dir, e.name));
      } else if (SCAN_EXT.has(path.extname(e.name))) {
        const p = path.join(dir, e.name);
        if (fs.statSync(p).size > 1024 * 1024) continue;
        const text = fs.readFileSync(p, 'utf8');
        for (const m of text.matchAll(/\bspec:\s*([A-Z][A-Z0-9]*-S-\d{3})/g)) {
          if (!refs.has(m[1])) refs.set(m[1], new Set());
          refs.get(m[1]).add(path.relative(ROOT, p).split(path.sep).join('/'));
        }
      }
    }
  };
  walk(ROOT);
  // .claude/plugin/mcp is excluded above; other tools/* folders are scanned.
  const tools = path.join(ROOT, 'tools');
  if (fs.existsSync(tools)) {
    for (const e of fs.readdirSync(tools, { withFileTypes: true })) {
      if (e.isDirectory() && e.name !== 'docs') walk(path.join(tools, e.name));
    }
  }
  return refs;
}

// ---------- trích dẫn đường-dẫn:dòng ----------
// Tài liệu (docs/agent/*.md và ba tầng) hay trích mã dạng `src/hub.js:508` hoặc `src/hub.js:508-530`. Kiểm: tệp có tồn tại không và
// dòng có nằm trong tệp không. CHỈ cảnh báo (không chặn): công cụ kiểm trích dẫn có thật, không kiểm nhận định có đúng.
const CITE_RE = /(?<![\w./\\-])((?:[\w.-]+\/)+[\w.-]+\.(?:js|mjs|cjs|ts|tsx|jsx|json|md|sql|yml|yaml|sh|ps1|html|css|go|py)):(\d{1,6})(?:-(\d{1,6}))?(?!\w)/g;
const MAX_CITE_WARNINGS = 40;

function citationWarnings() {
  const docs = [];
  const agentDir = path.join(DOCS, 'agent');
  if (fs.existsSync(agentDir)) for (const n of fs.readdirSync(agentDir)) if (n.endsWith('.md')) docs.push(path.join(agentDir, n));
  for (const m of listModules()) for (const { file } of Object.values(FILES)) {
    const p = path.join(modDir(m), file);
    if (fs.existsSync(p)) docs.push(p);
  }
  const lineCount = new Map();
  const linesOf = (abs) => {
    if (!lineCount.has(abs)) lineCount.set(abs, fs.readFileSync(abs, 'utf8').split('\n').length);
    return lineCount.get(abs);
  };
  const out = [];
  for (const doc of docs) {
    const seen = new Set();
    for (const m of fs.readFileSync(doc, 'utf8').matchAll(CITE_RE)) {
      const cite = `${m[1]}:${m[2]}${m[3] ? `-${m[3]}` : ''}`;
      if (seen.has(cite)) continue;
      seen.add(cite);
      const where = path.relative(ROOT, doc).split(path.sep).join('/');
      const abs = [path.join(ROOT, m[1]), path.join(BSN_DIR, m[1])].find((c) => fs.existsSync(c) && fs.statSync(c).isFile());
      if (!abs) { out.push(`[trích dẫn] ${where}: ${cite} trỏ tới tệp không tồn tại`); continue; }
      const last = Number(m[3] || m[2]);
      const n = linesOf(abs);
      if (last > n) out.push(`[trích dẫn] ${where}: ${cite} vượt quá số dòng của tệp (${n} dòng)`);
    }
  }
  if (out.length > MAX_CITE_WARNINGS) return [...out.slice(0, MAX_CITE_WARNINGS), `[trích dẫn] ... còn ${out.length - MAX_CITE_WARNINGS} trích dẫn lệch nữa (chỉ hiện ${MAX_CITE_WARNINGS} đầu)`];
  return out;
}

// ---------- check ----------
function check() {
  return transaction('docs_check', checkInner);
}

function checkInner() {
  const errors = [];
  const warnings = [];
  const notes = [];
  const rows = [];
  const refs = scanCode();
  const knownSpecIds = new Set();
  const journaled = store.lastShas(BSN_DIR); // băm của lần cam kết gần nhất của công cụ, để phát hiện sửa tay ngoài công cụ

  for (const name of listModules()) {
    let mod;
    try {
      mod = loadModule(name);
    } catch (e) {
      errors.push(`[${name}] ${e.message}`);
      continue;
    }
    for (const { file } of Object.values(FILES)) {
      const p = path.join(mod.dir, file);
      const key = path.relative(BSN_DIR, p).split(path.sep).join('/');
      if (journaled.has(key) && store.fileSha(p) !== journaled.get(key)) {
        warnings.push(`[${name}] ${file} đã đổi ngoài công cụ kể từ lần ghi cuối của bsn-docs (sửa tay? tầng này chỉ ghi qua design_record/spec_fill/impl_link)`);
      }
    }
    const created = syncModule(mod);
    if (created.length) notes.push(`[${name}] đã tự tạo khung: ${created.join(', ')}`);

    for (const b of mod.design.blocks) {
      const m = ID_RE.exec(b.id);
      if (!m || m[1] !== mod.prefix || m[2] !== 'D') errors.push(`[${name}] design ${b.id}: ID không khớp prefix ${mod.prefix}-D-nnn`);
      if (!DESIGN_STATUS.includes(b.fields.status)) errors.push(`[${name}] ${b.id}: status '${b.fields.status}' không hợp lệ (${DESIGN_STATUS.join('|')})`);
    }
    const ids = mod.design.blocks.map((b) => b.id);
    if (new Set(ids).size !== ids.length) errors.push(`[${name}] design có ID trùng`);

    for (const s of mod.spec.blocks) {
      knownSpecIds.add(s.id);
      const d = find(mod.design, s.fields.from);
      if (!d || `${mod.prefix}-S-${pad(num(d.id))}` !== s.id) errors.push(`[${name}] spec ${s.id}: 'from' (${s.fields.from}) không trỏ tới design tương ứng`);
    }
    for (const i of mod.impl.blocks) if (!find(mod.spec, i.id)) errors.push(`[${name}] impl ${i.id}: không có spec tương ứng`);

    for (const d of mod.design.blocks) {
      const sid = `${mod.prefix}-S-${pad(num(d.id))}`;
      const s = find(mod.spec, sid);
      const i = find(mod.impl, sid);
      const issues = [];
      const active = !INACTIVE_DESIGN.includes(d.fields.status);
      if (s && i && active) {
        if (s.fields.status !== 'todo' && s.fields.derived_from !== designHash(d)) issues.push(`STALE: design ${d.id} đã đổi sau lần rà spec cuối -> gọi spec_fill để rà lại`);
        if (!['todo', 'ready'].includes(s.fields.status)) issues.push(`spec status '${s.fields.status}' không hợp lệ (todo|ready)`);
        if (s.fields.status === 'ready' && (!s.fields.requirement || !s.fields.acceptance)) issues.push('spec ready nhưng thiếu requirement hoặc acceptance');
        const is = i.fields.status;
        if (!IMPL_STATUS.includes(is)) issues.push(`impl status '${is}' không hợp lệ (${IMPL_STATUS.join('|')})`);
        else if (is !== 'planned') {
          if (s.fields.status !== 'ready') issues.push('impl đã bắt đầu nhưng spec chưa ready');
          if (i.fields.spec_hash !== specHash(s)) issues.push(`STALE: spec ${sid} đã đổi sau lần impl_link cuối -> rà lại rồi gọi impl_link`);
          const code = list(i.fields.code);
          if (is === 'done' && !code.length) issues.push('impl done nhưng chưa liệt kê code');
          if (is === 'deviated' && !norm(i.fields.deviation)) issues.push('impl deviated nhưng chưa ghi deviation');
          for (const c of code) {
            const abs = path.join(ROOT, c);
            if (!fs.existsSync(abs)) issues.push(`code không tồn tại: ${c}`);
            // Tệp được liệt kê thì đọc thẳng tệp đó: bộ quét bỏ qua vài thư mục (ví dụ tools/ ở gốc dịch vụ) nên bảng refs có thể thiếu nó.
            else if (SCAN_EXT.has(path.extname(c)) && !(refs.get(sid) || new Set()).has(c) && !hasMarker(abs, sid)) warnings.push(`[${name}] ${sid}: ${c} chưa có marker '${markerHint(c, sid)}'`);
          }
        }
        for (const f of refs.get(sid) || []) {
          if (!list(i.fields.code).includes(f)) warnings.push(`[${name}] ${sid}: ${f} có marker nhưng chưa nằm trong impl code`);
        }
      }
      for (const msg of issues) errors.push(`[${name}] ${sid}: ${msg}`);
      rows.push({
        module: name,
        did: d.id,
        sid,
        title: d.title,
        design: d.fields.status,
        spec: s ? s.fields.status : '-',
        impl: i ? i.fields.status : '-',
        code: i ? list(i.fields.code) : [],
        issues,
      });
    }
  }
  for (const [id, files] of refs) {
    if (!knownSpecIds.has(id)) errors.push(`code tham chiếu spec không tồn tại: ${id} (trong ${[...files].join(', ')})`);
  }
  warnings.push(...citationWarnings());
  warnings.push(...entryWarnings());
  errors.push(...[...require('./service-doc').checkErrors(), ...require('../diagrams/diagrams').checkErrors()]); // nguồn có cấu trúc docs/service.yaml (nếu dịch vụ có)
  errors.push(...require('../context/annotations').checkErrors()); // từ vựng, quan hệ bổ sung, giải thích sơ đồ tự sinh: chỉ ghi qua công cụ
  warnings.push(...require('../diagrams/diagrams').checkWarnings()); // thiếu loại sơ đồ, sơ đồ dữ liệu tự sinh đã cũ: nhắc, không chặn
  writeTraceability(rows);
  return { errors, warnings, notes, rows };
}

function writeTraceability(rows) {
  const byModule = new Map();
  for (const r of rows) byModule.set(r.module, [...(byModule.get(r.module) || []), r]);
  let out = '<!-- GENERATED by .claude/plugin/mcp. Do not edit. -->\n# Traceability\n\nDesign -> Spec -> Impl -> Code. Sinh tự động từ `docs/modules/*`.\n';
  if (!rows.length) out += '\n_(chưa có module nào)_\n';
  for (const [m, rs] of byModule) {
    out += `\n## ${m}\n\n| Design | Spec | Tiêu đề | D | S | I | Code | Vấn đề |\n|---|---|---|---|---|---|---|---|\n`;
    for (const r of rs) out += `| ${r.did} | ${r.sid} | ${oneLine(r.title)} | ${r.design} | ${r.spec} | ${r.impl} | ${r.code.join('<br>') || '-'} | ${r.issues.length ? r.issues.length : '-'} |\n`;
  }
  makeDir(GENERATED);
  const p = path.join(GENERATED, 'traceability.md');
  if (!fileExists(p) || readText(p) !== out) writeText(p, out);
}

// ---------- operations used by MCP tools and CLI ----------
function designRecord({ module: name, prefix, title, decision, rationale, impacts = '', status = 'accepted' }) {
  for (const [k, v] of Object.entries({ module: name, title, decision, rationale })) if (!norm(v)) throw new Error(`Thiếu trường bắt buộc: ${k}`);
  if (!DESIGN_STATUS.includes(status)) throw new Error(`status phải là một trong: ${DESIGN_STATUS.join(', ')}`);
  const mod = ensureModule(name, prefix);
  const n = Math.max(0, ...mod.design.blocks.map((b) => num(b.id))) + 1;
  const id = `${mod.prefix}-D-${pad(n)}`;
  mod.design.blocks.push({
    id,
    title: oneLine(title),
    fields: { date: today(), status, decision: norm(decision), rationale: norm(rationale), impacts: norm(impacts) },
  });
  saveModule(mod, ['design']);
  const created = syncModule(mod);
  const res = check();
  return `Đã ghi ${id} vào ${name}/1-design.md.\nĐã tự tạo khung: ${created.join(', ') || '(không)'}.\nBước tiếp theo: spec_fill id=${mod.prefix}-S-${pad(n)} để điền requirement/contract/acceptance/tasks.\n${formatCheck(res, { verbose: false })}`;
}

function locate(id) {
  const m = ID_RE.exec(id || '');
  if (!m) throw new Error(`ID '${id}' không hợp lệ (dạng PREFIX-D-001 hoặc PREFIX-S-001)`);
  for (const name of listModules()) {
    const mod = loadModule(name);
    if (mod.prefix === m[1]) return mod;
  }
  throw new Error(`Không có module nào dùng prefix '${m[1]}'`);
}

function designUpdate({ id, title, decision, rationale, impacts, status }) {
  const mod = locate(id);
  const d = find(mod.design, id);
  if (!d) throw new Error(`Không tìm thấy design ${id}`);
  if (status !== undefined && !DESIGN_STATUS.includes(status)) throw new Error(`status phải là một trong: ${DESIGN_STATUS.join(', ')}`);
  const before = designHash(d);
  if (title !== undefined) d.title = oneLine(title);
  for (const [k, v] of Object.entries({ decision, rationale, impacts, status })) if (v !== undefined) d.fields[k] = norm(v);
  d.fields.date = today();
  saveModule(mod, ['design']);
  const changed = before !== designHash(d);
  const res = check();
  return `${changed ? `Đã cập nhật ${id}. Spec/impl liên quan giờ STALE cho tới khi rà lại (spec_fill rồi impl_link).` : `${id} không có thay đổi nội dung.`}\n${formatCheck(res, { verbose: false })}`;
}

function specFill({ id, requirement, contract, acceptance, tasks, add_tasks }) {
  const mod = locate(id);
  const s = find(mod.spec, id);
  if (!s) throw new Error(`Không tìm thấy spec ${id}`);
  const d = find(mod.design, s.fields.from);
  if (requirement !== undefined) s.fields.requirement = norm(requirement);
  if (contract !== undefined) s.fields.contract = norm(contract);
  if (acceptance !== undefined) s.fields.acceptance = norm(acceptance);
  if (tasks !== undefined) s.fields.tasks = normalizeTasks(tasks);
  if (add_tasks && add_tasks.length) {
    const extra = add_tasks.map((t) => (/^- \[[ xX]\]/.test(t) ? t : `- [ ] ${t}`)).join('\n');
    s.fields.tasks = [norm(s.fields.tasks), extra].filter(Boolean).join('\n');
  }
  s.fields.derived_from = designHash(d);
  s.fields.status = s.fields.requirement && s.fields.acceptance ? 'ready' : 'todo';
  saveModule(mod, ['spec']);
  const res = check();
  const hint = s.fields.status === 'ready' ? `Spec ${id} đã ready.` : `Spec ${id} vẫn todo: cần cả requirement và acceptance.`;
  return `${hint}\n${formatCheck(res, { verbose: false })}`;
}

function implLink({ id, status, code, tests, deviation, notes }) {
  const mod = locate(id);
  const s = find(mod.spec, id);
  const i = find(mod.impl, id);
  if (!s || !i) throw new Error(`Không tìm thấy spec/impl ${id}`);
  if (status !== undefined && !IMPL_STATUS.includes(status)) throw new Error(`status phải là một trong: ${IMPL_STATUS.join(', ')}`);
  if (code !== undefined) for (const c of code) if (!fs.existsSync(path.join(ROOT, c))) throw new Error(`File code không tồn tại: ${c}`);
  if (code !== undefined) i.fields.code = code.join(', ');
  if (tests !== undefined) i.fields.tests = tests.join(', ');
  if (deviation !== undefined) i.fields.deviation = norm(deviation);
  if (notes !== undefined) i.fields.notes = norm(notes);
  const next = status || (norm(deviation) ? 'deviated' : i.fields.status === 'planned' ? 'in-progress' : i.fields.status);
  if (next !== 'planned' && s.fields.status !== 'ready') throw new Error(`Spec ${id} chưa ready; hãy spec_fill trước khi impl_link`);
  i.fields.status = next;
  i.fields.spec_hash = specHash(s);
  saveModule(mod, ['impl']);
  const res = check();
  return `Đã cập nhật impl ${id}: status=${next}.\nQuy ước: đặt marker "spec: ${id}" trong một dòng chú thích của từng file code đã liệt kê, theo cú pháp chú thích của ngôn ngữ (JavaScript: hai gạch chéo; Python, YAML, shell: dấu thăng).\n${formatCheck(res, { verbose: false })}`;
}

function docsStatus({ module: only } = {}) {
  const res = check();
  const rows = res.rows.filter((r) => !only || r.module === only);
  if (only && !listModules().includes(only)) throw new Error(`Module '${only}' không tồn tại`);
  const lines = [];
  if (!rows.length) lines.push('(chưa có module/quyết định nào)');
  let cur = null;
  for (const r of rows) {
    if (r.module !== cur) {
      cur = r.module;
      lines.push(`\n## ${cur}`);
    }
    lines.push(`${r.sid} | design:${r.design} spec:${r.spec} impl:${r.impl} | ${oneLine(r.title)}${r.issues.length ? ' | ' + r.issues.join('; ') : ''}`);
  }
  lines.push('', formatCheck(res));
  return lines.join('\n');
}

const txOp = (reason, fn) => (...args) => transaction(reason, () => fn(...args));

module.exports = {
  get ROOT() {
    return ROOT;
  },
  BSN_DIR,
  serviceName,
  SERVICES_DIR,
  dirOf,
  setRoot,
  withService,
  serviceRoot,
  listServices,
  listAllServices,
  readText,
  writeText,
  fileExists,
  makeDir,
  check,
  formatCheck,
  markerHint,
  entryWarnings,
  ENTRY_SECTIONS,
  // Mỗi thao tác công cụ là MỘT giao dịch (khóa + đọc mới nhất + cam kết một lần). Gọi nội bộ giữa các hàm dùng chung giao dịch ngoài cùng.
  designRecord: txOp('design_record', designRecord),
  designUpdate: txOp('design_update', designUpdate),
  specFill: txOp('spec_fill', specFill),
  implLink: txOp('impl_link', implLink),
  docsStatus: txOp('docs_status', docsStatus),
  listModules,
  loadModule,
  syncModule,
  transaction,
  store,
};
