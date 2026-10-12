'use strict';
// spec: HOOK-S-010
// Lệnh dòng lệnh của khối servicedocs (S-064), góp vào bảng lệnh của cli.js qua khóa `commands` trong modules/servicedocs.json.
// `register(on, ctx)`: ctx = { argv, cmd, arg, si, core }.
function register(on, { arg, argv }) {
  const core = require('../../mcp/docs/core');
  on('check', () => {
    const res = core.check();
    console.log(core.formatCheck(res));
    process.exit(res.errors.length ? 1 : 0);
  });
  on('status', () => {
    console.log(core.docsStatus({ module: arg }));
  });
  on('sync', () => {
    for (const m of core.listModules()) {
      const created = core.syncModule(core.loadModule(m));
      if (created.length) console.log(`[${m}] ${created.join(', ')}`);
    }
    console.log('sync xong');
  });
  on('status-archive', () => {
    // Gọn docs/agent/STATUS.md: chuyển dòng nhật ký cũ sang STATUS-archive.md (không xóa gì). --keep N: số dòng mới nhất giữ lại (mặc định 15).
    const ki = argv.indexOf('--keep');
    const keep = ki >= 0 ? Number(argv[ki + 1]) : 15;
    if (!Number.isInteger(keep) || keep < 1) throw new Error('--keep cần một số nguyên dương');
    console.log(require('../../mcp/docs/status-archive').run({ keep }));
  });
  on('service-doc', () => {
    // In nguồn có cấu trúc docs/service.yaml của service (ghi thì dùng MCP bsn-docs: service_doc_set, problem_record).
    console.log(require('../../mcp/docs/service-doc').get());
  });
}

module.exports = { register };
