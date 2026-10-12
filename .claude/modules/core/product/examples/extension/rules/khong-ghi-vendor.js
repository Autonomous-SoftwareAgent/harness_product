'use strict';
// Luật mẫu: không ghi vào thư mục vendor/ (mã của bên ngoài, chép nguyên). Đường dẫn trong ctx tính từ thư mục của khối.
module.exports = {
  id: 'khong-ghi-vendor',
  api: '1.0',
  on: ['before-action'],
  run(ctx) {
    const hit = ctx.action.writes.filter((p) => p === 'vendor' || p.startsWith('vendor/') || p.includes('/vendor/'));
    if (hit.length) return ctx.block(`Thư mục vendor/ là mã của bên ngoài, không sửa tại chỗ (${hit.join(', ')}). Muốn đổi thì cập nhật bản gốc rồi chép lại.`);
    return null;
  },
};
