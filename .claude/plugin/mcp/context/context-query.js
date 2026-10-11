'use strict';
// spec: CTX-S-001
// CỬA VÀO của việc hỏi kho ngữ nghĩa (S-055): phần trả lời nằm ở core/context/query.js (thuần). Tệp này đưa cho nó kho đã dựng
// (mcp/context.js) và danh sách đơn vị ngoài của dự án (gate/gate-paths.js).
const Q = require('../../core/context/query');
const P = require('../../gate/gate-paths');
const BSN = require('node:path').resolve(__dirname, '..', '..', '..', '..');

const explore = (args, { all } = {}) => Q.explore(args, { all: all || require('./context').buildAll(), units: P.extraUnits(BSN), parents: P.unitParents(BSN) });

module.exports = { ...Q, explore };
