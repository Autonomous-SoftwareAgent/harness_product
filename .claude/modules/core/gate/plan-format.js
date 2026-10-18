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
// Tên gọi khác CÓ SẴN của các mục và của tiêu đề (cách người ta hay viết): không cần khai gì, ai viết kiểu nào cũng được miễn đủ năm thông tin.
const SYNONYMS = {
  'Dịch vụ': ['Đơn vị', 'Service', 'Services', 'Unit', 'Units'],
  'Làm gì': ['Việc làm', 'Việc sẽ làm', 'What'],
  'Sửa tệp': ['Tệp sửa', 'Tệp sẽ sửa', 'Tệp thay đổi', 'Sửa file', 'Files changed', 'Files', 'File', 'Tệp'],
  'Không làm': ['Ngoài phạm vi', 'Không bao gồm', 'Không đụng', 'Out of scope', 'Not doing', 'Non-goals'],
  'Rủi ro': ['Risks', 'Risk'],
};
const HEADING_SYNONYMS = ['Plan'];
// Mục TÙY CHỌN "Ủy quyền": kế hoạch cho phép phiên này duyệt thay người dùng kế hoạch của các phiên do chính nó tạo ra. Không nằm trong năm mục gốc, nhưng cổng
// phải nhận ra nó (không thì dòng này bị coi là phần đuôi của mục trước). Thiếu thì chỉ bị đòi khi kế hoạch nói sẽ mở phiên khác (xem spawnsSessions).
const DELEG = 'Ủy quyền';
const DELEG_NAMES = ['Uỷ quyền', 'Ủy quyền duyệt', 'Delegation', 'Delegate', 'Approval delegation', 'Duyệt thay'];
// Kế hoạch nói sẽ mở hay tạo phiên khác (so trên chữ đã bỏ dấu, chữ thường). Phủ định ("không mở phiên") không tính; "phiên bản" không phải phiên.
const SPAWN_RE = /(?<!khong )(?<!chua )(?<!dung )\b(?:mo|tao|khoi tao|khoi dong|giao viec (?:cho|sang)|spawn|create|open|start|launch)\b[^.\n;]{0,40}?\b(?:phien(?! ban)|session)\b|\bphien nen\b|\bremote control\b|\bbackground session\b|\bsession_(?:transfer|spawn)\b|\bsession\.js new\b/i;
const OFF_RE = /^(?:khong|none|no|n\/a|na|off|tat)(?![a-z0-9_])/;
// Mục TÙY CHỌN "Được làm": việc rủi ro mà kế hoạch cho phép (đọc từ dòng này, không đoán từ văn của "Làm gì"). Với ủy quyền, đây là giới hạn
// việc của các phiên làm thay. Không có dòng thì mặc định chỉ sửa tệp và commit ở máy.
const ALLOW = 'Được làm';
const ALLOW_NAMES = ['Được phép', 'Cho phép', 'Allowed', 'Allow'];
const ACTIONS = [
  ['commit', /\bcommit\b/],
  ['push', /\b(?:day|push|dua len)\b/],
  ['tag', /\b(?:gan nhan|tag|release)\b/],
  ['deploy', /\b(?:deploy|trien khai)\b/],
  ['rollback', /\b(?:rollback|quay lui)\b/],
  ['delete', /\b(?:xoa|delete|rm)\b/],
  ['overwrite', /\b(?:ghi de|overwrite|force)\b/],
  ['gate', /\b(?:sua cong duyet|cong duyet|gate)\b/],
  ['create', /\b(?:tao repo|tao kho|create repo|create)\b/],
  ['admin', /\b(?:quan tri|admin|administration)\b/],
];
// Mục TÙY CHỌN "GitHub": đối tượng trên GitHub mà kế hoạch được chạm ngoài repo của các đơn vị ở mục Dịch vụ: repo "chủ/tên" (hay địa chỉ
// đầy đủ), tổ chức "org:<tên>", tài khoản "tài khoản" (hay "account"). Việc được làm trên chúng do dòng "Được làm" quyết.
const GITHUB = 'GitHub';
const GITHUB_NAMES = ['Github', 'Đối tượng GitHub', 'Repo GitHub'];
function githubOf(found) {
  if (!(GITHUB in found)) return { present: false, repos: [], orgs: [], account: false, unknown: [], text: '' };
  const text = oneLine(found[GITHUB], 500);
  const repos = []; const orgs = []; const unknown = []; let account = false;
  for (const raw of text.split(/[,;\s]+/).map((s) => s.replace(/^[`'"]+|[`'".]+$/g, '')).filter(Boolean)) {
    const item = raw.replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/\/+$/, '');
    const flat = plain(item).toLowerCase();
    if (/^(?:tai|khoan|account|user)$/.test(flat) || flat === 'tai khoan') { if (flat !== 'tai') account = true; continue; }
    const org = /^(?:org|to-chuc|tochuc):([A-Za-z0-9][A-Za-z0-9-]{0,38})$/i.exec(item);
    if (org) { orgs.push(org[1].toLowerCase()); continue; }
    if (/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100}$/.test(item)) { repos.push(item.toLowerCase()); continue; }
    if (/^(?:va|and|cung|cua)$/.test(flat)) continue;
    unknown.push(raw);
  }
  if (/\btai khoan\b/.test(plain(text).toLowerCase())) account = true;
  return { present: true, repos: [...new Set(repos)], orgs: [...new Set(orgs)], account, unknown, text };
}
const ACTION_KEYS = ACTIONS.map(([k]) => k);
const DEFAULT_ACTIONS = ['commit'];
const HOURS = /(\d{1,3})\s*(?:h|gio|hours?)(?![a-z])/;
// Dài trước, ngắn sau: "Tệp sửa" phải thử trước "Tệp".
const names = (list) => [...list].sort((a, b) => b.length - a.length).map((n) => esc(plain(n))).join('|');
const WORD_END = '(?![a-z0-9_])';
const BOLD = '(?:\\*\\*|__)';
// Phần đứng giữa tên mục và dấu phân cách: chú thích trong ngoặc, hoặc vài chữ ("Sửa tệp nào", "Rủi ro / giả định").
const QUAL = '(?:[ \\t]*\\([^)\\n]{0,40}\\))?(?:[ \\t]*[/&+,][ \\t]*[^:\\n|*()]{1,30}?|[ \\t]+[^:\\n|*()]{1,30}?)?';
// Dòng mở một mục (regex khớp PHẦN ĐẦU dòng, đến hết dấu phân cách; nội dung là phần còn lại của dòng). Cách viết nào cũng được:
//   gạch đầu dòng, số thứ tự, tiêu đề (#), dòng bảng (|) hoặc không gì cả; tên mục in đậm hay không; kèm chú thích ngắn;
//   dấu hai chấm, gạch ngang có khoảng trắng, dấu | của bảng, hoặc tên mục in đậm rồi nội dung liền sau;
//   hoặc tên mục đứng một mình một dòng (nội dung ở các dòng sau).
const labelRe = (list) => new RegExp(`^[ \\t]{0,3}(?:\\|[ \\t]*)?(?:[-*+]|\\d+[.)])?[ \\t]*(?:#{1,6}[ \\t]*)?${BOLD}?(?:${names(list)})${WORD_END}(?:${QUAL}[ \\t]*${BOLD}?[ \\t]*:${BOLD}?[ \\t]*|${QUAL}[ \\t]+[-–—][ \\t]+|${QUAL}[ \\t]*\\|[ \\t]*|${BOLD}[ \\t]+(?=\\S)|${BOLD}?[ \\t]*:?[ \\t]*${BOLD}?[ \\t]*$)`, 'i');
// Dòng tiêu đề: bắt đầu bằng tên tiêu đề, phần sau tùy ý (tối đa 80 ký tự). Có dấu thăng hoặc in đậm thì chấp nhận ngay ("## Kế hoạch (v2)",
// "## Kế hoạch: đổi cỡ chữ"); không có thì cả dòng chỉ được là tên (kèm dấu hai chấm cuối), để một câu văn thường bắt đầu bằng
// "Kế hoạch này..." hay "Kế hoạch: tôi sẽ sửa a.js" không bị nhận nhầm.
function isHeading(flat, opts) {
  const m = new RegExp(`^[ \\t]{0,3}(#{1,6}[ \\t]*)?(${BOLD})?(?:${names([HEADING, ...HEADING_SYNONYMS, ...opts.heading])})${WORD_END}(.*)$`, 'i').exec(flat);
  if (!m) return false;
  const rest = m[3];
  if (rest.length > 80) return false;
  return Boolean(m[1] || m[2]) || /^[ \t]*:?[ \t]*$/.test(rest);
}
const NEXT_HEADING = /^[ \t]{0,3}#{1,6}[ \t]+\S/;
const oneLine = (s, max) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, max);
const firstLine = (s) => String(s || '').split('\n').map((l) => l.trim()).find(Boolean) || '';

