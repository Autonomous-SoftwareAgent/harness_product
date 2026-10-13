'use strict';
// spec: CTX-S-001
// CỬA VÀO của việc hỏi kho ngữ nghĩa: phần trả lời nằm ở core/context/query.js (thuần). Tệp này đưa cho nó kho đã dựng
// (mcp/context.js) và danh sách đơn vị ngoài của dự án (gate/gate-paths.js).
const Q = require('../../core/context/query');
const P = require('../../../core/gate/gate-paths');
const ROOT = P.rootFrom(__dirname); // gốc dự án: không đếm '..' (độ sâu của tệp khác nhau giữa hai bố cục)

const explore = (args, { all } = {}) => Q.explore(args, { all: all || require('./context').buildAll(), units: P.extraUnits(ROOT), parents: P.unitParents(ROOT) });

module.exports = { ...Q, explore };
