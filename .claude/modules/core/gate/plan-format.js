'use strict';
// spec: GATE-S-004
// spec: GATE-S-008
// Khuôn kế hoạch chuẩn. Cổng duyệt chỉ mở khi kế hoạch người dùng vừa đồng ý đọc được theo khuôn này; sổ phạm vi lấy danh sách
// dịch vụ, việc làm và phạm vi từ đây để đối soát đăng ký và lần sửa.
//
//   ## Kế hoạch
//   - Dịch vụ: <đơn-vị-a>, <đơn-vị-b>      (hoặc: không)
//   - Làm gì: ...
//   - Sửa tệp: ...
//   - Không làm: ...
//   - Rủi ro: ...
//
// Hai mức lỗi. NGHIÊM TRỌNG (lời đồng ý không mở cổng): thiếu tiêu đề, thiếu hẳn hoặc để trống một mục, mục "Dịch vụ" không đọc được, thiếu
// mục bắt buộc thêm. Với lỗi về mục, cổng chỉ đòi viết thêm ĐÚNG mục thiếu (mergeAddendum ghép vào kế hoạch cũ), không đòi viết lại cả kế hoạch.
// NHẸ (cho qua, không báo): thiếu dấu tiếng Việt, hoa thường, gạch đầu dòng hay số thứ tự hay không có, in đậm hay không, thứ tự mục, cấp tiêu đề
// hay tiêu đề in đậm, dấu hai chấm thay bằng gạch ngang, khoảng trắng, dấu chấm cuối.
// Nội dung một mục được kéo dài nhiều dòng (danh sách con). Lời giải thích cho người dùng viết tự do ở trên hoặc dưới khối này.
//
// KHUÔN KHAI ĐƯỢC, CHỈ CHẶT HƠN. Dự án khai trong cấu hình cổng duyệt (khóa `plan`), một đơn vị khai trong khối mở rộng ĐÃ ĐƯỢC NGƯỜI DÙNG
// XÁC NHẬN của nó (module.json, khóa `plan`):
//   { "heading": ["Plan"], "labels": { "Dịch vụ": ["Service"], ... }, "extra": ["Kiểm thử"] }
//   heading  tên gọi khác của tiêu đề          labels  tên gọi khác của năm mục gốc          extra  mục BẮT BUỘC thêm
// Không có khóa nào bớt được một mục hay làm một mục thành tùy chọn: năm mục gốc luôn bắt buộc. Khai hỏng thì bỏ đúng phần hỏng.
// Mục thêm của một đơn vị chỉ đòi khi kế hoạch nêu đơn vị đó ở mục "Dịch vụ".
// parsePlanWith(text, opts) là hàm thuần; parsePlan(text) dùng khuôn của dự án đang chạy (đọc một lần cho mỗi tiến trình).
const fs = require('node:fs');
const path = require('node:path');

