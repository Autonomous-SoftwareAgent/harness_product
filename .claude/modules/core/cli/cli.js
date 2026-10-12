#!/usr/bin/env node
'use strict';
// spec: MCP-S-001
// spec: HOOK-S-010
// spec: PORT-S-003
// CLI dùng chung cho mọi service, cùng lõi với MCP server. Hook và script triển khai gọi vào đây.
//   node <harness>/cli/cli.js [--service <tên>] <lệnh> ...   (đường dẫn thật: lệnh `usage` in ra; bố cục cũ là .claude/modules/core/cli/cli.js)
// Bỏ --service thì dùng mặc định (BSN_SERVICE, BSN_ROOT, thư mục hiện tại nếu nằm trong service, rồi đơn vị mặc định của cấu hình dự án).
// BẢNG LỆNH (S-056): mỗi lệnh con một dòng khai `on(tên, hàm)`. Lệnh của lõi khai ở đây; lệnh của các khối khác nằm trong khối đó
// (cli/commands/<việc>.js) và được gom qua bảng đăng ký (S-064, khóa `commands` trong tệp tự khai): khối tắt thì lệnh của nó không có.
const fs = require('fs');
const path = require('path');
const P = require('../gate/gate-paths');
const core = require('../adapters/storage/unit-docs');

