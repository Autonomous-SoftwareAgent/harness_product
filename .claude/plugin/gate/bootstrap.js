'use strict';
// spec: GATE-S-003
// Hook "mồi" đặt trong cấu hình CÁ NHÂN (~/.claude/settings.json), chạy cho mọi phiên Claude Code trên máy:
//   node -e "try{require('<BSN_>/.claude/plugin/gate/bootstrap.js')}catch(e){}"
// Lý do: hook và MCP ở BSN_/.claude KHÔNG nạp khi phiên mở trong thư mục con (vd. BSN_/payment-hub), và Claude Code
// không báo gì. Hook này chỉ làm một việc: thấy phiên mở TRONG BSN_ nhưng không phải ở gốc thì cảnh báo.
// Phiên ở gốc BSN_, hoặc ở ngoài BSN_ hoàn toàn (dự án khác): im lặng, không in gì. Lỗi gì cũng im lặng, không chặn.
const fs = require('node:fs');
const path = require('node:path');

const BSN = path.resolve(__dirname, '..', '..', '..');
const norm = (p) => path.resolve(String(p)).replace(/[\\/]+$/, '').toLowerCase();

// 'root' | 'inside' | 'outside'. Thư mục dùng chung không thuộc dịch vụ nào thì vẫn tính là 'inside' (không có harness).
function where(dir, bsn = BSN) {
  if (!dir) return 'outside';
  const d = norm(dir);
  const b = norm(bsn);
  if (d === b) return 'root';
  return d.startsWith(b + path.sep) || d.startsWith(`${b}/`) ? 'inside' : 'outside';
}

function message(dir, bsn = BSN) {
  return `CẢNH BÁO HARNESS BSN_: phiên này mở ở "${dir}", nằm trong BSN_ nhưng không phải gốc. Ở đây KHÔNG có hook nào ` +
    `(không gate duyệt kế hoạch, không guard, không theo dõi docs) và không có MCP bsn-docs. ` +
    `Hãy báo người dùng ngay, đề nghị đóng phiên và mở lại ở "${bsn}". Trong lúc chờ: chỉ đọc, không sửa tệp.`;
}

function run() {
  let input = {};
  try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { /* không có đầu vào */ }
  // Gốc dự án của phiên (nơi Claude Code tìm .claude/settings.json), không phải thư mục shell đang đứng.
  const dir = process.env.CLAUDE_PROJECT_DIR || input.cwd;
  if (where(dir) !== 'inside') return;
  const event = input.hook_event_name === 'UserPromptSubmit' ? 'UserPromptSubmit' : 'SessionStart';
  const text = message(dir);
  const out = { hookSpecificOutput: { hookEventName: event, additionalContext: text } };
  if (event === 'SessionStart') out.systemMessage = text;
  process.stdout.write(JSON.stringify(out));
}

module.exports = { where, message, BSN };
// Chạy khi gọi trực tiếp (node bootstrap.js) hoặc khi được require từ `node -e` (lúc đó require.main không có).
// Được require từ tệp khác (test) thì không chạy.
if (require.main === module || !require.main) {
  try { run(); } catch { /* im lặng */ }
}
