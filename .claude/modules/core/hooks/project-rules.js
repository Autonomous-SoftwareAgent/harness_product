'use strict';
// spec: HOOK-S-010
// CỬA VÀO của các luật MỞ RỘNG của dự án: <thư mục dự án>/rules/<id>.js. Đối số là loại sự kiện chung (ports/events.js):
// before-action | after-action | turn-end | user-prompt | session-start. Bộ cài (cli/setup.js) LUÔN khai hook này cho before-action
// (settings.json không đổi theo máy, khối vừa xác nhận chạy ngay ở mọi phiên); các loại khác chỉ khai khi có luật nghe.
// Không có luật nào thì cho qua. Hook lỗi thì cho qua.
const KIND = process.argv[2];
if (require.main === module && KIND) require('./wire').extensionHook({ kind: KIND, shell: KIND === 'before-action' });
