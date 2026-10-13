'use strict';
// spec: GATE-S-005
// spec: HOOK-S-010
// spec: GATE-S-002
// spec: PORT-S-003
// spec: HOOK-S-001
// spec: HOOK-S-004
// spec: GATE-S-004
// spec: HOOK-S-009
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
  const parents = (Array.isArray(u.parents) ? u.parents : []).map((p) => cleanRel(p)).filter((p) => p && !p.startsWith('.claude'));
  const sk = part(cfg.skills);
  const pol = cfg.policies && typeof cfg.policies === 'object' ? cfg.policies : {};
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
    units: { parents: [...new Set(parents)], dirsRaw: part(u.dirs).value },
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
  const rel = path.relative(root, path.resolve(abs)).split(path.sep).join('/');
  if (rel.startsWith('..') || path.isAbsolute(rel)) return '';
  for (const s of projectConfig(root).policies.unitSheets) {
    let m = null;
    try { m = new RegExp(s, 'i').exec(rel); } catch { continue; }
    if (m && m[1]) return m[1];
  }
  return '';
}
// Thư mục chứa đơn vị (tính từ gốc). Thư mục đầu là nơi đơn vị mới được tạo.
const unitParents = (root) => projectConfig(root).units.parents;
const servicesDir = (root) => { const p = unitParents(root); return p.length ? path.join(root, ...p[0].split('/')) : root; };
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
    out[name] = { dir: clean, reads: [...new Set(reads)].slice(0, MAX_UNIT_READS) };
  }
  return out;
}
function extraUnits(root) {
  return Object.fromEntries(Object.entries(parseUnits(root)).map(([name, u]) => [name, u.dir]));
}
// Các tệp ngoài thư mục mà đơn vị `name` khai để kho ngữ nghĩa đọc thêm (đường dẫn kiểu posix tính từ gốc dự án). Không khai thì [].
const unitReads = (root, name) => (parseUnits(root)[name] || { reads: [] }).reads;
// Thư mục của đơn vị `name`: đơn vị khai riêng; hoặc thư mục con của một thư mục cha đang có thật; chưa có thì ở thư mục cha đầu tiên.
function serviceDir(root, name) {
  const extra = extraUnits(root)[name];
  if (extra) return path.join(root, ...extra.split('/'));
  const parents = unitParents(root);
  for (const p of parents) { const d = path.join(root, ...p.split('/'), name); if (fs.existsSync(d)) return d; }
  return path.join(servicesDir(root), name);
}
// Dịch vụ có kho git để harness đọc bản đã commit: thư mục có .git riêng, hoặc một đơn vị ngoài nằm TRONG repo gốc
// (không có .git riêng, dùng kho của repo gốc; ví dụ chính harness ở .claude/modules).
function serviceHasRepo(root, name) {
  if (!name) return false;
  const dir = serviceDir(root, name);
  if (fs.existsSync(path.join(dir, '.git'))) return true;
  return Boolean(extraUnits(root)[name]) && fs.existsSync(dir) && fs.existsSync(path.join(root, '.git'));
}
// Đường dẫn của một dịch vụ tính từ gốc dự án, kiểu posix: "<thư mục cha>/<tên>" hoặc thư mục của đơn vị khai riêng.
const serviceRel = (root, name) => extraUnits(root)[name] || path.relative(root, serviceDir(root, name)).split(path.sep).join('/');
// Tên dịch vụ chứa đường dẫn tuyệt đối `abs` (thư mục con trực tiếp của một thư mục cha khai trong cấu hình, hoặc một đơn vị khai riêng),
// hoặc '' nếu không thuộc dịch vụ nào.
function serviceOf(root, abs) {
  const target = path.resolve(abs);
  for (const [name, rel] of Object.entries(extraUnits(root))) {
    const r = path.relative(path.join(root, ...rel.split('/')), target);
    if (r === '' || (!r.startsWith('..') && !path.isAbsolute(r))) return name;
  }
  for (const p of unitParents(root)) {
    const parts = path.relative(path.join(root, ...p.split('/')), target).split(path.sep);
    if (parts[0] && parts[0] !== '..' && !path.isAbsolute(parts[0])) return parts[0];
  }
  return '';
}
// Mọi thư mục có thể là dịch vụ: thư mục con có tên hợp lệ của các thư mục cha, cộng các đơn vị khai riêng có thư mục thật. [{ name, dir }], sắp theo tên.
function serviceEntries(root) {
  const out = new Map();
  for (const p of unitParents(root)) {
    const parent = path.join(root, ...p.split('/'));
    try { for (const d of fs.readdirSync(parent, { withFileTypes: true })) if (d.isDirectory() && UNIT_NAME_RE.test(d.name) && !out.has(d.name)) out.set(d.name, path.join(parent, d.name)); } catch { /* chưa có thư mục cha */ }
  }
  for (const [name, rel] of Object.entries(extraUnits(root))) {
    const dir = path.join(root, ...rel.split('/'));
    try { if (fs.statSync(dir).isDirectory()) out.set(name, dir); } catch { /* khai mà chưa có thư mục */ }
  }
  return [...out.entries()].map(([name, dir]) => ({ name, dir })).sort((a, b) => a.name.localeCompare(b.name));
}

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
  return dirs;
}

module.exports = {
  safeId, stateDir, sessionFile, gateStatePath, scopeStatePath, docsStatePath, diagLogPath, ledgerPath, LEDGER_FILE, evalDbPath, EVAL_FILE, dbBackupsDir, skillsMapPath, skillsDir, scopeConfigPath, scopeMode, localDir, bannedListPath,
  locksDir, lockPath, docsJournalPath, docsBackupsDir,
  SERVICES_DIR, LEGACY_CONFIG: LEGACY, pluginDir, projectConfigPath, projectConfig, policy, sheetOwner, unitParents, servicesDir, serviceDir, serviceOf, serviceRel, serviceEntries, extraUnits, unitReads, serviceHasRepo, HARNESS_UNIT_DIR,
  harnessDir, configPath, manifestPath, migratedAtPath, versionPath,
  MODULE_ORDER, rootFrom, isModular, modulesHome, harnessHome, codeIndex, moduleDirs, codePath, codeDirs, codeRel, projectDir, generatorsDir, contextConfigPath, moduleManifests, enabledModules, moduleEnabled, contributions, provided,
  UNIT_EXT_DIR, extensionsDir, trustDir, trustFile, extensionErrorsPath, mcpConfigPath, mcpTrustFile, mcpStateDir, loadedDir, transfersDir,
  norm, slashes, inside, isProtectedPath, isProtectedTarget, resolveToken, exemptDirs, PROTECTED_BASENAMES,
};
