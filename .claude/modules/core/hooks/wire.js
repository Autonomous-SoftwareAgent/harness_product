'use strict';
// spec: HOOK-S-007
// spec: HOOK-S-010
// spec: HOOK-S-011
// spec: LEDG-S-004
// CỬA VÀO, phần lắp ráp dùng chung của các tệp hook. Đây là nơi DUY NHẤT của các luật biết cả lõi lẫn bộ chuyển:
// chọn bộ chuyển cho từng cổng, tìm luật, rồi giao cho bộ chuyển Claude Code chạy. Mỗi tệp hook chỉ còn vài dòng gọi `hook(...)`.
// Lõi (core/) không nhập bộ chuyển; bộ chuyển (adapters/) không nhập lõi; cổng (ports/) không nhập gì. Test kiến trúc giữ ba điều đó.
const fs = require('node:fs');
const path = require('node:path');

const P = require('../gate/gate-paths');

const PLUGIN = path.resolve(__dirname, '..');
const ROOT = P.rootFrom(__dirname);
const RULES_DIR = path.join(PLUGIN, 'core', 'rules');

// Các phần khác của harness mà bộ chuyển "việc của harness" nhờ. Đưa vào dưới dạng hàm trả module để chỉ nạp lúc cần;
// thiếu tệp hoặc khối chứa nó đang tắt thì hàm ném lỗi và bên gọi xử lý như trước (bỏ qua, hoặc ghi nhật ký).
// Mỗi phần do một khối khai ở khóa `provides` trong tệp tự khai của nó; cửa vào này không nhập thẳng khối nào khác lõi.
const part = (name) => () => {
  const f = P.provided(ROOT, name);
  if (!f) throw new Error(`không có khối nào đang bật cung cấp "${name}"`);
  return require(f);
};
const PARTS = {
  portal: part('portal'),
  contextPortal: part('contextPortal'),
  mcpTools: part('mcpTools'),
  yaml: part('yaml'),
  gitHooks: part('gitHooks'),
  bannedScan: part('bannedScan'),
};

// Bộ chuyển cho từng cổng ra, đã kiểm đủ hàm theo hợp đồng. Nạp LÚC CẦN: luật nào không dùng cổng nào thì bộ chuyển của cổng đó không bị nạp
// (một tệp hỏng không kéo sập mọi hook).
function ports(root = ROOT) {
  const made = {};
  const lazy = (name, make) => Object.defineProperty(made, name, { enumerable: true, configurable: true, get() { const v = make(); Object.defineProperty(made, name, { value: v, enumerable: true }); return v; } });
  lazy('workspace', () => require('../ports/workspace').check(require('../adapters/project/workspace').create(root)));
  lazy('store', () => require('../ports/store').check(require('../adapters/storage/store').create(root)));
  lazy('repo', () => require('../ports/repo').check(require('../adapters/git/repo').create(root)));
  lazy('jobs', () => require('../ports/jobs').check(require('../adapters/jobs/jobs').create(root, PARTS)));
  return made;
}

// Tệp luật: mỗi tệp .js ngay trong core/rules/ (trừ sổ đăng ký) của các khối đang bật, rồi luật MỞ RỘNG của dự án ở <thư mục dự án>/rules/
// (dự án thêm luật mà không sửa mã của harness). [{ id, file, ext }], luật của harness trước.
function ruleFiles(root = ROOT) {
  const out = [];
  const on = new Set(P.enabledModules(root).enabled.map((m) => m.name));
  const dirs = P.isModular(root) ? P.codeDirs(root, 'core/rules').filter((d) => on.has(path.relative(P.modulesHome(root), d).split(path.sep)[0])) : [root === ROOT ? RULES_DIR : P.codePath(root, 'core/rules')];
  for (const d of dirs) for (const n of fs.readdirSync(d).filter((x) => x.endsWith('.js') && x !== 'registry.js').sort()) out.push({ id: n.replace(/\.js$/, ''), file: path.join(d, n), ext: false });
  const ext = path.join(P.projectDir(root), 'rules');
  try { for (const n of fs.readdirSync(ext).filter((x) => x.endsWith('.js')).sort()) out.push({ id: n.replace(/\.js$/, ''), file: path.join(ext, n), ext: true }); } catch { /* dự án chưa có luật mở rộng */ }
  return out;
}

