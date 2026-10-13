'use strict';
// spec: HOOK-S-010
// Phần khối context GÓP cho khối sơ đồ (khóa `provides.autoDiagrams` trong modules/context.json): sơ đồ tự sinh từ mã của dịch vụ
// đang chọn, và việc ghi phần giải thích cho chúng. Khối sơ đồ hỏi qua bảng đăng ký, không nhập thẳng khối này; khối context tắt thì
// danh sách sơ đồ tự sinh rỗng.
const yaml = require('../../../core/core/lib/yaml-lite');
const core = require('../../../servicedocs/mcp/docs/core');

// Sơ đồ tự sinh từ mã của dịch vụ đang chọn, kèm tình trạng phần agent viết (đọc từ thư mục làm việc). [] nếu chưa có kho.
function autoDiagrams() {
  const all = require('./context').loadAll();
  const g = all && all.services[core.serviceName()];
  if (!g) return [];
  const notes = require('./annotations');
  let entries = [];
  try { const p = notes.fileOf('auto'); if (core.fileExists(p)) entries = (yaml.parse(core.readText(p)).diagrams) || []; } catch { entries = []; }
  return require('../../core/context/auto-diagrams').forService(g, { project: require('../../../core/gate/gate-paths').projectConfig(require('../../../core/gate/gate-paths').rootFrom(__dirname)).name }).map((d) => ({ ...d, state: notes.autoState(entries, d.spec) }));
}

const autoExplain = (input) => require('./annotations').autoExplain(input);

module.exports = { autoDiagrams, autoExplain };
