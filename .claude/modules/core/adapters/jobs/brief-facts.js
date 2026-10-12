'use strict';
// spec: HOOK-S-003
// spec: HOOK-S-009
// BỘ CHUYỂN việc của harness, phần dữ kiện cho tóm tắt đầu phiên (S-055): gom từ đĩa và từ các phần khác của harness những điều mà lõi
// (core/sessions/brief.js) cần để viết tóm tắt. Mỗi mục lấy riêng và lỗi của mục nào thì chỉ mục đó bị bỏ (không làm hỏng việc mở phiên).
// Không khóa, không sửa mã hay docs. Việc ghi duy nhất: cài git hook cho repo còn thiếu (ensureGitHooks) và chuyển tệp phạm vi kiểu cũ vào sổ.
const fs = require('node:fs');
const path = require('node:path');

const P = require('../../gate/gate-paths');

const SERVICE_RE = /^[a-z][a-z0-9-]{1,40}$/;

function services(root) {
  return P.serviceEntries(root)
    .filter((d) => SERVICE_RE.test(d.name) && ['agent', 'modules'].some((x) => fs.existsSync(path.join(d.dir, 'docs', x))))
    .map((d) => d.name);
}

// Tình trạng docs của một dịch vụ, dạng dữ kiện (lõi viết thành chữ).
function serviceFacts(root, name, parts = {}) {
  const docs = path.join(P.serviceDir(root, name), 'docs');
  const out = { name, yaml: 'missing', modules: fs.existsSync(path.join(docs, 'modules')), statusSize: null };
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
      // Repo gốc không bao giờ đẩy (S-035): có remote, hoặc không đặt được chốt chặn đẩy, thì phải nói ra.
      if (b && name === '.') { if (b.remotes && b.remotes.length) rootPush.push(`đang có remote ${b.remotes.join(', ')}`); if (b.hooks['push-lock'] === 'missing') rootPush.push('chưa có chốt chặn đẩy trong cấu hình git'); if (b.hooks['pre-push'] === 'foreign') rootPush.push('pre-push là hook khác, không từ chối đẩy'); }
    } catch { /* bỏ qua repo này */ }
  }
  return { foreign, installed, banForeign, rootPush };
}

// Bảo đảm gốc dự án khai máy chủ MCP bsn-docs trong .mcp.json (S-063): Claude Code chỉ đọc tệp đó ở gốc, ngoài thư mục .claude/ mà người
// dùng chép vào. Chưa có tệp thì tạo; có tệp mà thiếu mục bsn-docs thì THÊM mục đó, giữ nguyên mọi mục khác. Tệp hỏng thì không đụng.
// Trả 'created' | 'added' | 'ok' | 'broken'.
function ensureMcpJson(root) {
  const file = path.join(root, '.mcp.json');
  const entry = { command: 'node', args: ['.claude/modules/core/mcp/mcp-server.js'] };
  let cfg = null;
  if (fs.existsSync(file)) {
    try { cfg = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return 'broken'; }
    if (!cfg || typeof cfg !== 'object') return 'broken';
    if (cfg.mcpServers && cfg.mcpServers['bsn-docs']) return 'ok';
    cfg.mcpServers = { ...(cfg.mcpServers || {}), 'bsn-docs': entry };
    fs.writeFileSync(file, `${JSON.stringify(cfg, null, 2)}\n`);
    return 'added';
  }
  fs.writeFileSync(file, `${JSON.stringify({ mcpServers: { 'bsn-docs': entry } }, null, 2)}\n`);
  return 'created';
}

// Dữ kiện về danh sách từ cấm của máy: { rel, hasWords, banForeign }, hoặc undefined khi không nạp được bộ đọc danh sách.
function bannedFacts(root, hooks, parts = {}) {
  const rel = path.relative(root, P.bannedListPath(root)).split(path.sep).join('/');
  let words = null;
  try { words = parts.bannedScan().loadWords(root); } catch { return undefined; }
  return { rel, hasWords: Boolean(words), banForeign: hooks.banForeign || [] };
}

// Mọi dữ kiện cho tóm tắt đầu phiên của phiên `sid`. `sessions` là phần bảng phiên (bên gọi đưa vào: otherSessions, myTitle),
// `skillHealth` là hàm kiểm sổ phiên, `importScopeFiles` là hàm chuyển tệp phạm vi kiểu cũ vào sổ (bên gọi đưa vào: bộ chuyển không nhập nhau).
// `parts` là các phần khác của harness, do CỬA VÀO đưa vào dưới dạng hàm trả module: { yaml, gitHooks, bannedScan, portal, contextPortal, mcpTools }.
function gather(root, sid, { now = Date.now(), sessions, skillHealth, importScopeFiles, parts = {} } = {}) {
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
  // Cấu hình dự án (S-063): thư mục chứa đơn vị; và dự án đã cài đặt chưa (chưa có cấu hình nào, cấu hình hỏng, hay chưa khai đơn vị nào).
  try {
    const cfg = P.projectConfig(root);
    f.parents = cfg.units.parents;
    if (cfg.broken) f.onboard = '.claude/project/project.json không đọc được';
    else if (!cfg.units.parents.length && !Object.keys(P.extraUnits(root)).length) f.onboard = cfg.exists ? 'project.json chưa khai đơn vị nào' : 'chưa có .claude/project/project.json';
  } catch { /* bỏ qua */ }
  try { const m = ensureMcpJson(root); if (m !== 'ok') f.mcpJson = m; } catch { /* bỏ qua */ }
  return f;
}

module.exports = { services, serviceFacts, openHandoffs, ensureGitHooks, ensureMcpJson, bannedFacts, gather };