// Một luật theo id. Quy ước: luật `id` nằm ở core/rules/<id>.js (hoặc <thư mục dự án>/rules/<id>.js). Sổ đăng ký kiểm luật đúng dạng.
function rule(id, root = ROOT) {
  const reg = require('../core/rules/registry').create();
  const f = ruleFiles(root).find((x) => x.id === id);
  const file = f ? f.file : path.join(RULES_DIR, `${id}.js`);
  reg.add(require(file), f && f.ext ? `rules/${id}.js (mở rộng của dự án)` : `core/rules/${id}.js`, { extension: Boolean(f && f.ext) });
  return reg.get(id);
}

// Mọi luật đang có (của harness và mở rộng của dự án). Thêm luật là thêm tệp; trùng id là lỗi.
function allRules(root = ROOT) {
  const reg = require('../core/rules/registry').create();
  for (const f of ruleFiles(root)) reg.add(require(f.file), f.ext ? `rules/${f.id}.js (mở rộng của dự án)` : `core/rules/${f.id}.js`, { extension: f.ext });
  return reg;
}

// Chạy một tệp hook: sự kiện loại `kind` của Claude Code đi vào luật `id`, quyết định đi ra.
//   cwdFallback  'root' hoặc 'process': thư mục dùng khi Claude Code không gửi cwd
//   shell        true nếu luật cần kết quả phân tích lệnh shell
//   params       tham số cửa vào đưa thêm cho luật (ví dụ dịch vụ lấy từ biến môi trường)
function hook({ name, id, kind, cwdFallback = 'process', shell = false, badInput = 'skip', params, root = ROOT }) {
  const host = require('../adapters/claude-code/hook');
  return host.serve({
    name, kind, root, badInput,
    cwdFallback: cwdFallback === 'root' ? root : process.cwd(),
    shell: shell ? require('../gate/bash-targets').analyzeBash : null,
  }, async (event) => {
    const r = rule(id);
    if (![].concat(r.on).includes(kind)) throw new Error(`luật "${id}" không nghe sự kiện ${kind}`);
    const ps = ports(root);
    const decision = await r.run(event, ps, typeof params === 'function' ? params() : params);
    await recordDecision(ps, r.id, event, decision);
    return decision;
  });
}

// KHỐI MỞ RỘNG: mọi khối của dự án và của các đơn vị, kèm tình trạng xác nhận và khai báo của bản ĐANG CHẠY (bản đã xác nhận).
// [{ key, scope, name, unit, base, state, run, manifest | null, problems: [chữ] }]. Chỉ khối có `manifest` mới chạy.
function extensions(root = ROOT) {
  const A = require('../adapters/project/extensions');
  const C = require('../core/extensions/contract');
  return A.status(root).map((e) => {
    const out = { ...e, manifest: null, problems: [] };
    if (e.state !== 'removed') out.problems.push(...C.checkManifest(e.raw, { scope: e.scope, name: e.name }).problems.map((p) => `bản trong repo: ${p}`));
    if (!e.run) return out;
    const m = C.checkManifest(A.runningManifest(e), { scope: e.scope, name: e.name });
    if (!m.manifest) { out.problems.push(...m.problems.map((p) => `bản đã xác nhận: ${p}`)); return out; }
    out.manifest = m.manifest;
    return out;
  });
}

// Nạp phần `key` ('rules' | 'tools' | 'commands') của một khối đang chạy, từ bản đã xác nhận. Trả { items, problems }.
function extensionParts(ext, key) {
  const C = require('../core/extensions/contract');
  const check = { rules: (x, f) => C.checkRule(x, ext.scope, f), tools: (x, f) => C.checkTool(x, f), commands: (x, f) => C.checkCommand(x, f) }[key];
  const items = [];
  const problems = [];
  for (const f of (ext.manifest && ext.manifest[key]) || []) {
    try {
      const mod = require(path.join(ext.run, ...f.split('/')));
      for (const x of Array.isArray(mod) ? mod : [mod]) items.push({ ...check(x, `${ext.key} ${f}`), file: f });
    } catch (e) { problems.push(`${f}: ${e.message.split('\n')[0]}`); }
  }
  return { items, problems };
}

