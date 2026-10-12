'use strict';
// spec: HOOK-S-007
// spec: HOOK-S-010
// spec: LEDG-S-004
// CỬA VÀO, phần lắp ráp dùng chung của các tệp hook (S-055). Đây là nơi DUY NHẤT của các luật biết cả lõi lẫn bộ chuyển:
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
// Mỗi phần do một khối khai ở khóa `provides` trong tệp tự khai của nó (S-064); cửa vào này không nhập thẳng khối nào khác lõi.
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
// (S-064: dự án thêm luật mà không sửa mã của harness). [{ id, file, ext }], luật của harness trước.
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

// Chạy các luật MỞ RỘNG của dự án nghe sự kiện `kind` (S-064). Luật chạy theo thứ tự id; quyết định khác "cho qua" đầu tiên thắng.
// Như mọi hook của harness: lỗi của một luật thì cho qua (Claude Code cũng cho qua khi hook hỏng) và ghi ra stderr.
function extensionHook({ kind, root = ROOT, shell = false }) {
  const host = require('../adapters/claude-code/hook');
  return host.serve({
    name: 'project-rules', kind, root, badInput: 'skip', cwdFallback: process.cwd(),
    shell: shell ? require('../gate/bash-targets').analyzeBash : null,
  }, async (event) => {
    const reg = require('../core/rules/registry').create();
    for (const f of ruleFiles(root).filter((x) => x.ext)) {
      try { reg.add(require(f.file), `rules/${f.id}.js (mở rộng của dự án)`, { extension: true }); } catch (e) { process.stderr.write(`project-rules: ${e.message}\n`); }
    }
    const ps = ports(root);
    for (const r of reg.forKind(kind)) {
      let decision = null;
      try { decision = await r.run(event, ps, {}); } catch (e) { process.stderr.write(`project-rules: ${r.id}: ${e.message}\n`); continue; }
      if (decision) { await recordDecision(ps, r.id, event, decision); return decision; }
    }
    return null;
  });
}

// Ghi mọi quyết định khác "cho qua" của một luật vào sổ quyết định (act_rule_decisions, S-060), để đo được luật nào chặn bao nhiêu,
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
  });
}

module.exports = { ROOT, PLUGIN, PARTS, ports, rule, allRules, ruleFiles, hook, extensionHook, briefFacts };
