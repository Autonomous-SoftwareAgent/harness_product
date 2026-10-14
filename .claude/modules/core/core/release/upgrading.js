'use strict';
// spec: HOOK-S-014
// BÁO CÁO NÂNG CẤP cho NGƯỜI dùng gói (tệp UPGRADING.md ở gốc gói). Sinh từ sổ phát hành (RELEASES.md, viết cho người) và các tờ thay đổi
// (releases/<bản>.json, cho máy), không ai viết tay: người đang ở bản cũ đọc một tệp là biết mỗi bản sau bản mình cần làm gì, có công cụ hay khóa
// nào bị bỏ, hành vi nào sẽ khác, điều gì chưa kiểm; không phải đọc git diff hay ghép từng mục của sổ phát hành.
// Hàm thuần: nhận dữ liệu đã đọc, trả chữ; không đọc đĩa.
const cmp = (a, b) => { const x = String(a).split('.').map(Number); const y = String(b).split('.').map(Number); for (let i = 0; i < 3; i += 1) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; } return 0; };

const list = (v) => (Array.isArray(v) ? v : []);
const clean = (s) => String(s || '').trim();
const oneLine = (s) => clean(s).replace(/\s+/g, ' ');

// Mức việc phải làm của một bản, theo tờ thay đổi của nó. Không có tờ (bản phát hành trước khi có tờ máy đọc) thì nói thẳng là chưa biết bằng máy.
function levelOf(sheet) {
  if (!sheet) return ['xem mục của bản này trong RELEASES.md'];
  const changes = list(sheet.changes);
  const out = [];
  if (changes.some((c) => c.kind === 'removed')) out.push('có công cụ, khóa hay tính năng bị bỏ');
  if (list(sheet.migrations).length || changes.some((c) => list(c.migrations).length)) out.push('chuyển cấu hình (lệnh nâng cấp tự làm)');
  if (changes.some((c) => list(c.decisions).length)) out.push('cần bạn quyết định');
  return out.length ? out : ['không có: nâng cấp như mọi lần'];
}

// Một mục của sổ phát hành -> ba phần người đọc cần ở UPGRADING.md.
const sec = (rel, name) => clean((rel.sections || {})[name]);

function render({ notes = [], sheets = [], current = '' } = {}) {
  const rels = list(notes).slice().sort((a, b) => cmp(b.version, a.version));
  const byVersion = new Map(list(sheets).map((s) => [s.version, s]));
  const latest = current || (rels[0] && rels[0].version) || '';
  const lines = [
    '# Nâng cấp harness: bạn đang ở bản nào, cần làm gì',
    '',
    'Tệp này do lệnh đóng gói sinh ra từ sổ phát hành và các tờ thay đổi, không ai viết tay. Nó trả lời một câu: **tôi đang ở bản X, lên bản mới nhất thì phải làm gì**, không cần đọc git diff.',
    '',
    '## Cách dùng',
    '1. Xem bản bạn đang cài: tệp `.claude/modules/VERSION` trong dự án.',
    `2. Trong bảng dưới, đọc các dòng nằm TRÊN bản của bạn, tới bản mới nhất (${latest || 'bản đang đóng gói'}). Cột "Việc phải làm" nói mỗi bản đòi gì.`,
    '3. Phần "Bị bỏ hoặc đổi tên" liệt kê những thứ bạn có thể đang dùng mà không còn nữa, kèm cái thay thế.',
    '4. Cài bản mới: tải gói này về rồi chạy lại lệnh `install` (xem README.md). Dự án đã cài có thể xem từng mục thay đổi gắn với tình trạng dự án bằng `node .claude/modules/core/cli/cli.js upgrade preview`.',
    '',
    '## Bảng các bản',
    '| Bản | Ngày | Việc phải làm | Tóm tắt |',
    '|---|---|---|---|',
    ...rels.map((r) => {
      const sh = byVersion.get(r.version);
      return `| ${r.version} | ${r.date} | ${levelOf(sh).join('; ')} | ${oneLine(sh && sh.summary).replace(/\|/g, '/') || '(xem mục của bản trong RELEASES.md)'} |`;
    }),
    '',
    '## Bị bỏ hoặc đổi tên',
  ];
  const gone = [];
  for (const r of rels) {
    const sh = byVersion.get(r.version);
    for (const c of list(sh && sh.changes)) {
      if (c.kind === 'removed') gone.push(`- **Bản ${r.version}, bị bỏ:** ${oneLine(c.title)}. Trước: ${oneLine(c.before)}${c.after ? ` Sau: ${oneLine(c.after)}` : ''} ${oneLine(c.impact)}`.trim());
      else if (list(c.migrations).length) gone.push(`- **Bản ${r.version}, đổi:** ${oneLine(c.title)}. Cấu hình của bạn được lệnh nâng cấp chuyển tự động. ${oneLine(c.impact)}`.trim());
    }
  }
  lines.push(...(gone.length ? gone : ['Không có bản nào trong bảng bỏ hay đổi tên thứ gì.']), '', '## Chi tiết từng bản (mới ở trên)');
  for (const r of rels) {
    const sh = byVersion.get(r.version);
    lines.push('', `### ${r.version} (${r.date})`, `- **Mức việc phải làm:** ${levelOf(sh).join('; ')}.`);
    if (sh && sh.summary) lines.push(`- **Tóm tắt:** ${oneLine(sh.summary)}`);
    for (const [name, label] of [['Nâng cấp', 'Việc bạn phải làm'], ['Hành vi đổi', 'Bạn sẽ thấy khác'], ['Chưa kiểm và giới hạn', 'Chưa kiểm và giới hạn']]) {
      const text = sec(r, name);
      if (text) lines.push('', `**${label}**`, '', text);
    }
  }
  return `${lines.join('\n')}\n`;
}

module.exports = { render, levelOf, cmp };
