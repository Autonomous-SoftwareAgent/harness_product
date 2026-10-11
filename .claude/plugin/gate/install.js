'use strict';
// spec: GATE-S-003
// Quản lý hook của gate phê duyệt. Nguồn chuẩn chính là BSN_/.claude/plugin/gate (harness chỉ có MỘT chỗ, ở gốc BSN_).
//   node .claude/plugin/gate/install.js --stamp [<thư-mục>]          ghi MANIFEST.json (băm các tệp mã); làm sau khi cố ý sửa mã
//   node .claude/plugin/gate/install.js --migrate [<thư-mục>]        ghi mốc MIGRATED_AT (làm MỘT lần khi nâng cấp gate đang có phiên mở)
//   node .claude/plugin/gate/install.js --verify [<thư-mục>]         kiểm từ bên ngoài: tệp đủ, khớp MANIFEST, settings.json có hook trỏ tới tệp thật; thoát 1 nếu lệch
//   node .claude/plugin/gate/install.js <thư-mục> [...]              trộn hook vào <thư-mục>/.claude/settings.json (chép mã nếu thư mục khác nguồn; dùng cho cây thử)
//   node .claude/plugin/gate/install.js --uninstall <thư-mục> [...]  gỡ hook khỏi settings.json (không xóa mã nếu đó là nguồn chuẩn)
//   node .claude/plugin/gate/install.js --dry-run <thư-mục> [...]    chỉ in việc sẽ làm
// Idempotent. Không đè hook khác trong settings.json. Cấu hình có sẵn của người dùng được giữ nguyên.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const SRC = __dirname;
const { CODE_FILES, stamp, health } = require('./gate-health');
const CONFIG_FILE = 'gate.config.json';
const MARK = 'gate-hook.js';
// Neo vào gốc dự án: Claude Code cấp CLAUDE_PROJECT_DIR cho hook. Khai tương đối thì hook hỏng khi thư mục làm việc của phiên đổi.
const CMD = (mode) => `node "$CLAUDE_PROJECT_DIR/.claude/plugin/gate/gate-hook.js" ${mode}`;

const WANTED = [
  { event: 'UserPromptSubmit', group: { hooks: [{ type: 'command', command: CMD('prompt'), timeout: 90, statusMessage: 'Checking approval...' }] } },
  { event: 'Stop', group: { hooks: [{ type: 'command', command: CMD('stop'), timeout: 10 }] } },
  { event: 'PreToolUse', group: { matcher: 'Write|Edit|NotebookEdit|Bash', hooks: [{ type: 'command', command: CMD('tool'), timeout: 10 }] } },
  { event: 'SessionStart', group: { hooks: [{ type: 'command', command: CMD('health'), timeout: 15 }] } },
];

// Thư mục harness của đích có chính là thư mục chứa install.js này (nguồn chuẩn) không.
const isSource = (harnessDir) => path.resolve(harnessDir).toLowerCase() === path.resolve(SRC).toLowerCase();

const isGateHook = (h) => h && typeof h.command === 'string' && h.command.includes(MARK);

function removeGate(settings) {
  const hooks = settings.hooks || {};
  for (const event of Object.keys(hooks)) {
    hooks[event] = (hooks[event] || [])
      .map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !isGateHook(h)) }))
      .filter((g) => g.hooks.length > 0);
    if (hooks[event].length === 0) delete hooks[event];
  }
  if (settings.hooks && Object.keys(settings.hooks).length === 0) delete settings.hooks;
  return settings;
}

function mergeGate(settings) {
  removeGate(settings);
  settings.hooks = settings.hooks || {};
  for (const { event, group } of WANTED) {
    settings.hooks[event] = settings.hooks[event] || [];
    settings.hooks[event].push(JSON.parse(JSON.stringify(group)));
  }
  return settings;
}

function version() {
  const h = crypto.createHash('sha256');
  for (const f of [...CODE_FILES].sort()) h.update(f).update(fs.readFileSync(path.join(SRC, f)));
  return h.digest('hex').slice(0, 12);
}

