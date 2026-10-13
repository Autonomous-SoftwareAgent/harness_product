'use strict';
// spec: PORT-S-002
// Tên cũ của bộ đọc cấu trúc dữ liệu: việc đọc PostgreSQL nằm ở adapters/postgres/reader.js, phép chuyển cấu trúc thành
// sơ đồ nằm ở core/diagrams/erd-from-db.js. Tệp này chỉ GHÉP hai phần cho mã và test đang gọi theo tên cũ.
module.exports = { ...require('../../adapters/postgres/reader'), ...require('../../core/diagrams/erd-from-db') };
