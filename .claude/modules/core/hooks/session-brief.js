'use strict';
// spec: HOOK-S-003
// spec: PORT-S-003
// spec: HOOK-S-004
// spec: HOOK-S-005
// CỬA VÀO: SessionStart. Tóm tắt ngắn nạp vào ngữ cảnh của model khi mở phiên ở gốc dự án, để phiên biết ngay hiện trạng mà không phải dò.
// Tệp này chỉ GHÉP: wire.js lắp bộ chuyển gom dữ kiện (adapters/jobs/brief-facts.js); core/sessions/brief.js viết dữ kiện thành
// tóm tắt (thuần); adapters/claude-code/hook.js nói với Claude Code. Không khóa, không sửa mã hay docs. Lỗi gì cũng không làm hỏng việc mở phiên.
const wire = require('./wire');
const facts = require('../adapters/jobs/brief-facts');
const B = require('../core/sessions/brief');

const brief = (root, sid, now = Date.now()) => B.compose(wire.briefFacts(root, sid, now));

// Bảng skill ở .claude/rules tự theo .claude/skills/ khi mở phiên (không ai phải chạy setup tay). Nói một dòng khi vừa cập nhật hay khi
// không được ghi đè (tệp bị sửa tay); im lặng khi đã đúng. Lỗi gì cũng bỏ qua: việc mở phiên không được hỏng vì bảng này.
// Cùng chỗ đó: tệp công cụ tự nạp ở từng đơn vị (<đơn vị>/.claude/) sinh từ định nghĩa gốc ở <đơn vị>/.harness/.
const quiet = (run) => { try { const r = run(); return r.text ? `${r.text}\n` : ''; } catch { return ''; } };
const syncSkillRules = (root) => quiet(() => require('../cli/skill-rules').sync(root)) + quiet(() => require('../adapters/hosts/sync').syncAll(root));

module.exports = {
  brief,
  services: facts.services,
  openHandoffs: facts.openHandoffs,
  describe: (root, name) => B.describe(facts.serviceFacts(root, name, wire.PARTS)),
  ensureGitHooks: (root) => facts.ensureGitHooks(root, wire.PARTS),
  bannedLine: (root, hooks) => { const b = facts.bannedFacts(root, hooks, wire.PARTS); return b ? B.bannedLine(b) : ''; },
};

if (require.main === module) {
  const { note } = require('../ports/events');
  require('../adapters/claude-code/hook').serve({ name: 'session-brief', kind: 'session-start', root: wire.ROOT, cwdFallback: wire.ROOT, badInput: 'empty' }, (event) => note(`${syncSkillRules(wire.ROOT)}${brief(wire.ROOT, event.session || undefined)}`));
}
