'use strict';
// spec: PORT-S-005
// PHẦN GIẢI THÍCH DO MÁY VIẾT cho sơ đồ tự sinh từ mã. Hàm thuần: chỉ đọc bản khai báo của hình, không đọc đĩa.
// Sơ đồ tự sinh được dựng lại sau mỗi commit; trước đây phần giải thích phải chờ một phiên viết tay và cũ đi sau mỗi lần hình đổi.
// Nay máy viết ngay từ chính dữ liệu của hình (hình gồm những gì, đọc thế nào, điều hình không nói), nên sơ đồ tự sinh luôn có giải thích
// khớp với hình. Phiên nào viết bản hay hơn bằng diagram_explain thì bản đó được dùng, cho tới khi hình đổi.
// Máy không biết VÌ SAO mã phụ thuộc theo chiều đó: phần "dễ hiểu nhầm" nói rõ điều này.
const MAX_GROUPS = 12;
const cut = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const names = (xs, n) => { const shown = xs.slice(0, n); return `${shown.join(', ')}${xs.length > shown.length ? ` và ${xs.length - shown.length} mục khác` : ''}`; };

function machineExplain(spec, origin = 'tự sinh từ mã') {
  if (!spec || spec.type !== 'flowchart') return null;
  const nodes = spec.nodes || []; const groups = spec.groups || []; const edges = spec.edges || [];
  const groupIds = new Set(groups.map((g) => g.id));
  const between = edges.filter((e) => groupIds.has(e.from) && groupIds.has(e.to)).length;
  const dotted = edges.some((e) => e.line === 'dotted');
  const labelled = edges.some((e) => e.label);
  const meaning = cut(`"${spec.title}": hình gồm ${nodes.length} ô${groups.length ? ` xếp trong ${groups.length} khung` : ''} và ${edges.length} đường nối, do máy ${origin} của bản đã commit. ` +
    'Dùng hình để biết phần nào nối với phần nào trước khi sửa: sửa một ô thì các ô có đường nối tới nó là chỗ cần xem lại.', 700);
  const read = [
    groups.length ? 'Mỗi khung là một nhóm (một thư mục, một lớp hoặc một loại cửa); các khung xếp từ trên xuống, trong mỗi khung các ô đi từ trái sang phải.' : 'Mỗi ô là một phần của đơn vị; đọc theo chiều mũi tên.',
    'Mũi tên đi từ bên DÙNG sang bên ĐƯỢC DÙNG (bên nhập sang bên được nhập, bên gọi sang bên được gọi).',
  ];
  if (between) read.push(`Nét đậm nối hai khung (${between} đường): mọi quan hệ giữa hai nhóm đã được gộp thành một đường${labelled ? ', chữ trên đường nói gộp bao nhiêu' : ''}.`);
  else if (labelled) read.push('Chữ trên đường nối nói loại quan hệ hoặc số lần.');
  if (dotted) read.push('Nét chấm là quan hệ gián tiếp hoặc đường quay lại.');
  read.push('Danh sách đầy đủ từng quan hệ (không gộp) có ở diagram_get của sơ đồ này.');
  const details = groups.slice(0, MAX_GROUPS).map((g) => {
    const inside = nodes.filter((n) => n.group === g.id).map((n) => n.label);
    return { term: cut(g.label, 90), text: cut(inside.length ? `${inside.length} ô: ${names(inside, 8)}.` : 'Khung này chỉ có đường nối, không có ô riêng.', 420) };
  });
  const pitfalls = [
    'Phần giải thích này do máy viết từ dữ liệu của hình: nó nói hình gồm gì, không nói vì sao mã được chia như vậy hay đường nối nào là nợ kỹ thuật.',
    'Máy chỉ thấy quan hệ viết rõ trong mã đã commit (lệnh nhập, khai báo). Quan hệ tính lúc chạy không có trên hình; khai thêm bằng context_relate.',
    'Hình đổi theo mã sau mỗi commit; mã chưa commit chưa có trên hình.',
  ];
  return { meaning, read: read.slice(0, 8), details, pitfalls, machine: true };
}

module.exports = { machineExplain };
