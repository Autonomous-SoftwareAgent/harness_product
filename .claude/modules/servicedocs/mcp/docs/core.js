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

// ---------- gốc đang làm và giao dịch: bộ máy ghi tài liệu của lõi (adapters/storage/unit-docs.js) ----------
// Tệp này giữ phần BA TẦNG; chọn đơn vị và giao dịch có khóa là việc chung của mọi khối ghi tài liệu nên nằm ở lõi.
const E = require('../../../core/adapters/storage/unit-docs');
const P = require('../../../core/gate/gate-paths');
const { BSN_DIR, SERVICES_DIR, dirOf, serviceName, setRoot, withService, serviceRoot, listServices, listAllServices, readText, writeText, fileExists, makeDir, transaction, store } = E;
const { DESIGN_FIELDS, SPEC_FIELDS, IMPL_FIELDS, DESIGN_STATUS, IMPL_STATUS, INACTIVE_DESIGN, ID_RE, hash, norm, oneLine, pad, num, list, parseDoc, serialize, designHash, specHash, find, addStubs, HASH_EXT, markerHint, ENTRY_SECTIONS, formatCheck, normalizeTasks } = require('../../core/docs/tiers');

const SCAN_EXT = new Set(['.js', '.ts', '.tsx', '.jsx', '.mjs', '.cjs', '.py', '.go', '.java', '.cs', '.rs', '.kt', '.sql', '.sh', '.ps1', '.yml', '.yaml', '.vue', '.html', '.css']);
// `external` holds reference projects (not project code); the rest are generated or vendored folders.
// 'docs' ở đây là tên logic: thư mục ghi chép thật của đơn vị được bỏ qua riêng trong scanCode (E.DOCS).
const SCAN_SKIP = new Set(['node_modules', '.git', /* tên logic */ 'docs', '.claude', 'external', 'dist', 'build', 'coverage', 'vendor', '.venv', '__pycache__', 'target', '.next']);

// ---------- small helpers ----------
const today = () => new Date().toISOString().slice(0, 10);

// ---------- module files ----------
const FILES = {
  design: { file: '1-design.md', order: DESIGN_FIELDS },
  spec: { file: '2-spec.md', order: SPEC_FIELDS },
  impl: { file: '3-impl.md', order: IMPL_FIELDS },
};
const modDir = (m) => path.join(E.MODULES, m);

