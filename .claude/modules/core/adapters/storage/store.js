'use strict';
// spec: HOOK-S-007
// spec: LEDG-S-004
// BỘ CHUYỂN lưu trữ: làm cổng "sổ" (ports/store.js) bằng SQLite và tệp trạng thái trên đĩa của máy này.
// Mọi hàm trả lời hứa để khớp hợp đồng "có chờ", dù SQLite trả lời ngay. Không mở được sổ thì trả giá trị rỗng theo hợp đồng, không ném lỗi.
const L = require('./ledger-db');
const S = require('./scope-db');
const D = require('./docs-state');

function create(root) {
  const book = (db) => ({
    touch: async (sid) => L.touch(db, sid),
    bumpEpoch: async (sid) => L.bumpEpoch(db, sid),
    prune: async () => L.prune(db),
    addSkill: async (row) => L.addSkill(db, row),
    addDoc: async (row) => L.addDoc(db, row),
    // Lời gọi công cụ gắn với kế hoạch đang hiệu lực của phiên lúc đó (0 nếu không có), để truy được kế hoạch -> việc đã làm.
    addTool: async (row) => L.addTool(db, { ...row, planId: S.planIdOf(db, root, row.sid) }),
    have: async (sid, agent) => L.have(db, sid, agent),
  });
  return {
    planExample: S.EXAMPLE,
    async ledger(work, fallback) {
      const db = L.open(root);
      if (!db) return fallback;
      try { return await work(book(db)); } finally { try { db.close(); } catch { /* bỏ qua */ } }
    },
    async activePlan(sid) {
      const db = L.open(root);
      if (!db) return null;
      try {
        const a = S.activePlan(db, root, sid);
        return a.plan ? { plan: a.plan, registered: [...S.registered(db, a.plan.id)] } : a;
      } finally { try { db.close(); } catch { /* bỏ qua */ } }
    },
    // Ghi một quyết định của một luật vào act_rule_decisions. Không mở được sổ hay ghi lỗi thì bỏ qua: việc ghi không bao giờ đổi quyết định.
    async decision(row) {
      if (!row || !row.sid) return;
      const db = L.open(root);
      if (!db) return;
      try { L.addDecision(db, { ...row, planId: S.planIdOf(db, root, row.sid) }); } catch { /* bỏ qua */ } finally { try { db.close(); } catch { /* bỏ qua */ } }
    },
    editsOf: async (sid) => S.editsOf(root, sid),
    noteEdit: async (sid, service) => S.noteEdit(root, sid, service),
    noteOnce: async (sid, prefix, key) => S.noteOnce(root, sid, prefix, key),
    recentOthers: async (sid, withinMs) => S.recentOthers(root, sid, { withinMs }),
    docsState: async (service, sid) => D.loadState(root, service, sid),
    saveDocsState: async (service, sid, state) => D.saveState(root, service, sid, state),
    clearDocsState: async (service, sid) => D.clearState(root, service, sid),
    async log(entry) { try { require('../../gate/gate-diag').logEvent(root, entry); } catch { /* bỏ qua */ } },
  };
}

module.exports = { create };
