'use strict';
// spec: PORT-S-004
// spec: HOOK-S-007
// CỔNG RA "việc của harness" (S-055): những việc nặng mà một luật NHỜ phần khác của harness làm. Tệp này chỉ là hợp đồng. Cổng này CÓ CHỜ.
//   docsCheck(service)        chạy phép kiểm đồng bộ tài liệu của dịch vụ: { failed, text }
//   refreshCodeMap(service)   làm mới bản đồ mã của dịch vụ; lỗi thì bỏ qua
//   rebuildPortalIfStale(sid) dựng lại cổng HTML nếu nguồn đã đổi; lỗi thì ghi vào sổ sức khỏe của cổng, không báo cho phiên
//   ensureGitHooks(service)   bảo đảm kho của dịch vụ có git hook của harness; lỗi thì bỏ qua
//   contextNotice(service)    lời nhắc về sơ đồ tự sinh của dịch vụ vừa đổi; '' nếu không có gì để nhắc
//   publishDue(sid)           có giao việc đẩy cổng lên claude.ai cho phiên này không: { due, files? }; mỗi nội dung cổng chỉ giao một lần, cho một phiên (S-058)
const NAME = 'jobs';
const METHODS = ['docsCheck', 'refreshCodeMap', 'rebuildPortalIfStale', 'ensureGitHooks', 'contextNotice', 'publishDue'];

function check(impl) {
  const miss = METHODS.filter((k) => typeof (impl || {})[k] !== 'function');
  if (miss.length) throw new Error(`bộ chuyển cho cổng "${NAME}" thiếu: ${miss.join(', ')}`);
  return impl;
}

module.exports = { NAME, METHODS, check };
