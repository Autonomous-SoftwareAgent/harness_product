#!/usr/bin/env node
'use strict';
// spec: MCP-S-005
// LỐI TẮT: mã thật ở cli/install-git-hooks.js. Giữ đường dẫn cũ cho tài liệu và phiên đang gọi theo tên cũ.
const m = require('../cli/install-git-hooks');
if (require.main === module) process.exit(m.main(process.argv.slice(2)));
module.exports = m;
