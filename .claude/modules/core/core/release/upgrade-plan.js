'use strict';
// spec: HOOK-S-017
// NÂNG CẤP CÓ GỘP, phần quyết định (hàm thuần). Người cài được sửa mã của gói và thêm khối riêng; bản mới không được đè lên phần đó.
// Với mỗi tệp có ba bản:
//   base    bản của gói ĐANG CÀI, đúng như lúc phát hành (lấy từ lịch sử của kho gói)
//   mine    bản đang nằm trên đĩa của dự án (có thể đã bị sửa)
//   theirs  bản của gói MỚI
// so ba bản ra một trong các tình trạng dưới đây và một việc phải làm. Mỗi bản là dấu nội dung (chuỗi) hoặc null khi không có tệp.
//
//   tình trạng            base  mine  theirs               việc
//   same                  bất kỳ, mine = theirs            none      không đụng
//   product-changed       B     B     T                    take      lấy bản mới
//   product-added         -     -     T                    take
//   product-removed       B     B     -                    remove    gói bỏ tệp, bạn chưa sửa: bỏ theo
//   local-changed         B     M     B                    keep      giữ bản bạn sửa (gói không đổi tệp này)
//   local-added           -     M     -                    keep      tệp hay khối bạn tự thêm
//   local-removed         B     -     B                    take      bạn xóa tệp của gói mà gói không đổi: đặt lại (gói cần đủ tệp)
//   both-changed          B     M     T                    merge     hai bên cùng sửa: gộp ba bên, chỗ đụng nhau để người quyết
//   both-added            -     M     T                    merge     hai bên cùng thêm một tệp khác nội dung: gộp với gốc rỗng
//   removed-vs-changed    B     M     -                    conflict  gói bỏ tệp bạn đã sửa: người quyết (mặc định giữ bản của bạn)
//   changed-vs-removed    B     -     T                    take      bạn xóa, gói sửa: lấy bản mới
//   removed-both          B     -     -                    none
const STATES = ['same', 'product-changed', 'product-added', 'product-removed', 'local-changed', 'local-added', 'local-removed',
  'both-changed', 'both-added', 'removed-vs-changed', 'changed-vs-removed', 'removed-both'];

function stateOf(base, mine, theirs) {
  const b = base || null; const m = mine || null; const t = theirs || null;
  if (m === t) return m === null && b !== null ? 'removed-both' : 'same';
  if (b === null) {
    if (m === null) return 'product-added';
    if (t === null) return 'local-added';
    return 'both-added';
  }
  if (m === b) return t === null ? 'product-removed' : 'product-changed';
  if (t === b) return m === null ? 'local-removed' : 'local-changed';
  if (m === null) return 'changed-vs-removed';
  if (t === null) return 'removed-vs-changed';
  return 'both-changed';
}
const ACTION = {
  same: 'none', 'removed-both': 'none',
  'product-changed': 'take', 'product-added': 'take', 'local-removed': 'take', 'changed-vs-removed': 'take',
  'product-removed': 'remove',
  'local-changed': 'keep', 'local-added': 'keep',
  'both-changed': 'merge', 'both-added': 'merge',
  'removed-vs-changed': 'conflict',
};

