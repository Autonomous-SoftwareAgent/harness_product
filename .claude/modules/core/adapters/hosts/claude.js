'use strict';
// spec: HOOK-S-010
// BỘ CHUYỂN CLAUDE CODE: biến định nghĩa gốc của một đơn vị (<đơn vị>/.harness/) thành tệp Claude Code tự nạp ở chỗ đơn vị (<đơn vị>/.claude/).
// Hàm thuần: nhận bản mô tả các đơn vị, trả danh sách tệp cần có (hợp đồng: ports/host-adapter.js). Đã đo bằng phiên claude thật (2.1.299, Windows):
// skill ở <đơn vị>/.claude/skills/ và rule ở <đơn vị>/.claude/rules/ được nạp khi phiên chạm tệp trong đơn vị (nạp muộn); hook và máy chủ MCP
// ở thư mục con thì KHÔNG nạp, nên bộ chuyển này không sinh settings.json hay .mcp.json.
const crypto = require('node:crypto');
const { stripEnforce, readAgent } = require('./definitions');
const { yamlScalar } = require('../../ports/skill-enforce');

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
  agents: { level: 'root', where: '.claude/agents/<đơn vị>-<tên>.md ở nơi mở phiên', note: 'Đã đo: agent trong thư mục đơn vị không nạp khi mở phiên ở gốc, nên bộ chuyển sinh agent ở gốc với tên có tiền tố đơn vị.' },
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

// Phần mở đầu harness gắn vào mọi sub-agent sinh ra: đọc cửa vào, mở skill riêng của đơn vị, giữ trong đơn vị, trả báo cáo theo mẫu. Agent con có ngữ cảnh riêng,
// nên tự nạp lại những thứ hook chặn theo skill đòi; có phần này thì nó không bị chặn vô ích ở lần sửa đầu.
function agentPreamble(u, name) {
  const where = u.rel ? `${u.rel}/` : '';
  const skills = (u.skills || []).slice(0, 8).map((s) => `${where}.harness/skills/${s.name}/SKILL.md`);
  return [
    `Bạn là sub-agent "${name}" của đơn vị ${u.name}. Phần mở đầu này do harness sinh, đừng sửa.`,
    '',
    'Trước khi làm:',
    `1. Đọc bằng công cụ Read: ${where}${u.entry.rel} (cửa vào của đơn vị) và tệp STATUS.md mà cửa vào nêu ở mục "Đọc gì khi nào".`,
    skills.length ? `2. Đọc TRỌN bằng công cụ Read skill riêng của đơn vị khớp việc được giao: ${skills.join('; ')}.` : '2. Đơn vị chưa có skill riêng; theo cửa vào của đơn vị.',
    `3. Chỉ làm trong đơn vị ${u.name}. Việc đụng đơn vị khác thì dừng và báo lại phiên giao việc; không tự sửa.`,
    '4. Điều chưa chạy hay chưa kiểm thì nói là chưa kiểm; không viết như đã chắc.',
    '',
    'Khi xong, trả về MỘT báo cáo ngắn đúng ba mục: Kết luận; Bằng chứng (tệp:dòng hoặc kết quả lệnh); Chưa kiểm. Không dán lại nội dung tệp đã đọc.',
    '',
    '---',
    '',
  ].join('\n');
}

// Một agent nguồn (<đơn vị>/.harness/agents/<tên>.md) -> tệp agent ở GỐC dự án: .claude/agents/<đơn vị>-<tên>.md. Đã đo (2.1.300): agent đặt trong thư mục
// đơn vị KHÔNG được nạp khi phiên mở ở gốc, agent ở gốc được nạp và danh sách tools có hiệu lực.
function agentFile(u, a) {
  const d = readAgent(a.text);
  const full = `${u.name}-${a.name}`;
  const lines = [`name: ${full}`, `description: ${yamlScalar(String(d.description).trim())}`, `tools: ${d.tools.join(', ')}`];
  if (d.model && d.model !== 'inherit') lines.push(`model: ${d.model}`);
  const text = `---\n${lines.join('\n')}\n---\n${agentPreamble(u, a.name)}${norm(d.body).replace(/^\n+/, '')}`;
  return { unit: u.name, rel: `.claude/agents/${full}.md`, text: stamp(text, `${u.rel ? `${u.rel}/` : ''}.harness/agents/${a.name}.md`), kind: 'agent', root: true, exclude: `/.claude/agents/${full}.md` };
}

function plan(units) {
  const out = [];
  for (const u of units) {
    for (const a of u.agents || []) {
      if (NAME_RE.test(a.name) && NAME_RE.test(`${u.name}-${a.name}`)) out.push(agentFile(u, a));
    }
    for (const s of u.skills || []) {
      if (!NAME_RE.test(s.name)) continue;
      // Điều kiện ép (harness-files, harness-reads) là của harness: không chép sang tệp của công cụ.
      out.push({ unit: u.name, rel: `.claude/skills/${s.name}/SKILL.md`, text: stamp(stripEnforce(s.text), `.harness/skills/${s.name}/SKILL.md`), kind: 'skill', exclude: `/.claude/skills/${s.name}/` });
    }
    // Note: rule nạp theo đường dẫn (frontmatter `paths:`), sinh ra .claude/rules/<tên>.md.
    for (const n of u.notes || []) {
      if (!NAME_RE.test(n.name) || n.name === 'harness') continue;
      out.push({ unit: u.name, rel: `.claude/rules/${n.name}.md`, text: stamp(n.text, `.harness/notes/${n.name}.md`), kind: 'rule', exclude: `/.claude/rules/${n.name}.md` });
    }
    if (u.entry && u.entry.exists) {
      out.push({ unit: u.name, rel: '.claude/rules/harness.md', text: stamp(entryRule(u), u.entry.rel), kind: 'rule', exclude: '/.claude/rules/harness.md' });
    }
  }
  return out;
}

module.exports = { name: NAME, capabilities, plan, read, stamp, hash, importNative, MARK };
