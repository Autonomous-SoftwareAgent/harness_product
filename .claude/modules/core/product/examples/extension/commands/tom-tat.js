'use strict';
// Lệnh mẫu: node <harness>/cli/cli.js extension run <khóa> tom-tat
module.exports = {
  name: 'tom-tat',
  api: '1.0',
  description: 'In tóm tắt thư mục của khối.',
  run(argv, ctx) {
    const where = ctx.unit ? `đơn vị ${ctx.unit.name}` : 'cả dự án';
    return `Khối của ${where}: ${ctx.fs.list('.').length} mục ở thư mục gốc.${argv.length ? ` Đối số: ${argv.join(' ')}` : ''}`;
  },
};
