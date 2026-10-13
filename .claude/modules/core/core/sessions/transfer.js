'use strict';
// spec: HOOK-S-013
// CHUYỂN PHIÊN, phần quyết định, hàm thuần: khuôn phần phiên cũ tự viết, tên phiên mới, nội dung tờ bàn giao, lời mở đầu của phiên
// mới, phép dò bí mật. Không đọc ghi đĩa, không chạy lệnh: việc đó ở adapters/project/transfers.js và cli/transfer.js.
// Vì sao có khuôn: lời giao việc viết tay giữa hai phiên từng thiếu điều người dùng đã chốt và không có bước xác nhận đã đọc (lần chuyển
// 2026-10-13). Khuôn ép đủ sáu mục; máy gom phần đọc được (kế hoạch, phạm vi, skill, git, handoff) để phiên cũ không phải kể lại.

// Sáu mục phiên cũ tự viết. Mỗi mục là một đoạn chữ hoặc một danh sách dòng; mục không có gì thì ghi rõ "không có", không bỏ trống.
const SECTIONS = [
  { key: 'doing', title: 'Đang làm gì', hint: 'mục tiêu người dùng giao và nó đang ở bước nào' },
  { key: 'todo', title: 'Việc dở theo thứ tự', hint: 'từng việc còn lại, việc làm trước đứng trước; nêu tệp và lệnh' },
  { key: 'decided', title: 'Điều người dùng đã chốt', hint: 'quyết định và ưu tiên người dùng đã nói, kèm lời của họ nếu có' },
  { key: 'forbidden', title: 'Điều cấm', hint: 'việc không được làm, thứ không được xóa hay đẩy' },
  { key: 'traps', title: 'Bẫy đã gặp', hint: 'lỗi đã mắc và cách tránh, lệnh không chạy được trên máy này' },
  { key: 'unverified', title: 'Điều chưa kiểm', hint: 'điều đã viết hay đã nói mà chưa chạy thật, chưa đo' },
];
const MAX = { item: 600, items: 40, section: 6000 };
const UNIT_RE = /^[a-z][a-z0-9-]{0,39}$/;

const listOf = (v) => (Array.isArray(v) ? v : typeof v === 'string' ? v.split(/\r?\n/) : []).map((x) => String(x).replace(/^\s*[-*]\s+/, '').trim()).filter(Boolean);

// Kiểm phần tự viết. Trả danh sách lỗi (rỗng là hợp lệ).
function checkNote(note) {
  const errs = [];
  if (!note || typeof note !== 'object' || Array.isArray(note)) return [`phần tự viết phải là một đối tượng có sáu mục: ${SECTIONS.map((s) => s.key).join(', ')}`];
  for (const k of Object.keys(note)) if (!SECTIONS.some((s) => s.key === k)) errs.push(`${k}: mục không có trong khuôn`);
  for (const s of SECTIONS) {
    const v = note[s.key];
    if (v !== undefined && typeof v !== 'string' && !Array.isArray(v)) { errs.push(`${s.key} (${s.title}): phải là chuỗi hoặc danh sách chuỗi`); continue; }
    const items = listOf(v);
    if (!items.length) { errs.push(`${s.key} (${s.title}): thiếu. Viết ${s.hint}; thật sự không có thì ghi "không có"`); continue; }
    if (items.length > MAX.items) errs.push(`${s.key}: quá ${MAX.items} dòng`);
    if (items.some((x) => x.length > MAX.item)) errs.push(`${s.key}: có dòng dài quá ${MAX.item} ký tự; tách ra`);
  }
  return errs;
}

// Tên phiên mới: <đơn-vị>-<số>, số kế tiếp sau số lớn nhất đang có của đơn vị đó (không dùng lại số, kể cả khi phiên cũ đã đóng).
// existing: mọi tên phiên đã biết (bảng phiên, phiên nền, các lần chuyển trước).
function nextName(unit, existing = []) {
  if (!UNIT_RE.test(String(unit || ''))) throw new Error('Tên đơn vị: chữ thường không dấu, số, gạch ngang, bắt đầu bằng chữ.');
  const re = new RegExp(`^${unit}-(\\d{1,4})$`, 'i');
  let top = 0;
  for (const n of existing) { const m = re.exec(String(n || '').trim()); if (m) top = Math.max(top, Number(m[1])); }
  return `${unit}-${top + 1}`;
}

// Mã của một lần chuyển: tên phiên mới kèm giờ tạo (đủ để không trùng, và đọc được).
const idOf = (name, at) => `${name}-${new Date(at).toISOString().replace(/[-:]/g, '').slice(0, 13)}`;

