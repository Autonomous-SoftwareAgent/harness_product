'use strict';
// spec: HOOK-S-010
// LỚP RULES: tệp .claude/rules/harness-skills.md do bộ cài (setup) SINH từ các skill đang cài ở .claude/skills/. Skill là nơi viết cách làm;
// tệp này chỉ là bảng chỉ đường "việc gì thì mở skill nào", nạp ngay từ đầu phiên (Claude Code nạp mọi tệp trong .claude/rules/). Khối bật hay
// tắt, skill thêm hay bớt thì chạy lại setup là bảng đúng theo; không ai sửa tay (sửa tay bị ghi đè).
const fs = require('node:fs');
const path = require('node:path');

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
  return [
    '<!-- Tệp này do `setup` của harness sinh từ .claude/skills/. Đừng sửa tay: sửa skill rồi chạy lại setup. -->',
    '# Skill của dự án: việc gì thì mở skill nào',
    '',
    'Mỗi việc có MỘT skill ghi cách làm. Mở bằng công cụ Skill trước khi làm; hook chặn lời gọi ghi khi phiên chưa mở skill cần thiết. Kế hoạch trình duyệt: luôn lập bằng công cụ `plan_draft` (skill `plan`), không tự gõ khối.',
    '',
    ...rows,
    '',
  ].join('\n');
}

module.exports = { FILE, build, meta, brief };
