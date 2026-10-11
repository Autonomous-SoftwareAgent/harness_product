'use strict';
// spec: GATE-S-005
// spec: GATE-S-001
// spec: GATE-S-004
// CỬA VÀO duy nhất của gate phê duyệt, cài ở <gốc>/.claude/plugin/gate/ và gọi từ settings.json:
//   node .claude/plugin/gate/gate-hook.js prompt   (UserPromptSubmit): phán xét lời người dùng, mở/đóng cổng, nhắc model quy trình
//   node .claude/plugin/gate/gate-hook.js stop     (Stop): lưu tin nhắn cuối của model làm ngữ cảnh cho lượt sau
//   node .claude/plugin/gate/gate-hook.js tool     (PreToolUse Write|Edit|NotebookEdit|Bash): chặn/hỏi khi cổng đóng
//   node .claude/plugin/gate/gate-hook.js health   (SessionStart): kiểm sức khỏe harness, chỉ nhắc khi có vấn đề
// Tệp này chỉ LẮP RÁP (S-056): bộ chuyển Claude Code (gate-host.js) dịch dữ liệu hook thành sự kiện chung; luật (gate-rule.js) quyết định;
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

const ROOT = path.resolve(__dirname, '..', '..', '..');
const DEFAULTS = { mode: 'enforce', model: 'claude-sonnet-5-5', classifierTimeoutMs: 45000, maxPromptChars: 600, claudeCmd: null };
const KIND = { prompt: 'user-prompt', stop: 'turn-end', tool: 'before-action', health: 'session-start' };

function loadConfig() {
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(paths.configPath(ROOT), 'utf8')) };
  } catch {
    return { ...DEFAULTS }; // thiếu hoặc hỏng thì dùng mặc định enforce, không im lặng tắt gate
  }
}

// Ghi lần phán xét vào sổ phạm vi (S-050). Sổ là bản ghi và lịch sử; cổng không phụ thuộc vào nó, nên lỗi thì bỏ qua.
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

// Các cổng ra của luật, nối với bộ chuyển thật của máy này.
const ports = (cfg) => ({
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

try {
  const kind = KIND[mode];
  if (kind) {
    const out = host.fromDecision(kind, rule.HANDLERS[kind](host.toEvent(input, { kind, root: ROOT }), cfg, ports(cfg)));
    if (out) process.stdout.write(out);
  }
} catch (err) {
  if (mode === 'tool') {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `Gate phê duyệt gặp lỗi nội bộ (${String(err && err.message).slice(0, 200)}). Từ chối cho an toàn. ` +
          'Người dùng có thể đặt "mode": "off" trong .claude/plugin/gate/gate.config.json hoặc chạy install.js --uninstall.',
      },
    }));
  }
  // prompt/stop/health: không đổi trạng thái, không chặn
}
process.exit(0);
