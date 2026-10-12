'use strict';
// spec: HOOK-S-007
// CỔNG VÀO của harness (S-055): dạng sự kiện chung và dạng quyết định. Tệp này chỉ là hợp đồng: không nhập gì, không đọc ghi gì.
// Bên ngoài (Claude Code hôm nay, công cụ chủ khác về sau) muốn nói với lõi thì bộ chuyển của nó dịch sang đúng dạng này; lõi trả lời
// bằng đúng dạng quyết định dưới đây, bộ chuyển dịch ngược lại. Lõi không bao giờ thấy dạng dữ liệu riêng của công cụ chủ.
//
// SỰ KIỆN: {
//   kind     một trong KINDS
//   root     thư mục gốc của dự án (đường dẫn tuyệt đối)
//   session  mã phiên, '' nếu công cụ chủ không cho biết
//   agent    mã agent con, '' nếu là phiên chính
//   cwd      thư mục làm việc lúc xảy ra sự kiện, '' nếu không biết
//   action   việc phiên sắp làm hoặc vừa làm (chỉ có nghĩa với before-action, after-action): {
//     type     một trong ACTIONS
//     tool     nhãn công cụ theo cách gọi của công cụ chủ; lõi chỉ GHI nhãn này vào sổ, không rẽ nhánh theo nó
//     file     đường dẫn tuyệt đối của tệp bị đụng tới, '' nếu không có
//     text     nội dung sắp ghi (các phần ghi nối bằng xuống dòng), '' nếu không có
//     command  chuỗi lệnh (run-command), '' nếu không có
//     shell    kết quả phân tích lệnh (run-command, chỉ khi cửa vào yêu cầu): { targets: [chuỗi], inline: [{ writes, code }], unparsable } hoặc null
//     server   tên máy chủ công cụ (call-tool), '' nếu không có
//     name     tên công cụ trên máy chủ đó (call-tool) hoặc tên skill (open-skill), '' nếu không có
//     args     tham số của công cụ (call-tool), {} nếu không có
//   }
//   prompt   lời người dùng vừa gõ (user-prompt), '' nếu không có
//   reply    câu trả lời cuối của phiên trong lượt vừa hết (turn-end), '' nếu không có
//   scratch  thư mục nháp riêng của phiên do công cụ chủ cấp, '' nếu không có
//   source   vì sao phiên bắt đầu (session-start): 'startup' | 'resume' | 'compact' | 'clear' | ''
//   again    true nếu lượt này đã bị giữ lại một lần ở turn-end (để luật không nhắc lặp vô hạn)
// }
// QUYẾT ĐỊNH: null (không có ý kiến, cho qua) hoặc { verdict, reason, detail?, service? }:
//   deny   chặn việc sắp làm (before-action)          ask    hỏi người dùng (before-action)
//   note   không chặn, nhắn thêm cho phiên            block  giữ lượt lại, chưa cho kết thúc (turn-end)
//   detail   (tùy chọn) một dòng ngắn cho sổ quyết định của luật (S-060), ví dụ "còn thiếu: services"; thiếu thì cửa vào lấy dòng đầu của reason
//   service  (tùy chọn) dịch vụ luật đã xét, khi luật biết rõ hơn cửa vào
const KINDS = ['session-start', 'user-prompt', 'before-action', 'after-action', 'turn-end'];
const ACTIONS = ['write-file', 'run-command', 'read-file', 'open-skill', 'call-tool', 'other'];
const VERDICTS = { 'before-action': ['deny', 'ask', 'note'], 'after-action': ['note'], 'turn-end': ['block'], 'session-start': ['note'], 'user-prompt': ['note'] };

const isStr = (x) => typeof x === 'string';

// Kiểm một sự kiện đúng hợp đồng. Sai thì ném lỗi nói rõ sai ở đâu: thà hỏng có tiếng còn hơn để luật quyết định trên dữ liệu thiếu
// (ví dụ khi công cụ chủ đổi dạng dữ liệu). Trả lại chính sự kiện.
function checkEvent(e) {
  const bad = (why) => { throw new Error(`sự kiện sai hợp đồng (ports/events.js): ${why}`); };
  if (!e || typeof e !== 'object') bad('không phải một vật');
  if (!KINDS.includes(e.kind)) bad(`kind lạ: ${String(e.kind)}`);
  for (const k of ['root', 'agent', 'cwd', 'prompt', 'reply', 'scratch', 'source']) if (!isStr(e[k])) bad(`${k} phải là chuỗi`);
  if (!e.root) bad('thiếu root');
  if (typeof e.again !== 'boolean') bad('again phải là đúng hoặc sai');
  const a = e.action;
  if (!a || typeof a !== 'object') bad('thiếu action');
  if (!ACTIONS.includes(a.type)) bad(`action.type lạ: ${String(a.type)}`);
  for (const k of ['tool', 'file', 'text', 'command', 'server', 'name']) if (!isStr(a[k])) bad(`action.${k} phải là chuỗi`);
  if (!a.args || typeof a.args !== 'object') bad('action.args phải là một vật');
  if (a.shell !== null && (typeof a.shell !== 'object' || !Array.isArray(a.shell.targets) || !Array.isArray(a.shell.inline))) bad('action.shell sai dạng');
  return e;
}

// Kiểm một quyết định đúng hợp đồng cho loại sự kiện `kind`. Trả lại chính quyết định (hoặc null).
function checkDecision(kind, d) {
  if (d === null || d === undefined) return null;
  const bad = (why) => { throw new Error(`quyết định sai hợp đồng (ports/events.js): ${why}`); };
  if (typeof d !== 'object') bad('không phải một vật');
  if (!(VERDICTS[kind] || []).includes(d.verdict)) bad(`verdict "${String(d.verdict)}" không dùng được cho ${kind}`);
  if (!isStr(d.reason) || !d.reason) bad('thiếu reason');
  return d;
}

const deny = (reason) => ({ verdict: 'deny', reason });
const ask = (reason) => ({ verdict: 'ask', reason });
const note = (reason) => ({ verdict: 'note', reason });
const block = (reason) => ({ verdict: 'block', reason });

module.exports = { KINDS, ACTIONS, VERDICTS, checkEvent, checkDecision, deny, ask, note, block };
