'use strict';
// spec: GATE-S-005
// spec: HOOK-S-010
// spec: GATE-S-002
// spec: PORT-S-003
// spec: HOOK-S-001
// spec: HOOK-S-004
// spec: GATE-S-004
// spec: HOOK-S-009
// spec: HOOK-S-018
// Nơi DUY NHẤT sinh đường dẫn của harness (trạng thái theo phiên, nhật ký, cấu hình) và quy định tệp nào được bảo vệ.
// Hook, gate và các hook theo dõi docs đều lấy đường dẫn từ đây; test quét tĩnh sẽ đỏ nếu thấy ".claude/.state" viết cứng nơi khác.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const safeId = (id) => String(id || 'default').replace(/[^\w-]/g, '_');

const stateDir = (root) => path.join(root, '.claude', '.state');
const sessionFile = (root, prefix, sessionId) => path.join(stateDir(root), `${prefix}-${safeId(sessionId)}.json`);

const gateStatePath = (root, sessionId) => sessionFile(root, 'gate', sessionId);
const scopeStatePath = (root, sessionId) => sessionFile(root, 'scope', sessionId);
const docsStatePath = (root, service, sessionId) => sessionFile(root, `docs-${service}`, sessionId);
const diagLogPath = (root) => path.join(stateDir(root), 'gate-diag.log');
// Sổ phiên (SQLite): phiên nào đã mở skill nào, đọc tài liệu nào của dịch vụ, gọi công cụ nào. Hook ghi; model không được ghi.
const LEDGER_FILE = 'harness.db';
const ledgerPath = (root) => path.join(stateDir(root), LEDGER_FILE);
// Sổ đo lường (schema `eval`): số liệu theo ngày gom từ sổ phiên và kết quả chấm điểm. Chỉ đọc sổ phiên, sổ phiên không đọc nó.
const EVAL_FILE = 'eval.db';
const evalDbPath = (root) => path.join(stateDir(root), EVAL_FILE);
// Bản sao lưu của sổ phiên (hằng ngày, và một bản chụp trước khi nâng phiên bản).
const dbBackupsDir = (root) => path.join(stateDir(root), 'db-backups');
// Bảng nối "việc nào cần skill nào" (phần `skills` của cấu hình dự án, có thể là một tệp riêng) và thư mục skill.
const skillsMapPath = (root) => projectConfig(root).skillsFile;
const skillsDir = (root) => path.join(root, '.claude', 'skills');
// Chế độ của luật phạm vi theo kế hoạch: { "mode": "enforce" | "legacy" | "off" }. Thiếu hoặc hỏng = enforce.
const scopeConfigPath = (root) => path.join(projectDir(root), 'scope.config.json');
// Biến môi trường BSN_SCOPE_MODE=enforce chỉ làm CHẶT hơn (bật enforce cho riêng một phiên, dùng khi kiểm bằng phiên thật trước lúc bật
// cho cả hệ); không có giá trị nào của biến này nới lỏng được.
function scopeMode(root) {
  if (process.env.BSN_SCOPE_MODE === 'enforce') return 'enforce';
  try { const m = JSON.parse(fs.readFileSync(scopeConfigPath(root), 'utf8')).mode; return ['enforce', 'legacy', 'off'].includes(m) ? m : 'enforce'; } catch { return 'enforce'; }
}
// Thứ chỉ có ở máy này, bị gitignore, không bao giờ commit. Danh sách từ cấm (tools/banned-scan.js) nằm ở đây: chính danh sách không được lộ.
const localDir = (root) => path.join(root, '.claude', 'local');
const bannedListPath = (root) => path.join(localDir(root), 'cam-tu.json');

// Công cụ docs dùng chung: khóa, nhật ký cam kết và sao lưu (adapters/storage/docs-store.js). Khóa theo tên; mỗi service một khóa docs riêng.
const locksDir = (root) => path.join(stateDir(root), 'locks');
const lockPath = (root, name) => path.join(locksDir(root), `${String(name).replace(/[^\w.-]/g, '_')}.lock`);
const docsJournalPath = (root) => path.join(stateDir(root), 'docs-journal.jsonl');
const docsBackupsDir = (root) => path.join(stateDir(root), 'docs-backups');

// CẤU HÌNH DỰ ÁN: .claude/project/project.json khai cách dự án tổ chức, để harness không viết cứng bố cục của dự án nào.
//   {
//     "units":    { "parents": ["<thư mục chứa đơn vị>", ...], "dirs": { "<tên>": "<thư mục>" | { "dir", "reads" } } | "units.json" },
//     "skills":   { bảng nối việc -> skill, xem core/rules/lib/knowledge.js } | "skills-map.json",
//     "policies": { "rootNeverPush": bool, "docsNeverPush": bool, "unitSheets": ["<mẫu có nhóm bắt tên đơn vị>"] }
//   }
// Giá trị là CHUỖI thì đó là tên một tệp JSON trong .claude/modules/ chứa phần đó. Không có project.json thì dùng bố cục cũ
// (LEGACY bên dưới), để cây cũ và cây thử chạy y như trước. Tệp hỏng thì cũng như không có cấu hình đơn vị nào: hook cho qua, phép kiểm báo.
const SERVICES_DIR = 'system_service'; // harness-export: bố cục cũ (tên thư mục của chế độ tương thích)

