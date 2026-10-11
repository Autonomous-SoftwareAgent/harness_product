'use strict';
// spec: MCP-S-003
// Gọn docs/agent/STATUS.md của một dịch vụ: chuyển các dòng nhật ký CŨ sang docs/agent/STATUS-archive.md. Không xóa gì.
// STATUS.md được agent đọc đầu mỗi phiên; nhật ký dài làm tốn ngữ cảnh mà ít khi cần. Chỉ chạy khi được gọi (không tự chạy trong hook).
// Chỉ nhận đúng một định dạng: mục "## Nhật ký" là bảng Markdown hai cột, mỗi dòng bắt đầu bằng "| YYYY-MM-DD |".
// Không nhận ra định dạng thì KHÔNG đổi gì và nói rõ. Hai tệp được ghi trong một giao dịch có khóa của core.
const path = require('path');
const core = require('./core');

const ROW = /^\|\s*\d{4}-\d{2}-\d{2}\s*\|/;

// Hàm thuần: trả { status, archive, moved, kept } hoặc { skipped: lý do }.
function split(statusText, archiveText, { keep = 15, service = '' } = {}) {
  const eol = statusText.includes('\r\n') ? '\r\n' : '\n';
  const lines = statusText.split(/\r?\n/);
  const head = lines.findIndex((l) => /^## Nhật ký\s*$/.test(l));
  if (head < 0) return { skipped: 'không có mục "## Nhật ký"' };
  let end = lines.findIndex((l, i) => i > head && /^## /.test(l));
  if (end < 0) end = lines.length;
  const body = lines.slice(head + 1, end);
  const rowIdx = body.map((l, i) => (ROW.test(l) ? i : -1)).filter((i) => i >= 0);
  if (!rowIdx.length) return { skipped: 'mục nhật ký không phải bảng có dòng "| YYYY-MM-DD | ... |"' };
  // Các dòng nhật ký phải liền nhau (một bảng), nếu không thì định dạng lạ: không đụng.
  if (rowIdx[rowIdx.length - 1] - rowIdx[0] + 1 !== rowIdx.length) return { skipped: 'các dòng nhật ký không liền nhau' };
  if (rowIdx.length <= keep) return { skipped: `nhật ký chỉ có ${rowIdx.length} dòng (giữ tới ${keep})` };
  const rows = rowIdx.map((i) => body[i]);
  // Giữ `keep` dòng MỚI NHẤT theo ngày; cùng ngày thì giữ thứ tự xuất hiện. Dòng được giữ vẫn ở đúng thứ tự cũ trong STATUS.
  const dated = rows.map((text, i) => ({ text, i, date: text.match(/\d{4}-\d{2}-\d{2}/)[0] }));
  const newestFirst = rows.length < 2 || dated[0].date >= dated[dated.length - 1].date;
  const order = [...dated].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (newestFirst ? a.i - b.i : b.i - a.i)));
  const keepSet = new Set(order.slice(0, keep).map((d) => d.i));
  const kept = dated.filter((d) => keepSet.has(d.i)).map((d) => d.text);
  const moved = dated.filter((d) => !keepSet.has(d.i)).map((d) => d.text);
  const note = `Nhật ký cũ hơn: [STATUS-archive.md](STATUS-archive.md) (${(archiveRows(archiveText).length + moved.length)} dòng).`;
  const before = body.slice(0, rowIdx[0]).filter((l) => !/^Nhật ký cũ hơn: /.test(l));
  const after = body.slice(rowIdx[rowIdx.length - 1] + 1).filter((l) => !/^Nhật ký cũ hơn: /.test(l));
  // Thân mới của mục: phần trước bảng (tiêu đề cột), các dòng giữ lại, ghi chú trỏ sang tệp lưu, rồi phần sau bảng (nếu có).
  const newBody = [...before, ...kept, '', note, '', ...after];
  const status = [...lines.slice(0, head + 1), ...newBody, ...lines.slice(end)].join(eol).replace(/(\r?\n){3,}/g, eol + eol).replace(/\s*$/, eol);
  const header = `# STATUS-archive${service ? `: ${service}` : ''}${eol}${eol}Nhật ký cũ chuyển từ STATUS.md bằng \`node .claude/plugin/cli/cli.js status-archive\`. Chỉ thêm, không sửa. Mới nhất ở trên.${eol}${eol}| Ngày | Thay đổi |${eol}|---|---|`;
  const old = archiveRows(archiveText);
  const all = [...moved, ...old].map((text, i) => ({ text, i, date: text.match(/\d{4}-\d{2}-\d{2}/)[0] })).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.i - b.i)).map((d) => d.text);
  const archive = `${header}${eol}${all.join(eol)}${eol}`;
  return { status, archive, moved: moved.length, kept: kept.length };
}

const archiveRows = (text) => (text ? text.split(/\r?\n/).filter((l) => ROW.test(l)) : []);

function run({ keep = 15 } = {}) {
  return core.transaction('status_archive', () => {
    const dir = path.join(core.ROOT, 'docs', 'agent');
    const sp = path.join(dir, 'STATUS.md');
    const ap = path.join(dir, 'STATUS-archive.md');
    if (!core.fileExists(sp)) return `${core.serviceName()}: không có docs/agent/STATUS.md.`;
    const before = core.readText(sp);
    const r = split(before, core.fileExists(ap) ? core.readText(ap) : '', { keep, service: core.serviceName() });
    if (r.skipped) return `${core.serviceName()}: không đổi gì (${r.skipped}).`;
    // Bảo đảm không mất dòng nào: tổng số dòng nhật ký trước và sau phải bằng nhau.
    const total = (t) => archiveRows(t).length;
    const prevArchive = core.fileExists(ap) ? core.readText(ap) : '';
    if (total(before) + total(prevArchive) !== total(r.status) + total(r.archive)) throw new Error('status-archive: số dòng nhật ký trước và sau không khớp, hủy, không ghi gì');
    core.writeText(sp, r.status);
    core.writeText(ap, r.archive);
    return `${core.serviceName()}: đã chuyển ${r.moved} dòng nhật ký cũ sang docs/agent/STATUS-archive.md, giữ ${r.kept} dòng mới nhất. STATUS.md: ${Math.round(Buffer.byteLength(before) / 1024)} KB -> ${Math.round(Buffer.byteLength(r.status) / 1024)} KB.`;
  });
}

module.exports = { split, run };
