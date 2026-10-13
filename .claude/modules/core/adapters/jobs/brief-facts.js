'use strict';
// spec: HOOK-S-003
// spec: HOOK-S-009
// BỘ CHUYỂN việc của harness, phần dữ kiện cho tóm tắt đầu phiên: gom từ đĩa và từ các phần khác của harness những điều mà lõi
// (core/sessions/brief.js) cần để viết tóm tắt. Mỗi mục lấy riêng và lỗi của mục nào thì chỉ mục đó bị bỏ (không làm hỏng việc mở phiên).
// Không khóa, không sửa mã hay docs. Việc ghi duy nhất: cài git hook cho repo còn thiếu (ensureGitHooks) và chuyển tệp phạm vi kiểu cũ vào sổ.
const fs = require('node:fs');
const path = require('node:path');

const P = require('../../gate/gate-paths');

const SERVICE_RE = /^[a-z][a-z0-9-]{1,40}$/;

function services(root) {
  return P.serviceEntries(root)
    .filter((d) => SERVICE_RE.test(d.name) && ['agent', 'modules'].some((x) => fs.existsSync(P.unitPath(root, d.name, `docs/${x}`))))
    .map((d) => d.name);
}

// Tình trạng docs của một dịch vụ, dạng dữ kiện (lõi viết thành chữ).
function serviceFacts(root, name, parts = {}) {
  const docs = P.unitPath(root, name, 'docs');
  const out = { name, yamlRel: P.unitPathRel(root, name, 'docs/service.yaml'), yaml: 'missing', modules: fs.existsSync(path.join(docs, 'modules')), statusSize: null };
  const y = path.join(docs, 'service.yaml');
  if (fs.existsSync(y)) {
    try {
      const doc = parts.yaml().parse(fs.readFileSync(y, 'utf8'));
      const live = (doc.problems || []).filter((p) => p.status !== 'resolved');
      out.yaml = { live: live.length, high: live.filter((p) => p.severity === 'high').length };
    } catch { out.yaml = 'unreadable'; }
  }
  try { out.statusSize = fs.statSync(path.join(docs, 'agent', 'STATUS.md')).size; } catch { /* chưa có STATUS.md */ }
  return out;
}