// Khối chứa tệp (để báo theo khối): đoạn đầu của đường dẫn trong thư mục mã; skill gom thành "skills".
function blockOf(rel) {
  const m = /^\.claude\/modules\/([^/]+)\//.exec(rel);
  if (m) return m[1];
  if (/^\.claude\/skills\//.test(rel)) return 'skills';
  return '(gốc)';
}

// files: { base, mine, theirs }, mỗi thứ là { đường dẫn: dấu }. Trả [{ path, block, state, action }] theo thứ tự đường dẫn, bỏ các tệp 'same'.
function classify({ base = {}, mine = {}, theirs = {} }) {
  const out = [];
  for (const p of [...new Set([...Object.keys(base), ...Object.keys(mine), ...Object.keys(theirs)])].sort()) {
    const state = stateOf(base[p], mine[p], theirs[p]);
    if (state === 'same' || state === 'removed-both') continue;
    out.push({ path: p, block: blockOf(p), state, action: ACTION[state] });
  }
  return out;
}

// Kết quả gộp của một tệp (bên gọi chạy phép gộp ba bên thật): gắn vào mục đã phân loại.
//   merged: { conflicts: số đoạn đụng nhau, broken: lý do bản gộp sạch mà không dùng được (ví dụ mã không qua kiểm cú pháp) | '' }
// Sau khi gắn: clean = gộp xong không cần người; cần người khi còn đoạn đụng nhau, bản gộp hỏng, hoặc tình trạng 'removed-vs-changed'.
function withMerge(item, merged) {
  if (item.action !== 'merge') return { ...item, needsHuman: item.action === 'conflict' };
  const conflicts = (merged && merged.conflicts) || 0;
  const broken = (merged && merged.broken) || '';
  const unmergeable = Boolean(merged && merged.unmergeable);
  return { ...item, conflicts, broken, unmergeable, needsHuman: conflicts > 0 || Boolean(broken) || unmergeable };
}

const LABEL = {
  'product-changed': 'gói sửa, bạn chưa đụng: lấy bản mới',
  'product-added': 'gói thêm: lấy',
  'product-removed': 'gói bỏ, bạn chưa đụng: bỏ theo',
  'local-changed': 'bạn đã sửa, gói không đổi: GIỮ bản của bạn',
  'local-added': 'bạn tự thêm: GIỮ',
  'local-removed': 'bạn đã xóa tệp của gói, gói không đổi: đặt lại',
  'both-changed': 'hai bên cùng sửa: gộp',
  'both-added': 'hai bên cùng thêm: gộp',
  'removed-vs-changed': 'gói BỎ tệp bạn đã sửa: cần bạn quyết (mặc định giữ bản của bạn)',
  'changed-vs-removed': 'bạn đã xóa, gói sửa: lấy bản mới',
};

// Báo cáo cho người đọc. items đã qua withMerge. Trả mảng dòng.
function report({ from, to, items, exportsNote = '' }) {
  const lines = [`Nâng cấp từ bản ${from} lên bản ${to}.`];
  const yours = items.filter((i) => ['local-changed', 'local-added', 'both-changed', 'both-added', 'removed-vs-changed', 'local-removed', 'changed-vs-removed'].includes(i.state));
  const human = items.filter((i) => i.needsHuman);
  const merged = items.filter((i) => i.action === 'merge' && !i.needsHuman);
  lines.push(`Gói đổi ${items.filter((i) => !['local-changed', 'local-added'].includes(i.state)).length} tệp; phần của bạn (đã sửa hoặc tự thêm) ${yours.length} tệp; trong đó gộp sạch ${merged.length}, CẦN BẠN XEM ${human.length}.`);
  const blocks = [...new Set(items.map((i) => i.block))].sort();
  for (const b of blocks) {
    const of = items.filter((i) => i.block === b);
    const count = (s) => of.filter((i) => i.state === s).length;
    const parts = STATES.filter((s) => count(s)).map((s) => `${count(s)} ${s}`);
    lines.push('', `Khối ${b}: ${of.length} tệp (${parts.join(', ')})`);
    for (const i of of.filter((x) => !['product-changed', 'product-added', 'product-removed'].includes(x.state))) {
      let tail = '';
      if (i.action === 'merge') tail = i.unmergeable ? ' -> KHÔNG gộp tự động được (tệp không phải văn bản hoặc quá lớn)' : i.conflicts ? ` -> ${i.conflicts} đoạn ĐỤNG NHAU` : i.broken ? ` -> gộp sạch nhưng HỎNG: ${i.broken}` : ' -> gộp sạch';
      lines.push(`  - ${i.path}: ${LABEL[i.state]}${tail}`);
    }
    const quiet = of.filter((x) => ['product-changed', 'product-added', 'product-removed'].includes(x.state)).length;
    if (quiet) lines.push(`  - và ${quiet} tệp gói đổi mà bạn chưa đụng (lấy theo gói).`);
  }
  if (exportsNote) lines.push('', exportsNote);
  if (human.length) lines.push('', `CẦN BẠN XEM ${human.length} tệp trước khi nâng cấp:`, ...human.map((i) => `  - ${i.path}`));
  else lines.push('', 'Không tệp nào cần bạn sửa tay.');
  return lines;
}

module.exports = { classify, stateOf, withMerge, report, blockOf, STATES, ACTION, LABEL };