function listModules() {
  if (!fs.existsSync(E.MODULES)) return [];
  return fs.readdirSync(E.MODULES, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
}

function loadModule(name) {
  const dir = modDir(name);
  if (!fs.existsSync(dir)) throw new Error(`Module '${name}' không tồn tại. Module hiện có: ${listModules().join(', ') || '(chưa có)'}`);
  const mod = { name, dir };
  for (const [kind, { file }] of Object.entries(FILES)) {
    const p = path.join(dir, file);
    if (!fileExists(p)) throw new Error(`Thiếu ${path.relative(E.ROOT,p)}`);
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
  makeDir(modDir(name)); // chỉ thư mục module: HTML cho người đọc nằm ở cổng docs/portal, không có artifacts/ trong dịch vụ
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
  const entry = E.rel('CLAUDE.md');
  try { text = fs.readFileSync(E.at('CLAUDE.md'), 'utf8'); } catch { return [`[${entry}] dịch vụ chưa có tệp cửa vào ${entry} (bổ sung khung: node .claude/modules/core/cli/new-service.js <tên>)`]; }
  const heads = text.split(/\r?\n/).filter((l) => /^## /.test(l)).map((l) => l.slice(3).trim());
  const out = ENTRY_SECTIONS.filter((s) => !heads.some((h) => h.startsWith(s))).map((s) => `[${entry}] thiếu mục bắt buộc "## ${s}" (khuôn tệp cửa vào: Phạm vi, Đọc gì khi nào, Quy tắc riêng, Lệnh thường dùng; skill services)`);
  const at = heads.findIndex((h) => h.startsWith('Đọc gì khi nào'));
  if (at >= 0 && !/docs\/agent\/STATUS\.md/.test(text)) out.push(`[${entry}] mục "Đọc gì khi nào" chưa trỏ tới ${E.rel('docs/agent/STATUS.md')}`);
  return out;
}
function scanCode() {
  const refs = new Map(); // id -> Set(relative file)
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (SCAN_SKIP.has(e.name) || (dir === E.ROOT && e.name === 'tools') || path.join(dir, e.name) === E.DOCS) continue;
        walk(path.join(dir, e.name));
      } else if (SCAN_EXT.has(path.extname(e.name))) {
        const p = path.join(dir, e.name);
        if (fs.statSync(p).size > 1024 * 1024) continue;
        const text = fs.readFileSync(p, 'utf8');
        for (const m of text.matchAll(/\bspec:\s*([A-Z][A-Z0-9]*-S-\d{3})/g)) {
          if (!refs.has(m[1])) refs.set(m[1], new Set());
          refs.get(m[1]).add(path.relative(E.ROOT,p).split(path.sep).join('/'));
        }
      }
    }
  };
  walk(E.ROOT);
  // .claude/modules/context/mcp is excluded above; other tools/* folders are scanned.
  const tools = path.join(E.ROOT,'tools');
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
  const agentDir = path.join(E.DOCS, 'agent');
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
      const where = path.relative(E.ROOT,doc).split(path.sep).join('/');
      const abs = [path.join(E.ROOT,m[1]), path.join(BSN_DIR, m[1])].find((c) => fs.existsSync(c) && fs.statSync(c).isFile());
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
            const abs = path.join(E.ROOT,c);
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
  errors.push(...require('./service-doc').checkErrors()); // nguồn có cấu trúc docs/service.yaml (nếu dịch vụ có)
  // Phép kiểm do các khối khác góp (khóa `checks` trong tệp tự khai): sơ đồ (thiếu loại, sơ đồ dữ liệu tự sinh đã cũ: chỉ nhắc),
  // kho ngữ nghĩa (từ vựng, quan hệ bổ sung, giải thích sơ đồ tự sinh: chỉ ghi qua công cụ). Khối tắt thì phép kiểm của nó không chạy.
  const checks = P.contributions(BSN_DIR, 'checks').map((c) => require(c.file));
  for (const c of checks) if (c.checkErrors) errors.push(...c.checkErrors());
  for (const c of checks) if (c.checkWarnings) warnings.push(...c.checkWarnings());
  writeTraceability(rows);
  return { errors, warnings, notes, rows };
}

function writeTraceability(rows) {
  const byModule = new Map();
  for (const r of rows) byModule.set(r.module, [...(byModule.get(r.module) || []), r]);
  let out = `<!-- GENERATED by .claude/modules/context/mcp. Do not edit. -->\n# Traceability\n\nDesign -> Spec -> Impl -> Code. Sinh tự động từ \`${E.rel('docs/modules')}/*\`.\n`;
  if (!rows.length) out += '\n_(chưa có module nào)_\n';
  for (const [m, rs] of byModule) {
    out += `\n## ${m}\n\n| Design | Spec | Tiêu đề | D | S | I | Code | Vấn đề |\n|---|---|---|---|---|---|---|---|\n`;
    for (const r of rs) out += `| ${r.did} | ${r.sid} | ${oneLine(r.title)} | ${r.design} | ${r.spec} | ${r.impl} | ${r.code.join('<br>') || '-'} | ${r.issues.length ? r.issues.length : '-'} |\n`;
  }
  makeDir(E.GENERATED);
  const p = path.join(E.GENERATED, 'traceability.md');
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
  if (code !== undefined) for (const c of code) if (!fs.existsSync(path.join(E.ROOT,c))) throw new Error(`File code không tồn tại: ${c}`);
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
    return E.ROOT;
  },
  get LAYOUT() {
    return E.LAYOUT;
  },
  rel: E.rel,
  at: E.at,
  unitAt: E.unitAt,
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