// HAI BỐ CỤC. Bố cục cũ: mọi mã và cấu hình ở .claude/modules/. Bố cục khối: mã ở .claude/modules/<khối>/<đường dẫn logic>,
// phần của dự án ở .claude/project/. "Đường dẫn logic" của một tệp mã là đường dẫn của nó tính từ .claude/modules/ ở bố cục cũ
// (ví dụ "core/rules/scope.js"); nó không đổi khi chuyển bố cục, nên mọi chỗ cần tìm tệp của harness hỏi qua codePath().
// Khối nào giữ tệp logic nào: .claude/modules/index.json (lệnh migrate ghi). Nhận bố cục khối khi có .claude/modules/core/module.json.
const LEGACY_HOME = ['.claude', 'plugin'];
const MODULES_HOME = ['.claude', 'modules'];
const PROJECT_HOME = ['.claude', 'project'];
const MODULE_ORDER = ['core', 'servicedocs', 'diagrams', 'context', 'portal', 'guard-push', 'bsn'];
// Gốc dự án tính từ thư mục của một tệp mã harness: thư mục cha của `.claude` gần nhất đi lên. Dùng thay cho chuỗi '..' cố định,
// vì độ sâu của tệp khác nhau giữa hai bố cục.
function rootFrom(dir) {
  let cur = path.resolve(dir);
  for (;;) {
    if (path.basename(cur) === '.claude') return path.dirname(cur);
    const up = path.dirname(cur);
    if (up === cur) return path.resolve(dir, '..', '..', '..');
    cur = up;
  }
}
const isModular = (root) => fs.existsSync(path.join(root, ...MODULES_HOME, 'core', 'module.json'));
const modulesHome = (root) => path.join(root, ...MODULES_HOME);
// Thư mục chứa mã của harness: .claude/modules (bố cục cũ) hoặc .claude/modules (bố cục khối).
const harnessHome = (root) => path.join(root, ...(isModular(root) ? MODULES_HOME : LEGACY_HOME));
const codeIndex = (root) => (isModular(root) ? readJson(path.join(root, ...MODULES_HOME, 'index.json')) || {} : null);
// Thư mục con của .claude/modules là một KHỐI khi có module.json (bản nguồn còn để test/ và docs/ của chính harness ở đó).
const moduleDirs = (root) => listDirs(modulesHome(root)).filter((m) => fs.existsSync(path.join(modulesHome(root), m, 'module.json')));
// Đường dẫn thật của tệp mã có đường dẫn logic `logical` (chuỗi kiểu posix, có thể là thư mục).
function codePath(root, logical) {
  const rel = String(logical).replace(/\\/g, '/').replace(/^\/+/, '');
  if (!isModular(root)) return path.join(root, ...LEGACY_HOME, ...rel.split('/'));
  const idx = codeIndex(root);
  let mod = idx[rel];
  if (!mod) { const k = Object.keys(idx).find((x) => x.startsWith(`${rel}/`)); mod = k ? idx[k] : ''; }
  // Không có chỉ mục (bản nguồn không giữ index.json) hoặc chỉ mục chưa biết tệp này: tìm khối đang giữ nó trên đĩa; không thấy thì lõi.
  // Tệp chưa có (ví dụ thư viện người dùng tự tải về sau): khối có thư mục cha sâu nhất của nó; bằng nhau thì theo thứ tự khối.
  if (!mod) {
    const mods = MODULE_ORDER.concat(moduleDirs(root).filter((m) => !MODULE_ORDER.includes(m)));
    const segs = rel.split('/');
    for (let n = segs.length; n > 0 && !mod; n--) mod = mods.find((m) => fs.existsSync(path.join(root, ...MODULES_HOME, m, ...segs.slice(0, n))));
    if (!mod) mod = 'core';
  }
  return path.join(root, ...MODULES_HOME, mod, ...rel.split('/'));
}
// Mọi thư mục thật giữ một thư mục logic (ở bố cục khối, một thư mục logic như core/rules/ có thể trải trên nhiều khối).
function codeDirs(root, logicalDir) {
  const rel = String(logicalDir).replace(/\\/g, '/').replace(/\/+$/, '');
  if (!isModular(root)) return [path.join(root, ...LEGACY_HOME, ...rel.split('/'))].filter((d) => fs.existsSync(d));
  return MODULE_ORDER.concat(moduleDirs(root).filter((m) => !MODULE_ORDER.includes(m)))
    .map((m) => path.join(root, ...MODULES_HOME, m, ...rel.split('/'))).filter((d) => fs.existsSync(d));
}
const listDirs = (dir) => { try { return fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort(); } catch { return []; } };
// Đường dẫn posix tính từ gốc dự án, dùng trong lời nhắc và lệnh cho người: ".claude/modules/core/cli/cli.js" hoặc ".claude/modules/core/cli/cli.js".
const codeRel = (root, logical) => path.relative(root, codePath(root, logical)).split(path.sep).join('/');
// Bộ sinh trang riêng của một đơn vị (phần của dự án): bố cục cũ .claude/modules/portal/mcp/portal/generators/<tên>, bố cục khối .claude/project/generators/<tên>.
const generatorsDir = (root) => (isModular(root) ? path.join(root, ...PROJECT_HOME, 'generators') : path.join(root, ...LEGACY_HOME, 'mcp', 'portal', 'generators'));
// Bộ sinh trang riêng của MỘT đơn vị, tệp `file`: bản ĐÃ XÁC NHẬN của khối mở rộng của đơn vị (<đơn vị>/.harness/generators/, người dùng xác
// nhận thì được chép vào chỗ chỉ người dùng ghi) đứng trước; không có thì phần của dự án (generatorsDir). Mã trong repo của đơn vị chưa
// xác nhận không bao giờ được chạy.
function unitGenerator(root, unit, file) {
  const own = path.join(trustDir(root), `unit-${unit}`, 'generators', file);
  return fs.existsSync(own) ? own : path.join(generatorsDir(root), unit, file);
}
// Thư mục bộ sinh đã xác nhận của mọi đơn vị (để tính dấu của bộ dựng cổng).
function trustedGeneratorDirs(root) {
  let names = [];
  try { names = fs.readdirSync(trustDir(root), { withFileTypes: true }).filter((d) => d.isDirectory() && d.name.startsWith('unit-')).map((d) => d.name).sort(); } catch { /* chưa có khối nào được xác nhận */ }
  return names.map((n) => path.join(trustDir(root), n, 'generators')).filter((d) => fs.existsSync(d));
}
// Skill riêng của một đơn vị: <đơn vị>/.harness/skills/<tên>/SKILL.md. Trả tên các skill, đã sắp xếp.
function unitSkills(root, name) {
  const dir = path.join(serviceDir(root, name), UNIT_EXT_DIR, 'skills');
  try { return fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() && fs.existsSync(path.join(dir, d.name, 'SKILL.md'))).map((d) => d.name).sort(); } catch { return []; }
}
// Công tắc của kho ngữ nghĩa (phần của dự án): bố cục cũ .claude/project/context.config.json, bố cục khối .claude/project/context.config.json.
const contextConfigPath = (root) => (isModular(root) ? path.join(root, ...PROJECT_HOME, 'context.config.json') : path.join(root, ...LEGACY_HOME, 'mcp', 'context.config.json'));
// Thư mục chứa phần của dự án: cấu hình (project.json và các tệp nó trỏ), cấu hình cổng duyệt và phạm vi, phần mở rộng.
const projectDir = (root) => path.join(root, ...(isModular(root) ? PROJECT_HOME : LEGACY_HOME));
// Tệp tự khai của các khối: bố cục khối .claude/modules/<khối>/module.json; bố cục cũ .claude/modules/<khối>/module.json.
function moduleManifests(root) {
  const out = [];
  if (isModular(root)) {
    for (const m of moduleDirs(root)) { const f = path.join(modulesHome(root), m, 'module.json'); const v = readJson(f); if (v) out.push({ ...v, name: v.name || m, file: f }); }
  } else {
    const dir = path.join(root, ...LEGACY_HOME, 'modules');
    let names = [];
    try { names = fs.readdirSync(dir).filter((n) => n.endsWith('.json')); } catch { /* cây cũ chưa có tệp tự khai */ }
    for (const n of names) { const f = path.join(dir, n); const v = readJson(f); if (v) out.push({ ...v, name: v.name || n.replace(/\.json$/, ''), file: f }); }
  }
  const rank = (n) => { const i = MODULE_ORDER.indexOf(n); return i < 0 ? MODULE_ORDER.length : i; };
  return out.sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
}
// Các khối đang bật: khóa `modules` của cấu hình dự án (danh sách tên), không khai thì mọi khối đang có. Khối bật mà khối nó dùng
// không bật (hoặc không có) thì bị tắt theo và nêu ở `problems`. `core` luôn bật. Trả { enabled: [manifest...], problems: [chuỗi] }.
function enabledModules(root) {
  const all = moduleManifests(root);
  const want = projectConfig(root).modules;
  const problems = [];
  let on = all.filter((m) => m.name === 'core' || !want || want.includes(m.name));
  if (want) for (const w of want) if (!all.some((m) => m.name === w)) problems.push(`khối "${w}" được bật trong cấu hình nhưng không có`);
  for (let changed = true; changed;) {
    changed = false;
    for (const m of on) {
      const miss = (m.uses || []).filter((u) => u !== '*' && !on.some((x) => x.name === u));
      if (miss.length) { problems.push(`khối "${m.name}" bị tắt vì cần khối chưa bật: ${miss.join(', ')}`); on = on.filter((x) => x !== m); changed = true; break; }
    }
  }
  return { enabled: on, problems };
}
// BẢNG ĐĂNG KÝ: phần một khối góp cho cửa vào chung, theo khóa trong tệp tự khai. Cửa vào chung (cli.js, mcp-tools.js, wire.js,
// phép kiểm tài liệu) đọc qua đây thay vì nhập thẳng khối khác, nên tắt một khối là phần nó góp biến mất, không gì gãy.
//   contributions(root, 'tools' | 'commands' | 'checks') -> [{ module, file (tuyệt đối), order }] của các khối đang bật, theo `order` rồi thứ tự khối
//   provided(root, '<tên>') -> đường dẫn tuyệt đối của tệp một khối đang bật cung cấp dưới tên đó (khóa `provides`), hoặc ''
function contributions(root, key) {
  const out = [];
  for (const m of enabledModules(root).enabled) {
    for (const entry of [].concat(m[key] || [])) {
      const e = typeof entry === 'string' ? { file: entry } : entry;
      if (e && typeof e.file === 'string') out.push({ ...e, module: m.name, file: codePath(root, e.file), order: Number.isFinite(e.order) ? e.order : 1000 });
    }
  }
  return out.map((e, i) => ({ ...e, i })).sort((a, b) => a.order - b.order || a.i - b.i).map(({ i, ...e }) => e);
}
function provided(root, name) {
  for (const m of enabledModules(root).enabled) if (m.provides && typeof m.provides[name] === 'string') return codePath(root, m.provides[name]);
  return '';
}
// MÁY CHỦ MCP của harness, mỗi khối một cái: khối `core` (phạm vi, chuyển phiên) mang tên <tiền tố>, khối `mcp` (cổng tới máy chủ MCP
// khác) mang <tiền tố>-mcp, mỗi khối khác khai `mcpBlock` trong tệp tự khai (docs, diagrams, ...) mang <tiền tố>-<khối>. Tắt một khối thì
// máy chủ của nó biến mất khỏi danh sách. Mọi máy chủ chạy cùng MỘT tệp mồi, khác nhau ở đối số cuối của .mcp.json (tên khối).
// Tên cũ "bsn-docs" (một máy chủ giữ cả bộ công cụ) vẫn chạy khi không có đối số; luật vẫn nhận tên đó để phiên đang mở không mất chốt.
const MCP_LEGACY = 'bsn-docs';
const mcpPrefix = (root) => projectConfig(root).mcp.prefix;
const mcpServerName = (prefix, block) => (block === 'core' ? prefix : `${prefix}-${block}`);
function mcpServers(root) {
  const prefix = mcpPrefix(root);
  const out = [];
  for (const m of enabledModules(root).enabled) {
    if (m.name === 'core' && m.mcpServer && typeof m.mcpServer.file === 'string') {
      for (const block of (Array.isArray(m.mcpServer.blocks) && m.mcpServer.blocks.length ? m.mcpServer.blocks : ['core'])) out.push({ name: mcpServerName(prefix, block), block, module: 'core', file: m.mcpServer.file });
    } else if (typeof m.mcpBlock === 'string' && /^[a-z][a-z0-9]*$/.test(m.mcpBlock)) {
      const core = enabledModules(root).enabled.find((x) => x.name === 'core');
      if (core && core.mcpServer) out.push({ name: mcpServerName(prefix, m.mcpBlock), block: m.mcpBlock, module: m.name, file: core.mcpServer.file });
    }
  }
  return out;
}
// Mẫu tên công cụ (cho matcher của hook) phủ MỌI công cụ của mọi máy chủ harness, kể cả tên cũ.
const mcpMatcher = (root) => [...mcpServers(root).map((s) => s.name), MCP_LEGACY].map((n) => `mcp__${n}__.*`).join('|');
const moduleEnabled = (root, name) => { const ms = moduleManifests(root); return !ms.length || enabledModules(root).enabled.some((m) => m.name === name); };
// KHỐI MỞ RỘNG: phần riêng của dự án và của từng đơn vị (luật, công cụ, lệnh), cùng một khuôn module.json.
//   cả dự án   <thư mục dự án>/extensions/<tên>/module.json
//   một đơn vị <thư mục đơn vị>/.harness/module.json
// Mã của khối chỉ chạy từ BẢN ĐÃ XÁC NHẬN chép ở <gốc>/.claude/local/extensions/ (chỉ người dùng ghi, ngoài phiên Claude).
const UNIT_EXT_DIR = '.harness';
const extensionsDir = (root) => path.join(projectDir(root), 'extensions');
const trustDir = (root) => path.join(localDir(root), 'extensions');
const trustFile = (root) => path.join(trustDir(root), 'trust.json');
// Cổng MCP: khai báo máy chủ ở phần của dự án (commit được); sổ xác nhận ở máy; tình trạng từng máy chủ do mỗi tiến trình cổng ghi.
const mcpConfigPath = (root) => path.join(projectDir(root), 'mcp.json');
const mcpTrustFile = (root) => path.join(localDir(root), 'mcp', 'trust.json');
const mcpStateDir = (root) => path.join(stateDir(root), 'mcp');
// Bản của thứ chỉ nạp một lần (CLAUDE.md gốc) mà từng phiên đã nạp, để so ra dòng đã đổi.
const loadedDir = (root) => path.join(stateDir(root), 'loaded');
// Tờ bàn giao khi chuyển phiên: chỉ ở máy, mỗi lần chuyển một tệp .md (phiên mới đọc) và một tệp .json (ai chuyển cho ai, đã đọc chưa).
const transfersDir = (root) => path.join(stateDir(root), 'transfers');
// Lỗi lúc chạy của khối mở rộng (hỏng, quá giờ): hook cho qua nhưng ghi lại để doctor và tóm tắt đầu phiên báo.
const extensionErrorsPath = (root) => path.join(stateDir(root), 'extensions-errors.jsonl');

