'use strict';
// spec: GATE-S-005
// spec: GATE-S-003
// Kiểm sức khỏe harness và dấu vân tay (MANIFEST). Hook của Claude Code FAIL OPEN: hook hỏng, quá giờ hay bị xóa thì công cụ vẫn chạy,
// và hook không thể tự phát hiện việc chính nó bị xóa. Nên có hai chỗ gọi: hook SessionStart (nhắc khi có vấn đề) và
// `install.js --verify` chạy từ ngoài (vô điều kiện, thoát mã khác 0 nếu lệch).
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const paths = require('./gate-paths');

// Mọi tệp mã của gate (nguồn duy nhất của danh sách này; install.js và MANIFEST dùng chung).
const CODE_FILES = [
  'gate-core.js', 'gate-state.js', 'gate-classify.js', 'gate-hook.js', 'gate-rule.js', 'gate-host.js', 'gate-paths.js', 'gate-diag.js', 'gate-health.js',
  'bash-targets.js', 'nested-settings.json', 'bootstrap.js', 'plan-format.js',
];
const HOOK_MODES = ['prompt', 'stop', 'tool', 'health'];

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const fileSha = (p) => sha256(fs.readFileSync(p));

function stamp(root) {
  const dir = paths.harnessDir(root);
  const files = {};
  for (const f of CODE_FILES) files[f] = fileSha(path.join(dir, f));
  const manifest = { at: new Date().toISOString(), files };
  fs.writeFileSync(paths.manifestPath(root), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

// Trả về { problems: string[], notes: string[] }. problems = cần người dùng xem; notes = chỉ để biết.
function health(root, { findClaude } = {}) {
  const problems = [];
  const notes = [];
  const dir = paths.harnessDir(root);

  for (const f of CODE_FILES) if (!fs.existsSync(path.join(dir, f))) problems.push(`thiếu tệp harness: ${f}`);

  const manifest = readJson(paths.manifestPath(root));
  if (!manifest || !manifest.files) {
    problems.push('chưa có MANIFEST.json (chạy: node .claude/plugin/gate/install.js --stamp .)');
  } else {
    for (const f of CODE_FILES) {
      const p = path.join(dir, f);
      if (!fs.existsSync(p)) continue;
      if (!manifest.files[f]) problems.push(`MANIFEST không có ${f}`);
      else if (fileSha(p) !== manifest.files[f]) problems.push(`${f} đã đổi so với MANIFEST (nếu bạn cố ý sửa, chạy lại --stamp)`);
    }
  }

  if (fs.existsSync(paths.configPath(root)) && readJson(paths.configPath(root)) === null) problems.push('gate.config.json không đọc được (đang dùng mặc định enforce)');

  try {
    fs.mkdirSync(paths.stateDir(root), { recursive: true });
    const probe = path.join(paths.stateDir(root), `.health-${process.pid}`);
    fs.writeFileSync(probe, 'x');
    fs.unlinkSync(probe);
  } catch (e) {
    problems.push(`thư mục trạng thái không ghi được: ${e.code || e.message}`);
  }

  const settings = readJson(path.join(root, '.claude', 'settings.json'));
  if (!settings) {
    problems.push('.claude/settings.json không có hoặc không đọc được: không có hook nào của gate được nạp');
  } else {
    const cmds = Object.values(settings.hooks || {}).flat().flatMap((g) => (g.hooks || []).map((h) => String(h.command || '')));
    for (const mode of HOOK_MODES) {
      const c = cmds.find((x) => x.includes('gate-hook.js') && x.trim().endsWith(` ${mode}`));
      if (!c) { problems.push(`settings.json thiếu hook gate: ${mode}`); continue; }
      // Lệnh hook phải neo vào gốc dự án bằng $CLAUDE_PROJECT_DIR: khai đường dẫn tương đối thì hook KHÔNG tìm thấy tệp ngay khi thư mục
      // làm việc của phiên đổi (đã gặp ở phiên Remote Control sau một lệnh cd), và Claude Code cho qua khi hook hỏng.
      const m = /node\s+"?([^"\s]+gate-hook\.js)"?/.exec(c);
      if (!m) continue;
      const ANCHOR = /^\$\{?CLAUDE_PROJECT_DIR\}?[\\/]/;
      const anchored = ANCHOR.test(m[1]);
      const file = anchored ? path.join(root, m[1].replace(ANCHOR, '')) : path.resolve(root, m[1]);
      if (!fs.existsSync(file)) problems.push(`hook gate '${mode}' trỏ tới tệp không tồn tại: ${m[1]}`);
      else if (!anchored && !path.isAbsolute(m[1])) problems.push(`hook gate '${mode}' khai đường dẫn tương đối (${m[1]}): hook sẽ hỏng khi thư mục làm việc của phiên đổi; khai lại bằng "$CLAUDE_PROJECT_DIR/..." (node .claude/plugin/gate/install.js .)`);
    }
  }

  if (findClaude) {
    const cfg = readJson(paths.configPath(root)) || {};
    if (!findClaude(cfg)) notes.push('không tìm thấy lệnh claude: phán xét chỉ còn luật nghiêm (câu đồng ý ngắn, rõ)');
  }
  return { problems, notes };
}

module.exports = { health, stamp, CODE_FILES, HOOK_MODES, sha256, fileSha };
