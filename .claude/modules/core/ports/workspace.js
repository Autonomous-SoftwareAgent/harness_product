'use strict';
// spec: HOOK-S-007
// CỔNG RA "dự án": những điều lõi cần biết về cây thư mục và cấu hình của dự án đang được harness quản lý.
// Tệp này chỉ là hợp đồng. Cổng này ĐỒNG BỘ (trả giá trị ngay): dự án luôn nằm trên đĩa của máy đang chạy harness.
//   root                     thư mục gốc của dự án (chuỗi)
//   servicesDirName          tên thư mục chứa các dịch vụ, tính từ gốc (chuỗi)
//   norm(p)                  đường dẫn để SO SÁNH (trên Windows là chữ thường)
//   inside(abs)              abs có nằm trong dự án không
//   resolveToken(token, cwd) đổi một từ trong lệnh shell thành đường dẫn tuyệt đối
//   exists(abs)              tệp hay thư mục có thật không
//   serviceOf(abs)           tên dịch vụ chứa abs, '' nếu không thuộc dịch vụ nào
//   isService(name)          name có phải một dịch vụ có kho git không
//   serviceRel(name)         đường dẫn của dịch vụ tính từ gốc, kiểu posix
//   serviceDir(name)         đường dẫn tuyệt đối của dịch vụ
//   units()                  đơn vị nằm ngoài thư mục dịch vụ: { tên: thư mục tính từ gốc }
//   scopeMode()              chế độ của luật phạm vi: 'enforce' | 'legacy' | 'off'
//   skillsMapRaw()           bảng nối việc với skill, đã đọc thành vật; null nếu thiếu hay hỏng
//   skillsMapRel             đường dẫn của bảng nối tính từ gốc, kiểu posix (chuỗi)
//   skillsDir                thư mục chứa skill (chuỗi, tuyệt đối)
//   skillExists(name)        skill có thật không
//   bannedWords()            danh sách từ cấm của máy (mảng chuỗi); null nếu máy không có danh sách
//   bannedListRel            đường dẫn của danh sách từ cấm tính từ gốc, kiểu posix (chuỗi)
//   entryExists(name)        tệp cửa vào của harness tên `name` (ví dụ 'docs-track.js') có còn không
const NAME = 'workspace';
const VALUES = ['root', 'servicesDirName', 'skillsMapRel', 'skillsDir', 'bannedListRel'];
//   caseKey(s)               một tên để SO SÁNH (trên Windows là chữ thường)
//   skillsMapExists()        tệp bảng nối có trên đĩa không (kể cả khi hỏng)
//   allSkills()              tên mọi skill đang có, đã sắp xếp
//   policy(name)             một luật riêng của dự án khai trong cấu hình: 'rootNeverPush', 'docsNeverPush' (bool), 'readOnlyDirs' (mảng)
//   loadedOnce()             những thứ công cụ chủ chỉ nạp MỘT lần lúc phiên mở: [{ id, label, stamp }]; id 'instructions' (tệp hướng dẫn ở gốc),
//                            'mcp' (máy chủ công cụ); stamp là dấu nội dung lúc này. Không có thứ nào thì []
//   externalWrite(tool)      công cụ `tool` (tên đầy đủ) có phải công cụ GHI RA NGOÀI của một máy chủ MCP đã khai không: tên máy chủ
//                            hoặc kết nối; '' nếu không
//   loadedDiff(sid, id)      phần đã đổi của thứ chỉ nạp một lần `id` so với bản phiên `sid` đã nạp: { added: [dòng], removed: [dòng] },
//                            và ghi bản hiện tại làm bản phiên đã nạp; null nếu không so được
//   transferPending(sid)     tờ bàn giao mà phiên `sid` nhận và CHƯA đọc: { id, rel, unit }; null nếu không có
//   transferRead(abs, sid)   phiên `sid` vừa đọc tệp `abs`: nếu đó là tờ bàn giao gửi cho nó thì ghi nhận đã đọc; trả mã lần chuyển, '' nếu không phải
//   sheetOwner(abs)          abs là "tờ của một đơn vị" nằm trong thư mục đơn vị khác (luật unitSheets): tên đơn vị chủ; '' nếu không
const METHODS = ['norm', 'caseKey', 'inside', 'resolveToken', 'exists', 'serviceOf', 'isService', 'serviceRel', 'serviceDir', 'units', 'scopeMode', 'skillsMapRaw', 'skillsMapExists', 'skillExists', 'allSkills', 'bannedWords', 'entryExists', 'policy', 'sheetOwner', 'loadedOnce', 'externalWrite', 'loadedDiff', 'transferPending', 'transferRead'];

// Kiểm một bộ chuyển có đủ những gì cổng yêu cầu; thiếu thì ném lỗi nêu tên thứ thiếu. Trả lại chính bộ chuyển.
function check(impl) {
  const miss = [...VALUES.filter((k) => typeof (impl || {})[k] !== 'string'), ...METHODS.filter((k) => typeof (impl || {})[k] !== 'function')];
  if (miss.length) throw new Error(`bộ chuyển cho cổng "${NAME}" thiếu: ${miss.join(', ')}`);
  return impl;
}

module.exports = { NAME, VALUES, METHODS, check };
