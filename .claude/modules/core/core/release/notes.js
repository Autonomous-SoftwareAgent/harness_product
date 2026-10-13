'use strict';
// spec: HOOK-S-014
// SỔ PHÁT HÀNH của gói sản phẩm: đọc và kiểm tệp RELEASES.md. Hàm thuần: nhận chữ, trả dữ liệu; không đọc đĩa.
// Khuôn của tệp: mỗi bản một mục cấp hai `## <số bản> (<YYYY-MM-DD>)`, bản mới nhất ở trên; trong mục có đủ các phần cấp ba ở SECTIONS,
// phần nào cũng phải có chữ (không có gì để nói thì ghi "Không có." chứ không bỏ trống: người đọc cần biết là đã xét).
const SECTIONS = ['Có gì mới', 'Hành vi đổi', 'Nâng cấp', 'Đã kiểm', 'Chưa kiểm và giới hạn'];
const HEAD = /^## (\d+\.\d+\.\d+) \((\d{4}-\d{2}-\d{2})\)\s*$/;

function parse(text) {
  const out = [];
  let cur = null;
  let sec = null;
  for (const line of String(text || '').split(/\r?\n/)) {
    const h = HEAD.exec(line);
    if (h) { cur = { version: h[1], date: h[2], sections: {} }; out.push(cur); sec = null; continue; }
    if (/^## /.test(line)) { cur = null; sec = null; continue; }
    if (!cur) continue;
    const s = /^### (.+?)\s*$/.exec(line);
    if (s) { sec = s[1]; cur.sections[sec] = cur.sections[sec] || ''; continue; }
    if (sec) cur.sections[sec] += `${line}\n`;
  }
  return out;
}

const key = (v) => v.split('.').map(Number);
const newer = (a, b) => { const x = key(a); const y = key(b); for (let i = 0; i < 3; i += 1) if (x[i] !== y[i]) return x[i] > y[i]; return false; };

// Trả danh sách lỗi (rỗng là đạt). `version`: số bản sắp đóng gói, phải là mục ĐẦU TIÊN của sổ.
function check(text, version) {
  const errs = [];
  const list = parse(text);
  if (!list.length) return [`sổ phát hành chưa có mục nào theo khuôn "## <số bản> (<YYYY-MM-DD>)"`];
  const seen = new Set();
  list.forEach((r, i) => {
    if (seen.has(r.version)) errs.push(`bản ${r.version} có hai mục`);
    seen.add(r.version);
    if (i > 0 && !newer(list[i - 1].version, r.version)) errs.push(`bản ${r.version} đứng sai chỗ: bản mới hơn phải ở trên`);
    for (const s of SECTIONS) {
      if (!(s in r.sections)) errs.push(`bản ${r.version} thiếu phần "### ${s}"`);
      else if (!r.sections[s].trim()) errs.push(`bản ${r.version}: phần "### ${s}" còn trống`);
    }
  });
  if (version && list[0].version !== version) {
    errs.push(seen.has(version)
      ? `bản ${version} không phải mục đầu của sổ phát hành (đang là ${list[0].version})`
      : `bản ${version} chưa có mục trong sổ phát hành: viết mục "## ${version} (<ngày>)" rồi mới đóng gói`);
  }
  return errs;
}

module.exports = { SECTIONS, parse, check };
