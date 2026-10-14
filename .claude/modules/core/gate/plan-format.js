'use strict';
// spec: GATE-S-004
// spec: GATE-S-008
// Khuôn kế hoạch chuẩn. Cổng duyệt chỉ mở khi kế hoạch người dùng vừa đồng ý đọc được theo khuôn này; sổ phạm vi lấy danh sách
// dịch vụ, lý do và phạm vi từ đây để đối soát đăng ký và lần sửa.
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
//
// KHUÔN KHAI ĐƯỢC, CHỈ CHẶT HƠN. Dự án khai trong cấu hình cổng duyệt (khóa `plan`), một đơn vị khai trong khối mở rộng ĐÃ ĐƯỢC NGƯỜI DÙNG
// XÁC NHẬN của nó (module.json, khóa `plan`):
//   { "heading": ["Plan"], "labels": { "Dịch vụ": ["Service"], ... }, "extra": ["Kiểm thử"] }
//   heading  tên gọi khác của tiêu đề          labels  tên gọi khác của sáu mục gốc          extra  mục BẮT BUỘC thêm
// Không có khóa nào bớt được một mục hay làm một mục thành tùy chọn: sáu mục gốc luôn bắt buộc. Khai hỏng thì bỏ đúng phần hỏng.
// Mục thêm của một đơn vị chỉ đòi khi kế hoạch nêu đơn vị đó ở mục "Dịch vụ".
// parsePlanWith(text, opts) là hàm thuần; parsePlan(text) dùng khuôn của dự án đang chạy (đọc một lần cho mỗi tiến trình).
const fs = require('node:fs');
const path = require('node:path');

const LABELS = ['Dịch vụ', 'Lý do', 'Làm gì', 'Sửa tệp', 'Không làm', 'Rủi ro'];
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
  return { heading, labels, extra, unitExtra: {}, strict: src.strict === true };
}
const DEFAULT_OPTIONS = normalizeOptions(null);

// Khối mẫu in cho phiên khi kế hoạch sai khuôn: sáu mục gốc, rồi các mục dự án đòi thêm.
function example(opts = DEFAULT_OPTIONS) {
  return [`## ${HEADING}`, '- Dịch vụ: <tên-dịch-vụ>[, <tên-khác>]   (hoặc: không)', '- Lý do: ...', '- Làm gì: ...', '- Sửa tệp: ...', '- Không làm: ...', '- Rủi ro: ...',
    ...opts.extra.map((l) => `- ${l}: ...`)].join('\n');
}

// Dòng mở một mục: "- Dịch vụ: ..." hoặc "- **Dịch vụ:** ..." hoặc "- **Dịch vụ**: ...", đứng ở lề (tối đa 3 dấu cách).
// Bỏ dấu từng ký tự (giữ nguyên độ dài chuỗi) để so tên mục không phân biệt dấu; đầu dòng là gạch đầu dòng hay số thứ tự đều được, hoặc không có.
const plain = (s) => Array.from(String(s)).map((c) => (c === 'đ' ? 'd' : c === 'Đ' ? 'D' : c.normalize('NFD')[0])).join('');
const labelRe = (names) => new RegExp(`^[ \\t]{0,3}(?:[-*+]|\\d+[.)])?[ \\t]*(?:\\*\\*)?(?:${names.map((n) => esc(plain(n))).join('|')})(?:\\*\\*)?[ \\t]*:(?:\\*\\*)?[ \\t]*(.*)$`, 'i');
const oneLine = (s, max) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, max);

