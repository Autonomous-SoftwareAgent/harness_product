'use strict';
// spec: GATE-S-005
// spec: GATE-S-007
// spec: GATE-S-001
// spec: GATE-S-004
// CỬA VÀO duy nhất của gate phê duyệt, cài ở <gốc>/.claude/modules/core/gate/ và gọi từ settings.json:
//   node .claude/modules/core/gate/gate-hook.js prompt   (UserPromptSubmit): phán xét lời người dùng, mở/đóng cổng, nhắc model quy trình
//   node .claude/modules/core/gate/gate-hook.js stop     (Stop): lưu tin nhắn cuối của model làm ngữ cảnh cho lượt sau
//   node .claude/modules/core/gate/gate-hook.js tool     (PreToolUse Write|Edit|NotebookEdit|Bash): chặn/hỏi khi cổng đóng
//   node .claude/modules/core/gate/gate-hook.js health   (SessionStart): kiểm sức khỏe harness, chỉ nhắc khi có vấn đề
// Tệp này chỉ LẮP RÁP: bộ chuyển Claude Code (gate-host.js) dịch dữ liệu hook thành sự kiện chung; luật (gate-rule.js) quyết định;
// các cổng ra của luật được nối với trạng thái (gate-state.js), model phán xét (gate-classify.js), nhật ký (gate-diag.js),
// đường dẫn (gate-paths.js), phép kiểm sức khỏe (gate-health.js) và sổ phạm vi của harness nếu có.
// Hook lỗi: prompt, stop, health im lặng (không đổi trạng thái); tool thì từ chối (đóng khi lỗi), kèm cách tắt.
// Tiến trình con `claude -p` của bộ phán xét đặt BSN_GATE_NESTED=1 để hook thoát ngay, không lặp vô hạn.
const fs = require('node:fs');
const path = require('node:path');
const core = require('./gate-core');
const paths = require('./gate-paths');
const host = require('./gate-host');
const rule = require('./gate-rule');
const { loadState, saveState, stateMtime } = require('./gate-state');
const { classify, findClaude } = require('./gate-classify');
const { logEvent, lastTransition } = require('./gate-diag');
const { health } = require('./gate-health');

if (process.env.BSN_GATE_NESTED === '1') process.exit(0);

const ROOT = paths.rootFrom(__dirname);
const DEFAULTS = { mode: 'enforce', model: 'claude-sonnet-5-5', classifierTimeoutMs: 45000, maxPromptChars: 600, claudeCmd: null };
const KIND = { prompt: 'user-prompt', stop: 'turn-end', tool: 'before-action', health: 'session-start' };

// PreToolUse Read|Grep|Glob: không cho công cụ đọc đọc khóa ký ủy quyền (đọc được khóa là tự ký được lệnh duyệt). Thư mục chứa khóa chỉ bị chặn với Grep và Glob.
function guardRead(input) {
  const ti = input && input.tool_input && typeof input.tool_input === 'object' ? input.tool_input : {};
  const target = ti.file_path || ti.path;
  if (typeof target !== 'string' || !target) return;
  const abs = path.resolve(input.cwd || process.cwd(), target);
  const keyDir = path.dirname(require('./gate-delegate').keyPath());
  const hit = paths.isSecretPath(abs) || (input.tool_name !== 'Read' && paths.norm(abs) === paths.norm(keyDir));
  if (hit) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: 'Khóa ký ủy quyền duyệt kế hoạch không đọc qua công cụ của phiên. Xem tình trạng ủy quyền bằng công cụ delegate_status.' } }));
  else if (isRootEnv(abs)) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: ENV_DENY } }));
}

// Tệp .env ở gốc dự án giữ bí mật của máy (token): phiên không đọc, không ghi, không nhắc tới nó trong lệnh shell. Lệnh của harness cần token thì
// tự nạp vào tiến trình con (cli/gh.js, cli/git-credential.js). Chỉ là hàng rào: một lệnh vòng vèo vẫn đọc được tệp.
const ENV_DENY = 'Tệp .env ở gốc dự án giữ bí mật của máy (ví dụ GH_TOKEN): phiên không đọc, không ghi, không nhắc tới nó trong lệnh. Cần GitHub thì dùng `git push` bình thường (harness tự cấp mật khẩu) hoặc `node .claude/modules/core/cli/gh.js <tham số gh>`; token thiếu thì nhờ người dùng tự điền vào tệp.';
// Kho bí mật của máy (khối secrets): thư mục ~/.claude/secrets (hay BSN_SECRETS_DIR), Keychain/Secret Service mang tên "harness".
const secretsDir = () => process.env.BSN_SECRETS_DIR || path.join(require('node:os').homedir(), '.claude', 'secrets');
const isRootEnv = (abs) => paths.norm(abs) === paths.norm(path.join(ROOT, '.env')) || paths.inside(abs, secretsDir()) || paths.norm(abs) === paths.norm(secretsDir());
const READS_STORE = /\b(?:find-generic-password|secret-tool\s+lookup|ConvertTo-SecureString|PtrToStringBSTR|ZeroFreeBSTR)\b|\.dpapi\b|[\\/]\.claude[\\/]secrets\b/i;
function mentionsRootEnv(command, cwd) {
  const cmd = String(command || '');
  const slash = (s) => s.split('\\').join('/');
  const want = slash(path.join(ROOT, '.env'));
  if (slash(cmd).toLowerCase().includes(want.toLowerCase()) || READS_STORE.test(cmd)) return true;
  const atRoot = paths.norm(path.resolve(cwd || process.cwd())) === paths.norm(ROOT);
  return atRoot && /(^|[\s'"=<>|;&(`])(?:\.[\\/])?\.env(?![\w.-])/.test(cmd);
}
function guardEnv(input) {
  const ti = input && input.tool_input && typeof input.tool_input === 'object' ? input.tool_input : {};
  const cwd = input.cwd || process.cwd();
  const shell = input.tool_name === 'Bash' || input.tool_name === 'PowerShell';
  const target = ti.file_path || ti.notebook_path;
  const hit = shell ? mentionsRootEnv(ti.command, cwd) : (typeof target === 'string' && target && isRootEnv(path.resolve(cwd, target)));
  if (!hit) return false;
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: ENV_DENY } }));
  return true;
}

