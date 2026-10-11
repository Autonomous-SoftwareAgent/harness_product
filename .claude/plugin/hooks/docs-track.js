'use strict';
// spec: HOOK-S-003
// CỬA VÀO: PostToolUse (Write|Edit|NotebookEdit) cho MỘT service, lấy tên từ biến môi trường BSN_SERVICE. Luật nằm ở core/rules/docs-track.js;
// tệp này chỉ nối bộ chuyển Claude Code với luật đó (S-055). forward.js gọi cùng luật cho dịch vụ nó tự nhận ra, và coi sự có mặt
// của tệp này là dấu hiệu phần theo dõi tài liệu còn nguyên. Việc theo dõi không bao giờ chặn công cụ.
if (require.main === module) require('./wire').hook({ name: 'docs-track', id: 'docs-track', kind: 'after-action', badInput: 'empty', params: () => ({ service: process.env.BSN_SERVICE || '' }) });
