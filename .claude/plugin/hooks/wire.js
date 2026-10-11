'use strict';
// spec: HOOK-S-007
// spec: LEDG-S-004
// CỬA VÀO, phần lắp ráp dùng chung của các tệp hook (S-055). Đây là nơi DUY NHẤT của các luật biết cả lõi lẫn bộ chuyển:
// chọn bộ chuyển cho từng cổng, tìm luật, rồi giao cho bộ chuyển Claude Code chạy. Mỗi tệp hook chỉ còn vài dòng gọi `hook(...)`.
// Lõi (core/) không nhập bộ chuyển; bộ chuyển (adapters/) không nhập lõi; cổng (ports/) không nhập gì. Test kiến trúc giữ ba điều đó.
const fs = require('node:fs');
const path = require('node:path');

const PLUGIN = path.resolve(__dirname, '..');
const ROOT = path.resolve(PLUGIN, '..', '..');
const RULES_DIR = path.join(PLUGIN, 'core', 'rules');

// Các phần khác của harness mà bộ chuyển "việc của harness" nhờ. Đưa vào dưới dạng hàm trả module để chỉ nạp lúc cần;
// thiếu tệp thì hàm ném lỗi và bên gọi xử lý như trước (bỏ qua, hoặc ghi nhật ký).
const PARTS = {
  portal: () => require('../mcp/portal/portal'),
  contextPortal: () => require('../mcp/context/context-portal'),
  mcpTools: () => require('../mcp/mcp-tools'),
  yaml: () => require('../core/lib/yaml-lite'),
  gitHooks: () => require('../cli/install-git-hooks'),
  bannedScan: () => require('../cli/banned-scan'),
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

// Một luật theo id. Quy ước: luật `id` nằm ở core/rules/<id>.js. Sổ đăng ký kiểm luật đúng dạng.
function rule(id) {
  const reg = require('../core/rules/registry').create();
  reg.add(require(path.join(RULES_DIR, `${id}.js`)), `core/rules/${id}.js`);
  return reg.get(id);
}

// Mọi luật đang có: mỗi tệp .js ngay trong core/rules/ (trừ sổ đăng ký) là một luật. Thêm luật là thêm tệp; trùng id là lỗi.
function allRules() {
  const reg = require('../core/rules/registry').create();
  for (const f of fs.readdirSync(RULES_DIR).filter((n) => n.endsWith('.js') && n !== 'registry.js').sort()) reg.add(require(path.join(RULES_DIR, f)), `core/rules/${f}`);
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

module.exports = { ROOT, PLUGIN, PARTS, ports, rule, allRules, hook, briefFacts };
