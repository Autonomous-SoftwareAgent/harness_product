'use strict';
// spec: HOOK-S-003
// spec: HOOK-S-005
// LUẬT theo dõi lần sửa (sau khi phiên ghi một tệp). Không bao giờ chặn.
//  - Ghi "phiên vừa sửa dịch vụ này" vào sổ theo kế hoạch đang hiệu lực: bảng phiên, lời cảnh báo hai phiên cùng một dịch vụ
//    và chế độ legacy của luật phạm vi đọc từ đó.
//  - Lần đầu phiên sửa một dịch vụ: bảo đảm kho của nó có git hook của harness.
//  - Sơ đồ tự sinh của dịch vụ vừa đổi sau một commit: nhắc MỘT lần cho phiên đang sửa dịch vụ đó.
//  - Dịch vụ dùng bsn-docs (có docs/modules): ghi loại tệp vừa đổi để cuối lượt biết còn nợ STATUS hay không.
const path = require('node:path');
const crypto = require('node:crypto');
const { note } = require('../../ports/events');
const D = require('./lib/docs-tracking');

// `params.entry` là tên tệp cửa vào của phần theo dõi tài liệu (cửa vào đưa vào; lõi không biết tên tệp nào).
// Chốt chặn không được biến mất cùng tệp của nó: thiếu tệp thì nói rõ, không im lặng.
async function run(event, { workspace: ws, store, jobs }, params = {}) {
  const TRACK_ENTRY = params.entry;
  const abs = event.action.file;
  if (!abs) return null;
  // Tờ của một đơn vị (luật unitSheets) là của CHÍNH đơn vị đó, dù nằm trong thư mục của đơn vị khác: ghi nó không
  // tính là "phiên đã sửa đơn vị chứa nó". Trước đây có tính, nên phiên ghi tờ của mình xong thì bị hỏi ở MỌI lần sửa sau đó.
  if (ws.sheetOwner(abs)) return null; // luật unitSheets của cấu hình dự án
  const svc = ws.serviceOf(abs);
  if (!svc || !ws.isService(svc)) return null;
  // Lần sửa này ĐÃ CHẠY: ghi vào sổ theo kế hoạch đang hiệu lực của phiên.
  const { first } = await store.noteEdit(event.session, svc);
  // Lần đầu phiên này sửa dịch vụ: bảo đảm repo của nó có git hook post-commit (cổng dựng lại theo commit). Bắt được cả dịch vụ
  // vừa xuất hiện giữa phiên. Không ghi đè hook của người khác; lỗi thì bỏ qua.
  if (first) await jobs.ensureGitHooks(svc);
  // Sơ đồ tự sinh của dịch vụ này đổi sau một commit: nhắc MỘT lần cho phiên đang sửa dịch vụ đó (không chặn). Tắt theo mặc định
  // (context.config.json: notify); lỗi thì im lặng, không ảnh hưởng việc đang làm.
  let out = null;
  try {
    const text = await jobs.contextNotice(svc);
    if (text) {
      const key = `notice:${svc}:${crypto.createHash('sha256').update(text).digest('hex').slice(0, 12)}`;
      if (await store.noteOnce(event.session, `notice:${svc}:`, key)) out = note(text);
    }
  } catch { /* bỏ qua */ }
  // Theo dõi tài liệu chỉ áp cho service dùng bsn-docs (có docs/modules). Service chưa dùng (ví dụ mới tạo) thì không bị bắt cập nhật STATUS
  // và không bị tạo docs/_generated; luật phạm vi vẫn theo dõi nó như mọi service.
  if (!ws.exists(path.join(ws.serviceDir(svc), ...ws.unitRel(svc, 'docs/modules').split('/')))) return out;
  if (ws.entryExists(TRACK_ENTRY) && ws.exists(ws.serviceDir(svc))) {
    try { await D.track(event, svc, { workspace: ws, store }); } catch { /* việc theo dõi không bao giờ chặn công cụ */ }
  } else {
    // Phần theo dõi mất: không chặn được ở đây, nhưng KHÔNG im lặng. Ghi nhật ký để cuối lượt và phép kiểm sức khỏe còn thấy.
    await store.log({ sid: event.session, event: 'hook-missing', hook: TRACK_ENTRY, service: svc });
  }
  return out;
}

module.exports = { id: 'track', on: 'after-action', run };
