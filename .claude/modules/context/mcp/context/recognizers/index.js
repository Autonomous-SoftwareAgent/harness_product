'use strict';
// spec: CTX-S-003
// SỔ ĐĂNG KÝ bộ nhận dạng của kho ngữ nghĩa. Lõi của kho (context.js, context-scan.js) chỉ biết BA CỔNG dưới đây và dạng chuẩn
// mà mỗi cổng trả về; nó không biết tên một bộ nhận dạng nào. Mỗi bộ nhận dạng là MỘT TỆP trong thư mục của cổng:
//   sources/  đọc một loại tài liệu hay một lớp sự thật, ghi NÚT và CẠNH vào kho qua "bồn nhận" (chỉ thêm, không sửa, không xóa)
//   langs/    đọc mã của một ngôn ngữ: lệnh nhập, khai báo chính, chỗ nhập động
//   entries/  nhận một loại CỬA VÀO của mã (đường dẫn API, công cụ MCP, lệnh dòng lệnh, hook)
// Thêm một loại mới = thêm một tệp vào đúng thư mục. Không sửa tệp cũ, không sửa lõi.
// CHỈ THÊM, KHÔNG GHI ĐÈ: hai tệp khai cùng `id` là lỗi (nêu tên cả hai tệp), không tệp nào thay được tệp kia.
// Tệp tên bắt đầu bằng "_" bị bỏ qua (để tạm tắt một bộ mà không xóa).
const fs = require('fs');
const path = require('path');

const PORTS = {
  // run(sink, ctx): sink là bồn nhận (context.js: Graph.sink); ctx = { svc, scope, files, infra, allInfra, facts, entryKinds }.
  // scopes: 'service' (một dịch vụ hay đơn vị), 'root' (phần chung của cả hệ). order: số nhỏ chạy trước; chỉ quyết định ai là "bản đầu" khi hai bộ nói cùng một điều.
  source: { dir: 'sources', need: { id: 'string', title: 'string', order: 'number', scopes: 'object', run: 'function' } },
  // scan(file, text, has, state) -> { imports, externals, decls, dynamic }. prepare(codePaths) -> state (tùy chọn; ví dụ bảng tên module).
  lang: { dir: 'langs', need: { id: 'string', ext: 'object', scan: 'function' } },
  // find(file, text, lang) -> [{ name, line, ...thuộc tính riêng }]. lang là id của ngôn ngữ, hoặc null với tệp không phải mã.
  // nodeType: loại nút trong kho (mặc định 'entry'). bucket(name, file) -> tên nhóm trên sơ đồ cửa vào (mặc định: tệp chứa nó).
  entry: { dir: 'entries', need: { id: 'string', label: 'string', group: 'string', unit: 'string', order: 'number', find: 'function' } },
};

const cache = new Map();
function load(port) {
  if (cache.has(port)) return cache.get(port);
  const def = PORTS[port];
  if (!def) throw new Error(`bộ nhận dạng: không có cổng '${port}'`);
  const dir = path.join(__dirname, def.dir);
  const seen = new Map();
  const out = [];
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => n.endsWith('.js') && !n.startsWith('_')).sort() : []) {
    const mod = require(path.join(dir, f));
    for (const [k, t] of Object.entries(def.need)) {
      if (typeof mod[k] !== t || (t === 'object' && !Array.isArray(mod[k]))) throw new Error(`bộ nhận dạng ${def.dir}/${f}: thiếu hoặc sai trường '${k}' (cần ${t === 'object' ? 'danh sách' : t})`);
    }
    if (!/^[a-z][a-z0-9-]*$/.test(mod.id)) throw new Error(`bộ nhận dạng ${def.dir}/${f}: id '${mod.id}' phải là chữ thường, số, gạch ngang`);
    if (seen.has(mod.id)) throw new Error(`bộ nhận dạng ${def.dir}/${f}: id '${mod.id}' đã có ở ${def.dir}/${seen.get(mod.id)} (chỉ thêm, không ghi đè: đặt id khác)`);
    seen.set(mod.id, f);
    out.push(Object.freeze({ ...mod, file: `${def.dir}/${f}` }));
  }
  out.sort((a, b) => (a.order || 0) - (b.order || 0) || (a.id < b.id ? -1 : 1));
  cache.set(port, out);
  return out;
}

// Mọi tệp của các bộ nhận dạng (để tính dấu của bộ dựng: đổi hay thêm một bộ thì kho dựng lại).
function sourceFiles() {
  const out = [path.join(__dirname, 'index.js'), path.join(__dirname, 'kit.js')];
  for (const def of Object.values(PORTS)) {
    const dir = path.join(__dirname, def.dir);
    if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.js')).sort()) out.push(path.join(dir, f));
  }
  return out;
}

// Bảng cho người và cho phép kiểm sức khỏe: cổng nào có những bộ nào.
function describe() {
  return Object.keys(PORTS).map((p) => ({ port: p, dir: PORTS[p].dir, items: load(p).map((x) => ({ id: x.id, file: x.file, title: x.title || x.label || x.id })) }));
}

module.exports = { load, sourceFiles, describe, PORTS };
