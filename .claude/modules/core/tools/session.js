#!/usr/bin/env node
'use strict';
// spec: MCP-S-005
// LỐI TẮT (S-057): mã thật ở cli/session.js. Giữ đường dẫn cũ cho tài liệu và phiên đang gọi theo tên cũ.
const m = require('../cli/session');
if (require.main === module) console.log(m.main(process.argv.slice(2)));
module.exports = m;