const pluginDir = (root) => projectDir(root);
const projectConfigPath = (root) => path.join(projectDir(root), 'project.json');
// Giá trị của chế độ tương thích: cây chưa có project.json chạy như trước khi có cấu hình dự án.
const LEGACY = { name: '', defaultUnit: '', units: { parents: [SERVICES_DIR], dirs: 'units.json' }, skills: 'skills-map.json', policies: { rootNeverPush: true, docsNeverPush: true, unitSheets: ['^infra/services/([a-z][a-z0-9-]*)\\.json$'], readOnlyDirs: ['external'] } }; // harness-export: bố cục cũ
const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return undefined; } };
const MCP_PREFIX = 'harness';
const MCP_PREFIX_RE = /^[a-z][a-z0-9]{0,30}(-[a-z0-9]{1,20}){0,2}$/;
const UNIT_LAYOUTS = ['harness', 'legacy'];
const UNIT_ENTRY = 'CLAUDE.md';
const ENTRY_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,60}\.md$/;
// Trả { exists, broken, units: { parents, dirsRaw }, skillsRaw, skillsFile, policies }. Đọc lại mỗi lần (hook là tiến trình ngắn).
function projectConfig(root) {
  const file = projectConfigPath(root);
  const exists = fs.existsSync(file);
  const raw = exists ? readJson(file) : LEGACY;
  const broken = exists && (!raw || typeof raw !== 'object' || Array.isArray(raw));
  // Bộ khuôn có sẵn: `preset` là tên một tệp presets/<tên>.json của harness; khóa nào dự án không khai thì lấy từ bộ khuôn
  // (riêng `policies` gộp từng khóa). Bộ khuôn lạ thì như không có, và phép kiểm báo.
  const own = broken ? {} : raw;
  const presetName = typeof own.preset === 'string' && /^[a-z][a-z0-9-]{0,30}$/.test(own.preset) ? own.preset : '';
  const preset = presetName ? readJson(codePath(root, `presets/${presetName}.json`)) : undefined;
  const cfg = preset && typeof preset === 'object' ? { ...preset, ...own, policies: { ...(preset.policies || {}), ...(own.policies || {}) } } : own;
  const part = (v) => (typeof v === 'string' ? { file: path.join(pluginDir(root), path.basename(v)), value: readJson(path.join(pluginDir(root), path.basename(v))) } : { file: '', value: v });
  const u = cfg.units && typeof cfg.units === 'object' ? cfg.units : {};
  const ws = cfg.workspace && typeof cfg.workspace === 'object' && !Array.isArray(cfg.workspace) ? cfg.workspace : {};
  // "." = chính gốc mã là thư mục chứa đơn vị (các repo nằm ngay dưới nó). Chỉ nhận khi dự án khai gốc mã riêng: ở "nhà" thì "." sẽ biến
  // mọi thư mục cấp một (docs, tài liệu chung) thành đơn vị.
  const parents = (Array.isArray(u.parents) ? u.parents : []).map((p) => (p === '.' && typeof ws.root === 'string' && ws.root.trim() ? '.' : cleanRel(p))).filter((p) => p && !p.startsWith('.claude'));
  const sk = part(cfg.skills);
  const pol = cfg.policies && typeof cfg.policies === 'object' ? cfg.policies : {};
  const up = cfg.upgrade && typeof cfg.upgrade === 'object' && !Array.isArray(cfg.upgrade) ? cfg.upgrade : {};
  return {
    exists, broken,
    preset: presetName, presetMissing: Boolean(presetName) && !(preset && typeof preset === 'object'),
    // Ngôn ngữ của lời chặn và lời nhắc: 'vi' (mặc định) hoặc 'en'.
    lang: cfg.lang === 'en' ? 'en' : 'vi',
    // Khối được bật; null = mọi khối đang có.
    modules: Array.isArray(cfg.modules) ? cfg.modules.filter((m) => typeof m === 'string') : null,
    // Tên hiển thị của dự án (cổng HTML). Không khai: tên thư mục gốc; cây chưa có project.json (bố cục cũ) thì là "dự án".
    name: typeof cfg.name === 'string' && cfg.name.trim() ? cfg.name.trim() : (exists ? path.basename(path.resolve(root)) : 'dự án'),
    // Đơn vị mặc định của công cụ bsn-docs khi lời gọi không truyền `service`. '' = luôn phải truyền.
    defaultUnit: typeof cfg.defaultUnit === 'string' && UNIT_NAME_RE.test(cfg.defaultUnit) ? cfg.defaultUnit : '',
    units: {
      parents: [...new Set(parents)], dirsRaw: part(u.dirs).value,
      // Phần tại chỗ của đơn vị: bố cục ('harness' = gom trong <đơn vị>/.harness/, 'legacy' = docs/ và tệp cửa vào ở gốc đơn vị,
      // '' = tự nhận theo thứ đang có), tên tệp cửa vào, và ghi chép có vào git của đơn vị không ('local' = không).
      layout: UNIT_LAYOUTS.includes(u.layout) ? u.layout : '',
      entry: typeof u.entry === 'string' && ENTRY_NAME_RE.test(u.entry) ? u.entry : UNIT_ENTRY,
      docs: u.docs === 'local' ? 'local' : 'committed',
    },
    // Nơi chứa mã khi nó KHÔNG nằm trong thư mục mở phiên: đường dẫn tuyệt đối, hoặc tương đối tính từ thư mục mở phiên (được đi ra ngoài).
    workspaceRaw: typeof ws.root === 'string' ? ws.root.trim() : '',
    // Nâng cấp: việc harness tự làm ở nền đầu phiên khi có bản mới ('prepare' = kiểm rồi dựng sẵn, 'check' = chỉ kiểm, 'off' = không làm),
    // và các lệnh kiểm dự án tự khai, chạy sau khi cài (mỗi lệnh là một mảng đối số, không qua shell; lệnh nào hỏng thì quay lại bản cũ).
    upgrade: {
      auto: ['prepare', 'check', 'off'].includes(up.auto) ? up.auto : 'prepare',
      verify: (Array.isArray(up.verify) ? up.verify : []).filter((c) => Array.isArray(c) && c.length > 0 && c.every((x) => typeof x === 'string' && x.length > 0)),
    },
    // Máy chủ MCP của harness: mỗi khối một máy chủ tên <tiền tố>[-<khối>]; tiền tố mặc định "harness".
    mcp: { prefix: typeof (cfg.mcp && cfg.mcp.prefix) === 'string' && MCP_PREFIX_RE.test(cfg.mcp.prefix) ? cfg.mcp.prefix : MCP_PREFIX },
    skillsRaw: sk.value && typeof sk.value === 'object' ? sk.value : null,
    skillsFile: sk.file || file,
    policies: {
      rootNeverPush: pol.rootNeverPush === true,
      docsNeverPush: pol.docsNeverPush === true,
      unitSheets: (Array.isArray(pol.unitSheets) ? pol.unitSheets : []).filter((s) => typeof s === 'string'),
      readOnlyDirs: (Array.isArray(pol.readOnlyDirs) ? pol.readOnlyDirs : []).map((d) => cleanRel(d)).filter(Boolean),
    },
  };
}
const policy = (root, name) => projectConfig(root).policies[name];
// Tệp `abs` là "tờ của một đơn vị" nằm trong thư mục của đơn vị khác (luật unitSheets: tờ đó là của
// chính đơn vị được nêu tên): trả tên đơn vị chủ (nhóm bắt đầu tiên của mẫu), hoặc ''. Mẫu hỏng thì bỏ qua.
function sheetOwner(root, abs) {
  // Tờ nằm ở thư mục mở phiên, hoặc ở gốc mã khi dự án khai gốc mã riêng: mẫu tính trên đường dẫn từ nơi chứa nó.
  const from = (base) => path.relative(base, path.resolve(abs)).split(path.sep).join('/');
  let rel = from(root);
  if (rel.startsWith('..') || path.isAbsolute(rel)) rel = from(workspaceRoot(root));
  if (rel.startsWith('..') || path.isAbsolute(rel)) return '';
  for (const s of projectConfig(root).policies.unitSheets) {
    let m = null;
    try { m = new RegExp(s, 'i').exec(rel); } catch { continue; }
    if (m && m[1]) return m[1];
  }
  return '';
}
// GỐC MÃ: thư mục mà đường dẫn của đơn vị (units.parents, units.dirs) tính từ đó. Không khai workspace.root thì là thư mục mở phiên
// ("nhà"), như trước. Khai thì mã được nằm ở chỗ khác hẳn; "nhà" vẫn giữ .claude/, trạng thái, tài liệu chung và cổng HTML.
// Trả { dir, declared, problem }: khai sai (trỏ vào .claude/, không phải thư mục) thì dùng "nhà" và nêu `problem` cho phép kiểm sức khỏe.
function workspace(root) {
  const home = path.resolve(root);
  const raw = projectConfig(root).workspaceRaw;
  if (!raw) return { dir: home, declared: false, problem: '' };
  const dir = path.resolve(home, raw);
  if (inside(dir, path.join(home, '.claude'))) return { dir: home, declared: true, problem: `workspace.root "${raw}" trỏ vào .claude/ (không được)` };
  let ok = false;
  try { ok = fs.statSync(dir).isDirectory(); } catch { /* chưa có */ }
  if (!ok) return { dir: home, declared: true, problem: `workspace.root "${raw}" không phải một thư mục đang có` };
  return { dir, declared: norm(dir) !== norm(home), problem: '' };
}
const workspaceRoot = (root) => workspace(root).dir;
// Thư mục chứa đơn vị (tính từ gốc mã). Thư mục đầu là nơi đơn vị mới được tạo.
const unitParents = (root) => { const p = projectConfig(root).units.parents; return p.includes('.') && !workspace(root).declared ? p.filter((x) => x !== '.') : p; };
const servicesDir = (root) => { const p = unitParents(root); const w = workspaceRoot(root); return p.length ? path.join(w, ...p[0].split('/')) : w; };
// Đơn vị có tài liệu nằm NGOÀI thư mục chứa đơn vị: một repo git riêng ở chỗ khác trong dự án nhưng được harness đối xử như một dịch vụ
// (tài liệu qua bsn-docs, sơ đồ, kho ngữ nghĩa, trang trên cổng, hook giữ phạm vi). Khai ở .claude/project/units.json: { "<tên>": "<thư mục tính từ gốc dự án>" }.
// Ví dụ { "deploy": "deploy" }. Tên theo luật tên dịch vụ; thư mục là đường dẫn tương đối không chứa "..". Tệp thiếu hay hỏng = không có đơn vị ngoài.
const UNIT_NAME_RE = /^[a-z][a-z0-9-]{1,40}$/;
// Thư mục DUY NHẤT dưới .claude/ được khai làm đơn vị: mã của chính harness. Phần còn lại của .claude/ (trạng thái, settings, skill) không bao giờ là đơn vị.
const HARNESS_UNIT_DIR = '.claude/modules';
const HARNESS_UNIT_DIRS = [HARNESS_UNIT_DIR, '.claude/modules']; // bố cục cũ và bố cục khối
// Một đơn vị còn khai được dạng đầy đủ { "dir": "<thư mục>", "reads": ["<tệp tính từ gốc dự án>", ...] }: `reads` là các tệp nằm NGOÀI thư mục
// của đơn vị mà kho ngữ nghĩa được ĐỌC thêm khi dựng kho của đơn vị đó (ví dụ harness đọc .claude/settings.json để biết hook nào được khai).
// `reads` KHÔNG làm tệp đó thuộc đơn vị: serviceOf, hook giữ phạm vi và hook chặn ghi tay không đổi. Dạng chuỗi cũ giữ nguyên nghĩa.
const MAX_UNIT_READS = 10;
const cleanRel = (rel) => {
  if (typeof rel !== 'string') return '';
  const clean = rel.replace(/\\/g, '/').replace(/\/+$/, '');
  return !clean || path.isAbsolute(clean) || /^[A-Za-z]:/.test(clean) || clean.split('/').some((x) => x === '..' || x === '.' || x === '') ? '' : clean;
};
function parseUnits(root) {
  const cfg = projectConfig(root);
  const raw = cfg.units.dirsRaw;
  const parents = cfg.units.parents;
  const out = {};
  for (const [name, value] of Object.entries(raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {})) {
    const full = value && typeof value === 'object' && !Array.isArray(value);
    const clean = cleanRel(full ? value.dir : value);
    if (!UNIT_NAME_RE.test(name) || !clean || parents.some((p) => clean === p || clean.startsWith(`${p}/`)) || (clean.split('/')[0] === '.claude' && !HARNESS_UNIT_DIRS.includes(clean))) continue;
    // Tệp đọc thêm: trong dự án, không thoát ra ngoài, không phải trạng thái của harness, và không nằm trong chính thư mục của đơn vị (thứ đó đã được đọc).
    const reads = (full && Array.isArray(value.reads) ? value.reads : []).map(cleanRel)
      .filter((r) => r && !r.startsWith('.claude/.state/') && !r.startsWith('.claude/local/') && r !== clean && !r.startsWith(`${clean}/`));
    // Thư mục của đơn vị tính từ GỐC MÃ; riêng đơn vị nằm dưới .claude/ (mã của chính harness), hoặc khai "base": "home", tính từ "nhà".
    const atHome = clean.split('/')[0] === '.claude' || (full && value.base === 'home');
    out[name] = {
      dir: clean, base: atHome ? 'home' : 'workspace', reads: [...new Set(reads)].slice(0, MAX_UNIT_READS),
      layout: full && UNIT_LAYOUTS.includes(value.layout) ? value.layout : '',
      docs: full && (value.docs === 'local' || value.docs === 'committed') ? value.docs : '',
    };
  }
  return out;
}
// Thư mục thật của các đơn vị khai riêng: { tên: đường dẫn tuyệt đối }.
function unitDirs(root) {
  const w = workspaceRoot(root);
  return Object.fromEntries(Object.entries(parseUnits(root)).map(([name, u]) => [name, path.join(u.base === 'home' ? path.resolve(root) : w, ...u.dir.split('/'))]));
}
// Đường dẫn kiểu posix của `abs` tính từ "nhà" (dùng trong lời nhắc và để ghép lại với gốc). Gốc mã nằm ngoài "nhà" thì bắt đầu bằng "../";
// khác ổ đĩa (Windows) thì là đường dẫn tuyệt đối.
const relFromHome = (root, abs) => path.relative(path.resolve(root), abs).split(path.sep).join('/');
// { tên: đường dẫn tính từ "nhà" } của các đơn vị khai riêng. Gốc mã trùng "nhà" thì đúng bằng giá trị đã khai.
function extraUnits(root) {
  return Object.fromEntries(Object.entries(unitDirs(root)).map(([name, dir]) => [name, relFromHome(root, dir)]));
}
// Các tệp ngoài thư mục mà đơn vị `name` khai để kho ngữ nghĩa đọc thêm (đường dẫn kiểu posix tính từ gốc dự án). Không khai thì [].
const unitReads = (root, name) => (parseUnits(root)[name] || { reads: [] }).reads;
// Thư mục của đơn vị `name`: đơn vị khai riêng; hoặc thư mục con của một thư mục cha đang có thật; chưa có thì ở thư mục cha đầu tiên.
function serviceDir(root, name) {
  const extra = unitDirs(root)[name];
  if (extra) return extra;
  const w = workspaceRoot(root);
  for (const p of orderedParents(root)) { const d = path.join(w, ...p.split('/'), name); if (fs.existsSync(d)) return d; }
  return path.join(servicesDir(root), name);
}
// Dịch vụ có kho git để harness đọc bản đã commit: thư mục có .git riêng, hoặc một đơn vị khai riêng nằm TRONG repo chứa nó
// (không có .git riêng: đơn vị ở "nhà" dùng kho của repo gốc, ví dụ chính harness ở .claude/modules; đơn vị ở gốc mã dùng kho của gốc mã).
function serviceHasRepo(root, name) {
  if (!name) return false;
  const dir = serviceDir(root, name);
  if (fs.existsSync(path.join(dir, '.git'))) return true;
  const u = parseUnits(root)[name];
  return Boolean(u) && fs.existsSync(dir) && fs.existsSync(path.join(u.base === 'home' ? path.resolve(root) : workspaceRoot(root), '.git'));
}
// Đường dẫn của một dịch vụ tính từ "nhà", kiểu posix: "<thư mục cha>/<tên>" hoặc thư mục của đơn vị khai riêng ("../..." khi gốc mã nằm ngoài).
const serviceRel = (root, name) => relFromHome(root, serviceDir(root, name));
// Tên dịch vụ chứa đường dẫn tuyệt đối `abs` (thư mục con trực tiếp của một thư mục cha khai trong cấu hình, hoặc một đơn vị khai riêng),
// hoặc '' nếu không thuộc dịch vụ nào.
function serviceOf(root, abs) {
  const target = path.resolve(abs);
  for (const [name, dir] of Object.entries(unitDirs(root))) {
    const r = path.relative(dir, target);
    if (r === '' || (!r.startsWith('..') && !path.isAbsolute(r))) return name;
  }
  const w = workspaceRoot(root);
  const hold = containerNames(root);
  for (const p of orderedParents(root)) {
    const parts = path.relative(path.join(w, ...p.split('/')), target).split(path.sep);
    if (parts[0] && parts[0] !== '..' && !path.isAbsolute(parts[0]) && !(p === '.' && hold.has(parts[0]))) return parts[0];
  }
  return '';
}
// Thư mục cha "." (chính gốc mã) xét SAU các thư mục cha khác, và không coi là đơn vị những thư mục cấp một chỉ để CHỨA đơn vị
// (đoạn đầu của một thư mục cha khác, hay của một đơn vị khai riêng nằm sâu hơn một cấp): không thì "nhom/gamma" bị tính cho đơn vị "nhom".
const orderedParents = (root) => { const p = unitParents(root); return [...p.filter((x) => x !== '.'), ...p.filter((x) => x === '.')]; };
function containerNames(root) {
  const out = new Set();
  for (const p of unitParents(root)) if (p !== '.') out.add(p.split('/')[0]);
  for (const u of Object.values(parseUnits(root))) if (u.base === 'workspace' && u.dir.includes('/')) out.add(u.dir.split('/')[0]);
  return out;
}
// Mọi thư mục có thể là dịch vụ: thư mục con có tên hợp lệ của các thư mục cha, cộng các đơn vị khai riêng có thư mục thật. [{ name, dir }], sắp theo tên.
function serviceEntries(root) {
  const out = new Map();
  const w = workspaceRoot(root);
  const hold = containerNames(root);
  for (const p of orderedParents(root)) {
    const parent = path.join(w, ...p.split('/'));
    try { for (const d of fs.readdirSync(parent, { withFileTypes: true })) if (d.isDirectory() && UNIT_NAME_RE.test(d.name) && !out.has(d.name) && !(p === '.' && hold.has(d.name))) out.set(d.name, path.join(parent, d.name)); } catch { /* chưa có thư mục cha */ }
  }
  for (const [name, dir] of Object.entries(unitDirs(root))) {
    try { if (fs.statSync(dir).isDirectory()) out.set(name, dir); } catch { /* khai mà chưa có thư mục */ }
  }
  return [...out.entries()].map(([name, dir]) => ({ name, dir })).sort((a, b) => a.name.localeCompare(b.name));
}