// Cửa sổ nhìn và cách trả lời của khối `ext` cho sự kiện `event`. `writesAbs`: các tệp việc đó ghi (tuyệt đối).
function extensionCtx(root, ext, event, writesAbs, { write = false } = {}) {
  const A = require('../adapters/project/extensions');
  const C = require('../core/extensions/contract');
  const v = A.view(ext.base, { write });
  const rel = (abs) => A.relIn(ext.base, abs);
  return {
    api: C.EXT_API, kind: event.kind, scope: ext.scope, unit: ext.unit ? { name: ext.unit, dir: ext.base } : null,
    session: event.session || '', agent: event.agent || '', prompt: event.prompt || '', reply: event.reply || '', source: event.source || '',
    action: C.shapeAction(event.action, rel, writesAbs),
    // Đơn vị chứa một đường dẫn tính từ thư mục của khối ('' nếu không thuộc đơn vị nào): khối của cả dự án dùng để xét theo đơn vị.
    unitOf: (p) => P.serviceOf(root, path.resolve(ext.base, String(p || ''))),
    fs: v.fs, git: v.git, ...C.answers(event.kind),
  };
}

// Các tệp một việc ghi (đường dẫn tuyệt đối): tệp của lần ghi, và đích của lệnh shell khi cửa vào có phân tích lệnh.
function writesOf(event, root) {
  const a = event.action || {};
  const out = [];
  if (a.type === 'write-file' && a.file) out.push(path.resolve(a.file));
  if (a.shell && Array.isArray(a.shell.targets)) for (const t of a.shell.targets) out.push(P.resolveToken(t, event.cwd || root));
  return out;
}

const withTimeout = (p, ms, what) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error(`${what}: quá ${ms} ms`)), ms);
  p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
});

// Khối của đơn vị chỉ nhận việc đụng tới đơn vị của nó: tệp ghi nằm trong đơn vị, hoặc công cụ được gọi với service là đơn vị đó.
function touchesUnit(root, unit, event, writesAbs) {
  const a = event.action || {};
  if (writesAbs.some((f) => P.serviceOf(root, f) === unit)) return true;
  if (a.file && P.serviceOf(root, a.file) === unit) return true;
  return Boolean(a.args && a.args.service === unit);
}

// Chạy luật MỞ RỘNG nghe sự kiện `kind`: luật kiểu cũ ở <thư mục dự án>/rules/ (api 0.1) và luật của các khối mở rộng đã xác nhận
//. Mọi quyết định được gộp, chặn mạnh nhất thắng: khối chỉ chặn thêm được, không nới được gì (luật của harness là hook riêng,
// Claude Code gộp theo cùng cách). Luật hỏng hay quá giờ thì cho qua, ghi ra stderr và sổ lỗi để doctor, tóm tắt đầu phiên báo.
function extensionHook({ kind, root = ROOT, shell = false }) {
  const host = require('../adapters/claude-code/hook');
  return host.serve({
    name: 'project-rules', kind, root, badInput: 'skip', cwdFallback: process.cwd(),
    shell: shell ? require('../gate/bash-targets').analyzeBash : null,
  }, async (event) => runExtensions(root, kind, event));
}

