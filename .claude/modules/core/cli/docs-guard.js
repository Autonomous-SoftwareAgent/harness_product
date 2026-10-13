#!/usr/bin/env node
'use strict';
// spec: HOOK-S-008
// CỬA VÀO dòng lệnh của phép dò "nội dung docs/ không bao giờ lên remote"; phép dò nằm ở adapters/git/docs-leaks.js.
//
//   node .claude/modules/core/cli/docs-guard.js pre-push <remote>     git hook (banned-scan.js pre-push gọi): đọc danh sách ref từ stdin
//   node .claude/modules/core/cli/docs-guard.js check [<remote>]      kiểm tay repo đang đứng: các commit của HEAD chưa có ở remote
//   node .claude/modules/core/cli/docs-guard.js scan-dir <thư-mục>    kiểm một cây thư mục (ví dụ gói sắp xuất bản) trước khi commit
//
// Kết quả chỉ nêu tệp và lý do, không in nội dung. Thoát mã 1 khi có tệp bị chặn, và cả khi không kiểm được
// (thà chặn nhầm còn hơn lọt ra ngoài); 0 khi sạch.
const fs = require('node:fs');
const path = require('node:path');
const D = require('../adapters/git/docs-leaks');

const ROOT = require('../gate/gate-paths').rootFrom(__dirname);

function report(leaks, what) {
  const rows = [...new Set(leaks.map((l) => `${l.commit ? `${l.commit.slice(0, 12)} ` : ''}${l.file}: ${l.why}`))];
  process.stderr.write([
    `DOCS: ${what} có ${rows.length} tệp là nội dung của docs/, thứ KHÔNG BAO GIỜ được lên remote. Từ chối.`,
    ...rows.slice(0, 40).map((r) => `  ${r}`),
    rows.length > 40 ? `  ... còn ${rows.length - 40} tệp` : '',
    'Bỏ các tệp đó khỏi commit rồi làm lại. Không tìm đường khác để đẩy; cần thì báo người dùng.',
  ].filter(Boolean).join('\n') + '\n');
}

// Dùng chung cho git hook pre-push. Trả mã thoát.
function prePush(cwd, remote, stdin, root = ROOT) {
  const r = D.checkPush(root, cwd, remote, D.parseRefs(stdin));
  if (r.error) { process.stderr.write(`DOCS: không kiểm được các commit sắp đẩy (${r.error}). Từ chối đẩy cho tới khi kiểm được.\n`); return 1; }
  if (r.leaks.length) { report(r.leaks, 'các commit sắp đẩy'); return 1; }
  return 0;
}

function main(argv, root = ROOT) {
  const [mode, a1] = argv;
  const cwd = process.cwd();
  if (mode === 'pre-push') { let stdin = ''; try { stdin = fs.readFileSync(0, 'utf8'); } catch { /* không có stdin */ } return prePush(cwd, a1, stdin, root); }
  if (mode === 'check') {
    const r = D.checkRef(root, cwd, a1 || 'origin');
    if (r.error) { console.error(`KHÔNG kiểm được: ${r.error}`); return 1; }
    if (r.leaks.length) { report(r.leaks, 'các commit chưa có ở remote'); return 1; }
    console.log('Sạch: các commit chưa có ở remote không chứa nội dung của docs/.');
    return 0;
  }
  if (mode === 'scan-dir' && a1) {
    let leaks;
    try { leaks = D.scanDir(root, a1); } catch (e) { console.error(`KHÔNG kiểm được: ${e.message}`); return 1; }
    if (leaks.length) { report(leaks, `thư mục ${a1}`); return 1; }
    console.log(`Sạch: ${a1} không chứa nội dung của docs/.`);
    return 0;
  }
  console.error('Dùng: docs-guard.js pre-push <remote> | check [<remote>] | scan-dir <thư-mục>');
  return 2;
}

module.exports = { main, prePush };
if (require.main === module) process.exit(main(process.argv.slice(2)));