const LABELS = ['Dịch vụ', 'Làm gì', 'Sửa tệp', 'Không làm', 'Rủi ro'];
const HEADING = 'Kế hoạch';
const NAME_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const NONE_RE = /^(không|khong|none)$/i;
const MAX = { heading: 5, alias: 5, extra: 10, chars: 40 };

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const key = (s) => String(s).normalize('NFC').trim().toLowerCase();
// Một tên mục hay tên tiêu đề hợp lệ: một dòng ngắn, không chứa ký tự mà khuôn dùng làm dấu (dấu hai chấm, dấu sao, dấu thăng, dấu huyền).
const cleanName = (v) => {
  if (typeof v !== 'string') return '';
  const s = v.normalize('NFC').trim();
  return s && s.length <= MAX.chars && !/[:*#`\r\n]/.test(s) ? s : '';
};

// Đưa khai báo thô (của dự án, hoặc của một đơn vị) về dạng dùng được. Tên trùng nhau (không phân biệt hoa thường) thì giữ tên khai trước;
// tên gọi khác trùng với tên gốc của mục KHÁC bị bỏ (không thì một dòng tính được cho hai mục).
function normalizeOptions(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const taken = new Set(LABELS.map(key));
  const list = (v, max) => {
    const out = [];
    for (const x of Array.isArray(v) ? v : []) {
      const name = cleanName(x);
      if (!name || taken.has(key(name)) || out.length >= max) continue;
      taken.add(key(name));
      out.push(name);
    }
    return out;
  };
  const headingTaken = new Set([key(HEADING)]);
  const heading = [];
  for (const x of Array.isArray(src.heading) ? src.heading : []) {
    const name = cleanName(x);
    if (!name || headingTaken.has(key(name)) || heading.length >= MAX.heading) continue;
    headingTaken.add(key(name));
    heading.push(name);
  }
  const labels = {};
  const rawLabels = src.labels && typeof src.labels === 'object' && !Array.isArray(src.labels) ? src.labels : {};
  for (const l of LABELS) labels[l] = list(rawLabels[l], MAX.alias);
  const extra = list(src.extra, MAX.extra);
  return { heading, labels, extra, unitExtra: {} };
}
const DEFAULT_OPTIONS = normalizeOptions(null);

// Khối mẫu in cho phiên khi kế hoạch sai khuôn: năm mục gốc, rồi các mục dự án đòi thêm.
function example(opts = DEFAULT_OPTIONS) {
  return [`## ${HEADING}`, '- Dịch vụ: <tên-dịch-vụ>[, <tên-khác>]   (hoặc: không)', '- Làm gì: ...', '- Sửa tệp: ...', '- Không làm: ...', '- Rủi ro: ...',
    ...opts.extra.map((l) => `- ${l}: ...`)].join('\n');
}

// So tên không phân biệt dấu: bỏ dấu từng ký tự (giữ nguyên độ dài chuỗi, ký tự ngoài mặt phẳng cơ bản giữ nguyên) để vị trí khớp với chuỗi gốc.
const plain = (s) => Array.from(String(s)).map((c) => (c.length > 1 ? c : c === 'đ' ? 'd' : c === 'Đ' ? 'D' : c.normalize('NFD')[0])).join('');
const names = (list) => list.map((n) => esc(plain(n))).join('|');
// Dòng mở một mục: gạch đầu dòng, số thứ tự hay không có gì; tên mục in đậm hay không; dấu hai chấm hoặc gạch ngang.
const labelRe = (list) => new RegExp(`^[ \\t]{0,3}(?:[-*+]|\\d+[.)])?[ \\t]*(?:\\*\\*)?(?:${names(list)})(?:\\*\\*)?[ \\t]*(?::|[-–—])(?:\\*\\*)?[ \\t]*(.*)$`, 'i');
// Dòng tiêu đề: có hay không dấu thăng (cấp nào cũng được), in đậm hay không, dấu hai chấm cuối nếu có; cả dòng chỉ có tên tiêu đề.
const headRe = (opts) => new RegExp(`^[ \\t]{0,3}(?:#{1,6}[ \\t]*)?(?:\\*\\*)?(?:${names([HEADING, ...opts.heading])})(?:\\*\\*)?[ \\t]*:?[ \\t]*(?:\\*\\*)?[ \\t]*$`, 'i');
const NEXT_HEADING = /^[ \t]{0,3}#{1,6}[ \t]+\S/;
const oneLine = (s, max) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, max);

// Các mục có thể xuất hiện: năm mục gốc (kèm tên gọi khác), mục thêm của dự án, và mục thêm của mọi đơn vị (đòi hay không thì xét sau,
// khi đã biết kế hoạch nêu đơn vị nào).
function fieldsOf(opts) {
  const unitLabels = [...new Set(Object.values(opts.unitExtra || {}).flat())];
  return [...LABELS.map((l) => [l, [l, ...opts.labels[l]]]), ...[...opts.extra, ...unitLabels.filter((l) => !opts.extra.some((e) => key(e) === key(l)))].map((l) => [l, [l]])]
    .map(([name, list]) => ({ name, re: labelRe(list) }));
}

// Đọc các dòng thành { mục: nội dung } (nội dung có thể nhiều dòng). stopAtBlank: nội dung dừng ở dòng trống (cho đoạn bổ sung ngắn).
function scan(lines, opts, { stopAtBlank = false } = {}) {
  const fields = fieldsOf(opts);
  const found = {};
  let cur = null;
  for (const line of lines) {
    const flat = plain(line);
    const hit = fields.map((f) => [f.name, f.re.exec(flat)]).find(([, m]) => m);
    if (hit) { cur = hit[0]; if (!(cur in found)) found[cur] = line.slice(flat.length - hit[1][1].length); else cur = null; continue; }
    if (cur) { if (stopAtBlank && !line.trim()) { cur = null; continue; } found[cur] += `\n${line}`; }
  }
  return found;
}

