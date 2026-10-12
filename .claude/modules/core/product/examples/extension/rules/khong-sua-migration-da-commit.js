'use strict';
// Luật mẫu: tệp migration đã commit thì không sửa (cơ sở dữ liệu thật đã chạy bản cũ; sửa lại làm các máy lệch nhau). Tệp mới thì được.
module.exports = {
  id: 'khong-sua-migration-da-commit',
  api: '1.0',
  on: ['before-action'],
  run(ctx) {
    const hit = ctx.action.writes.filter((p) => /(^|\/)migrations\//.test(p) && ctx.git.isCommitted(p));
    if (hit.length) return ctx.block(`Tệp migration đã commit thì không sửa (${hit.join(', ')}): tạo một tệp migration mới cho thay đổi này.`);
    return null;
  },
};
