'use strict';
// spec: MCP-S-001
// Việc của công cụ MCP host_status và host_define (khai ở mcp/mcp-tools.js; mã ở đây vì mcp/ chỉ giữ giao thức). Agent đổi định nghĩa gốc qua đây, không sửa tay tệp sinh:
//   host_status  chỉ đọc: kiểm kê .claude/ của team ở từng đơn vị, tệp harness sinh, chỗ trùng tên, chỗ lệch.
//   host_define  tạo hoặc sửa MỘT skill ở <đơn vị>/.harness/skills/<tên>/SKILL.md (có kiểm tên, mô tả, nội dung) rồi sinh tệp công cụ.
const fs = require('node:fs');
const path = require('node:path');
const P = require('../gate/gate-paths');

const ROOT = P.rootFrom(__dirname);

const status = () => {
  const inv = require('../adapters/hosts/inventory');
  const sync = require('../adapters/hosts/sync').syncAll(ROOT, { check: true });
  const out = [inv.render(inv.inventory(ROOT))];
  if (sync.notes.length) out.push('Trùng tên:', ...sync.notes.map((n) => `  ${n}`));
  out.push(sync.problems.length ? `Cần xử lý:\n${sync.problems.map((p) => `  ${p}`).join('\n')}` : 'Tệp sinh khớp định nghĩa gốc.');
  return out.join('\n');
};

function define(a) {
  const defs = require('../adapters/hosts/definitions');
  const sync = require('../adapters/hosts/sync');
  const claude = require('../adapters/hosts/claude');
  const unit = String(a.service || '');
  const entry = P.serviceEntries(ROOT).find((e) => e.name === unit);
  if (!entry) throw new Error(`Không có đơn vị "${unit}" theo cấu hình dự án. Đơn vị có: ${P.serviceEntries(ROOT).map((e) => e.name).join(', ') || '(chưa có)'}.`);
  const bad = defs.problems(a);
  if (bad.length) throw new Error(`Skill không hợp lệ: ${bad.join('; ')}.`);
  const native = claude.importNative(sync.nativeFiles(entry.dir)).find((d) => d.name === a.name);
  if (native) throw new Error(`Đơn vị ${unit} đã có skill "${a.name}" do team viết ở ${native.src}. Bản của team được dùng, nên harness không ghi bản trùng tên. Đặt tên khác, hoặc nhờ người dùng quyết định nhận skill đó vào .harness/.`);
  const file = path.join(entry.dir, P.UNIT_EXT_DIR, 'skills', a.name, 'SKILL.md');
  const existed = fs.existsSync(file);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, defs.skillText(a));
  fs.renameSync(tmp, file);
  try { require('../hooks/sessions-lib').mark(ROOT, process.env.CLAUDE_CODE_SESSION_ID, unit); } catch { /* không có mã phiên: bỏ qua */ }
  const r = sync.syncAll(ROOT);
  return [`${existed ? 'Đã cập nhật' : 'Đã tạo'} skill "${a.name}" ở ${unit}/${P.UNIT_EXT_DIR}/skills/${a.name}/SKILL.md.`, r.text || 'Tệp công cụ đã khớp.'].join('\n');
}

module.exports = { status, define };
