'use strict';
// spec: HOOK-S-010
// CỬA VÀO của các luật MỞ RỘNG của dự án (S-064): <thư mục dự án>/rules/<id>.js. Đối số là loại sự kiện chung (ports/events.js):
// before-action | after-action | turn-end | user-prompt | session-start. Bộ cài (cli/setup.js) chỉ khai hook này cho loại sự kiện mà ít nhất
// một luật mở rộng nghe. Hook lỗi thì cho qua.
const KIND = process.argv[2];
if (require.main === module && KIND) require('./wire').extensionHook({ kind: KIND, shell: KIND === 'before-action' });
