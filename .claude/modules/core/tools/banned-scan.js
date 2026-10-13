#!/usr/bin/env node
'use strict';
// spec: MCP-S-005
// LỐI TẮT: mã thật ở cli/banned-scan.js. Git hook quét từ cấm đã cài ở các repo gọi đúng đường dẫn này.
const m = require('../cli/banned-scan');
if (require.main === module) process.exit(m.main(process.argv.slice(2)));
module.exports = m;