// Phép dò bí mật trước khi ghi tờ bàn giao: chỉ bắt dạng thường gặp; qua được không chứng minh sạch. Trả [{ line, what }], không trả giá trị.
const SECRETS = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'khóa riêng'],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}/, 'token GitHub'],
  [/\bgithub_pat_[A-Za-z0-9_]{30,}/, 'token GitHub'],
  [/\bdckr_pat_[A-Za-z0-9_-]{20,}/, 'token Docker Hub'],
  [/\bsk-[A-Za-z0-9_-]{24,}/, 'khóa API'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'khóa AWS'],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/, 'token Slack'],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, 'token JWT'],
  [/\b(?:password|passwd|mật khẩu|secret|token|api[_-]?key)\b\s*[:=]\s*["']?[^\s"'<>`]{8,}/i, 'giá trị của mật khẩu hoặc token'],
];
function secretsIn(text) {
  const out = [];
  String(text || '').split(/\r?\n/).forEach((l, i) => { for (const [re, what] of SECRETS) if (re.test(l)) { out.push({ line: i + 1, what }); break; } });
  return out;
}

const bullets = (xs) => (xs && xs.length ? xs.map((x) => `- ${x}`) : ['- (không có)']);

// Nội dung tờ bàn giao (Markdown). facts: phần máy gom, mọi trường là mảng dòng hoặc chuỗi; trường nào không lấy được thì bên gom ghi rõ lý do.
function render({ id, unit, name, from = {}, at, note, facts = {} }) {
  const out = [
    `# Bàn giao phiên: ${unit} (${id})`,
    '',
    `Phiên mới: ${name}. Phiên giao: ${from.name || 'không rõ tên'}${from.sid ? ` (mã ${String(from.sid).slice(0, 8)})` : ''}. Lúc ${new Date(at).toISOString()}.`,
    '',
    'Tờ này là TOÀN BỘ điều phiên trước để lại. Phần A do phiên trước viết theo khuôn; phần B do máy gom lúc chuyển. Chỗ nào hai phần lệch nhau thì tin phần B và báo người dùng.',
    '',
    '## Việc đầu tiên của phiên mới',
    '1. Đọc trọn tờ này bằng công cụ Read (harness ghi nhận lần đọc; chưa đọc thì mỗi lượt đều bị nhắc).',
    `2. Mở skill \`services\`, rồi đọc \`CLAUDE.md\` và \`docs/agent/STATUS.md\` của đơn vị \`${unit}\`.`,
    '3. Trả lời người dùng: đã nhận bàn giao, hiểu việc kế tiếp là gì (ba dòng), và điều gì trong tờ này chưa rõ.',
    '4. CHƯA sửa gì. Lời duyệt của phiên trước KHÔNG chuyển sang phiên này: trình kế hoạch theo khuôn, chờ người dùng duyệt, rồi đăng ký phạm vi.',
    '',
    '## A. Phiên trước viết',
  ];
  for (const s of SECTIONS) out.push('', `### ${s.title}`, ...bullets(listOf(note[s.key])));
  out.push('', '## B. Máy gom lúc chuyển');
  const part = (title, v) => out.push('', `### ${title}`, ...(Array.isArray(v) ? bullets(v) : [String(v || '(không có)')]));
  part('Kế hoạch và phạm vi của phiên trước (chỉ để biết; không còn hiệu lực ở phiên mới)', facts.scope);
  part('Skill phiên trước đã mở', facts.skills);
  part('Tình trạng git', facts.git);
  part('Yêu cầu còn mở trong docs/handoff liên quan tới đơn vị', facts.handoffs);
  part('Luật riêng của đơn vị', facts.rules);
  return `${out.join('\n')}\n`;
}

// Lời mở đầu của phiên mới (đối số đầu của lệnh tạo phiên): ngắn, trỏ tới tờ bàn giao; nội dung nằm trong tờ, không nhét vào đây.
function opening({ unit, rel, id }) {
  return `Phiên này được giao dịch vụ "${unit}", nhận BÀN GIAO từ một phiên khác (mã ${id}). Việc đầu tiên, trước mọi việc khác: đọc trọn tệp ${rel} bằng công cụ Read và làm theo mục "Việc đầu tiên của phiên mới" trong đó. ` +
    'Chưa sửa gì: lời duyệt của phiên trước không chuyển sang phiên này. Đọc xong thì báo người dùng bạn đã nhận bàn giao và việc kế tiếp là gì, rồi DỪNG chờ người dùng.';
}

// Lời nhắc cho phiên mới khi chưa đọc tờ bàn giao.
const reminder = ({ rel, id }) => `BÀN GIAO CHƯA ĐỌC (${id}): phiên này nhận việc từ một phiên khác. Trước mọi việc khác, đọc trọn tệp ${rel} bằng công cụ Read và làm theo mục "Việc đầu tiên của phiên mới". Lời nhắc này lặp lại cho tới khi tệp được đọc.`;

module.exports = { SECTIONS, MAX, UNIT_RE, checkNote, listOf, nextName, idOf, secretsIn, render, opening, reminder };
