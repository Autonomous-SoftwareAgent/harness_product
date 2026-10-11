#!/usr/bin/env node
'use strict';
// spec: MCP-S-001
// spec: PORT-S-003
// CLI dùng chung cho mọi service, cùng lõi với MCP server. Hook và script triển khai gọi vào đây.
//   node .claude/plugin/cli/cli.js [--service <tên>] <check|status [module]|sync|code|overview [--run-tests]|services>
// Bỏ --service thì dùng mặc định của core (BSN_SERVICE, BSN_ROOT, thư mục hiện tại nếu nằm trong service, rồi payment-hub).
const fs = require('fs');
const path = require('path');
const core = require('../mcp/docs/core');

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
  const child = spawn(process.execPath, [__filename, 'diagrams-check', '--record'], { cwd: core.BSN_DIR, detached: true, stdio: 'ignore', windowsHide: true, env: { ...process.env, BSN_PORTAL_AUTOCHECK: '0' } });
  child.unref();
  return true;
}

// Bộ sinh riêng của từng service (đọc thẳng mã của service đó) nằm ở trung tâm: .claude/plugin/mcp/portal/generators/<service>/<tên>.js.
const GENERATORS = path.join(__dirname, '..', 'mcp', 'portal', 'generators');
// Service không giữ công cụ docs nào trong thư mục của nó.
function generator(name) {
  const svc = core.serviceName();
  const file = path.join(GENERATORS, svc, `${name}.js`);
  if (!fs.existsSync(file)) throw new Error(`Service ${svc} chưa có bộ sinh ${name} (${path.relative(core.BSN_DIR, file)})`);
  return require(file);
}

