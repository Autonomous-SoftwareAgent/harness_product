'use strict';
// spec: HOOK-S-003
// BỘ CHUYỂN lưu trữ, phần trạng thái theo dõi tài liệu (S-055). Trạng thái theo phiên và theo service nằm ở thư mục trạng thái của harness
// (đường dẫn do gate-paths sinh), không nằm trong thư mục service. Phần "nghĩ" (tệp thuộc loại nào, còn nợ gì) ở core/rules/lib/docs-tracking.js.
const fs = require('node:fs');

const P = require('../../gate/gate-paths'); // nguồn duy nhất sinh đường dẫn trạng thái

const statePath = (root, svc, sessionId) => P.docsStatePath(root, svc, sessionId);
const empty = () => ({ code: [], status: false, decisions: false, artifact: false });

function loadState(root, svc, sessionId) {
  try {
    return { ...empty(), ...JSON.parse(fs.readFileSync(statePath(root, svc, sessionId), 'utf8')) };
  } catch {
    return empty();
  }
}

function saveState(root, svc, sessionId, state) {
  fs.mkdirSync(P.stateDir(root), { recursive: true });
  const file = statePath(root, svc, sessionId);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state));
  fs.renameSync(tmp, file);
}

function clearState(root, svc, sessionId) {
  try {
    fs.unlinkSync(statePath(root, svc, sessionId));
  } catch { /* chưa có */ }
}

module.exports = { loadState, saveState, clearState, statePath };
