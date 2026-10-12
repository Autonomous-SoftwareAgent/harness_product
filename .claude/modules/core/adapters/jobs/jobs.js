'use strict';
// spec: PORT-S-004
// spec: HOOK-S-003
// spec: HOOK-S-007
// BỘ CHUYỂN việc của harness: làm cổng "việc của harness" (ports/jobs.js) bằng cách gọi các phần khác của harness trên máy này (S-055):
// lệnh cli.js (kiểm tài liệu, bản đồ mã, dựng cổng), bộ cài git hook, kho ngữ nghĩa. Các phần đó được nạp LÚC CẦN và lỗi của
// chúng không lọt ra ngoài: một luật nhờ việc mà việc hỏng thì luật vẫn chạy tiếp.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// `parts` là các phần khác của harness mà bộ chuyển này nhờ, do CỬA VÀO đưa vào dưới dạng hàm trả module (nạp lúc cần):
//   { portal, gitHooks, contextPortal }. Bộ chuyển không tự nhập mcp/ hay tools/ (test kiến trúc giữ điều đó).
function create(root, parts = {}) {
  const P = require('../../gate/gate-paths');
  const cli = P.codePath(root, 'cli/cli.js'); // đường dẫn thật theo bố cục (S-064)
  const runCli = (args, opts) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', cwd: root, ...opts });
  return {
    async docsCheck(service) {
      const r = runCli(['--service', service, 'check'], { timeout: 20000 });
      return { failed: r.status === 1, text: (r.stdout || '').trim() };
    },
    async refreshCodeMap(service) { runCli(['--service', service, 'code'], { timeout: 20000 }); },
    // Cổng HTML cục bộ (docs/portal) tự dựng lại khi docs của bất kỳ dịch vụ nào đổi (kể cả do phiên khác hoặc do bsn-docs ghi).
    // Chạy ở tiến trình con để lỗi của bộ dựng không làm hỏng hook. Lỗi ghi vào sổ sức khỏe của cổng và nhật ký chẩn đoán;
    // xem bằng `node .claude/modules/core/cli/cli.js portal-status`.
    async rebuildPortalIfStale(sid) {
      if (!P.provided(root, 'portal')) return; // khối portal tắt hoặc không có
      if (!fs.existsSync(P.provided(root, 'portal'))) return;
      const p = runCli(['portal', '--if-stale'], { timeout: 30000 });
      if (p.status === 0) return;
      const why = (p.error ? p.error.message : (p.stderr || p.stdout || '').trim()).slice(0, 300);
      try { parts.portal().writeHealth({ buildError: { at: new Date().toISOString(), message: why || 'không rõ lý do' } }); } catch { /* bỏ qua */ }
      try { require('../../gate/gate-diag').logEvent(root, { sid, event: 'portal-build-failed' }); } catch { /* bỏ qua */ }
    },
    async ensureGitHooks(service) {
      try {
        parts.gitHooks().install(P.serviceDir(root, service), { bsn: root });
      } catch { /* bỏ qua */ }
    },
    async contextNotice(service) { return parts.contextPortal().noticeFor(service) || ''; },
    // Việc đẩy cổng lên claude.ai (S-058): bộ dựng cổng quyết định có giao cho phiên này không. Lỗi thì coi như không giao.
    async publishDue(sid) {
      try { const r = parts.portal().claimPublish(sid); return r && r.due ? { due: true, files: r.files } : { due: false }; } catch { return { due: false }; }
    },
  };
}

module.exports = { create };