// Luật có nhận công cụ của việc này không. Nhóm hook trong settings.json gộp matcher của MỌI luật (và luôn có các công cụ ghi mặc định),
// nên từng luật phải tự lọc: luật khai matcher thì chỉ nhận đúng công cụ đó, không khai thì nhận các công cụ ghi mặc định.
// Chỉ lọc ở before-action: các loại sự kiện khác được khai không kèm matcher. Matcher đọc như Claude Code đọc: một biểu thức khớp trọn tên.
const { DEFAULT_MATCHER } = require('../core/extensions/contract');
function wantsTool(kind, matcher, event) {
  if (kind !== 'before-action') return true;
  const tool = String((event.action && event.action.tool) || '');
  if (!tool) return true;
  const m = typeof matcher === 'string' && matcher ? matcher : DEFAULT_MATCHER;
  try { return new RegExp(`^(?:${m})$`).test(tool); } catch { return m.split('|').includes(tool); }
}

async function runExtensions(root, kind, event) {
  const A = require('../adapters/project/extensions');
  const C = require('../core/extensions/contract');
  const ps = ports(root);
  const decisions = [];
  const fail = (key, rule, e) => {
    process.stderr.write(`project-rules: ${key} ${rule}: ${e.message}\n`);
    A.logError(root, { key, rule, kind, error: e.message.split('\n')[0].slice(0, 300) });
  };
  // Luật kiểu cũ (api 0.1).
  const reg = require('../core/rules/registry').create();
  const legacyMatcher = new Map();
  for (const f of ruleFiles(root).filter((x) => x.ext)) {
    try { const mod = require(f.file); reg.add(mod, `rules/${f.id}.js (mở rộng của dự án)`, { extension: true }); legacyMatcher.set(mod.id, mod.matcher); } catch (e) { fail('rules', f.id, e); }
  }
  for (const r of reg.forKind(kind)) {
    if (!wantsTool(kind, legacyMatcher.get(r.id), event)) continue;
    let d = null;
    try { d = await r.run(event, ps, {}); } catch (e) { fail('rules', r.id, e); continue; }
    if (d) { await recordDecision(ps, r.id, event, d); decisions.push(d); }
  }
  // Khối mở rộng đã xác nhận.
  const writesAbs = writesOf(event, root);
  let exts = [];
  try { exts = extensions(root).filter((x) => x.manifest); } catch (e) { fail('extensions', '-', e); }
  const runs = [];
  for (const ext of exts) {
    if (ext.scope === 'unit' && (!C.UNIT_KINDS.includes(kind) || !touchesUnit(root, ext.unit, event, writesAbs))) continue;
    const { items, problems } = extensionParts(ext, 'rules');
    for (const p of problems) fail(ext.key, '-', new Error(p));
    for (const r of items.filter((x) => x.on.includes(kind) && wantsTool(kind, x.matcher, event))) {
      runs.push((async () => {
        try {
          const d = await withTimeout(Promise.resolve().then(() => r.run(extensionCtx(root, ext, event, writesAbs))), ext.manifest.timeoutMs, `luật ${r.id}`);
          const l = C.label(kind, ext, r.id, d);
          if (l) { await recordDecision(ps, `${ext.name}/${r.id}`, event, l); decisions.push(l); }
        } catch (e) { fail(ext.key, r.id, e); }
      })());
    }
  }
  await Promise.all(runs);
  return C.merge(decisions);
}

// Ghi mọi quyết định khác "cho qua" của một luật vào sổ quyết định (act_rule_decisions), để đo được luật nào chặn bao nhiêu,
// ở dịch vụ nào, dưới kế hoạch nào. Ghi ở MỘT chỗ này cho mọi luật, nên luật không phải tự ghi. Lỗi thì bỏ qua: quyết định giữ nguyên.
async function recordDecision(ps, ruleId, event, decision) {
  if (!decision || !event.session) return;
  try {
    const a = event.action || {};
    let service = typeof decision.service === 'string' ? decision.service : '';
    if (!service && a.file) { const s = ps.workspace.serviceOf(a.file); if (ps.workspace.isService(s)) service = s; }
    if (!service && a.args && typeof a.args.service === 'string' && ps.workspace.isService(a.args.service)) service = a.args.service;
    const detail = typeof decision.detail === 'string' ? decision.detail : String(decision.reason || '').split('\n')[0];
    await ps.store.decision({ sid: event.session, agent: event.agent || '', rule: ruleId, kind: event.kind, tool: a.tool || '', service, verdict: decision.verdict, detail });
  } catch { /* bỏ qua */ }
}