function openHandoffs(root) {
  const dir = path.join(root, 'docs', 'handoff');
  let files = [];
  try { files = fs.readdirSync(dir); } catch { return []; }
  return files.filter((f) => f.endsWith('.md') && f.toLowerCase() !== 'readme.md').sort().filter((f) => {
    try { return /^Trạng thái:\s*open\b/im.test(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { return false; }
  });
}

// Bảo đảm repo gốc và mọi dịch vụ có git hook post-commit (cổng docs/portal dựng lại theo commit). Tự cài cho repo còn thiếu,
// nên dịch vụ có từ trước hay vừa xuất hiện đều không cần ai nhớ cài tay. Không ghi đè hook của người khác: trả tên các repo đó để nhắc.
// Việc ghi duy nhất ở đây là tệp trong .git/hooks; không đụng mã hay docs. Lỗi thì bỏ qua.
function ensureGitHooks(root, parts = {}) {
  const foreign = [];
  const installed = [];
  const banForeign = [];
  const rootPush = [];
  let tool;
  try { tool = parts.gitHooks(); } catch { return { foreign, installed, banForeign, rootPush }; }
  for (const name of ['.', ...services(root)]) {
    try {
      const r = tool.install(name === '.' ? root : P.serviceDir(root, name), { bsn: root });
      if (r.status === 'foreign') foreign.push(name === '.' ? '(gốc)' : name);
      if (r.status === 'installed' || r.status === 'updated') installed.push(name === '.' ? '(gốc)' : name);
      // Hook quét từ cấm đi cùng: repo có hook khác ở đó thì KHÔNG được quét, phải nói ra.
      const b = tool.installBan ? tool.installBan(name === '.' ? root : P.serviceDir(root, name), { bsn: root }) : null;
      if (b && b.status === 'foreign') banForeign.push(name === '.' ? '(gốc)' : name);
      // Repo gốc không bao giờ đẩy: có remote, hoặc không đặt được chốt chặn đẩy, thì phải nói ra.
      if (b && name === '.') { if (b.remotes && b.remotes.length) rootPush.push(`đang có remote ${b.remotes.join(', ')}`); if (b.hooks['push-lock'] === 'missing') rootPush.push('chưa có chốt chặn đẩy trong cấu hình git'); if (b.hooks['pre-push'] === 'foreign') rootPush.push('pre-push là hook khác, không từ chối đẩy'); }
    } catch { /* bỏ qua repo này */ }
  }
  return { foreign, installed, banForeign, rootPush };
}

// Bảo đảm gốc dự án khai các máy chủ MCP của harness (mỗi khối đang bật một cái) trong .mcp.json: Claude Code chỉ đọc tệp đó ở gốc,
// ngoài thư mục .claude/ mà người dùng chép vào. Chưa có tệp thì tạo; có tệp mà thiếu máy chủ nào thì THÊM máy chủ đó, giữ nguyên mọi mục
// khác (kể cả máy chủ cũ "bsn-docs": gỡ nó là việc của bước chuyển cấu hình và của `setup`, không phải của lời nhắc đầu phiên).
// Tệp hỏng thì không đụng. Trả 'created' | 'added' | 'ok' | 'broken'.
function ensureMcpJson(root) {
  const file = path.join(root, '.mcp.json');
  let want = [];
  try { want = P.mcpServers(root); } catch { /* không đọc được tệp tự khai */ }
  if (!want.length) want = [{ name: 'bsn-docs', block: '', file: 'core/mcp/mcp-server.js' }];
  const entry = (s) => ({ command: 'node', args: s.block ? [P.codeRel(root, s.file), s.block] : [P.codeRel(root, s.file)] });
  let cfg = null;
  if (fs.existsSync(file)) {
    try { cfg = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return 'broken'; }
    if (!cfg || typeof cfg !== 'object') return 'broken';
    const have = cfg.mcpServers && typeof cfg.mcpServers === 'object' ? cfg.mcpServers : {};
    const miss = want.filter((s) => !have[s.name]);
    if (!miss.length) return 'ok';
    cfg.mcpServers = { ...have, ...Object.fromEntries(miss.map((s) => [s.name, entry(s)])) };
    fs.writeFileSync(file, `${JSON.stringify(cfg, null, 2)}\n`);
    return 'added';
  }
  fs.writeFileSync(file, `${JSON.stringify({ mcpServers: Object.fromEntries(want.map((s) => [s.name, entry(s)])) }, null, 2)}\n`);
  return 'created';
}

// Dữ kiện về danh sách từ cấm của máy: { rel, hasWords, banForeign }, hoặc undefined khi không nạp được bộ đọc danh sách.
function bannedFacts(root, hooks, parts = {}) {
  const rel = path.relative(root, P.bannedListPath(root)).split(path.sep).join('/');
  let words = null;
  try { words = parts.bannedScan().loadWords(root); } catch { return undefined; }
  return { rel, hasWords: Boolean(words), banForeign: hooks.banForeign || [] };
}

// BẢN MỚI CỦA GÓI. Lệnh `upgrade check` ghi kết quả lần kiểm gần nhất; ở đây chỉ đọc kết quả đó để báo một dòng, và khi kết quả đã cũ
// hơn một ngày thì cho một tiến trình nền chạy `upgrade auto`: lấy bản mới về bản clone của kho gói, có bản mới thì DỰNG SẴN (gói mới,
// phần đã gộp, báo cáo theo từng mục thay đổi) vào thư mục trạng thái. Không bao giờ tự cài: cài là việc sau khi người dùng duyệt.
// Dự án chưa biết kho gói ở đâu thì không làm gì. Bớt việc: khóa upgrade.auto của dự án (check, off). Tắt việc kiểm nền: BSN_UPGRADE_AUTOCHECK=0.
const DAY_MS = 24 * 3600 * 1000;
function upgradeNotice(root, now = Date.now()) {
  const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };
  // Chưa kiểm lần nào nhưng lệnh cài đã ghi nhận kho gói: coi như lần kiểm đã cũ, để lần kiểm đầu tiên tự chạy.
  const memo = readJson(path.join(P.localDir(root), 'upgrade.json'));
  const last = readJson(path.join(P.stateDir(root), 'upgrade-check.json')) || (memo && memo.source ? { source: memo.source, at: 0 } : null);
  if (!last || !last.source) return '';
  const files = readJson(path.join(P.modulesHome(root), 'FILES.json'));
  const installed = files && files.version ? String(files.version) : '';
  if (installed && process.env.BSN_UPGRADE_AUTOCHECK !== '0' && now - Date.parse(last.at || 0) > DAY_MS) {
    try {
      const child = require('node:child_process').spawn(process.execPath, [P.codePath(root, 'cli/cli.js'), 'upgrade', 'auto'], { cwd: root, detached: true, stdio: 'ignore', windowsHide: true });
      child.unref();
    } catch { /* không kiểm nền được: lần sau thử lại */ }
  }
  if (!last.newer || !installed || last.installed !== installed) return '';
  // Đã dựng sẵn ở nền (gói mới, phần đã gộp, báo cáo theo từng mục thay đổi): agent đọc báo cáo rồi trình người dùng; chưa cài gì.
  const stage = path.join(P.stateDir(root), 'upgrade', String(last.latest));
  if (last.prepared && last.prepared.to === last.latest && fs.existsSync(path.join(stage, 'BAO-CAO.md')) && (readJson(path.join(stage, 'DA-CHAY.json')) || {}).result !== 'applied') {
    return `HARNESS CÓ BẢN MỚI ${last.latest} (đang cài ${installed}), ĐÃ DỰNG SẴN, chưa cài gì. Mở skill harness-upgrade; đọc ${path.relative(root, stage).split(path.sep).join('/')}/BAO-CAO.md rồi trình người dùng TỪNG MỤC thay đổi (đổi gì, ở đâu, hành vi mới, chạm gì tới dự án này) và xin ý kiến. Chỉ cài sau khi người dùng duyệt.`;
  }
  return `HARNESS CÓ BẢN MỚI ${last.latest} (đang cài ${installed}). Báo người dùng; xem trước sẽ đổi gì và phần đã sửa gộp tới đâu: node ${P.codeRel(root, 'cli/cli.js')} upgrade prepare (skill harness-upgrade). Chỉ cài sau khi người dùng duyệt.`;
}

// Mọi dữ kiện cho tóm tắt đầu phiên của phiên `sid`. `sessions` là phần bảng phiên (bên gọi đưa vào: otherSessions, myTitle),
// `skillHealth` là hàm kiểm sổ phiên, `importScopeFiles` là hàm chuyển tệp phạm vi kiểu cũ vào sổ (bên gọi đưa vào: bộ chuyển không nhập nhau).
// `parts` là các phần khác của harness, do CỬA VÀO đưa vào dưới dạng hàm trả module: { yaml, gitHooks, bannedScan, portal, contextPortal, mcpTools }.
function gather(root, sid, { now = Date.now(), sessions, skillHealth, importScopeFiles, extensions, mcp, parts = {} } = {}) {
  const svcs = services(root);
  const hooks = ensureGitHooks(root, parts);
  const f = { services: svcs.map((s) => serviceFacts(root, s, parts)), hooks, handoffs: openHandoffs(root), notices: [], toolCount: 0, advertise: false };
  try { f.others = sessions.otherSessions(root, sid, { now }); } catch { /* bỏ qua */ }
  try { f.title = sessions.myTitle(sid); } catch { /* bỏ qua */ }
  try { f.skillHealth = skillHealth(root); } catch { /* chưa có sổ phiên */ }
  try { f.banned = bannedFacts(root, hooks, parts); } catch { /* bỏ qua */ }
  try { f.publish = parts.portal().publishBrief() || ''; } catch { /* chưa có bộ dựng cổng */ }
  // Lời nhắc dùng kho ngữ nghĩa chỉ hiện khi đã bật cho mọi phiên (context.config.json: advertise, hoặc biến BSN_CONTEXT_ADVERTISE=1 để thử).
  try { f.advertise = process.env.BSN_CONTEXT_ADVERTISE === '1' || parts.contextPortal().config().advertise === true; } catch { /* chưa có kho */ }
  try {
    const kho = parts.contextPortal();
    for (const s of svcs) { const t = kho.noticeFor(s); if (t) f.notices.push(t); }
  } catch { /* chưa có kho: bỏ qua */ }
  // Tệp scope-<phiên>.json của cách lưu cũ: chuyển vào sổ rồi xóa (một lần; không còn tệp thì không làm gì).
  try { importScopeFiles(root); } catch { /* bỏ qua */ }
  try { f.scopeMode = P.scopeMode(root); } catch { /* bỏ qua */ }
  try { f.toolCount = parts.mcpTools().list().length; } catch { /* không nạp được lớp công cụ: không nêu số */ }
  try { f.mcpServers = P.mcpServers(root).map((s) => s.name); } catch { /* không đọc được tệp tự khai: không nêu tên */ }
  // Cấu hình dự án: thư mục chứa đơn vị; và dự án đã cài đặt chưa (chưa có cấu hình nào, cấu hình hỏng, hay chưa khai đơn vị nào).
  try {
    const cfg = P.projectConfig(root);
    f.parents = cfg.units.parents;
    if (cfg.broken) f.onboard = '.claude/project/project.json không đọc được';
    else if (!cfg.units.parents.length && !Object.keys(P.extraUnits(root)).length) f.onboard = cfg.exists ? 'project.json chưa khai đơn vị nào' : 'chưa có .claude/project/project.json';
  } catch { /* bỏ qua */ }
  try { const m = ensureMcpJson(root); if (m !== 'ok') f.mcpJson = m; } catch { /* bỏ qua */ }
  try { const u = upgradeNotice(root, now); if (u) f.notices.push(u); } catch { /* bỏ qua */ }
  // Khối mở rộng: bên gọi đưa vào hàm tính tình trạng; không có gì đáng nói thì không có dòng.
  try { const x = extensions(root); if (x && x.lines.length) f.extensions = x; } catch { /* bỏ qua */ }
  // Cổng MCP: máy chủ chưa xác nhận, đã sửa sau lần xác nhận, đang hỏng, khai báo hỏng.
  try { const x = mcp ? mcp(root) : null; if (x && x.lines.length) f.mcp = x; } catch { /* bỏ qua */ }
  return f;
}

module.exports = { services, serviceFacts, openHandoffs, ensureGitHooks, ensureMcpJson, bannedFacts, upgradeNotice, gather };
