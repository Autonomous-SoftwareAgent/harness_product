'use strict';
// spec: HOOK-S-003
// LUẬT cuối lượt cho MỘT dịch vụ, dùng khi cửa vào chỉ định dịch vụ qua tham số `service`: giữ lượt lại khi
//  (a) đã sửa code mà docs/agent/STATUS.md chưa được cập nhật sau lần sửa cuối, hoặc
//  (b) phép kiểm đồng bộ báo lệch design/spec/impl/code.
// Luật wrap-up.js gọi cùng phần "nghĩ" này cho từng dịch vụ phiên đã sửa.
const { block } = require('../../ports/events');
const D = require('./lib/docs-tracking');

async function run(event, ports, params = {}) {
  const text = await D.wrapUp(event, params.service, ports);
  return text ? block(text) : null;
}

module.exports = { id: 'docs-stop', on: 'turn-end', run };