// Tiêu đề kế hoạch và phạm vi khối của nó trong danh sách dòng: { hi, end } hoặc null.
function locate(lines, opts) {
  const re = headRe(opts);
  const hi = lines.findIndex((l) => re.test(plain(l)));
  if (hi < 0) return null;
  let end = lines.length;
  for (let i = hi + 1; i < lines.length; i += 1) if (NEXT_HEADING.test(lines[i])) { end = i; break; }
  return { hi, end };
}

// Trả { ok, errors, fix, headingOk, services, reason, scope, block, extra }.
//   fix: tên các mục phải viết thêm hoặc sửa (thiếu, để trống, "Dịch vụ" không đọc được, mục bắt buộc thêm); rỗng khi lỗi không sửa theo từng mục được.
//   reason: dòng đầu của mục "Làm gì" (tóm tắt việc sẽ làm; sổ phạm vi ghi vào cột lý do). services rỗng nghĩa là kế hoạch chỉ đụng phần dùng chung.
function parsePlanWith(text, options) {
  const opts = options || DEFAULT_OPTIONS;
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const loc = locate(lines, opts);
  if (!loc) return { ok: false, errors: [`thiếu tiêu đề "## ${HEADING}" (đứng riêng một dòng)`], fix: [], headingOk: false, services: [], reason: '', scope: '', block: '', extra: {} };
  const bodyLines = lines.slice(loc.hi + 1, loc.end);
  const found = scan(bodyLines, opts);
  const errors = [];
  const fix = [];
  const missing = LABELS.filter((l) => !(l in found));
  const empty = LABELS.filter((l) => l in found && !oneLine(found[l], 10));
  if (missing.length) { errors.push(`thiếu mục: ${missing.join(', ')}`); fix.push(...missing); }
  if (empty.length) { errors.push(`mục để trống: ${empty.join(', ')}`); fix.push(...empty); }
  let services = [];
  if ('Dịch vụ' in found) {
    // Lấy dòng đầu của mục, bỏ phần chú thích trong ngoặc và dấu định dạng.
    const raw = found['Dịch vụ'].split('\n')[0].replace(/\([^)]*\)/g, ' ').replace(/[`*]/g, '').trim().replace(/[.;]+$/, '');
    if (raw && !NONE_RE.test(raw)) {
      services = [...new Set(raw.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean))];
      const bad = services.filter((s) => !NAME_RE.test(s));
      if (bad.length) { errors.push(`mục "Dịch vụ" phải là tên dịch vụ cách nhau bằng dấu phẩy (chữ thường, số, gạch ngang) hoặc chữ "không"; không đọc được: ${bad.slice(0, 5).join(', ')}`); if (!fix.includes('Dịch vụ')) fix.push('Dịch vụ'); }
    }
  }
  // Mục bắt buộc thêm: của dự án (luôn đòi), và của từng đơn vị mà kế hoạch nêu tên.
  const need = [...opts.extra.map((l) => ({ label: l, by: '' }))];
  for (const s of services) for (const l of (opts.unitExtra || {})[s] || []) if (!need.some((n) => key(n.label) === key(l))) need.push({ label: l, by: s });
  const show = (n) => (n.by ? `${n.label} (đơn vị ${n.by} đòi)` : n.label);
  const missingExtra = need.filter((n) => !(n.label in found));
  if (missingExtra.length) { errors.push(`thiếu mục bắt buộc thêm: ${missingExtra.map(show).join(', ')}`); fix.push(...missingExtra.map((n) => n.label)); }
  const emptyExtra = need.filter((n) => n.label in found && !oneLine(found[n.label], 10));
  if (emptyExtra.length) { errors.push(`mục bắt buộc thêm để trống: ${emptyExtra.map(show).join(', ')}`); fix.push(...emptyExtra.map((n) => n.label)); }
  const block = `${lines[loc.hi].trim()}\n${bodyLines.join('\n').trim()}`;
  const extra = Object.fromEntries(need.filter((n) => n.label in found).map((n) => [n.label, oneLine(found[n.label], 500)]));
  return { ok: errors.length === 0, errors, fix: [...new Set(fix)], headingOk: true, services: errors.length ? [] : services, reason: oneLine(String(found['Làm gì'] || '').split('\n')[0], 300), scope: oneLine(found['Sửa tệp'], 500), block, extra };
}

// Ghép phần bổ sung vào kế hoạch cũ: `addendum` là tin ngắn của model chỉ có các dòng của đúng các mục trong `fix`. Các dòng cũ của mục đó
// (nếu có) bị bỏ, dòng mới chèn vào cuối khối kế hoạch. Trả kế hoạch đã ghép, hoặc null nếu phần bổ sung không đủ mục hay ghép xong vẫn không đọc được.
function mergeAddendum(base, addendum, fix, options) {
  const opts = options || DEFAULT_OPTIONS;
  const want = (fix || []).filter(Boolean);
  if (!want.length) return null;
  const lines = String(base || '').replace(/\r\n/g, '\n').split('\n');
  const loc = locate(lines, opts);
  if (!loc) return null;
  const add = scan(String(addendum || '').replace(/\r\n/g, '\n').split('\n'), opts, { stopAtBlank: true });
  if (want.some((l) => !(l in add) || !oneLine(add[l], 10))) return null;
  const fields = fieldsOf(opts);
  const kept = [];
  let skipping = false;
  for (const line of lines.slice(loc.hi + 1, loc.end)) {
    const flat = plain(line);
    const hit = fields.find((f) => f.re.test(flat));
    if (hit) skipping = want.includes(hit.name);
    if (!skipping) kept.push(line);
  }
  while (kept.length && !kept[kept.length - 1].trim()) kept.pop();
  const inserted = want.map((l) => `- ${l}: ${add[l].trim()}`);
  const merged = [...lines.slice(0, loc.hi + 1), ...kept, ...inserted, ...lines.slice(loc.end)].join('\n');
  return parsePlanWith(merged, opts).ok ? merged : null;
}

// Khuôn của dự án đang chạy: khóa `plan` trong cấu hình cổng duyệt, cộng mục thêm của từng đơn vị lấy từ BẢN ĐÃ XÁC NHẬN của khối mở rộng
// của đơn vị đó (chỉ người dùng ghi được chỗ này, nên phiên không tự bớt hay tự thêm được). Không đọc được gì thì là khuôn gốc.
function loadOptions(root) {
  const paths = require('./gate-paths');
  const base = root || paths.rootFrom(__dirname);
  const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };
  const cfg = readJson(paths.configPath(base));
  const opts = normalizeOptions(cfg && cfg.plan);
  let dirs = [];
  try { dirs = fs.readdirSync(paths.trustDir(base), { withFileTypes: true }).filter((d) => d.isDirectory() && d.name.startsWith('unit-')).map((d) => d.name); } catch { /* chưa có khối nào được xác nhận */ }
  for (const d of dirs.sort()) {
    const unit = d.slice('unit-'.length);
    const man = readJson(path.join(paths.trustDir(base), d, 'module.json'));
    if (!NAME_RE.test(unit) || !man || !man.plan) continue;
    // Đơn vị chỉ được ĐÒI THÊM mục; tên gọi khác và tiêu đề là việc của dự án.
    const extra = normalizeOptions({ extra: man.plan.extra }).extra;
    if (extra.length) opts.unitExtra[unit] = extra;
  }
  return opts;
}

let cached = null;
const currentOptions = () => { if (!cached) { try { cached = loadOptions(); } catch { cached = DEFAULT_OPTIONS; } } return cached; };
const parsePlan = (text) => parsePlanWith(text, currentOptions());
const mergeAddendumNow = (base, addendum, fix) => mergeAddendum(base, addendum, fix, currentOptions());

module.exports = {
  parsePlan, parsePlanWith, mergeAddendum: mergeAddendumNow, mergeAddendumWith: mergeAddendum, normalizeOptions, loadOptions, example, LABELS, HEADING, NAME_RE, currentOptions,
  // Khối mẫu của dự án đang chạy (dự án không khai mục thêm thì đúng bằng khối gốc).
  get EXAMPLE() { return example(currentOptions()); },
};