// BẢNG LỆNH (S-056): mỗi lệnh con một dòng khai `on(tên, hàm)`. Thêm lệnh là thêm một dòng khai; test sổ tính năng đọc tên lệnh từ các dòng này.
const COMMANDS = {};
const on = (names, run) => { for (const n of [].concat(names)) { if (COMMANDS[n]) throw new Error(`trùng lệnh con: ${n}`); COMMANDS[n] = run; } };

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
on('services', () => {
    console.log(core.listServices().join('\n'));
});
on('code', () => {
    // Sinh docs/_generated/code-map.md từ code (cho agent), bằng bộ sinh riêng của service.
    const r = generator('gen-code-docs').generate();
    console.log(`${r.changed ? 'đã ghi' : 'không đổi'}: ${path.relative(core.ROOT, r.path)} (${r.bytes} byte)`);
});
on('overview', () => {
    // Sinh trang chi tiết kỹ thuật của service vào cổng cục bộ (docs/portal/<service>/overview.html); thêm --run-tests để lấy số test thật.
    generator('gen-overview-html').generate({ runTestSuite: argv.includes('--run-tests') }).then((r) => {
      console.log(`đã ghi: ${path.relative(core.BSN_DIR, r.path)} (${r.bytes} byte), kèm mảnh _parts/architecture.html cho trang ba tab.`);
      console.log(require('../mcp/portal/portal').build().summary);
    }).catch((e) => { console.error(e.message); process.exit(2); });
});
on('portal', () => {
    // Dựng lại cổng docs/portal/: trang ba tab của từng dịch vụ (từ bản đã commit) và trang tổng gom liên kết. --if-stale: chỉ dựng khi nguồn đổi.
    const portal = require('../mcp/portal/portal');
    if (argv.includes('--if-stale')) {
      const r = portal.buildIfStale();
      console.log(r.built ? r.summary : 'Cổng đã mới nhất, không dựng lại.');
    } else console.log(portal.build().summary);
    autoCheck(portal);
});
on('portal-publish', () => {
    // Chuẩn bị bản publish (docs/portal/_publish/index.html) và in danh sách tệp đi kèm. KHÔNG gửi gì ra ngoài: việc đẩy lên claude.ai do phiên Claude làm.
    // Dò ba lượt trên gói (publish-scan.js). Chỉ in danh sách tệp để đẩy khi cả ba lượt sạch; không sạch thì thoát mã 1 và nói phải làm gì.
    const b = require('../mcp/portal/portal').publishBundle();
    console.log(b.report);
    if (!b.scan.ok) { console.log('KHÔNG ĐƯỢC ĐẨY.'); process.exitCode = 1; }
    else console.log(`ĐƯỢC ĐẨY (S-058: commit là publish theo). Đẩy bằng công cụ Artifact, tải lại rồi chạy portal-verify <thư mục>, cuối cùng: node .claude/plugin/cli/cli.js portal-published\n${JSON.stringify({ page: b.page, files: b.files }, null, 2)}`);
});
on('portal-verify', () => {
    // Sau khi đẩy: dò ba lượt trên bản TẢI VỀ từ claude.ai (thư mục chứa các tệp cùng tên với gói), so với bản trên máy, kiểm liên kết. Thoát 1 nếu không đạt.
    if (!arg || !fs.existsSync(arg)) throw new Error('Dùng: cli.js portal-verify <thư mục chứa bản tải về từ claude.ai>');
    const r = require('../mcp/portal/portal').verifyPublished(path.resolve(arg));
    console.log(r.text); if (!r.ok) process.exitCode = 1;
});
on('portal-published', () => {
    // Phiên gọi sau khi đẩy xong lên claude.ai: ghi lại bản vừa đẩy, để lời nhắc "bản trên claude.ai đã cũ" tắt cho tới lần cổng đổi kế tiếp.
    // --undo: gỡ bản ghi khi ghi nhầm (chưa đẩy mà đã chạy lệnh này).
    const r = argv.includes('--undo') ? require('../mcp/portal/portal').unmarkPublished() : require('../mcp/portal/portal').markPublished({ note: arg });
    console.log(r.text); if (!r.ok) process.exitCode = 1;
});
on('on-commit', () => {
    // Gọi từ git hook post-commit (.claude/plugin/cli/install-git-hooks.js) của repo gốc hoặc của một dịch vụ: cổng chỉ hiện bản đã commit,
    // nên commit là lúc cập nhật. Dịch vụ có bộ sinh trang chi tiết thì sinh lại trang đó (từ mã vừa commit), rồi dựng lại cổng.
    // Git đặt GIT_DIR, GIT_INDEX_FILE... cho hook. Khi commit ở một bản sao làm việc phụ (git worktree), GIT_DIR là đường dẫn tuyệt đối
    // tới repo đó, nên mọi lệnh git mà bộ dựng cổng chạy cho repo KHÁC (từng dịch vụ) đều đọc nhầm repo: cổng mất trang của các dịch vụ
    // (đã gặp 2026-10-10). Bỏ các biến đó: từ đây mỗi lệnh git tự tìm repo theo thư mục nó được trỏ tới.
    for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_PREFIX', 'GIT_OBJECT_DIRECTORY']) delete process.env[k];
    const rel = require('../gate/gate-paths').serviceOf(core.BSN_DIR, process.cwd());
    // Ghi commit vừa xong vào sổ phạm vi (S-050): repo của dịch vụ nào, mã commit, và kế hoạch đang hiệu lực của phiên đã chạy lệnh commit
    // (mã phiên có trong môi trường khi lệnh do một phiên Claude chạy; người dùng tự commit thì không gắn với kế hoạch nào). Lỗi thì bỏ qua.
    try {
      const head = require('child_process').spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', timeout: 10000, windowsHide: true });
      // Repo gốc không thuộc thư mục dịch vụ nào: ghi cho đơn vị harness, đơn vị sống trong repo gốc.
      if (head.status === 0) require('../hooks/scope-lib').recordCommit(core.BSN_DIR, { sid: process.env.CLAUDE_CODE_SESSION_ID, service: rel || 'harness', sha: head.stdout.trim() });
    } catch { /* bỏ qua */ }
    const gen = rel && core.listAllServices().includes(rel) ? path.join(GENERATORS, rel, 'gen-overview-html.js') : null;
    // Sau khi dựng cổng: dựng luôn gói publish và dò ba lượt, để lúc người dùng bảo "publish" thì gói đã sẵn và đã biết sạch hay bị giữ. Không gửi gì ra ngoài.
    // Bảo trì hai sổ (gom số liệu theo ngày, xóa nhật ký cũ, chụp bản sao) cũng chạy ở đây: lệnh nền sau commit, không phải hook. Im lặng.
    try { require('../adapters/storage/db-maintain').run(core.BSN_DIR); } catch { /* bỏ qua */ }
    const finish = () => { const portal = require('../mcp/portal/portal'); const built = portal.build(); console.log(built.summary); try { const b = portal.publishBundle({ built }); if (!b.scan.ok) console.log('Gói publish BỊ GIỮ (xem: node .claude/plugin/cli/cli.js portal-publish).'); } catch (e) { console.error(`Gói publish không dựng được: ${e.message}`); } autoCheck(portal); };
    if (gen && fs.existsSync(gen)) {
      core.setRoot(core.serviceRoot(rel));
      require(gen).generate({}).then(finish, (e) => { console.error(`Trang chi tiết của ${rel} không sinh được: ${e.message}`); finish(); });
    } else finish();
});
on('db-maintain', () => {
    // Bảo trì hai sổ của harness (S-060): gom số liệu theo ngày vào eval.db, xóa nhật ký act_ cũ hơn 60 ngày, chụp bản sao sổ phiên.
    // Thường tự chạy sau mỗi commit; chạy tay khi cần.
    const M = require('../adapters/storage/db-maintain');
    const r = M.run(core.BSN_DIR);
    console.log(M.text(r)); if (r.errors.length) process.exitCode = 1;
});
on('doctor', () => {
    // Kiểm sức khỏe của harness trên dự án này (S-063): cấu hình, đơn vị, bảng việc -> skill, cổng duyệt, máy chủ MCP, git hook. Chỉ đọc.
    const r = require('./doctor').run(core.BSN_DIR);
    console.log(r.text); if (r.errors) process.exitCode = 1;
});
on('public-export', () => {
    // Đóng gói harness thành sản phẩm cài được cho dự án khác (S-063) vào <thư mục> (phải trống hoặc chưa có): chỉ bản ĐÃ COMMIT, bỏ phần
    // nội bộ, thay skill bằng bộ skill của sản phẩm, rồi dò gói. Không commit, không đẩy gì.
    if (!arg) throw new Error('Dùng: cli.js public-export <thư mục đích>');
    const r = require('./public-export').run(core.BSN_DIR, path.resolve(arg));
    console.log(r.text); if (!r.ok) process.exitCode = 1;
});
on('status-archive', () => {
    // Gọn docs/agent/STATUS.md: chuyển dòng nhật ký cũ sang STATUS-archive.md (không xóa gì). --keep N: số dòng mới nhất giữ lại (mặc định 15).
    const ki = argv.indexOf('--keep');
    const keep = ki >= 0 ? Number(argv[ki + 1]) : 15;
    if (!Number.isInteger(keep) || keep < 1) throw new Error('--keep cần một số nguyên dương');
    console.log(require('../mcp/docs/status-archive').run({ keep }));
});
on('diagrams', () => {
    // Liệt kê sơ đồ của service theo loại, kèm loại còn thiếu (cùng kết quả với công cụ MCP diagram_list).
    console.log(require('../mcp/diagrams/diagrams').listDetail());
});
on('diagrams-check', () => {
    // Kiểm sơ đồ VẼ THẬT trong trình duyệt không giao diện, trên các trang đã dựng của cổng. Thoát 1 nếu có sơ đồ hỏng, 3 nếu không kiểm được.
    // --record: ghi kết quả vào sổ sức khỏe của cổng (docs/portal/.health.json) và làm mới chân trang tổng; dùng cho lần kiểm tự động.
    const dc = require('../mcp/diagrams/diagram-check');
    const r = dc.run({ service: si >= 0 ? core.serviceName() : undefined });
    if (argv.includes('--record') && si < 0) { const portal = require('../mcp/portal/portal'); portal.recordCheck(r); portal.build(); }
    console.log(dc.format(r));
    process.exit(r.skipped ? 3 : r.ok ? 0 : 1);
});
on('portal-status', () => {
    // Trạng thái của cổng cho người và phiên harness: phiên bản bộ vẽ, lần dựng, lần kiểm sơ đồ, sơ đồ quá lớn, phần giải thích thiếu hay cũ.
    console.log(require('../mcp/portal/portal').status());
});
on(['diagram-save', 'diagram-explain'], () => {
    // Cùng đường ghi với công cụ MCP diagram_save / diagram_explain, nhận dữ liệu từ một tệp JSON (cho phiên chưa nối lại MCP).
    //   diagram-save <tệp.json chứa bản khai báo>     diagram-explain <id> <tệp.json chứa {meaning, read, details, pitfalls}>
    const d = require('../mcp/diagrams/diagrams');
    const file = cmd === 'diagram-save' ? arg : argv[2];
    if (!file || !fs.existsSync(file)) throw new Error(`Dùng: cli.js --service <tên> ${cmd === 'diagram-save' ? 'diagram-save <tệp.json>' : 'diagram-explain <id> <tệp.json>'}`);
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    console.log(cmd === 'diagram-save' ? d.save({ spec: data }) : d.explain({ id: arg, explain: data }));
});
on('diagram-get', () => {
    // Đọc MỘT sơ đồ ở dạng gọn (cùng kết quả với công cụ MCP diagram_get); thêm --json để lấy bản khai báo cần sửa.
    console.log(require('../mcp/diagrams/diagrams').get({ id: arg, format: argv.includes('--json') ? 'json' : 'gon' }));
});
on('context', () => {
    // Hỏi kho ngữ nghĩa (cùng kết quả với công cụ MCP context_explore).
    //   context "<câu hỏi>" [--to "<vật thứ hai>"] [--section <mục>]      context --impact <tệp> [<tệp>...]
    const rest = argv.slice(1);
    const opt = (name) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : undefined; };
    const svc = si >= 0 ? core.serviceName() : undefined;
    if (rest[0] === '--impact') console.log(require('../mcp/context/context-query').explore({ impact: rest.slice(1), service: svc }));
    else console.log(require('../mcp/context/context-query').explore({ q: rest[0], to: opt('--to'), section: opt('--section'), service: svc }));
});
on('context-build', () => {
    // Dựng lại kho ngữ nghĩa của mọi dịch vụ từ bản đã commit (thường không cần gọi: cổng tự dựng sau mỗi commit). --force: bỏ kho đã lưu.
    const r = require('../mcp/context/context').buildAll({ force: argv.includes('--force') });
    for (const g of [...Object.values(r.services), r.root]) console.log(`${g.name}: ${g.nodes.length} nút, ${g.edges.length} cạnh, ${g.dark.length} vùng tối${r.built.includes(g.name) ? ' (vừa dựng lại)' : ''}`);
});
on(['context-term', 'context-relate', 'diagram-review'], () => {
    // Cùng đường ghi với các công cụ MCP context_term / context_relate / diagram_review, nhận dữ liệu từ một tệp JSON.
    if (!arg || !fs.existsSync(arg)) throw new Error(`Dùng: cli.js --service <tên> ${cmd} <tệp.json>`);
    const data = JSON.parse(fs.readFileSync(arg, 'utf8'));
    const notes = require('../mcp/context/annotations');
    console.log(cmd === 'context-term' ? (data.remove ? notes.termRemove(data) : notes.term(data)) : cmd === 'context-relate' ? notes.relate(data) : notes.review(data));
});
on('diagram-generate', () => {
    // Sơ đồ dữ liệu TỰ SINH từ cơ sở dữ liệu thật (data-reader.js). Đối số là mã sơ đồ đã có (sinh lại theo cấu hình đã lưu), hoặc một tệp JSON
    // { id, title, sources: [tệp khai cấu trúc bảng], command: [lệnh tạo bảng, không qua shell], url_env, url_format, tables? } để tạo lần đầu hay đổi cấu hình.
    if (!arg) throw new Error('Dùng: cli.js --service <tên> diagram-generate <id | tệp.json>');
    const input = fs.existsSync(arg) ? JSON.parse(fs.readFileSync(arg, 'utf8')) : { id: arg };
    console.log(require('../mcp/diagrams/diagrams').generate(input));
});
on('diagram-remove', () => {
    // Xóa MỘT sơ đồ đã khai báo (tệp do công cụ sở hữu nên không xóa tay được).
    console.log(require('../mcp/diagrams/diagrams').remove({ id: arg }));
});
on('service-doc', () => {
    // In nguồn có cấu trúc docs/service.yaml của service (ghi thì dùng MCP bsn-docs: service_doc_set, problem_record).
    console.log(require('../mcp/docs/service-doc').get());
});

const usage = () => {
    console.log('Usage: node .claude/plugin/cli/cli.js [--service <tên>] <check|status [module]|sync|code|overview [--run-tests]|service-doc|diagrams|diagrams-check [--record]|diagram-save <tệp.json>|diagram-explain <id> <tệp.json>|diagram-get <id> [--json]|diagram-review <tệp.json>|context "<câu hỏi>" [--to ..] [--section ..]|context --impact <tệp...>|context-build [--force]|context-term <tệp.json>|context-relate <tệp.json>|diagram-generate <id|tệp.json>|diagram-remove <id>|portal-status|db-maintain|doctor|public-export <thư mục>|status-archive [--keep N]|portal [--if-stale]|portal-publish|portal-verify <thư mục>|portal-published [ghi chú] [--undo]|on-commit|services>');
    process.exit(cmd ? 2 : 0);
};

try {
  (Object.prototype.hasOwnProperty.call(COMMANDS, cmd) ? COMMANDS[cmd] : usage)();
} catch (e) {
  console.error(e.message);
  process.exit(2);
}