function readSettings(file) {
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function install(target, { dryRun = false } = {}) {
  const log = [];
  const harness = path.join(target, '.claude', 'plugin', 'gate');
  const settingsFile = path.join(target, '.claude', 'settings.json');
  const ver = version();
  if (isSource(harness)) {
    // Nguồn chuẩn chính là thư mục đang chạy (BSN_/.claude/plugin/gate): không chép đè lên chính nó, chỉ ghi dấu phiên bản.
    log.push('đây là nguồn chuẩn, không chép tệp');
    if (!dryRun) fs.writeFileSync(path.join(harness, 'VERSION'), `${ver}\n`);
    log.push(`VERSION ${ver}`);
  } else {
    if (!dryRun) fs.mkdirSync(harness, { recursive: true });
    for (const f of CODE_FILES) {
      log.push(`chép ${f}`);
      if (!dryRun) fs.copyFileSync(path.join(SRC, f), path.join(harness, f));
    }
    const cfgDest = path.join(harness, CONFIG_FILE);
    if (fs.existsSync(cfgDest)) log.push(`giữ nguyên ${CONFIG_FILE} (đã có)`);
    else { log.push(`tạo ${CONFIG_FILE}`); if (!dryRun) fs.copyFileSync(path.join(SRC, CONFIG_FILE), cfgDest); }
    if (!dryRun) fs.writeFileSync(path.join(harness, 'VERSION'), `${ver}\n`);
    log.push(`VERSION ${ver}`);
    if (!dryRun) { stamp(target); log.push('MANIFEST.json'); }
  }
  const merged = mergeGate(readSettings(settingsFile));
  log.push(`trộn hook vào ${path.relative(target, settingsFile) || settingsFile} (UserPromptSubmit, Stop, PreToolUse, SessionStart)`);
  if (!dryRun) fs.writeFileSync(settingsFile, `${JSON.stringify(merged, null, 2)}\n`);
  return log;
}

function uninstall(target, { dryRun = false } = {}) {
  const log = [];
  const settingsFile = path.join(target, '.claude', 'settings.json');
  if (fs.existsSync(settingsFile)) {
    const cleaned = removeGate(readSettings(settingsFile));
    log.push('gỡ hook khỏi settings.json');
    if (!dryRun) fs.writeFileSync(settingsFile, `${JSON.stringify(cleaned, null, 2)}\n`);
  }
  const harness = path.join(target, '.claude', 'plugin', 'gate');
  if (isSource(harness)) {
    log.push('giữ .claude/plugin/gate/ (đây là nguồn chuẩn, không xóa)');
  } else if (fs.existsSync(harness)) {
    log.push('xóa .claude/plugin/gate/');
    if (!dryRun) fs.rmSync(harness, { recursive: true, force: true });
  }
  return log;
}

function main(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const sourceRoot = path.resolve(SRC, '..', '..', '..'); // gốc chứa .claude/plugin/gate này
  const targets = argv.filter((a) => !a.startsWith('--')).map((t) => path.resolve(t));
  if (flags.has('--migrate')) {
    // Ghi mốc chuyển đổi: trạng thái phiên định dạng cũ (open:true không kèm kế hoạch đã duyệt) ghi TRƯỚC mốc này được nâng cấp một lần.
    for (const root of targets.length ? targets : [sourceRoot]) {
      fs.writeFileSync(require('./gate-paths').migratedAtPath(root), `${Date.now()}\n`);
      console.log(`${root}\n  - đã ghi MIGRATED_AT`);
    }
    return 0;
  }
  if (flags.has('--stamp') || flags.has('--verify')) {
    const roots = targets.length ? targets : [sourceRoot];
    let bad = 0;
    for (const root of roots) {
      if (flags.has('--stamp')) {
        const m = stamp(root);
        console.log(`${root}\n  - đã ghi MANIFEST.json (${Object.keys(m.files).length} tệp)`);
        continue;
      }
      const r = health(root, { findClaude: (cfg) => require('./gate-classify').findClaude(cfg) });
      console.log(`${root}\n${r.problems.length ? r.problems.map((p) => `  - VẤN ĐỀ: ${p}`).join('\n') : '  - sạch: tệp đủ, khớp MANIFEST, hook trỏ tới tệp thật'}`);
      for (const n of r.notes) console.log(`  - ghi chú: ${n}`);
      if (r.problems.length) bad = 1;
    }
    return bad;
  }
  if (!targets.length) { console.error('Dùng: node .claude/plugin/gate/install.js [--stamp|--verify|--uninstall|--dry-run] [<thư-mục>...]'); return 2; }
  for (const t of targets) {
    if (!fs.existsSync(t)) { console.error(`Không có thư mục: ${t}`); return 1; }
    const opts = { dryRun: flags.has('--dry-run') };
    const log = flags.has('--uninstall') ? uninstall(t, opts) : install(t, opts);
    console.log(`${opts.dryRun ? '[dry-run] ' : ''}${t}\n${log.map((l) => `  - ${l}`).join('\n')}`);
  }
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { install, uninstall, mergeGate, removeGate, version, CODE_FILES };
