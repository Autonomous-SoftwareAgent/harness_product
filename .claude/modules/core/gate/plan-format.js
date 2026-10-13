'use strict';
// spec: GATE-S-004
// Khuôn kế hoạch chuẩn: hàm thuần, không đọc tệp. Cổng duyệt chỉ mở khi kế hoạch người dùng vừa đồng ý đọc được theo khuôn này;
// sổ phạm vi (hooks/scope-lib.js) lấy danh sách dịch vụ, lý do và phạm vi từ đây để đối soát đăng ký và lần sửa.
//
//   ## Kế hoạch
//   - Dịch vụ: <đơn-vị-a>, <đơn-vị-b>      (hoặc: không)
//   - Lý do: ...
//   - Làm gì: ...
//   - Sửa tệp: ...
//   - Không làm: ...
//   - Rủi ro: ...
//
// Tiêu đề ở cấp nào cũng được (#, ##, ###). Tên mục được in đậm (**Dịch vụ:**), nội dung một mục được kéo dài nhiều dòng (danh sách con).
// Lời giải thích cho người dùng viết tự do ở trên hoặc dưới khối này.
const LABELS = ['Dịch vụ', 'Lý do', 'Làm gì', 'Sửa tệp', 'Không làm', 'Rủi ro'];
const NAME_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const HEAD_RE = /^[ \t]{0,3}#{1,6}[ \t]*Kế hoạch[ \t]*$/im;
const NONE_RE = /^(không|khong|none)$/i;

const EXAMPLE = ['## Kế hoạch', '- Dịch vụ: <tên-dịch-vụ>[, <tên-khác>]   (hoặc: không)', '- Lý do: ...', '- Làm gì: ...', '- Sửa tệp: ...', '- Không làm: ...', '- Rủi ro: ...'].join('\n');

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Dòng mở một mục: "- Dịch vụ: ..." hoặc "- **Dịch vụ:** ..." hoặc "- **Dịch vụ**: ...", đứng ở lề (tối đa 3 dấu cách).
const labelRe = (label) => new RegExp(`^[ \\t]{0,3}[-*][ \\t]+(?:\\*\\*)?${esc(label)}(?:\\*\\*)?[ \\t]*:(?:\\*\\*)?[ \\t]*(.*)$`, 'i');
const oneLine = (s, max) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, max);

// Trả { ok, errors: [chuỗi], services: [tên], reason, scope, block }. services rỗng nghĩa là kế hoạch chỉ đụng phần dùng chung.
function parsePlan(text) {
  const src = String(text || '').replace(/\r\n/g, '\n');
  const head = HEAD_RE.exec(src);
  if (!head) return { ok: false, errors: ['thiếu tiêu đề "## Kế hoạch" (đứng riêng một dòng)'], services: [], reason: '', scope: '', block: '' };
  // Khối kế hoạch: từ tiêu đề tới tiêu đề kế tiếp (bất kỳ cấp nào) hoặc hết tin.
  const after = src.slice(head.index + head[0].length);
  const next = /^[ \t]{0,3}#{1,6}[ \t]+\S/m.exec(after);
  const body = next ? after.slice(0, next.index) : after;
  const lines = body.split('\n');
  const found = {};
  let cur = null;
  for (const line of lines) {
    const hit = LABELS.map((l) => [l, labelRe(l).exec(line)]).find(([, m]) => m);
    if (hit) { cur = hit[0]; if (!(cur in found)) found[cur] = hit[1][1]; else cur = null; continue; }
    if (cur) found[cur] += `\n${line}`;
  }
  const errors = [];
  const missing = LABELS.filter((l) => !(l in found));
  if (missing.length) errors.push(`thiếu mục: ${missing.join(', ')}`);
  const empty = LABELS.filter((l) => l in found && !oneLine(found[l], 10));
  if (empty.length) errors.push(`mục để trống: ${empty.join(', ')}`);
  let services = [];
  if ('Dịch vụ' in found) {
    // Lấy dòng đầu của mục, bỏ phần chú thích trong ngoặc và dấu định dạng.
    const raw = found['Dịch vụ'].split('\n')[0].replace(/\([^)]*\)/g, ' ').replace(/[`*]/g, '').trim().replace(/[.;]+$/, '');
    if (raw && !NONE_RE.test(raw)) {
      services = [...new Set(raw.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean))];
      const bad = services.filter((s) => !NAME_RE.test(s));
      if (bad.length) errors.push(`mục "Dịch vụ" phải là tên dịch vụ cách nhau bằng dấu phẩy (chữ thường, số, gạch ngang) hoặc chữ "không"; không đọc được: ${bad.slice(0, 5).join(', ')}`);
    }
  }
  const block = `${head[0].trim()}\n${body.trim()}`;
  return { ok: errors.length === 0, errors, services: errors.length ? [] : services, reason: oneLine(found['Lý do'], 300), scope: oneLine(found['Sửa tệp'], 500), block };
}

module.exports = { parsePlan, LABELS, EXAMPLE, NAME_RE };