const ROOT = core.BSN_DIR;
const CMD_REL = P.codeRel(ROOT, 'cli/cli.js');
const argv = process.argv.slice(2);
const si = argv.indexOf('--service');
if (si >= 0) {
  const name = argv[si + 1];
  if (!name) {
    console.error('--service cần một tên');
    process.exit(2);
  }
  argv.splice(si, 2);
  try {
    core.setRoot(core.serviceRoot(name));
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
}
const [cmd, arg] = argv;

// Bộ vẽ đổi kể từ lần kiểm gần nhất: tự kiểm lại MỌI sơ đồ bằng trình duyệt, ở tiến trình nền tách rời (không làm chậm phiên nào,
// không in gì vào phiên nào). Kết quả nằm ở portal-status và chân trang tổng. Tắt bằng BSN_PORTAL_AUTOCHECK=0 hoặc --no-check.
function autoCheck(portal) {
  if (process.env.BSN_PORTAL_AUTOCHECK === '0' || argv.includes('--no-check') || !portal.needsCheck()) return false;
  const { spawn } = require('child_process');
  const child = spawn(process.execPath, [__filename, 'diagrams-check', '--record'], { cwd: ROOT, detached: true, stdio: 'ignore', windowsHide: true, env: { ...process.env, BSN_PORTAL_AUTOCHECK: '0' } });
  child.unref();
  return true;
}

// Bộ sinh riêng của từng service (đọc thẳng mã của service đó) là phần của dự án: P.generatorsDir()/<service>/<tên>.js.
// Service không giữ công cụ docs nào trong thư mục của nó.
function generator(name) {
  const svc = core.serviceName();
  const file = path.join(P.generatorsDir(ROOT), svc, `${name}.js`);
  if (!fs.existsSync(file)) throw new Error(`Service ${svc} chưa có bộ sinh ${name} (${path.relative(ROOT, file)})`);
  return require(file);
}
// Bộ dựng cổng của khối portal, nếu khối đó đang bật.
const portal = () => { const f = P.provided(ROOT, 'portal'); return f ? require(f) : null; };

const COMMANDS = {};
const on = (names, run) => { for (const n of [].concat(names)) { if (COMMANDS[n]) throw new Error(`trùng lệnh con: ${n}`); COMMANDS[n] = run; } };

on('services', () => {
    console.log(core.listServices().join('\n'));
});
on('on-commit', () => {
    // Gọi từ git hook post-commit (cli/install-git-hooks.js) của repo gốc hoặc của một dịch vụ: cổng chỉ hiện bản đã commit,
    // nên commit là lúc cập nhật. Dịch vụ có bộ sinh trang chi tiết thì sinh lại trang đó (từ mã vừa commit), rồi dựng lại cổng.
    // Git đặt GIT_DIR, GIT_INDEX_FILE... cho hook. Khi commit ở một bản sao làm việc phụ (git worktree), GIT_DIR là đường dẫn tuyệt đối
    // tới repo đó, nên mọi lệnh git mà bộ dựng cổng chạy cho repo KHÁC (từng dịch vụ) đều đọc nhầm repo: cổng mất trang của các dịch vụ
    // (đã gặp 2026-10-10). Bỏ các biến đó: từ đây mỗi lệnh git tự tìm repo theo thư mục nó được trỏ tới.
    for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_PREFIX', 'GIT_OBJECT_DIRECTORY']) delete process.env[k];
    const rel = P.serviceOf(ROOT, process.cwd());
    // Ghi commit vừa xong vào sổ phạm vi (S-050): repo của dịch vụ nào, mã commit, và kế hoạch đang hiệu lực của phiên đã chạy lệnh commit
    // (mã phiên có trong môi trường khi lệnh do một phiên Claude chạy; người dùng tự commit thì không gắn với kế hoạch nào). Lỗi thì bỏ qua.
    try {
      const head = require('child_process').spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', timeout: 10000, windowsHide: true });
      // Repo gốc không thuộc thư mục dịch vụ nào: ghi cho đơn vị harness, đơn vị sống trong repo gốc.
      if (head.status === 0) require('../hooks/scope-lib').recordCommit(ROOT, { sid: process.env.CLAUDE_CODE_SESSION_ID, service: rel || 'harness', sha: head.stdout.trim() });
    } catch { /* bỏ qua */ }
    // Sau khi dựng cổng: dựng luôn gói publish và dò ba lượt, để lúc người dùng bảo "publish" thì gói đã sẵn và đã biết sạch hay bị giữ. Không gửi gì ra ngoài.
    // Bảo trì hai sổ (gom số liệu theo ngày, xóa nhật ký cũ, chụp bản sao) cũng chạy ở đây: lệnh nền sau commit, không phải hook. Im lặng.
    try { require('../adapters/storage/db-maintain').run(ROOT); } catch { /* bỏ qua */ }
    const p = portal();
    if (!p) return; // khối portal tắt: không có cổng để dựng
    const gen = rel && core.listAllServices().includes(rel) ? path.join(P.generatorsDir(ROOT), rel, 'gen-overview-html.js') : null;
    const finish = () => { const built = p.build(); console.log(built.summary); try { const b = p.publishBundle({ built }); if (!b.scan.ok) console.log(`Gói publish BỊ GIỮ (xem: node ${CMD_REL} portal-publish).`); } catch (e) { console.error(`Gói publish không dựng được: ${e.message}`); } autoCheck(p); };
    if (gen && fs.existsSync(gen)) {
      core.setRoot(core.serviceRoot(rel));
      require(gen).generate({}).then(finish, (e) => { console.error(`Trang chi tiết của ${rel} không sinh được: ${e.message}`); finish(); });
    } else finish();
});
on('db-maintain', () => {
    // Bảo trì hai sổ của harness (S-060): gom số liệu theo ngày vào eval.db, xóa nhật ký act_ cũ hơn 60 ngày, chụp bản sao sổ phiên.
    // Thường tự chạy sau mỗi commit; chạy tay khi cần.
    const M = require('../adapters/storage/db-maintain');
    const r = M.run(ROOT);
    console.log(M.text(r)); if (r.errors.length) process.exitCode = 1;
});
on('doctor', () => {
    // Kiểm sức khỏe của harness trên dự án này (S-063): cấu hình, đơn vị, bảng việc -> skill, cổng duyệt, máy chủ MCP, git hook, khối. Chỉ đọc.
    const r = require('./doctor').run(ROOT);
    console.log(r.text); if (r.errors) process.exitCode = 1;
});
on('setup', () => {
    // Bộ cài (S-064): sinh phần của harness trong .claude/settings.json và .mcp.json từ tệp tự khai của các khối đang bật; giữ phần người dùng
    // tự thêm. --check: chỉ so, thoát 1 nếu lệch. --dry-run: in việc sẽ làm.
    const r = require('./setup').run(ROOT, { check: argv.includes('--check'), dryRun: argv.includes('--dry-run') });
    console.log(r.text); if (!r.ok) process.exitCode = 1;
});
on('install', () => {
    // Cài, nâng cấp, hoặc chuyển bố cục (S-064), chạy TỪ BẢN MỚI (gói harness_product) vào dự án <đích>: dự án chưa có harness thì cài mới;
    // đang ở bố cục cũ (.claude/modules/) thì chuyển sang bố cục khối và giữ cấu hình, sổ phiên; đang ở bố cục khối thì thay mã của sản phẩm.
    // Phần của dự án (.claude/project/, skill riêng, settings của người dùng) không bị đụng. Mặc định chỉ in việc sẽ làm; --apply làm thật
    // (cất bản cũ để quay lại); --undo quay lại lần cài gần nhất.
    if (!arg || arg.startsWith('--')) throw new Error(`Dùng: node ${CMD_REL} install <thư mục dự án> [--apply | --undo]`);
    const r = require('./install').run(ROOT, path.resolve(arg), { apply: argv.includes('--apply'), undo: argv.includes('--undo') });
    console.log(r.text); if (!r.ok) process.exitCode = 1;
});
on('extension', () => {
    // Khối mở rộng của dự án và của từng đơn vị (S-065): xem, tạo khung, chạy ca thử, xác nhận (chỉ người dùng, ngoài phiên Claude), chạy lệnh.
    return require('./extension').run(ROOT, argv.slice(1)).then((r) => { console.log(r.text); if (!r.ok) process.exitCode = 1; }, (e) => { console.error(e.message); process.exitCode = 2; });
});
on('public-export', () => {
    // Đóng gói harness thành sản phẩm cài được cho dự án khác (S-063) vào <thư mục> (phải trống hoặc chưa có): chỉ bản ĐÃ COMMIT, bỏ phần
    // nội bộ, thay skill bằng bộ skill của sản phẩm, rồi dò gói. Không commit, không đẩy gì.
    if (!arg) throw new Error('Dùng: cli.js public-export <thư mục đích>');
    const r = require('./public-export').run(ROOT, path.resolve(arg));
    console.log(r.text); if (!r.ok) process.exitCode = 1;
});

// Lệnh của các khối đang bật.
const ctx = { argv, cmd, arg, si, core, autoCheck, generator, portal, cmdRel: CMD_REL };
for (const c of P.contributions(ROOT, 'commands')) require(c.file).register(on, ctx);

const usage = () => {
    console.log(`Usage: node ${CMD_REL} [--service <tên>] <check|status [module]|sync|code|overview [--run-tests]|service-doc|diagrams|diagrams-check [--record]|diagram-save <tệp.json>|diagram-explain <id> <tệp.json>|diagram-get <id> [--json]|diagram-review <tệp.json>|context "<câu hỏi>" [--to ..] [--section ..]|context --impact <tệp...>|context-build [--force]|context-term <tệp.json>|context-relate <tệp.json>|diagram-generate <id|tệp.json>|diagram-remove <id>|portal-status|db-maintain|doctor|setup [--check]|install <thư mục dự án> [--apply|--undo]|extension <list|new|test|trust|untrust|run> ...|public-export <thư mục>|status-archive [--keep N]|portal [--if-stale]|portal-publish|portal-verify <thư mục>|portal-published [ghi chú] [--undo]|on-commit|services>`);
    process.exit(cmd ? 2 : 0);
};

try {
  (Object.prototype.hasOwnProperty.call(COMMANDS, cmd) ? COMMANDS[cmd] : usage)();
} catch (e) {
  console.error(e.message);
  process.exit(2);
}
