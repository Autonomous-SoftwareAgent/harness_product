'use strict';
// spec: LEDG-S-001
// spec: LEDG-S-002
// spec: LEDG-S-003
// CỬA VÀO cho mã còn gọi sổ phiên theo tên cũ (cổng duyệt, công cụ dòng lệnh, bảng phiên). Tệp này chỉ GHÉP (S-055):
//   phần SQLite            adapters/storage/ledger-db.js
//   phần "nghĩ"            core/rules/lib/knowledge.js
//   skill và bảng nối      adapters/project/workspace.js
//   lệnh hook đang khai    adapters/claude-code/settings.js
const db = require('../adapters/storage/ledger-db');
const project = require('../adapters/project/workspace');
const K = require('../core/rules/lib/knowledge');

const skillSet = (root) => ({ all: project.allSkills(root), exists: (name) => project.skillExists(root, name) });

// Kiểm bảng nối với thực tế: skill được nhắc phải tồn tại; chế độ; hook đã khai trong settings. Trả danh sách vấn đề (rỗng = sạch).
function health(root) {
  return K.health(project.create(root), {
    hookCommands: require('../adapters/claude-code/settings').hookCommands(root),
    skillMatchers: require('../adapters/claude-code/settings').preToolMatchers(root, 'guard-skill.js'),
    ledgerOpens: () => { const d = db.open(root); if (d) try { d.close(); } catch { /* bỏ qua */ } return Boolean(d); },
  });
}

module.exports = {
  ...db,
  loadMap: (root) => K.loadMap(project.create(root)),
  stats: (d, root, opts) => db.stats(d, skillSet(root), opts),
  health,
  skillExists: project.skillExists,
  allSkills: project.allSkills,
};
