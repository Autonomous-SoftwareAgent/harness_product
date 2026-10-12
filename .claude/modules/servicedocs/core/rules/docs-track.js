'use strict';
// spec: HOOK-S-003
// LUẬT theo dõi tài liệu cho MỘT dịch vụ (sau khi phiên ghi một tệp), dùng khi cửa vào chỉ định dịch vụ qua tham số `service`.
// Luật track.js gọi cùng phần "nghĩ" này cho dịch vụ nó tự nhận ra. Không bao giờ chặn.
const D = require('../../../core/core/rules/lib/docs-tracking');

async function run(event, ports, params = {}) {
  await D.track(event, params.service, ports);
  return null;
}

module.exports = { id: 'docs-track', on: 'after-action', run };
