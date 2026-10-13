'use strict';
// spec: MCP-S-002
// spec: MCP-S-003
// spec: MCP-S-004
// LÕI của tài liệu ba tầng: dạng tệp design/spec/impl, dấu "đã đổi" của từng tầng, khung còn thiếu, lời in ra.
// Thuần: không đọc ghi đĩa, không biết dịch vụ nào đang được chọn, không hỏi giờ. Việc đọc, ghi có khóa và chọn dịch vụ là của mcp/core.js.
const crypto = require('node:crypto');
const path = require('node:path');

const DESIGN_FIELDS = ['date', 'status', 'decision', 'rationale', 'impacts'];
const SPEC_FIELDS = ['from', 'derived_from', 'status', 'requirement', 'contract', 'acceptance', 'tasks'];
const IMPL_FIELDS = ['spec_hash', 'status', 'code', 'tests', 'deviation', 'notes'];

const DESIGN_STATUS = ['proposed', 'accepted', 'superseded', 'rejected'];
const IMPL_STATUS = ['planned', 'in-progress', 'done', 'deviated'];
const INACTIVE_DESIGN = ['superseded', 'rejected'];

const ID_RE = /^([A-Z][A-Z0-9]*)-([DS])-(\d{3})$/;

// ---------- small helpers ----------
const hash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 8);
const norm = (v) => String(v == null ? '' : v).replace(/\r/g, '').trim();
const oneLine = (s) => norm(s).replace(/\s+/g, ' ');
const pad = (n) => String(n).padStart(3, '0');
const num = (id) => Number(id.split('-').pop());
const list = (v) => norm(v).split(/[,\n]/).map((x) => x.trim()).filter(Boolean);

// ---------- parse / serialize ----------
function parseDoc(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  const front = {};
  if (lines[0] === '---') {
    i = 1;
    while (i < lines.length && lines[i] !== '---') {
      const m = /^(\w+):\s*(.*)$/.exec(lines[i]);
      if (m) front[m[1]] = m[2].trim();
      i++;
    }
    i++;
  }
  const pre = [];
  const blocks = [];
  let cur = null;
  let field = null;
  for (; i < lines.length; i++) {
    const l = lines[i];
    const h = /^## ([A-Z][A-Z0-9]*-[DS]-\d{3})(?::\s*(.*))?$/.exec(l);
    if (h) {
      cur = { id: h[1], title: (h[2] || '').trim(), fields: {} };
      blocks.push(cur);
      field = null;
      continue;
    }
    if (!cur) {
      pre.push(l);
      continue;
    }
    const f = /^- (\w+):\s?(.*)$/.exec(l);
    if (f) {
      field = f[1];
      cur.fields[field] = f[2];
      continue;
    }
    if (field && /^ {2}/.test(l)) cur.fields[field] += '\n' + l.slice(2);
  }
  for (const b of blocks) for (const k of Object.keys(b.fields)) b.fields[k] = norm(b.fields[k]);
  return { front, pre: pre.join('\n').trim(), blocks };
}

function serialize(doc, order) {
  let out = '';
  if (Object.keys(doc.front).length) {
    out += '---\n' + Object.entries(doc.front).map(([k, v]) => `${k}: ${v}`).join('\n') + '\n---\n';
  }
  out += doc.pre + '\n\n';
  for (const b of doc.blocks) {
    out += `## ${b.id}${b.title ? ': ' + b.title : ''}\n`;
    const keys = [...order.filter((k) => k in b.fields), ...Object.keys(b.fields).filter((k) => !order.includes(k))];
    for (const k of keys) {
      const lines = String(b.fields[k] == null ? '' : b.fields[k]).split('\n');
      if (lines.length === 1) {
        out += `- ${k}:${lines[0] ? ' ' + lines[0] : ''}\n`;
      } else {
        out += `- ${k}:\n`;
        for (const r of lines) out += `  ${r}\n`;
      }
    }
    out += '\n';
  }
  return out.replace(/\n+$/, '\n');
}