function loadConfig() {
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(paths.configPath(ROOT), 'utf8')) };
  } catch {
    return { ...DEFAULTS }; // thiếu hoặc hỏng thì dùng mặc định enforce, không im lặng tắt gate
  }
}

// Ghi lần phán xét vào sổ phạm vi. Sổ là bản ghi và lịch sử; cổng không phụ thuộc vào nó, nên lỗi thì bỏ qua.
function recordPlan(sid, text, parsed, status) {
  try {
    const db = require('../hooks/ledger-lib').open(ROOT);
    if (!db) return;
    try { require('../hooks/scope-lib').recordVerdict(db, { sid, sha: core.sha(text), parsed, status }); } finally { try { db.close(); } catch { /* bỏ qua */ } }
  } catch { /* không có sổ: bỏ qua */ }
}

// Mốc chuyển đổi: trạng thái định dạng cũ (open:true không kèm kế hoạch đã duyệt) chỉ được chấp nhận nếu được ghi TRƯỚC mốc này.
function migratedAt() {
  try { return Number(fs.readFileSync(paths.migratedAtPath(ROOT), 'utf8').trim()) || 0; } catch { return 0; }
}

// Ủy quyền duyệt kế hoạch (gate-delegate.js). Lỗi bên trong thì coi như không có ủy quyền: cổng không bao giờ mở vì lỗi.
const safely = (fn, fallback) => (...a) => { try { return fn(...a); } catch { return fallback; } };
const delegation = () => {
  const d = require('./gate-delegate');
  return {
    directive: safely(d.directive, null),
    apply: safely((sid, dir) => d.applyDirective(ROOT, sid, dir), { text: 'GATE: không ghi được ủy quyền (lỗi bên trong).' }),
    bind: safely((sid, msg) => d.bindSpawn(ROOT, sid, msg), null),
    fromPlan: safely((sid, parsed) => d.planGrant(ROOT, sid, parsed), { granted: false, text: '' }),
    claim: safely((sid, st) => d.claim(ROOT, sid, st), null),
    stillValid: safely((sid, by) => d.stillValid(ROOT, sid, by), false),
    isOrchestrator: safely((sid) => d.isOrchestrator(ROOT, sid), false),
    limit: safely((sid, action, cwd) => d.delegatedLimitFor(ROOT, sid, action, cwd), 'không kiểm được giới hạn của việc làm thay (lỗi bên trong)'),
    supersede: safely((sid) => d.supersede(ROOT, sid), null),
  };
};

// Các cổng ra của luật, nối với bộ chuyển thật của máy này.
const ports = (cfg) => ({
  delegate: delegation(),
  state: { load: (sid) => loadState(ROOT, sid), save: (sid, s) => saveState(ROOT, sid, s), mtime: (sid) => stateMtime(ROOT, sid) },
  judge: (msg, plan, held) => classify(msg, plan, cfg, held ? { held } : {}),
  log: (entry) => logEvent(ROOT, entry),
  lastTransition: (sid) => lastTransition(ROOT, sid),
  recordPlan,
  scopeMode: () => paths.scopeMode(ROOT),
  exemptDirs: (scratch) => paths.exemptDirs(ROOT, { scratchpad_dir: scratch }),
  migratedAt,
  health: () => health(ROOT, { findClaude: () => findClaude(cfg) }),
  now: () => Date.now(),
});

const mode = process.argv[2];
const input = host.readInput();
const cfg = loadConfig();
if (cfg.mode === 'off') process.exit(0);
if (mode === 'read') { try { guardRead(input); } catch { /* không đọc được thì cho qua */ } process.exit(0); }
if (mode === 'tool') { let done = false; try { done = guardEnv(input); } catch { /* không đọc được thì để luật cổng xét */ } if (done) process.exit(0); }

try {
  const kind = KIND[mode];
  if (kind) {
    let lang = 'vi';
    try { lang = paths.projectConfig(ROOT).lang; } catch { /* cấu hình hỏng: tiếng Việt */ }
    const out = host.fromDecision(kind, rule.HANDLERS[kind](host.toEvent(input, { kind, root: ROOT }), cfg, ports(cfg)), lang);
    if (out) process.stdout.write(out);
  }
} catch (err) {
  if (mode === 'tool') {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `Gate phê duyệt gặp lỗi nội bộ (${String(err && err.message).slice(0, 200)}). Từ chối cho an toàn. ` +
          'Người dùng có thể đặt "mode": "off" trong .claude/project/gate.config.json hoặc chạy install.js --uninstall.',
      },
    }));
  }
  // prompt/stop/health: không đổi trạng thái, không chặn
}
process.exit(0);