// Các mục có thể xuất hiện: năm mục gốc (kèm tên gọi khác có sẵn và tên gọi khác do dự án khai), mục thêm của dự án, và mục thêm của mọi đơn vị
// (đòi hay không thì xét sau, khi đã biết kế hoạch nêu đơn vị nào).
function fieldsOf(opts) {
  const unitLabels = [...new Set(Object.values(opts.unitExtra || {}).flat())];
  return [...LABELS.map((l) => [l, [l, ...SYNONYMS[l], ...opts.labels[l]]]), [DELEG, [DELEG, ...DELEG_NAMES]], [ALLOW, [ALLOW, ...ALLOW_NAMES]], [GITHUB, [GITHUB, ...GITHUB_NAMES]], ...[...opts.extra, ...unitLabels.filter((l) => !opts.extra.some((e) => key(e) === key(l)))].map((l) => [l, [l]])]
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
    if (hit) {
      cur = hit[0];
      if (!(cur in found)) found[cur] = line.slice(hit[1][0].length).replace(/^[ \t]*\|[ \t]*$|[ \t]*\|[ \t]*$/, '');
      else cur = null;
      continue;
    }
    if (cur) { if (stopAtBlank && !line.trim()) { cur = null; continue; } found[cur] += `\n${line}`; }
  }
  return found;
}