// ---------- hashes: what "changed" means at each layer ----------
const designHash = (b) => hash(JSON.stringify([b.title, ...['status', 'decision', 'rationale', 'impacts'].map((k) => norm(b.fields[k]))]));
const specHash = (b) =>
  hash(JSON.stringify([b.title, norm(b.fields.requirement), norm(b.fields.contract), norm(b.fields.acceptance), norm(b.fields.tasks).replace(/\[[xX]\]/g, '[ ]')]));


const find = (doc, id) => doc.blocks.find((b) => b.id === id);

// Thêm vào `mod` (trong bộ nhớ) khung spec và impl còn thiếu cho từng quyết định thiết kế. Gọi lại nhiều lần không sao.
// Trả danh sách khung vừa thêm; bên gọi lo việc lưu.
function addStubs(mod) {
  const created = [];
  for (const d of mod.design.blocks) {
    const sid = `${mod.prefix}-S-${pad(num(d.id))}`;
    if (!find(mod.spec, sid)) {
      mod.spec.blocks.push({
        id: sid,
        title: d.title,
        fields: { from: d.id, derived_from: designHash(d), status: 'todo', requirement: '', contract: '', acceptance: '', tasks: '' },
      });
      created.push(`${sid} (spec)`);
    }
    if (!find(mod.impl, sid)) {
      mod.impl.blocks.push({ id: sid, title: d.title, fields: { spec_hash: '', status: 'planned', code: '', tests: '', deviation: '', notes: '' } });
      created.push(`${sid} (impl)`);
    }
  }
  return created;
}


// Bộ quét nhận dấu ở MỌI kiểu chú thích (chỉ tìm chữ "spec:" rồi tới mã). Lời nhắc thì phải viết đúng cú pháp chú thích của tệp đó:
// trước đây luôn in kiểu hai gạch chéo, làm phiên Python và YAML tưởng công cụ đòi thứ không viết được (P-006).
const HASH_EXT = new Set(['.py', '.sh', '.yml', '.yaml', '.ps1', '.toml', '.rb']);
function markerHint(file, sid) {
  const ext = path.extname(file).toLowerCase();
  if (HASH_EXT.has(ext)) return `# spec: ${sid}`;
  if (ext === '.sql') return `-- spec: ${sid}`;
  if (ext === '.html' || ext === '.vue') return `<!-- spec: ${sid} -->`;
  if (ext === '.css') return `/* spec: ${sid} */`;
  return `// spec: ${sid}`;
}

// Tệp cửa vào của dịch vụ (CLAUDE.md ở gốc dịch vụ) theo MỘT khuôn: bốn mục bắt buộc, so theo đầu tiêu đề cấp hai
// để mỗi dịch vụ còn thêm được lời riêng ("Quy tắc riêng của ...", "Lệnh thường dùng (chạy từ ...)"). Mục khác thì tự do thêm.
const ENTRY_SECTIONS = ['Phạm vi', 'Đọc gì khi nào', 'Quy tắc', 'Lệnh thường dùng'];

function formatCheck(res, { verbose = true } = {}) {
  const lines = [];
  lines.push(res.errors.length ? `FAIL: ${res.errors.length} lỗi, ${res.warnings.length} cảnh báo` : `OK: không có lỗi (${res.warnings.length} cảnh báo)`);
  for (const e of res.errors) lines.push(`  ERROR ${e}`);
  if (verbose) {
    for (const w of res.warnings) lines.push(`  warn  ${w}`);
    for (const n of res.notes) lines.push(`  note  ${n}`);
  }
  return lines.join('\n');
}


function normalizeTasks(v) {
  return norm(v);
}


module.exports = { DESIGN_FIELDS, SPEC_FIELDS, IMPL_FIELDS, DESIGN_STATUS, IMPL_STATUS, INACTIVE_DESIGN, ID_RE, hash, norm, oneLine, pad, num, list, parseDoc, serialize, designHash, specHash, find, addStubs, HASH_EXT, markerHint, ENTRY_SECTIONS, formatCheck, normalizeTasks };
