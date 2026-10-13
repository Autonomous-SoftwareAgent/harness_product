'use strict';
// spec: PORT-S-002
// LÕI: từ cấu trúc thô của một cơ sở dữ liệu quan hệ (bảng, cột, kiểu, khóa) ra nội dung của sơ đồ dữ liệu.
// Thuần: việc tạo cơ sở dữ liệu tạm và hỏi cấu trúc là của bộ chuyển (adapters/postgres/reader.js).
const specs = require('./spec');

// Cấu trúc thô -> phần nội dung của sơ đồ dữ liệu { entities, relations }. Hàm thuần: cùng cấu trúc luôn ra cùng kết quả.
//  - Mỗi bảng một thực thể; cột giữ thứ tự của bảng; khóa: PK, FK, UK (duy nhất).
//  - Mỗi khóa ngoại một quan hệ, khai từ bảng được trỏ tới (phía "một") sang bảng giữ khóa (phía "nhiều"); nếu các cột khóa ngoại
//    cũng chính là khóa chính hoặc một ràng buộc duy nhất của bảng giữ khóa thì phía kia là "không hoặc một".
function toErd(raw, { tables = [] } = {}) {
  const want = new Set(tables);
  const names = [...new Set(raw.columns.map((c) => c.table))].filter((t) => !want.size || want.has(t)).sort();
  for (const t of want) if (!names.includes(t)) throw new Error(`không có bảng '${t}' sau khi chạy lệnh tạo bảng (đang có: ${[...new Set(raw.columns.map((c) => c.table))].sort().join(', ') || 'không bảng nào'})`);
  if (!names.length) throw new Error('lệnh tạo bảng chạy xong nhưng cơ sở dữ liệu tạm không có bảng nào: lệnh có thật sự tạo bảng không, có dùng đúng biến môi trường url_env không?');
  if (names.length > specs.MAX.entities) throw new Error(`có ${names.length} bảng, quá ${specs.MAX.entities} cho một sơ đồ: truyền \`tables\` để chia thành nhiều sơ đồ`);
  const idOf = (t) => (specs.EL_ID_RE.test(t) && !specs.RESERVED.has(t.toLowerCase()) ? t : `t_${t.replace(/[^A-Za-z0-9_]/g, '_')}`.slice(0, 40));
  const same = (a, b) => a.length === b.length && [...a].sort().join('\u0000') === [...b].sort().join('\u0000');
  const entities = names.map((t) => {
    const cons = raw.constraints.filter((c) => c.table === t);
    const pk = new Set(cons.filter((c) => c.kind === 'p').flatMap((c) => c.cols));
    const fk = new Set(cons.filter((c) => c.kind === 'f').flatMap((c) => c.cols));
    const uniques = cons.filter((c) => c.kind === 'u');
    const cols = raw.columns.filter((c) => c.table === t);
    if (cols.length > specs.MAX.columns) throw new Error(`bảng '${t}' có ${cols.length} cột, quá ${specs.MAX.columns} cho một thực thể`);
    const entity = { id: idOf(t), store: 'table', columns: cols.map((c) => {
      const keys = [];
      if (pk.has(c.name)) keys.push('PK');
      if (fk.has(c.name)) keys.push('FK');
      const uq = uniques.filter((u) => u.cols.includes(c.name));
      if (uq.length) keys.push('UK');
      const notes = [];
      const together = uq.filter((u) => u.cols.length > 1).map((u) => `duy nhất theo (${u.cols.join(', ')})`);
      notes.push(...together);
      if (!c.notnull) notes.push('cho phép trống');
      const col = { type: shortType(c.type).slice(0, specs.MAX.colType), name: c.name, keys };
      if (notes.length) col.note = notes.join('; ').slice(0, specs.MAX.note);
      return col;
    }) };
    if (entity.id !== t) entity.label = t;
    return entity;
  });
  const relations = [];
  for (const c of raw.constraints.filter((x) => x.kind === 'f' && names.includes(x.table) && names.includes(x.ftable))) {
    const own = raw.constraints.filter((x) => x.table === c.table && (x.kind === 'p' || x.kind === 'u'));
    const nullable = c.cols.some((n) => !(raw.columns.find((x) => x.table === c.table && x.name === n) || {}).notnull);
    relations.push({ from: idOf(c.ftable), to: idOf(c.table), from_card: nullable ? 'zero-or-one' : 'one', to_card: own.some((x) => same(x.cols, c.cols)) ? 'zero-or-one' : 'many', label: c.cols.join(', ').slice(0, specs.MAX.label) });
  }
  return { entities, relations };
}

// Tên kiểu dài của PostgreSQL -> tên ngắn quen dùng, để cột trên hình không bị kéo rộng.
const TYPE_ALIAS = [[/^character varying/, 'varchar'], [/^character/, 'char'], [/^timestamp with time zone/, 'timestamptz'], [/^timestamp without time zone/, 'timestamp'],
  [/^time with time zone/, 'timetz'], [/^time without time zone/, 'time'], [/^double precision/, 'float8'], [/^boolean/, 'bool']];
function shortType(type) {
  let t = String(type);
  for (const [re, short] of TYPE_ALIAS) if (re.test(t)) { t = t.replace(re, short); break; }
  return t;
}

module.exports = { toErd, shortType };