// PHẦN TẠI CHỖ CỦA ĐƠN VỊ: thứ harness đặt trong thư mục của một đơn vị (tệp cửa vào, ghi chép, phần mở rộng). Mọi mã cần đường dẫn
// của các thứ đó hỏi ở đây bằng TÊN LOGIC ("CLAUDE.md", "docs/agent/STATUS.md", "docs/service.yaml"...), không tự ghép chữ "docs".
//   bố cục 'harness': gom trong <đơn vị>/.harness/  (.harness/<tệp cửa vào>, .harness/docs/...)
//   bố cục 'legacy':  <đơn vị>/<tệp cửa vào>, <đơn vị>/docs/...
// Chọn bố cục: đơn vị khai `layout` -> dự án khai `units.layout` -> tự nhận (đã có .harness/docs hay .harness/<tệp cửa vào> thì 'harness';
// đã có docs/ hay tệp cửa vào ở gốc đơn vị thì 'legacy'; chưa có gì thì 'harness' ở dự án có project.json, 'legacy' ở cây cũ).
// `local`: ghi chép không vào git của đơn vị (chỉ ở bố cục 'harness'); khi đó cổng HTML và kho ngữ nghĩa đọc từ đĩa thay vì bản đã commit.
const LOGICAL_ENTRY = 'CLAUDE.md';
const LOGICAL_DOCS = 'docs';
function unitLayoutAt(root, dir, over = {}) {
  const cfg = projectConfig(root);
  const entry = cfg.units.entry;
  const has = (...p) => fs.existsSync(path.join(dir, ...p));
  let layout = over.layout || cfg.units.layout;
  if (!layout) {
    if (has(UNIT_EXT_DIR, LOGICAL_DOCS) || has(UNIT_EXT_DIR, entry)) layout = 'harness';
    // Dự án đã cài từ trước không khai gì: đơn vị đã có docs/ hay tệp cửa vào ở gốc thì GIỮ bố cục cũ (thà giữ nguyên còn hơn lặng lẽ
    // đổi chỗ và làm các luật theo đường dẫn thôi chặn). Dự án mới khai rõ "layout": "harness" trong khuôn project.json.
    else if (has(entry) || has(LOGICAL_DOCS)) layout = 'legacy';
    else layout = cfg.exists ? 'harness' : 'legacy';
  }
  const harness = layout === 'harness';
  return {
    layout,
    local: harness && (over.docs || cfg.units.docs) === 'local',
    entryRel: harness ? `${UNIT_EXT_DIR}/${entry}` : entry,
    docsRel: harness ? `${UNIT_EXT_DIR}/${LOGICAL_DOCS}` : LOGICAL_DOCS,
    localRel: UNIT_EXT_DIR,
  };
}
const unitLayout = (root, name) => unitLayoutAt(root, serviceDir(root, name), parseUnits(root)[name] || {});
// Bố cục của thư mục đơn vị `dir` (tuyệt đối): là thư mục của một đơn vị đã biết thì theo khai báo của đơn vị đó.
function unitLayoutOfDir(root, dir) {
  const name = serviceOf(root, dir);
  return name && norm(serviceDir(root, name)) === norm(dir) ? unitLayout(root, name) : unitLayoutAt(root, dir);
}
// Tên logic -> đường dẫn thật tính từ thư mục đơn vị (kiểu posix). Tên không thuộc phần tại chỗ thì giữ nguyên.
function unitRealRel(layout, logical) {
  const rel = String(logical).replace(/\\/g, '/');
  if (rel === LOGICAL_ENTRY) return layout.entryRel;
  if (rel === LOGICAL_DOCS) return layout.docsRel;
  if (rel.startsWith(`${LOGICAL_DOCS}/`)) return `${layout.docsRel}${rel.slice(LOGICAL_DOCS.length)}`;
  return rel;
}
// Chiều ngược: đường dẫn thật tính từ thư mục đơn vị -> tên logic; không thuộc phần tại chỗ thì ''.
function unitLogicalRel(layout, real) {
  const rel = String(real).replace(/\\/g, '/');
  if (rel === layout.entryRel) return LOGICAL_ENTRY;
  if (rel === layout.docsRel) return LOGICAL_DOCS;
  if (rel.startsWith(`${layout.docsRel}/`)) return `${LOGICAL_DOCS}${rel.slice(layout.docsRel.length)}`;
  return '';
}
const unitPathRel = (root, name, logical) => unitRealRel(unitLayout(root, name), logical);
const unitPath = (root, name, logical) => path.join(serviceDir(root, name), ...unitPathRel(root, name, logical).split('/'));

