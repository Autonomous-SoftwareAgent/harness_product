'use strict';
// spec: GATE-S-006
// spec: GATE-S-001
// Đọc/ghi trạng thái gate theo mã phiên. Ghi nguyên tử (tệp tạm rồi đổi tên) để hai hook chạy sát nhau không làm hỏng tệp.
// Mỗi phiên một tệp nên các phiên chạy song song không đè trạng thái của nhau. Đường dẫn lấy từ gate-paths (nguồn duy nhất).
const fs = require('node:fs');
const path = require('node:path');
const { initialState } = require('./gate-core');
const { gateStatePath, sessionFile } = require('./gate-paths');

const statePath = gateStatePath;

function parse(s) {
  const base = { ...initialState(), open: s.open === true, lastAssistant: typeof s.lastAssistant === 'string' ? s.lastAssistant : '' };
  const a = s.approved;
  base.pending = typeof s.pending === 'string' ? s.pending : '';
  base.pendingAge = Number.isInteger(s.pendingAge) && s.pendingAge > 0 ? s.pendingAge : 0;
  base.approved = a && typeof a === 'object' && typeof a.sha === 'string' && typeof a.plan === 'string' ? { sha: a.sha, plan: a.plan, at: Number(a.at) || 0 } : null;
  return base;
}

function loadState(root, sessionId) {
  try {
    return parse(JSON.parse(fs.readFileSync(statePath(root, sessionId), 'utf8')));
  } catch {
    return initialState(); // chưa có hoặc hỏng: coi như cổng đóng (an toàn)
  }
}

// Thời điểm sửa tệp trạng thái lần cuối (ms), hoặc 0 nếu chưa có. Dùng cho việc chuyển đổi trạng thái định dạng cũ.
function stateMtime(root, sessionId) {
  try { return fs.statSync(statePath(root, sessionId)).mtimeMs; } catch { return 0; }
}

function saveState(root, sessionId, state) {
  const file = statePath(root, sessionId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state));
  fs.renameSync(tmp, file);
}

// Các khối kế hoạch do công cụ plan_draft dựng trong phiên (giữ 5 khối gần nhất), để cuối lượt đối chiếu tin kế hoạch có dán nguyên khối đó không.
const draftPath = (root, sessionId) => sessionFile(root, 'plandraft', sessionId);
const MAX_DRAFTS = 5;

function loadDrafts(root, sessionId) {
  try {
    const v = JSON.parse(fs.readFileSync(draftPath(root, sessionId), 'utf8'));
    return Array.isArray(v.blocks) ? v.blocks.filter((b) => typeof b === 'string').slice(-MAX_DRAFTS) : [];
  } catch { return []; }
}

function saveDraft(root, sessionId, block) {
  const file = draftPath(root, sessionId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const blocks = [...loadDrafts(root, sessionId).filter((b) => b !== block), block].slice(-MAX_DRAFTS);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ blocks }));
  fs.renameSync(tmp, file);
}

module.exports = { statePath, loadState, saveState, stateMtime, draftPath, loadDrafts, saveDraft };