// Dữ kiện cho tóm tắt đầu phiên của phiên `sid`: bộ chuyển gom, với bảng phiên, sổ phiên và các phần khác của harness do đây đưa vào.
function briefFacts(root, sid, now = Date.now()) {
  return require('../adapters/jobs/brief-facts').gather(root, sid, {
    now,
    parts: PARTS,
    sessions: { otherSessions: (...a) => require('./sessions-lib').otherSessions(...a), myTitle: (...a) => require('./sessions-lib').myTitle(...a) },
    skillHealth: (r) => require('./ledger-lib').health(r),
    importScopeFiles: (r) => require('./scope-lib').importScopeFiles(r),
    extensions: (r) => extensionsBrief(r, now),
    mcp: (r) => mcpBrief(r, now),
  });
}

// Các điều về máy chủ MCP sau cổng mà phiên cần biết: chưa xác nhận, đã sửa sau lần xác nhận, đang hỏng, khai báo hỏng.
// Trả { lines: [chữ], cli }; rỗng khi mọi máy chủ chạy đúng hoặc dự án không khai máy chủ nào.
function mcpBrief(root, now = Date.now()) {
  const lines = [];
  const M = require('../adapters/project/mcp-servers');
  const st = M.status(root);
  const live = require('../cli/mcp').live(root, now);
  for (const p of st.problems) lines.push(`khai báo hỏng, bị bỏ qua (${p})`);
  for (const s of st.list) {
    const l = live[s.name];
    if (s.state === 'untrusted') lines.push(`${s.name} chưa được xác nhận nên KHÔNG chạy (mã ${s.token})`);
    else if (s.state === 'changed') lines.push(`${s.name} đã sửa sau lần xác nhận, đang chạy bản đã xác nhận (mã của bản mới: ${s.token})`);
    else if (l && (l.status === 'broken' || l.status === 'paused')) lines.push(`${s.name} đang ${l.status === 'paused' ? 'bị tạm ngắt' : 'hỏng'}: ${l.error || 'chưa rõ'} (cổng tự thử lại; máy chủ khác vẫn chạy)`);
  }
  return { lines, cli: P.codeRel(root, 'cli/cli.js') };
}

// Các điều về khối mở rộng mà phiên và người dùng cần biết: khối chưa xác nhận, đã sửa, đã xóa, khai báo hỏng, lỗi lúc chạy
// trong 24 giờ qua. Trả { lines: [chữ], cli } ; rỗng khi mọi khối chạy đúng.
function extensionsBrief(root, now = Date.now()) {
  const lines = [];
  for (const e of extensions(root)) {
    if (e.state === 'untrusted') lines.push(`${e.key} chưa được xác nhận nên KHÔNG chạy`);
    else if (e.state === 'changed') lines.push(`${e.key} đã sửa sau lần xác nhận, đang chạy bản đã xác nhận`);
    else if (e.state === 'removed') lines.push(`${e.key} đã xóa khỏi repo nhưng bản đã xác nhận vẫn chạy`);
    if (e.problems.length) lines.push(`${e.key} khai báo hỏng: ${e.problems[0]}`);
  }
  const errs = require('../adapters/project/extensions').recentErrors(root, new Date(now - 24 * 3600 * 1000).toISOString());
  const byKey = {};
  for (const x of errs) byKey[x.key] = (byKey[x.key] || 0) + 1;
  for (const [k, n] of Object.entries(byKey)) lines.push(`${k} lỗi lúc chạy ${n} lần trong 24 giờ (luật lỗi thì cho qua)`);
  return { lines, cli: P.codeRel(root, 'cli/cli.js') };
}

module.exports = { ROOT, PLUGIN, PARTS, ports, rule, allRules, ruleFiles, hook, extensionHook, runExtensions, wantsTool, DEFAULT_MATCHER, mcpBrief, extensions, extensionParts, extensionCtx, writesOf, briefFacts };
