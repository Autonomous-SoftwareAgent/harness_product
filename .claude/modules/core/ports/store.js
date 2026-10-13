'use strict';
// spec: HOOK-S-007
// CỔNG RA "sổ": những gì lõi cần nhớ giữa các lần chạy. Tệp này chỉ là hợp đồng.
// Cổng này CÓ CHỜ: mọi hàm có thể trả lời hứa (Promise), lõi luôn chờ kết quả. Nhờ vậy đổi nơi lưu sang thứ trả lời qua mạng không phải sửa lõi.
// Không mở được sổ thì KHÔNG ném lỗi: hàm trả giá trị rỗng ghi ở từng dòng, để luật không chặn ai khi sổ hỏng (phép kiểm sức khỏe báo).
//
//   ledger(work, fallback)   mở sổ kiến thức của phiên, gọi work(sổ), đóng sổ, trả kết quả của work; không mở được thì trả fallback.
//                            `sổ` có: touch(sid), bumpEpoch(sid), prune(), addSkill({ sid, agent, skill, via }), addDoc({ sid, agent, service, doc }),
//                            addTool({ sid, agent, tool, service }), have(sid, agent) -> { skills: Set, docs: Set<"dịch-vụ|tệp"> }
//   decision({ sid, agent, rule, kind, tool, service, verdict, detail })
//                            ghi một quyết định của một luật (chặn, hỏi, giữ lượt, nhắc); lỗi thì bỏ qua, không bao giờ đổi quyết định
//   activePlan(sid)          kế hoạch đang hiệu lực của phiên: { closed: true } | { invalid: true, errors } | { plan: { id, services }, registered: [tên] };
//                            null nếu không mở được sổ
//   planExample              khuôn kế hoạch để in trong lời nhắc (chuỗi)
//   editsOf(sid)             dịch vụ phiên đã làm, mới nhất trước: [{ service, lastAt, edits }]; [] nếu không có
//   noteEdit(sid, service)   ghi một lần sửa tệp; trả { first } (true nếu là lần sửa đầu của phiên ở dịch vụ này)
//   noteOnce(sid, prefix, key) ghi chú một lần; true nếu là ghi chú mới
//   recentOthers(sid, withinMs) các phiên KHÁC đã sửa tệp trong khoảng gần đây, mới nhất trước: [{ sid, services: [tên], ageMs }]; [] nếu không có
//   docsState(service, sid)  trạng thái theo dõi tài liệu: { code: [tệp], status, decisions, artifact }
//   saveDocsState(service, sid, state)      clearDocsState(service, sid)
//   log(entry)               ghi một dòng vào nhật ký chẩn đoán; lỗi thì bỏ qua
const NAME = 'store';
const VALUES = ['planExample'];
const METHODS = ['ledger', 'decision', 'activePlan', 'editsOf', 'noteEdit', 'noteOnce', 'recentOthers', 'docsState', 'saveDocsState', 'clearDocsState', 'log'];
const LEDGER_METHODS = ['touch', 'bumpEpoch', 'prune', 'addSkill', 'addDoc', 'addTool', 'have'];

function check(impl) {
  const miss = [...VALUES.filter((k) => typeof (impl || {})[k] !== 'string'), ...METHODS.filter((k) => typeof (impl || {})[k] !== 'function')];
  if (miss.length) throw new Error(`bộ chuyển cho cổng "${NAME}" thiếu: ${miss.join(', ')}`);
  return impl;
}

module.exports = { NAME, VALUES, METHODS, LEDGER_METHODS, check };