const harnessDir = (root) => codePath(root, 'gate');
// Bố cục khối: cấu hình cổng duyệt và mốc chuyển đổi là của dự án (.claude/project/), dấu vân tay là của sản phẩm (.claude/modules/).
const configPath = (root) => (isModular(root) ? path.join(projectDir(root), 'gate.config.json') : path.join(harnessDir(root), 'gate.config.json'));
const manifestPath = (root) => (isModular(root) ? path.join(modulesHome(root), 'MANIFEST.json') : path.join(harnessDir(root), 'MANIFEST.json'));
const migratedAtPath = (root) => (isModular(root) ? path.join(projectDir(root), 'MIGRATED_AT') : path.join(harnessDir(root), 'MIGRATED_AT'));
const versionPath = (root) => (isModular(root) ? path.join(modulesHome(root), 'VERSION') : path.join(harnessDir(root), 'VERSION'));

const norm = (p) => (process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p));
const slashes = (p) => norm(p).split(path.sep).join('/');

function inside(child, parent) {
  const rel = path.relative(norm(parent), norm(child));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

// Tệp model không bao giờ được ghi, kể cả khi cổng mở (chỉ người dùng đổi): cấu hình, dấu vân tay, mốc chuyển đổi,
// và mọi tệp gate-* trong thư mục trạng thái (trạng thái phiên và nhật ký chẩn đoán).
const PROTECTED_BASENAMES = new Set(['gate.config.json', 'manifest.json', 'migrated_at']);

function isProtectedPath(p) {
  const n = slashes(p);
  const base = n.slice(n.lastIndexOf('/') + 1);
  // So tên không phân biệt hoa thường: tệp thật là MANIFEST.json và MIGRATED_AT, và norm() chỉ đổi về chữ thường trên Windows,
  // nên trên Linux hai tệp đó từng không được bảo vệ.
  if (n.includes('/.claude/modules/core/gate/') && PROTECTED_BASENAMES.has(base.toLowerCase())) return true;
  // Bố cục khối: dấu vân tay và chỉ mục khối của sản phẩm, mốc chuyển đổi của dự án.
  if (/\/\.claude\/modules\/(manifest\.json|index\.json)$/i.test(n) || /\/\.claude\/project\/migrated_at$/i.test(n)) return true;
  if (base === 'gate.config.json') return true;
  // Danh sách "đã xem, vô hại" của bộ dò gói publish (mcp/publish-scan.js): chỉ người dùng ghi. Phiên tự ghi được thì tự cho qua được chỗ bị báo.
  if (n.endsWith('/.claude/local/publish-allow.json')) return true;
  // Danh sách từ cấm của máy: chỉ người dùng ghi. Phiên tự ghi được thì làm rỗng được danh sách, và mọi lớp quét thôi quét (P-017).
  if (n.endsWith('/.claude/local/cam-tu.json')) return true;
  // Bản đã xác nhận của khối mở rộng và sổ xác nhận: phiên tự ghi được thì tự bật mã chưa duyệt, hoặc tắt luật chặn của đơn vị.
  if (n.includes('/.claude/local/extensions/')) return true;
  // Sổ xác nhận máy chủ MCP của cổng MCP: chỉ lệnh `mcp trust` ghi, sau lời duyệt của người dùng. Phiên tự ghi được thì tự cho
  // một máy chủ lạ chạy với quyền của người dùng.
  if (n.includes('/.claude/local/mcp/')) return true;
  // Sổ phiên và các tệp đi kèm của SQLite (harness.db, harness.db-wal, harness.db-shm): hook chặn dựa vào sổ này nên model không được tự ghi.
  // Sổ đo lường và bản sao lưu của sổ phiên: phiên tự ghi được thì sửa được điểm chấm, hoặc thay sổ bằng bản cũ.
  if (n.includes('/.claude/.state/db-backups/')) return true;
  return n.includes('/.claude/.state/') && (base.startsWith('gate-') || base.startsWith(LEDGER_FILE) || base.startsWith(EVAL_FILE));
}

// Đích của một lệnh XÓA/DỜI/CHÉP cũng bị chặn nếu nó là thư mục chứa tệp được bảo vệ (rm -rf .claude/.state),
// hoặc là mẫu glob có thể khớp tệp được bảo vệ (rm .claude/.state/gate-*).
function isProtectedTarget(p) {
  const raw = String(p);
  const globAt = raw.search(/[*?[]/);
  const base = globAt >= 0 ? raw.slice(0, Math.max(0, raw.lastIndexOf('/', globAt), raw.lastIndexOf('\\', globAt))) || '.' : raw;
  const n = slashes(base);
  if (globAt >= 0) {
    // Mẫu glob: nguy hiểm nếu phần cố định (trước ký tự glob) nằm trong hoặc bằng thư mục trạng thái/harness.
    return n.endsWith('/.claude/.state') || n.includes('/.claude/.state/') || n.endsWith('/.claude/modules/core/gate') || n.includes('/.claude/modules/core/gate/') ||
      n.endsWith('/.claude/modules') || /\/\.claude\/modules\/core\/gate(\/|$)/.test(n) || n.endsWith('/.claude/project') || isProtectedPath(raw.replace(/[*?[]/g, 'x'));
  }
  if (isProtectedPath(p)) return true;
  return n.endsWith('/.claude/.state') || n.endsWith('/.claude/modules/core/gate') || n.endsWith('/.claude/modules') || n.endsWith('/.claude') ||
    n.endsWith('/.claude/local') || n.endsWith('/.claude/local/extensions') ||
    n.endsWith('/.claude/modules') || n.endsWith('/.claude/modules/core') || n.endsWith('/.claude/modules/core/gate') || n.endsWith('/.claude/project');
}

// Chuyển đường dẫn kiểu Git Bash (/d/Training/x) hoặc tương đối thành đường dẫn tuyệt đối của hệ điều hành.
function resolveToken(token, cwd) {
  let t = String(token);
  const m = /^\/([a-zA-Z])(\/.*)?$/.exec(t);
  if (process.platform === 'win32' && m) t = `${m[1].toUpperCase()}:${m[2] || '/'}`;
  return path.resolve(cwd || process.cwd(), t);
}

// Thư mục được ghi tự do khi cổng đóng: thư mục tạm, ~/.claude (memory), docs/handoff của dự án, scratchpad của phiên.
function exemptDirs(root, input = {}) {
  const dirs = [os.tmpdir(), path.join(os.homedir(), '.claude'), path.resolve(root, '..', 'docs', 'handoff')];
  if (!fs.existsSync(path.join(root, '.git'))) dirs.push(path.join(root, 'docs', 'handoff')); // root là gốc dự án (không phải một đơn vị)
  if (typeof input.scratchpad_dir === 'string' && input.scratchpad_dir) dirs.push(input.scratchpad_dir);
  // Phần "của bạn" trong một bản nâng cấp ĐÃ DỰNG SẴN (chưa cài): agent xử lý chỗ đụng nhau ở đây TRƯỚC khi trình người dùng, để người
  // dùng duyệt đúng thứ sẽ được cài. Không phải mã đang chạy; mã duyệt tính trên nội dung nên sửa sau lúc duyệt là lời duyệt hết hiệu lực.
  try {
    const up = path.join(stateDir(root), 'upgrade');
    for (const d of fs.readdirSync(up, { withFileTypes: true })) if (d.isDirectory() && /^\d+\.\d+\.\d+$/.test(d.name)) dirs.push(path.join(up, d.name, 'overlay'));
  } catch { /* chưa dựng sẵn bản nào */ }
  return dirs;
}

module.exports = {
  safeId, stateDir, sessionFile, gateStatePath, scopeStatePath, docsStatePath, diagLogPath, ledgerPath, LEDGER_FILE, evalDbPath, EVAL_FILE, dbBackupsDir, skillsMapPath, skillsDir, scopeConfigPath, scopeMode, localDir, bannedListPath,
  locksDir, lockPath, docsJournalPath, docsBackupsDir,
  SERVICES_DIR, LEGACY_CONFIG: LEGACY, pluginDir, projectConfigPath, projectConfig, policy, sheetOwner, unitParents, servicesDir, serviceDir, serviceOf, serviceRel, serviceEntries, extraUnits, unitReads, serviceHasRepo, HARNESS_UNIT_DIR,
  unitGenerator, trustedGeneratorDirs, unitSkills,
  workspace, workspaceRoot, unitDirs, unitLayout, unitLayoutAt, unitLayoutOfDir, unitRealRel, unitLogicalRel, unitPathRel, unitPath, LOGICAL_ENTRY, LOGICAL_DOCS,
  harnessDir, configPath, manifestPath, migratedAtPath, versionPath,
  MCP_LEGACY, mcpPrefix, mcpServers, mcpMatcher,
  MODULE_ORDER, rootFrom, isModular, modulesHome, harnessHome, codeIndex, moduleDirs, codePath, codeDirs, codeRel, projectDir, generatorsDir, contextConfigPath, moduleManifests, enabledModules, moduleEnabled, contributions, provided,
  UNIT_EXT_DIR, extensionsDir, trustDir, trustFile, extensionErrorsPath, mcpConfigPath, mcpTrustFile, mcpStateDir, loadedDir, transfersDir,
  norm, slashes, inside, isProtectedPath, isProtectedTarget, resolveToken, exemptDirs, PROTECTED_BASENAMES,
};