// Tiêu đề kế hoạch và phạm vi khối của nó trong danh sách dòng: { hi, end, implicit } hoặc null.
// Có dòng tiêu đề: khối chạy tới tiêu đề markdown kế tiếp KHÔNG phải một dòng mở mục (nhãn dạng "### Dịch vụ" vẫn thuộc khối).
// Không có tiêu đề nhưng cả năm mục gốc đều có mặt: vẫn đọc được, khối bắt đầu từ dòng mở mục đầu tiên (implicit).
function locate(lines, opts) {
  const fields = fieldsOf(opts);
  const isLabel = (l) => { const flat = plain(l); return fields.some((f) => f.re.test(flat)); };
  const hi = lines.findIndex((l) => isHeading(plain(l), opts));
  if (hi >= 0) {
    let end = lines.length;
    for (let i = hi + 1; i < lines.length; i += 1) if (NEXT_HEADING.test(lines[i]) && !isLabel(lines[i])) { end = i; break; }
    return { hi, end, implicit: false };
  }
  const first = lines.findIndex(isLabel);
  if (first < 0) return null;
  const found = scan(lines.slice(first), opts);
  if (!LABELS.every((l) => l in found)) return null;
  return { hi: first - 1, end: lines.length, implicit: true };
}

// Mục "Dịch vụ": đọc tên đơn vị từ ĐẦU dòng, phần còn lại là chú thích. Tên cách nhau bằng dấu phẩy, "và", "với", "&", "+", "/";
// đọc dừng ở dấu hiệu chú thích đầu tiên: ngoặc, dấu chấm phẩy, gạch dài, dấu hai chấm, chấm hết câu. Chữ hoa được hạ thành chữ thường.
// "không", "không có", "n/a", "chung" (đầu dòng) nghĩa là chỉ đụng phần dùng chung. Trả { services, none, unreadable }: unreadable chỉ khi
// đầu dòng có chữ mà không đọc ra được tên nào. Tên có thật hay không là việc của scope_register (từ chối tên lạ), không phải của khuôn.
const NONE_START = /^(?:khong|none|n\/a|na|no|chung)(?![a-z0-9_-])/i;
function readServices(text) {
  const first = firstLine(text).replace(/[`*_]/g, '');
  const seg = plain(first).split(/\(|\[|;|\s[-–—]\s|[–—]|:\s|\.(?:\s|$)/)[0].trim();
  if (!seg || NONE_START.test(seg) || /^-+$/.test(seg)) return { services: [], none: true, unreadable: false };
  const clean = (s) => s.trim().replace(/^["'“”‘’]+|["'“”‘’.]+$/g, '');
  const items = seg.split(/\s*(?:,|&|\+|\/|\bva\b|\bvoi\b|\band\b|\bhoac\b|\bor\b|\bcung\b)\s*/i).map(clean).filter(Boolean);
  const services = [];
  for (let i = 0; i < items.length; i += 1) {
    const it = items[i].toLowerCase();
    if (NAME_RE.test(it)) { services.push(it); continue; }
    // Nhiều tên cách nhau bằng khoảng trắng ("api web"): chỉ nhận ở mục đầu, khi MỌI từ đều là tên viết chữ thường. Cụm chữ hoa ("Ten Don Vi")
    // là một cách gọi chứ không phải danh sách tên: không đoán, đòi viết lại tên.
    const parts = it.split(/\s+/);
    if (i === 0 && items[i] === it && parts.length > 1 && parts.length <= 4 && parts.every((p) => NAME_RE.test(p))) { services.push(...parts); continue; }
    break; // chữ giải thích: dừng đọc
  }
  const uniq = [...new Set(services)];
  return { services: uniq, none: false, unreadable: uniq.length === 0 };
}

// Dòng "Ủy quyền" của kế hoạch: { present, enabled, hours, text }. Giá trị "không", "none", "no", "tắt" hoặc để trống là KHÔNG ủy quyền; mọi giá trị khác là có.
// Giờ lấy từ chữ như "8h", "4 giờ" (mặc định 8, kẹp trong 1 đến 24).
function delegationOf(found) {
  if (!(DELEG in found)) return { present: false, enabled: false, hours: 0, text: '' };
  const text = oneLine(found[DELEG], 300);
  const flat = plain(text).toLowerCase();
  const h = HOURS.exec(flat);
  return { present: true, enabled: Boolean(flat) && !OFF_RE.test(flat), hours: Math.min(24, Math.max(1, h ? Number(h[1]) : 8)), text };
}
// Dòng "Được làm": { present, actions, unknown, text }. Mỗi món cách nhau bằng dấu phẩy hay chấm phẩy; món không nhận ra ghi vào unknown (để nhắc,
// không chặn). "không" thì không món nào; thiếu dòng thì mặc định DEFAULT_ACTIONS.
function allowedOf(found) {
  if (!(ALLOW in found)) return { present: false, actions: [...DEFAULT_ACTIONS], unknown: [], text: '' };
  const text = oneLine(found[ALLOW], 300);
  const flat = plain(text).toLowerCase();
  if (!flat || OFF_RE.test(flat)) return { present: true, actions: [], unknown: [], text };
  const actions = new Set();
  const unknown = [];
  for (const item of flat.split(/[,;]+/).map((s) => s.trim()).filter(Boolean)) {
    const hit = ACTIONS.filter(([, re]) => re.test(item)).map(([k]) => k);
    if (hit.length) hit.forEach((k) => actions.add(k)); else unknown.push(item);
  }
  return { present: true, actions: ACTION_KEYS.filter((k) => actions.has(k)), unknown, text };
}
// Kế hoạch có nói sẽ mở hay tạo phiên khác không (xét mục "Làm gì" và "Sửa tệp").
const spawnsSessions = (found) => SPAWN_RE.test(plain(`${found['Làm gì'] || ''}\n${found['Sửa tệp'] || ''}`).toLowerCase());

// Trả { ok, errors, fix, headingOk, services, reason, scope, block, extra, delegation }.
//   fix: tên các mục phải viết thêm hoặc sửa (thiếu, để trống, "Dịch vụ" không đọc ra tên nào, mục bắt buộc thêm); rỗng khi lỗi không sửa theo từng mục được.
//   reason: dòng đầu của mục "Làm gì" (tóm tắt việc sẽ làm; sổ phạm vi ghi vào cột lý do). services rỗng nghĩa là kế hoạch chỉ đụng phần dùng chung.
function parsePlanWith(text, options) {
  const opts = options || DEFAULT_OPTIONS;
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const loc = locate(lines, opts);
  if (!loc) return { ok: false, errors: [`không thấy kế hoạch: cần một dòng tiêu đề "## ${HEADING}" (phần chữ sau đó tùy ý) rồi đủ năm mục ${LABELS.join(', ')}`], fix: [], headingOk: false, services: [], reason: '', scope: '', block: '', extra: {}, delegation: { present: false, enabled: false, hours: 0, text: '' }, allowed: { present: false, actions: [...DEFAULT_ACTIONS], unknown: [], text: '' }, github: { present: false, repos: [], orgs: [], account: false, unknown: [], text: '' } };
  const bodyLines = lines.slice(loc.hi + 1, loc.end);
  const found = scan(bodyLines, opts);
  const errors = [];
  const fix = [];
  const missing = LABELS.filter((l) => !(l in found));
  const empty = LABELS.filter((l) => l in found && !oneLine(found[l], 10));
  if (missing.length) { errors.push(`thiếu mục: ${missing.join(', ')}`); fix.push(...missing); }
  if (empty.length) { errors.push(`mục để trống: ${empty.join(', ')}`); fix.push(...empty); }
  let services = [];
  if ('Dịch vụ' in found && oneLine(found['Dịch vụ'], 10)) {
    const r = readServices(found['Dịch vụ']);
    services = r.services;
    if (r.unreadable) { errors.push('mục "Dịch vụ" không đọc ra tên đơn vị nào ở đầu dòng: viết tên đơn vị (chữ thường, số, gạch ngang; nhiều tên cách nhau bằng dấu phẩy) hoặc "không"; lời giải thích đặt sau dấu ngoặc hoặc dấu chấm phẩy'); if (!fix.includes('Dịch vụ')) fix.push('Dịch vụ'); }
  }
  // Mục bắt buộc thêm: của dự án (luôn đòi), và của từng đơn vị mà kế hoạch nêu tên.
  const need = [...opts.extra.map((l) => ({ label: l, by: '' }))];
  for (const s of services) for (const l of (opts.unitExtra || {})[s] || []) if (!need.some((n) => key(n.label) === key(l))) need.push({ label: l, by: s });
  const show = (n) => (n.by ? `${n.label} (đơn vị ${n.by} đòi)` : n.label);
  const missingExtra = need.filter((n) => !(n.label in found));
  if (missingExtra.length) { errors.push(`thiếu mục bắt buộc thêm: ${missingExtra.map(show).join(', ')}`); fix.push(...missingExtra.map((n) => n.label)); }
  const emptyExtra = need.filter((n) => n.label in found && !oneLine(found[n.label], 10));
  if (emptyExtra.length) { errors.push(`mục bắt buộc thêm để trống: ${emptyExtra.map(show).join(', ')}`); fix.push(...emptyExtra.map((n) => n.label)); }
  // Kế hoạch nói sẽ mở phiên khác mà không có dòng "Ủy quyền": chưa mở cổng, chỉ đòi viết thêm đúng dòng đó (ghi "không" cũng được).
  const delegation = delegationOf(found);
  if (!delegation.present && spawnsSessions(found)) {
    errors.push('thiếu mục: Ủy quyền (kế hoạch nói sẽ mở hoặc tạo phiên khác; ghi "Ủy quyền: không" nếu không cần phiên đó duyệt thay người dùng)');
    fix.push(DELEG);
  }
  const block = `${loc.implicit ? `## ${HEADING}` : lines[loc.hi].trim()}\n${bodyLines.join('\n').trim()}`;
  const extra = Object.fromEntries(need.filter((n) => n.label in found).map((n) => [n.label, oneLine(found[n.label], 500)]));
  return { ok: errors.length === 0, errors, fix: [...new Set(fix)], headingOk: true, services: errors.length ? [] : services, reason: oneLine(firstLine(found['Làm gì']), 300), scope: oneLine(found['Sửa tệp'], 500), block, extra, delegation, allowed: allowedOf(found), github: githubOf(found) };
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
  parsePlan, parsePlanWith, mergeAddendum: mergeAddendumNow, mergeAddendumWith: mergeAddendum, normalizeOptions, loadOptions, example, LABELS, HEADING, NAME_RE, currentOptions, DELEG, ALLOW, GITHUB, ACTION_KEYS, DEFAULT_ACTIONS,
  // Khối mẫu của dự án đang chạy (dự án không khai mục thêm thì đúng bằng khối gốc).
  get EXAMPLE() { return example(currentOptions()); },
};
