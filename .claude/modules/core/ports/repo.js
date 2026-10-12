'use strict';
// spec: HOOK-S-007
// spec: HOOK-S-008
// CỔNG RA "kho mã" (S-055): những gì lõi cần hỏi hệ quản lý phiên bản. Tệp này chỉ là hợp đồng. Cổng này CÓ CHỜ.
//   isIgnored(abs)   tệp abs có bị kho chứa nó bỏ qua không (không hỏi được thì trả false)
//   topLevel(dir)    thư mục gốc của kho chứa dir (thư mục chưa có thì hỏi thư mục cha gần nhất); '' nếu không thuộc kho nào
//   docsLeaks(dir, remote, ref)  tệp là nội dung của `<gốc dự án>/docs/` trong các commit của `ref` (mặc định HEAD) mà kho `dir` sẽ đẩy
//                    lên `remote` (S-062): [{ commit, file, why }]; không kiểm được thì [] (lớp git hook pre-push vẫn chặn)
const NAME = 'repo';
const METHODS = ['isIgnored', 'topLevel', 'docsLeaks'];

function check(impl) {
  const miss = METHODS.filter((k) => typeof (impl || {})[k] !== 'function');
  if (miss.length) throw new Error(`bộ chuyển cho cổng "${NAME}" thiếu: ${miss.join(', ')}`);
  return impl;
}

module.exports = { NAME, METHODS, check };