// Trả { ok, errors: [chuỗi], services: [tên], reason, scope, block, extra: { mục: nội dung } }. services rỗng nghĩa là kế hoạch chỉ đụng phần dùng chung.
function parsePlanWith(text, options) {
  const opts = options || DEFAULT_OPTIONS;
  const src = String(text || '').replace(/\r\n/g, '\n');
  const headRe = new RegExp(`^[ \\t]{0,3}#{1,6}[ \\t]*(?:${[HEADING, ...opts.heading].map(esc).join('|')})[ \\t]*$`, 'im');
  const head = headRe.exec(src);
  if (!head) return { ok: false, errors: [`thiếu tiêu đề "## ${HEADING}" (đứng riêng một dòng)`], services: [], reason: '', scope: '', block: '', extra: {} };
  // Khối kế hoạch: từ tiêu đề tới tiêu đề kế tiếp (bất kỳ cấp nào) hoặc hết tin.
  const after = src.slice(head.index + head[0].length);
  const next = /^[ \t]{0,3}#{1,6}[ \t]+\S/m.exec(after);
  const body = next ? after.slice(0, next.index) : after;
  const lines = body.split('\n');
  // Mọi mục có thể xuất hiện: sáu mục gốc (kèm tên gọi khác), mục thêm của dự án, và mục thêm của mọi đơn vị (đòi hay không thì xét sau,
  // khi đã biết kế hoạch nêu đơn vị nào).
  const unitLabels = [...new Set(Object.values(opts.unitExtra || {}).flat())];
  const fields = [...LABELS.map((l) => [l, [l, ...opts.labels[l]]]), ...[...opts.extra, ...unitLabels.filter((l) => !opts.extra.some((e) => key(e) === key(l)))].map((l) => [l, [l]])]
    .map(([name, names]) => ({ name, re: labelRe(names) }));
  const found = {};
  let cur = null;
  for (const line of lines) {
    const flat = plain(line);
    const hit = fields.map((f) => [f.name, f.re.exec(flat)]).find(([, m]) => m);
    if (hit) { cur = hit[0]; if (!(cur in found)) found[cur] = line.slice(flat.length - hit[1][1].length); else cur = null; continue; }
    if (cur) found[cur] += `\n${line}`;
  }
  // Cổng chỉ cần mục "Dịch vụ" (để đăng ký phạm vi); năm mục còn lại thiếu hay trống chỉ là cảnh báo, trừ khi cấu hình đặt plan.strict.
  const errors = [];
  const warnings = [];
  const hardLabels = opts.strict ? LABELS : ['Dịch vụ'];
  const missing = LABELS.filter((l) => !(l in found));
  const empty = LABELS.filter((l) => l in found && !oneLine(found[l], 10));
  const report = (list, msg) => {
    const h = list.filter((l) => hardLabels.includes(l)); const w = list.filter((l) => !hardLabels.includes(l));
    if (h.length) errors.push(`${msg}: ${h.join(', ')}`);
    if (w.length) warnings.push(`${msg}: ${w.join(', ')}`);
  };
  report(missing, 'thiếu mục');
  report(empty, 'mục để trống');
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
  // Mục bắt buộc thêm: của dự án (luôn đòi), và của từng đơn vị mà kế hoạch nêu tên.
  const need = [...opts.extra.map((l) => ({ label: l, by: '' }))];
  for (const s of services) for (const l of (opts.unitExtra || {})[s] || []) if (!need.some((n) => key(n.label) === key(l))) need.push({ label: l, by: s });
  const show = (n) => (n.by ? `${n.label} (đơn vị ${n.by} đòi)` : n.label);
  const missingExtra = need.filter((n) => !(n.label in found));
  if (missingExtra.length) errors.push(`thiếu mục bắt buộc thêm: ${missingExtra.map(show).join(', ')}`);
  const emptyExtra = need.filter((n) => n.label in found && !oneLine(found[n.label], 10));
  if (emptyExtra.length) errors.push(`mục bắt buộc thêm để trống: ${emptyExtra.map(show).join(', ')}`);
  const block = `${head[0].trim()}\n${body.trim()}`;
  const extra = Object.fromEntries(need.filter((n) => n.label in found).map((n) => [n.label, oneLine(found[n.label], 500)]));
  return { ok: errors.length === 0, errors, warnings, services: errors.length ? [] : services, reason: oneLine(found['Lý do'], 300), scope: oneLine(found['Sửa tệp'], 500), block, extra };
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
// Nhận kế hoạch dạng DỮ LIỆU và trả khối chuẩn đã dựng sẵn (công cụ plan_draft). Người viết chỉ điền nội dung, không gõ tên mục, nên sai khuôn
// không xảy ra; lỗi nội dung (mục trống, đơn vị không có thật, thiếu mục bắt buộc thêm) trả về ngay, trước khi có tin kế hoạch nào.
//   input: { services: [tên] | "a, b" | [] | "không", reason, work, files, skip, risks, extra: { <mục thêm>: nội dung } }
//   known: danh sách tên đơn vị có thật (rỗng hoặc bỏ trống thì chỉ kiểm dạng tên, không kiểm có thật)
const DRAFT_MAX = 1500;
const squash = (s) => String(s || '').replace(/\s+/g, ' ').trim();
function draftPlan(input, options, known) {
  const opts = options || DEFAULT_OPTIONS;
  const src = input && typeof input === 'object' ? input : {};
  const errors = [];
  const text = (v) => (Array.isArray(v) ? v.map((x) => squash(x)).filter(Boolean).join('; ') : squash(v));
  const fields = [['Lý do', 'reason'], ['Làm gì', 'work'], ['Sửa tệp', 'files'], ['Không làm', 'skip'], ['Rủi ro', 'risks']];
  const body = {};
  for (const [label, name] of fields) {
    const v = text(src[name]);
    if (!v) errors.push(`thiếu "${name}" (mục "${label}")`);
    else if (v.length > DRAFT_MAX) errors.push(`"${name}" dài ${v.length} ký tự, tối đa ${DRAFT_MAX}: viết gọn lại`);
    else body[label] = v;
  }
  if (src.services == null) errors.push('thiếu "services" (mục "Dịch vụ"; không đụng đơn vị nào thì truyền [])');
  const rawSvc = Array.isArray(src.services) ? src.services : String(src.services == null ? '' : src.services).split(/[,\s]+/);
  let services = [...new Set(rawSvc.map((x) => String(x).trim()).filter(Boolean))];
  if (services.length === 1 && NONE_RE.test(services[0])) services = [];
  const bad = services.filter((x) => !NAME_RE.test(x));
  if (bad.length) errors.push(`tên đơn vị không đọc được: ${bad.slice(0, 5).join(', ')} (chữ thường, số, gạch ngang)`);
  const list = Array.isArray(known) ? known : [];
  const unknown = list.length ? services.filter((x) => NAME_RE.test(x) && !list.includes(x)) : [];
  if (unknown.length) errors.push(`đơn vị không có thật: ${unknown.join(', ')} (có: ${list.join(', ')})`);
  const rawExtra = src.extra && typeof src.extra === 'object' && !Array.isArray(src.extra) ? src.extra : {};
  const need = [...opts.extra];
  for (const s of services) for (const l of (opts.unitExtra || {})[s] || []) if (!need.some((n) => key(n) === key(l))) need.push(l);
  const extraLines = [];
  for (const l of need) {
    const hit = Object.keys(rawExtra).find((k) => key(k) === key(l));
    const v = hit ? text(rawExtra[hit]) : '';
    if (!v) errors.push(`thiếu mục bắt buộc thêm "${l}" (truyền trong "extra")`);
    else extraLines.push(`- ${l}: ${v}`);
  }
  if (errors.length) return { ok: false, errors, block: '', services: [] };
  const block = [`## ${HEADING}`, `- Dịch vụ: ${services.length ? services.join(', ') : 'không'}`, ...LABELS.slice(1).map((l) => `- ${l}: ${body[l]}`), ...extraLines].join('\n');
  // Đối chiếu ngược: khối dựng ra phải đọc được theo đúng khuôn mà cổng dùng; lệch là lỗi của công cụ, không phải của người viết.
  const back = parsePlanWith(block, opts);
  if (!back.ok) return { ok: false, errors: [`khối dựng ra không đọc được theo khuôn (lỗi của công cụ): ${back.errors.join('; ')}`], block: '', services: [] };
  return { ok: true, errors: [], block, services };
}

// Tin có tiêu đề kế hoạch đứng riêng một dòng hay không (không xét nội dung).
function hasHeading(text, options) {
  const opts = options || DEFAULT_OPTIONS;
  const re = new RegExp(`^[ \\t]{0,3}#{1,6}[ \\t]*(?:${[HEADING, ...opts.heading].map(esc).join('|')})[ \\t]*$`, 'im');
  return re.test(String(text || '').replace(/\r\n/g, '\n'));
}
// Tin có dán NGUYÊN khối do draftPlan dựng (so sau khi gộp khoảng trắng) hay không.
const usesDraft = (reply, blocks) => { const r = squash(reply); return (blocks || []).some((b) => b && r.includes(squash(b))); };

// Chế độ lưới cuối lượt, khóa `plan.draft` của cấu hình cổng duyệt: "off" (mặc định, không giữ lượt) hoặc "block" (giữ lượt một lần khi kế hoạch không do plan_draft dựng).
function draftMode(root) {
  try {
    const paths = require('./gate-paths');
    const cfg = JSON.parse(fs.readFileSync(paths.configPath(root || paths.rootFrom(__dirname)), 'utf8'));
    return cfg && cfg.plan && cfg.plan.draft === 'block' ? 'block' : 'off';
  } catch { return 'off'; }
}

let cached = null;
const currentOptions = () => { if (!cached) { try { cached = loadOptions(); } catch { cached = DEFAULT_OPTIONS; } } return cached; };
const parsePlan = (text) => parsePlanWith(text, currentOptions());

module.exports = {
  parsePlan, parsePlanWith, normalizeOptions, loadOptions, example, LABELS, HEADING, NAME_RE, draftPlan, hasHeading, usesDraft, draftMode, squash, currentOptions,
  // Khối mẫu của dự án đang chạy (dự án không khai mục thêm thì đúng bằng khối gốc).
  get EXAMPLE() { return example(currentOptions()); },
};
