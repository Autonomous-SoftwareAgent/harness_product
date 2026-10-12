'use strict';
// spec: HOOK-S-003
// CỬA VÀO: Stop cho MỘT service, lấy tên từ biến môi trường BSN_SERVICE. Luật nằm ở core/rules/docs-stop.js;
// tệp này chỉ nối bộ chuyển Claude Code với luật đó (S-055). forward.js gọi cùng luật cho từng dịch vụ phiên đã sửa, và coi sự có mặt
// của tệp này là dấu hiệu phần kiểm tài liệu cuối lượt còn nguyên.
if (require.main === module) require('../../core/hooks/wire').hook({ name: 'docs-stop', id: 'docs-stop', kind: 'turn-end', badInput: 'empty', params: () => ({ service: process.env.BSN_SERVICE || '' }) });
