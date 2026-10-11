'use strict';
// spec: HOOK-S-007
// Sổ đăng ký luật của harness (S-055). Mỗi luật là MỘT tệp trong core/rules/ xuất { id, on, run }:
//   id   tên luật, duy nhất
//   on   loại sự kiện luật nghe (một chuỗi hoặc một mảng; xem ports/events.js)
//   run  hàm (sự kiện, các cổng, tham số) -> quyết định hoặc null; có thể trả lời hứa
// Thêm luật là thêm tệp: sổ chỉ nhận thêm, trùng id là lỗi (không ghi đè). Tệp này thuần: việc tìm tệp luật trên đĩa là của cửa vào.
const { KINDS } = require('../../ports/events');

function create() {
  const rules = new Map();
  return {
    // Nhận một luật. `from` là nơi luật đến (tên tệp), chỉ để lời báo lỗi chỉ đúng chỗ.
    add(rule, from = '') {
      const where = from ? ` (${from})` : '';
      if (!rule || typeof rule !== 'object') throw new Error(`luật không phải một vật${where}`);
      if (typeof rule.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(rule.id)) throw new Error(`luật thiếu id hợp lệ${where}`);
      if (typeof rule.run !== 'function') throw new Error(`luật "${rule.id}" thiếu hàm run${where}`);
      const on = [].concat(rule.on || []);
      const lạ = on.filter((k) => !KINDS.includes(k));
      if (!on.length || lạ.length) throw new Error(`luật "${rule.id}" khai loại sự kiện không có trong hợp đồng: ${lạ.join(', ') || '(trống)'}${where}`);
      if (rules.has(rule.id)) throw new Error(`trùng id luật "${rule.id}"${where}: sổ chỉ nhận thêm, không ghi đè`);
      rules.set(rule.id, { id: rule.id, on, run: rule.run });
      return this;
    },
    get(id) {
      const r = rules.get(id);
      if (!r) throw new Error(`không có luật "${id}"`);
      return r;
    },
    ids: () => [...rules.keys()].sort(),
    // Các luật nghe loại sự kiện `kind`, theo thứ tự id.
    forKind: (kind) => [...rules.values()].filter((r) => r.on.includes(kind)).sort((a, b) => a.id.localeCompare(b.id)),
  };
}

module.exports = { create };
