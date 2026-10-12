'use strict';
// spec: LEDG-S-003
// CỬA VÀO cho mã còn gọi sổ phạm vi theo tên cũ (cổng duyệt, máy chủ MCP, bảng phiên, tóm tắt đầu phiên). Phần SQLite nằm ở
// adapters/storage/scope-db.js; lời từ chối của luật phạm vi nằm ở core/rules/scope.js (S-055).
module.exports = require('../adapters/storage/scope-db');
