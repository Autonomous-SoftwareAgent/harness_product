'use strict';
// spec: HOOK-S-010
// LỚP RULES: tệp .claude/rules/harness-skills.md do bộ cài (setup) SINH từ các skill đang cài ở .claude/skills/. Skill là nơi viết cách làm;
// tệp này chỉ là bảng chỉ đường "việc gì thì mở skill nào", nạp ngay từ đầu phiên (Claude Code nạp mọi tệp trong .claude/rules/). Khối bật hay
// tắt, skill thêm hay bớt thì chạy lại setup là bảng đúng theo; không ai sửa tay (sửa tay bị ghi đè).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const FILE = '.claude/rules/harness-skills.md';
const MAX_LINE = 110;

// Frontmatter của SKILL.md: name và description (một dòng).
function meta(file) {
  let text = '';
  try { text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'); } catch { return null; }
  const m = /^---\n([\s\S]*?)\n---/.exec(text);
  if (!m) return null;
  const get = (k) => { const r = new RegExp(`^${k}:[ \t]*(.*)$`, 'm').exec(m[1]); return r ? r[1].trim() : ''; };
  const name = get('name');
  return name ? { name, description: get('description') } : null;
}

// Mô tả gọn: phần đầu tới dấu " - " hoặc dấu chấm đầu tiên, cắt ở MAX_LINE.
function brief(desc) {
  let s = String(desc || '').replace(/\s+/g, ' ').trim();
  const cut = [s.indexOf(' - '), s.search(/\.( |$)/)].filter((i) => i > 0);
  if (cut.length) s = s.slice(0, Math.min(...cut));
  return s.length > MAX_LINE ? `${s.slice(0, MAX_LINE - 1).trimEnd()}…` : s;
}

function build(root) {
  const dir = path.join(root, '.claude', 'skills');
  let names = [];
  try { names = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort(); } catch { /* chưa có skill nào */ }
  const rows = names.map((n) => meta(path.join(dir, n, 'SKILL.md'))).filter(Boolean).map((s) => `- \`${s.name}\`: ${brief(s.description)}`);
  const body = [
    '# Skill của dự án: việc gì thì mở skill nào',
    '',
    'Mỗi việc có MỘT skill ghi cách làm. Mở bằng công cụ Skill trước khi làm; hook chặn lời gọi ghi khi phiên chưa mở skill cần thiết. Kế hoạch trình duyệt: theo skill `plan` (đủ năm mục; lỗi nhẹ cổng bỏ qua, thiếu mục thì chỉ viết thêm đúng mục đó).',
    '',
    ...rows,
    '',
  ].join('\n');
  return `${HEADER_PREFIX} sha:${bodyHash(body)} -->\n${body}`;
}

// Mã băm của phần thân ghi ngay trong dòng chú thích đầu tệp: nhờ đó biết tệp còn nguyên như lúc sinh hay đã có người sửa tay.
const bodyHash = (body) => crypto.createHash('sha256').update(body).digest('hex').slice(0, 12);
const HEADER_PREFIX = '<!-- Tệp này do `setup` của harness sinh từ .claude/skills/. Đừng sửa tay: sửa skill rồi chạy lại setup.';
const GENERATED_RE = /^<!-- Tệp này do `setup` của harness sinh từ \.claude\/skills\/\.[^\n]*?(?: sha:([0-9a-f]{12}))? -->\n/;

// Đồng bộ bảng với .claude/skills/ (gọi ở hook đầu phiên). Chỉ ghi khi tệp còn là bản sinh nguyên vẹn (khớp mã băm đã ghi, hoặc bản cũ
// chưa có mã băm); tệp có người sửa tay, hay không phải bản sinh, thì KHÔNG ghi đè mà báo. Trả { changed, text }; text rỗng khi không có gì để nói.
function sync(root) {
  if (!fs.existsSync(path.join(root, '.claude', 'skills'))) return { changed: false, text: '' };
  const file = path.join(root, FILE);
  const next = build(root);
  let cur = null;
  try { cur = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'); } catch { /* chưa có tệp */ }
  if (cur === next) return { changed: false, text: '' };
  if (cur !== null) {
    const m = GENERATED_RE.exec(cur);
    if (!m) return { changed: false, text: `Bảng skill ${FILE} không phải bản do harness sinh nên không tự cập nhật; chạy setup nếu muốn sinh lại.` };
    if (m[1] && bodyHash(cur.slice(m[0].length)) !== m[1]) return { changed: false, text: `Bảng skill ${FILE} đã bị sửa tay nên không tự ghi đè; chạy setup để sinh lại theo .claude/skills/.` };
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, next);
  fs.renameSync(tmp, file);
  return { changed: true, text: `Đã cập nhật bảng skill ${FILE} theo .claude/skills/.` };
}

module.exports = { FILE, build, sync, meta, brief };
