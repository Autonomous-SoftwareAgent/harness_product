'use strict';
// spec: PORT-S-002
// CỔNG RA "bộ vẽ" (S-055). Tệp này chỉ là hợp đồng. Bản khai báo sơ đồ (core/diagrams/spec.js) nói sơ đồ CHỨA GÌ; bộ vẽ quyết VẼ THẾ NÀO.
// Đổi thư viện vẽ là viết bộ chuyển mới cho cổng này; bản khai báo đã lưu của mọi dịch vụ không phải khai lại.
//   STYLE_NAMES        tên màu mà bản khai báo được chọn (bộ vẽ quyết mỗi tên ra màu gì)
//   RENDERER_VERSION   số nguyên, tăng mỗi khi cách sinh hình đổi: cổng HTML thấy số đổi thì vẽ lại và kiểm lại mọi sơ đồ
//   render(spec)       bản khai báo đã qua bộ kiểm -> văn bản của thư viện vẽ; hàm thuần, cùng đầu vào luôn ra cùng một chuỗi
const NAME = 'renderer';
const STYLE_NAMES = ['gray', 'green', 'blue', 'amber', 'pink', 'red', 'teal'];
const METHODS = ['render'];

function check(impl) {
  const miss = METHODS.filter((k) => typeof (impl || {})[k] !== 'function');
  if (!Number.isInteger((impl || {}).RENDERER_VERSION)) miss.push('RENDERER_VERSION');
  if (miss.length) throw new Error(`bộ chuyển cho cổng "${NAME}" thiếu: ${miss.join(', ')}`);
  return impl;
}

module.exports = { NAME, STYLE_NAMES, METHODS, check };
