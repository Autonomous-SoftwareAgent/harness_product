'use strict';
// spec: HOOK-S-004
// LUẬT từ cấm (trước khi phiên ghi tệp hoặc gọi công cụ ghi của bsn-docs): CHẶN khi nội dung hoặc tên tệp có từ nằm trong danh sách
// cấm của máy này. Danh sách chỉ ở máy, không commit; luật này không chứa và không in lại từ nào.
// Chỉ xét tệp sẽ vào kho mã: tệp trong dự án mà kho KHÔNG bỏ qua. Thư mục tạm, bộ nhớ của phiên, tệp bị bỏ qua thì ghi tự do.
// Hàng rào đầu: lệnh ghi qua shell không đi qua đây, nhưng git hook pre-commit, commit-msg và pre-push (cùng bộ quét) vẫn chặn.
// Máy không có danh sách: cho qua (tóm tắt đầu phiên nói rõ là đang không quét).
const path = require('node:path');
const { deny } = require('../../ports/events');
const W = require('./lib/banned-words');

const TOOL_SERVER = 'bsn-docs';

async function run(event, { workspace: ws, repo }) {
  const words = ws.bannedWords();
  if (!words) return null;
  const re = W.matcher(words);
  const a = event.action;
  const no = (where) => deny(`Lời gọi này bị chặn vì ${where} có từ nằm trong danh sách cấm của máy này. Từ trong danh sách không được có trong bất kỳ commit nào (nội dung, tên tệp, lời nhắn). Đọc danh sách ở ${ws.bannedListRel} (tệp chỉ có ở máy), viết lại không dùng các từ đó rồi gọi lại. Không chép từ trong danh sách vào tệp, tài liệu, lời nhắn commit hay tin nhắn nào.`);
  if (a.type === 'call-tool' && a.server === TOOL_SERVER) {
    let readonly = [];
    try { readonly = ws.skillsMapRaw().readonly || []; } catch { /* không có bảng nối: xét mọi công cụ */ }
    if (readonly.includes(a.name)) return null;
    const lines = W.linesWith(JSON.stringify(a.args, null, 1), re);
    return lines.length ? no('tham số của công cụ') : null;
  }
  const abs = a.file;
  if (!abs) return null;
  if (!ws.inside(abs) || await repo.isIgnored(abs)) return null;
  const rel = path.relative(ws.root, abs).split(path.sep).join('/');
  if (re.test(rel)) return no('tên tệp');
  const lines = W.linesWith(a.text, re);
  return lines.length ? no(`nội dung sắp ghi (dòng ${lines.slice(0, 8).join(', ')} của phần ghi)`) : null;
}

module.exports = { id: 'banned', on: 'before-action', run };
