'use strict';
// spec: HOOK-S-007
// spec: HOOK-S-010
// Sổ đăng ký luật của harness (S-055). Mỗi luật là MỘT tệp trong core/rules/ xuất { id, on, run }:
//   id   tên luật, duy nhất
//   on   loại sự kiện luật nghe (một chuỗi hoặc một mảng; xem ports/events.js)
//   run  hàm (sự kiện, các cổng, tham số) -> quyết định hoặc null; có thể trả lời hứa
// Thêm luật là thêm tệp: sổ chỉ nhận thêm, trùng id là lỗi (không ghi đè). Tệp này thuần: việc tìm tệp luật trên đĩa là của cửa vào.
const { KINDS } = require('../../ports/events');

// GIAO DIỆN MỞ RỘNG (S-064): luật của dự án (<thư mục dự án>/rules/<id>.js) khai `api: "<lớn>.<nhỏ>"` là bản giao diện nó viết theo.
// Nhận khi cùng số lớn và số nhỏ không lớn hơn bản của harness. Bản 0.x: sự kiện và quyết định ở ports/events.js, bốn cổng ports/*.js.
const API_VERSION = '0.1';
function apiCompatible(want, have = API_VERSION) {
  const m = /^(\d+)\.(\d+)$/.exec(String(want || ''));
  const [hm, hn] = have.split('.').map(Number);
  return Boolean(m) && Number(m[1]) === hm && Number(m[2]) <= hn;
}

function create() {
  const rules = new Map();
  return {
    // Nhận một luật. `from` là nơi luật đến (tên tệp), chỉ để lời báo lỗi chỉ đúng chỗ. `extension`: luật mở rộng của dự án, phải khai `api` hợp.
    add(rule, from = '', { extension = false } = {}) {
      const where = from ? ` (${from})` : '';
      if (!rule || typeof rule !== 'object') throw new Error(`luật không phải một vật${where}`);
      if (extension && !apiCompatible(rule.api)) throw new Error(`luật mở rộng "${rule.id || '?'}" khai giao diện ${rule.api ? `"${rule.api}"` : '(không khai)'}, harness đang ở bản ${API_VERSION}: khai \`api: "${API_VERSION}"\` và viết theo ports/events.js${where}`);
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

module.exports = { create, API_VERSION, apiCompatible };
