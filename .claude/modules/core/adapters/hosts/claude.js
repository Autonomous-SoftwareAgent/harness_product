'use strict';
// spec: HOOK-S-010
// BỘ CHUYỂN CLAUDE CODE: biến định nghĩa gốc của một đơn vị (<đơn vị>/.harness/) thành tệp Claude Code tự nạp ở chỗ đơn vị (<đơn vị>/.claude/).
// Hàm thuần: nhận bản mô tả các đơn vị, trả danh sách tệp cần có (hợp đồng: ports/host-adapter.js). Đã đo bằng phiên claude thật (2.1.299, Windows):
// skill ở <đơn vị>/.claude/skills/ và rule ở <đơn vị>/.claude/rules/ được nạp khi phiên chạm tệp trong đơn vị (nạp muộn); hook và máy chủ MCP
// ở thư mục con thì KHÔNG nạp, nên bộ chuyển này không sinh settings.json hay .mcp.json.
const crypto = require('node:crypto');

const NAME = 'claude';
const MARK = 'harness-host:claude';
const NAME_RE = /^[a-z][a-z0-9-]*$/;
const FRONT_RE = /^---\n[\s\S]*?\n---\n/;
const MARK_RE = /^<!-- harness-host:claude src:(\S+) sha:([0-9a-f]{12}) -->\n/m;

const capabilities = {
  skills: { level: 'native', where: '<đơn vị>/.claude/skills/<tên>/SKILL.md', note: 'Nạp muộn: hiện trong danh sách sau khi phiên chạm tệp trong đơn vị.' },
  rules: { level: 'native', where: '<đơn vị>/.claude/rules/*.md', note: 'Nạp khi phiên chạm tệp trong đơn vị.' },
  hooks: { level: 'root', where: '.claude/settings.json ở nơi mở phiên', note: 'Hook của thư mục con không chạy; luật riêng của đơn vị đi qua hook gốc.' },
  mcp: { level: 'root', where: '.mcp.json ở nơi mở phiên', note: 'Máy chủ MCP chỉ nạp ở nơi mở phiên; công cụ riêng của đơn vị hiện qua máy chủ của harness.' },
  commands: { level: 'native', where: '<đơn vị>/.claude/commands/', note: 'Chưa sinh: chưa có định nghĩa gốc cho lệnh.' },
};

const norm = (t) => String(t).replace(/\r\n/g, '\n');
const hash = (t) => crypto.createHash('sha256').update(t).digest('hex').slice(0, 12);

// Gắn dấu sinh vào nội dung: ngay sau phần frontmatter (frontmatter phải nằm đầu tệp thì Claude Code mới đọc được), không có thì ở đầu tệp.
// Mã băm tính trên nội dung KHÔNG có dòng dấu: nhờ đó biết tệp còn nguyên như lúc sinh hay đã bị sửa tay.
function stamp(text, src) {
  const body = norm(text);
  const line = `<!-- ${MARK} src:${src} sha:${hash(body)} -->\n`;
  const f = FRONT_RE.exec(body);
  return f ? `${f[0]}${line}${body.slice(f[0].length)}` : `${line}${body}`;
}

// Đọc dấu của một tệp đã sinh: { src, sha, body, pristine } hoặc null khi không phải bản do bộ chuyển này sinh.
function read(text) {
  const t = norm(text);
  const m = MARK_RE.exec(t);
  if (!m) return null;
  const body = t.slice(0, m.index) + t.slice(m.index + m[0].length);
  return { src: m[1], sha: m[2], body, pristine: hash(body) === m[2] };
}

// CHIỀU ĐỌC: biến các tệp team tự viết ở <đơn vị>/.claude/ thành định nghĩa chung. Thuần: nhận danh sách { rel, text } (rel tính từ thư mục đơn vị)
// và trả skill native { kind, name, text, src }. Bỏ qua tệp do chính bộ chuyển này sinh (có dấu): đó là đầu ra, không phải nguồn.
function importNative(files) {
  const out = [];
  for (const f of files || []) {
    const m = /^\.claude\/skills\/([a-z][a-z0-9-]*)\/SKILL\.md$/.exec(f.rel);
    if (m && !read(f.text)) out.push({ kind: 'skill', name: m[1], text: norm(f.text), src: f.rel });
  }
  return out.sort((x, y) => x.name.localeCompare(y.name));
}

function entryRule(unit) {
  return [
    `# Cửa vào harness của đơn vị ${unit.name}`,
    '',
    `Trước khi sửa tệp trong đơn vị \`${unit.name}\`, đọc \`${unit.entry.rel}\` (cửa vào của đơn vị) và các tài liệu nó trỏ tới. Hook của harness ở nơi mở phiên chặn lần sửa đầu nếu chưa đọc.`,
    '',
  ].join('\n');
}

function plan(units) {
  const out = [];
  for (const u of units) {
    for (const s of u.skills || []) {
      if (!NAME_RE.test(s.name)) continue;
      out.push({ unit: u.name, rel: `.claude/skills/${s.name}/SKILL.md`, text: stamp(s.text, `.harness/skills/${s.name}/SKILL.md`), kind: 'skill', exclude: `/.claude/skills/${s.name}/` });
    }
    if (u.entry && u.entry.exists) {
      out.push({ unit: u.name, rel: '.claude/rules/harness.md', text: stamp(entryRule(u), u.entry.rel), kind: 'rule', exclude: '/.claude/rules/harness.md' });
    }
  }
  return out;
}

module.exports = { name: NAME, capabilities, plan, read, stamp, hash, importNative, MARK };
