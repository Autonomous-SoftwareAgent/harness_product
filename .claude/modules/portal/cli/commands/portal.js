'use strict';
// spec: HOOK-S-010
// Lệnh dòng lệnh của khối portal (S-064), góp vào bảng lệnh của cli.js qua khóa `commands` trong modules/portal.json.
const fs = require('fs');
const path = require('path');

function register(on, { argv, arg, core, autoCheck, generator, cmdRel }) {
  const portal = () => require('../../mcp/portal/portal');
  on('code', () => {
    // Sinh docs/_generated/code-map.md từ code (cho agent), bằng bộ sinh riêng của service.
    const r = generator('gen-code-docs').generate();
    console.log(`${r.changed ? 'đã ghi' : 'không đổi'}: ${path.relative(core.ROOT, r.path)} (${r.bytes} byte)`);
  });
  on('overview', () => {
    // Sinh trang chi tiết kỹ thuật của service vào cổng cục bộ (docs/portal/<service>/overview.html); thêm --run-tests để lấy số test thật.
    generator('gen-overview-html').generate({ runTestSuite: argv.includes('--run-tests') }).then((r) => {
      console.log(`đã ghi: ${path.relative(core.BSN_DIR, r.path)} (${r.bytes} byte), kèm mảnh _parts/architecture.html cho trang ba tab.`);
      console.log(portal().build().summary);
    }).catch((e) => { console.error(e.message); process.exit(2); });
  });
  on('portal', () => {
    // Dựng lại cổng docs/portal/: trang ba tab của từng dịch vụ (từ bản đã commit) và trang tổng gom liên kết. --if-stale: chỉ dựng khi nguồn đổi.
    const p = portal();
    if (argv.includes('--if-stale')) {
      const r = p.buildIfStale();
      console.log(r.built ? r.summary : 'Cổng đã mới nhất, không dựng lại.');
    } else console.log(p.build().summary);
    autoCheck(p);
  });
  on('portal-publish', () => {
    // Chuẩn bị bản publish (docs/portal/_publish/index.html) và in danh sách tệp đi kèm. KHÔNG gửi gì ra ngoài: việc đẩy lên claude.ai do phiên Claude làm.
    // Dò ba lượt trên gói (publish-scan.js). Chỉ in danh sách tệp để đẩy khi cả ba lượt sạch; không sạch thì thoát mã 1 và nói phải làm gì.
    const b = portal().publishBundle();
    console.log(b.report);
    if (!b.scan.ok) { console.log('KHÔNG ĐƯỢC ĐẨY.'); process.exitCode = 1; }
    else console.log(`ĐƯỢC ĐẨY (S-058: commit là publish theo). Đẩy bằng công cụ Artifact, tải lại rồi chạy portal-verify <thư mục>, cuối cùng: node ${cmdRel} portal-published\n${JSON.stringify({ page: b.page, files: b.files }, null, 2)}`);
  });
  on('portal-verify', () => {
    // Sau khi đẩy: dò ba lượt trên bản TẢI VỀ từ claude.ai (thư mục chứa các tệp cùng tên với gói), so với bản trên máy, kiểm liên kết. Thoát 1 nếu không đạt.
    if (!arg || !fs.existsSync(arg)) throw new Error('Dùng: cli.js portal-verify <thư mục chứa bản tải về từ claude.ai>');
    const r = portal().verifyPublished(path.resolve(arg));
    console.log(r.text); if (!r.ok) process.exitCode = 1;
  });
  on('portal-published', () => {
    // Phiên gọi sau khi đẩy xong lên claude.ai: ghi lại bản vừa đẩy, để lời nhắc "bản trên claude.ai đã cũ" tắt cho tới lần cổng đổi kế tiếp.
    // --undo: gỡ bản ghi khi ghi nhầm (chưa đẩy mà đã chạy lệnh này).
    const r = argv.includes('--undo') ? portal().unmarkPublished() : portal().markPublished({ note: arg });
    console.log(r.text); if (!r.ok) process.exitCode = 1;
  });
  on('portal-status', () => {
    // Trạng thái của cổng cho người và phiên harness: phiên bản bộ vẽ, lần dựng, lần kiểm sơ đồ, sơ đồ quá lớn, phần giải thích thiếu hay cũ.
    console.log(portal().status());
  });
}

module.exports = { register };
