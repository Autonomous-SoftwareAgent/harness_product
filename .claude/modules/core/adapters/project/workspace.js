'use strict';
// spec: HOOK-S-007
// spec: HOOK-S-009
// BỘ CHUYỂN dự án: làm cổng "dự án" (ports/workspace.js) bằng cây thư mục và các tệp cấu hình trên đĩa.
// Mọi đường dẫn của harness vẫn sinh ở MỘT nơi là gate/gate-paths.js; tệp này chỉ gọi lại và đọc tệp.
const fs = require('node:fs');
const path = require('node:path');
const P = require('../../gate/gate-paths');

const crypto = require('node:crypto');

const posix = (p) => String(p).split(path.sep).join('/');

// Những thứ Claude Code chỉ nạp một lần lúc phiên mở, kèm dấu nội dung lúc này: tệp hướng dẫn ở gốc dự án; máy chủ MCP của harness
// (tệp khai .mcp.json và lớp bề mặt mà phiên giữ thành một tiến trình). Thứ nào không có trên đĩa thì không nêu.
function loadedOnce(root) {
  const sha = (parts) => { const h = crypto.createHash('sha256'); let any = false; for (const f of parts) { try { h.update(fs.readFileSync(f)); any = true; } catch { h.update('(thiếu)'); } } return any ? h.digest('hex').slice(0, 12) : ''; };
  const out = [];
  const guide = sha([path.join(root, 'CLAUDE.md')]);
  if (guide) out.push({ id: 'instructions', label: 'CLAUDE.md ở gốc dự án', stamp: guide });
  let surface = '';
  try { surface = P.codePath(root, 'mcp/mcp-server.js'); } catch { /* không có khối nào giữ máy chủ */ }
  // Chỉ NỘI DUNG tệp mồi (đóng băng): phần xử lý nạp lại được, và tệp mồi dời chỗ mà nội dung như cũ thì phiên không phải nối lại.
  const mcp = surface ? sha([surface]) : '';
  if (mcp) out.push({ id: 'mcp', label: 'máy chủ MCP của harness', stamp: mcp });
  return out;
}

// Danh sách từ cấm ở máy: { "words": ["...", ...] }. Trả mảng từ (đã bỏ rỗng), hoặc null khi không có tệp hay tệp hỏng.
// Danh sách chỉ nằm ở MÁY (tệp bị gitignore), không bao giờ được commit: chính danh sách là thông tin không được lộ.
function loadWords(root) {
  let raw;
  try { raw = JSON.parse(fs.readFileSync(P.bannedListPath(root), 'utf8')); } catch { return null; }
  const words = (Array.isArray(raw && raw.words) ? raw.words : []).filter((w) => typeof w === 'string' && w.trim()).map((w) => w.trim());
  return words.length ? words : null;
}

const skillFile = (root, name) => path.join(P.skillsDir(root), name, 'SKILL.md');
const skillExists = (root, name) => /^[a-z][a-z0-9-]*$/.test(String(name || '')) && fs.existsSync(skillFile(root, name));
const allSkills = (root) => { try { return fs.readdirSync(P.skillsDir(root)).filter((n) => skillExists(root, n)).sort(); } catch { return []; } };

// Phần đã đổi của tệp hướng dẫn ở gốc so với bản phiên `sid` đã nạp, rồi ghi bản hiện tại làm bản phiên đã nạp.
// So theo DÒNG (tệp hướng dẫn là các gạch đầu dòng độc lập): dòng mới có, dòng đã bỏ. Chưa có bản của phiên thì trả null.
const KEEP_LOADED_MS = 14 * 24 * 3600 * 1000;
function loadedDiff(root, sid, id) {
  if (id !== 'instructions' || !sid) return null;
  let cur;
  try { cur = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8'); } catch { return null; }
  const dir = P.loadedDir(root);
  const file = path.join(dir, `${P.safeId(sid)}.md`);
  let old = null;
  try { old = fs.readFileSync(file, 'utf8'); } catch { /* phiên chưa có bản nào */ }
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, cur);
    const now = Date.now();
    for (const n of fs.readdirSync(dir)) { const f = path.join(dir, n); try { if (now - fs.statSync(f).mtimeMs > KEEP_LOADED_MS) fs.rmSync(f, { force: true }); } catch { /* bỏ qua */ } }
  } catch { /* không ghi được bản mới: lần sau so lại với bản cũ */ }
  if (old === null) return null;
  const a = old.split(/\r?\n/); const b = cur.split(/\r?\n/);
  const sa = new Set(a); const sb = new Set(b);
  return { added: b.filter((l) => l.trim() && !sa.has(l)), removed: a.filter((l) => l.trim() && !sb.has(l)) };
}

function create(root) {
  return {
    root,
    servicesDirName: P.SERVICES_DIR,
    skillsMapRel: posix(path.relative(root, P.skillsMapPath(root))),
    skillsDir: P.skillsDir(root),
    bannedListRel: posix(path.relative(root, P.bannedListPath(root))),
    norm: (p) => P.norm(p),
    caseKey: (s) => (process.platform === 'win32' ? String(s).toLowerCase() : String(s)),
    inside: (abs) => P.inside(abs, root),
    resolveToken: (token, cwd) => P.resolveToken(token, cwd),
    exists: (abs) => fs.existsSync(abs),
    serviceOf: (abs) => P.serviceOf(root, abs),
    isService: (name) => P.serviceHasRepo(root, name),
    serviceRel: (name) => P.serviceRel(root, name),
    serviceDir: (name) => P.serviceDir(root, name),
    units: () => P.extraUnits(root),
    scopeMode: () => P.scopeMode(root),
    // Bảng nối là phần `skills` của cấu hình dự án: khai ngay trong project.json, hoặc tên một tệp riêng (ví dụ skills-map.json).
    skillsMapRaw: () => { try { return P.projectConfig(root).skillsRaw; } catch { return null; } },
    skillsMapExists: () => fs.existsSync(P.skillsMapPath(root)),
    skillExists: (name) => skillExists(root, name),
    allSkills: () => allSkills(root),
    bannedWords: () => loadWords(root),
    entryExists: (name) => fs.existsSync(P.codePath(root, `hooks/${name}`)),
    policy: (name) => P.policy(root, name),
    sheetOwner: (abs) => P.sheetOwner(root, abs),
    loadedOnce: () => loadedOnce(root),
    externalWrite: (tool) => require('./mcp-servers').writeOwner(root, tool),
    loadedDiff: (sid, id) => loadedDiff(root, sid, id),
    transferPending: (sid) => require('./transfers').pending(root, sid),
    transferRead: (abs, sid) => require('./transfers').markRead(root, abs, sid),
  };
}

module.exports = { create, loadWords, skillExists, allSkills, loadedOnce, loadedDiff };
