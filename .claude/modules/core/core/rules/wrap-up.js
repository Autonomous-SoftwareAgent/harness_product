'use strict';
// spec: HOOK-S-003
// spec: PORT-S-004
// LUẬT cuối lượt. Với từng dịch vụ phiên đã sửa (và dùng bsn-docs): giữ lượt lại khi còn nợ STATUS hoặc tài liệu lệch mã.
// Rồi nhờ dựng lại cổng HTML nếu nguồn đã đổi; lỗi của bộ dựng KHÔNG được chèn vào phiên (phiên của dịch vụ không cần biết gì về cổng
// và bộ vẽ): cổng jobs ghi vào sổ sức khỏe của cổng và nhật ký chẩn đoán.
const path = require('node:path');
const { block } = require('../../ports/events');
const D = require('./lib/docs-tracking');

// Lời giao việc đẩy cổng. Commit là publish theo: phiên không chờ người dùng bảo. Lõi chỉ nói PHẢI LÀM GÌ; đường link và chi tiết ở tài liệu.
const PUBLISH = (n) => [
  `PUBLISH: cổng trên máy mới hơn bản trên claude.ai và gói ${n || ''} tệp đã dò ba lượt sạch. Commit là publish theo, áp cho mọi phiên: đẩy NGAY trong lượt này, không hỏi lại người dùng.`,
  'Làm đúng thứ tự (chi tiết và đường link: docs/system/portal-publish.md):',
  '1. `node .claude/modules/core/cli/cli.js portal-publish` phải in "ĐƯỢC ĐẨY"; in "KHÔNG ĐƯỢC ĐẨY" thì DỪNG và báo người dùng.',
  '2. Công cụ Artifact: đọc Artifact ở đường link đó (action read), rồi publish với `url` là đường link, `file_path` và `files` đúng như lệnh vừa in.',
  '3. Tải các tệp vừa đẩy về một thư mục tạm (Artifact read với `paths` và `out_dir`), chạy `node .claude/modules/core/cli/cli.js portal-verify <thư mục>`; không đạt thì báo người dùng.',
  '4. `node .claude/modules/core/cli/cli.js portal-published`.',
  'Phiên không có công cụ Artifact, hoặc lớp quyền từ chối việc đẩy: nói rõ điều đó với người dùng ở cuối lượt, không tìm đường khác. Không commit gì thêm chỉ để ghi lại lần đẩy.',
].join('\n');

// `params.entry` là tên tệp cửa vào của phần kiểm tài liệu cuối lượt (cửa vào đưa vào; lõi không biết tên tệp nào).
async function run(event, { workspace: ws, store, jobs }, params = {}) {
  const STOP_ENTRY = params.entry;
  const reasons = [];
  const edited = (await store.editsOf(event.session)).filter((e) => e.edits > 0).map((e) => e.service);
  for (const svc of edited) {
    if (!ws.exists(path.join(ws.serviceDir(svc), ...ws.unitRel(svc, 'docs/modules').split('/')))) continue;
    // Chốt chặn không được biến mất cùng tệp của nó: thiếu phần kiểm docs thì chặn và nói rõ (một lần mỗi lượt), không bỏ qua.
    if (!(ws.entryExists(STOP_ENTRY) && ws.exists(ws.serviceDir(svc)))) {
      if (!event.again) reasons.push(`[${svc}] Thiếu hook ${STOP_ENTRY} (.claude/modules/core/hooks): kiểm docs không chạy được. Báo người dùng khôi phục tệp này.`);
      continue;
    }
    let text = '';
    try { text = await D.wrapUp(event, svc, { workspace: ws, store, jobs }); } catch { /* lỗi của phần kiểm: không giữ lượt vì nó */ }
    if (text) reasons.push(`[${svc}] ${text}`);
  }
  await jobs.rebuildPortalIfStale(event.session);
  // Cổng mới hơn bản trên claude.ai và gói sạch: giao việc đẩy cho phiên này (một lần cho mỗi nội dung, một phiên nhận).
  let pub = null;
  try { pub = await jobs.publishDue(event.session); } catch { /* lỗi của bộ dựng cổng không được giữ lượt */ }
  if (pub && pub.due) reasons.push(PUBLISH(pub.files));
  return reasons.length ? block(reasons.join('\n\n')) : null;
}

module.exports = { id: 'wrap-up', on: 'turn-end', run };
