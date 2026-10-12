'use strict';
// spec: MCP-S-003
// YAML tối giản cho tệp nguồn có cấu trúc của dịch vụ (docs/service.yaml). Không phụ thuộc thư viện ngoài.
// Tệp này CHỈ do công cụ ghi (stringify) rồi đọc lại (parse), nên chỉ hỗ trợ đúng tập con mà stringify sinh ra:
//   - map với khóa dạng [a-z_][a-z0-9_]*; list; lồng nhau bằng thụt 2 dấu cách
//   - giá trị đơn: chuỗi LUÔN đặt trong nháy kép kiểu JSON (cũng là chuỗi nháy kép hợp lệ của YAML), số, true/false/null
//   - list rỗng `[]`, map rỗng `{}`; không hỗ trợ list lồng trực tiếp trong list
// Kết quả là YAML hợp lệ mà công cụ YAML khác đọc được. parse() gặp thứ ngoài tập con thì ném lỗi kèm số dòng, không đoán.
const KEY_RE = /^[a-z_][a-z0-9_]*$/;
const NUM_RE = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function scalar(v) {
  if (v === null) return 'null';
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'boolean') return String(v);
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error('yaml-lite: số không hữu hạn');
    return String(v);
  }
  throw new Error(`yaml-lite: không ghi được kiểu ${typeof v}`);
}

function mapLines(obj, indent) {
  const pad = ' '.repeat(indent);
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    if (!KEY_RE.test(k)) throw new Error(`yaml-lite: khóa không hợp lệ '${k}'`);
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      if (!v.length) out.push(`${pad}${k}: []`);
      else out.push(`${pad}${k}:`, ...listLines(v, indent + 2));
    } else if (isMap(v)) {
      if (!Object.keys(v).length) out.push(`${pad}${k}: {}`);
      else out.push(`${pad}${k}:`, ...mapLines(v, indent + 2));
    } else out.push(`${pad}${k}: ${scalar(v)}`);
  }
  return out;
}

function listLines(arr, indent) {
  const pad = ' '.repeat(indent);
  const out = [];
  for (const v of arr) {
    if (Array.isArray(v)) throw new Error('yaml-lite: không hỗ trợ list lồng trực tiếp trong list');
    if (isMap(v)) {
      const lines = mapLines(v, indent + 2);
      if (!lines.length) out.push(`${pad}- {}`);
      else out.push(`${pad}- ${lines[0].slice(indent + 2)}`, ...lines.slice(1));
    } else out.push(`${pad}- ${scalar(v)}`);
  }
  return out;
}

function stringify(value) {
  if (!isMap(value)) throw new Error('yaml-lite: gốc tài liệu phải là map');
  return `${mapLines(value, 0).join('\n')}\n`;
}

function parseScalar(text, no) {
  const t = text.trim();
  if (t === 'null') return null;
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t === '[]') return [];
  if (t === '{}') return {};
  if (t.startsWith('"')) {
    try {
      const v = JSON.parse(t);
      if (typeof v === 'string') return v;
    } catch { /* báo lỗi bên dưới */ }
    throw new Error(`yaml-lite dòng ${no}: chuỗi nháy kép không hợp lệ`);
  }
  if (NUM_RE.test(t)) return Number(t);
  throw new Error(`yaml-lite dòng ${no}: giá trị không hỗ trợ (chuỗi phải đặt trong nháy kép): ${t.slice(0, 40)}`);
}

function parse(text) {
  const lines = [];
  String(text).replace(/\r\n/g, '\n').split('\n').forEach((raw, i) => {
    if (!raw.trim() || raw.trim().startsWith('#')) return;
    if (raw.includes('\t')) throw new Error(`yaml-lite dòng ${i + 1}: không dùng tab`);
    const indent = raw.length - raw.trimStart().length;
    lines.push({ indent, text: raw.slice(indent).replace(/\s+$/, ''), no: i + 1 });
  });
  let pos = 0;
  const isItem = (l) => l.text === '-' || l.text.startsWith('- ');
  const keyOf = (s) => {
    if (s.startsWith('"')) return null;
    const c = s.indexOf(':');
    if (c <= 0 || !KEY_RE.test(s.slice(0, c))) return null;
    const rest = s.slice(c + 1);
    if (rest !== '' && !rest.startsWith(' ')) return null;
    return { key: s.slice(0, c), rest: rest.trim() };
  };

  function block(indent) {
    return isItem(lines[pos]) ? list(indent) : map(indent);
  }
  function child(parent) {
    const next = lines[pos];
    if (!next || next.indent !== parent + 2) throw new Error(`yaml-lite dòng ${next ? next.no : 'cuối'}: cần khối con thụt ${parent + 2} dấu cách`);
    return block(parent + 2);
  }
  function map(indent) {
    const obj = {};
    while (pos < lines.length && lines[pos].indent === indent && !isItem(lines[pos])) {
      const l = lines[pos];
      const k = keyOf(l.text);
      if (!k) throw new Error(`yaml-lite dòng ${l.no}: cần 'khóa: giá trị'`);
      if (Object.prototype.hasOwnProperty.call(obj, k.key)) throw new Error(`yaml-lite dòng ${l.no}: khóa trùng '${k.key}'`);
      pos++;
      obj[k.key] = k.rest === '' ? child(indent) : parseScalar(k.rest, l.no);
    }
    if (pos < lines.length && lines[pos].indent > indent) throw new Error(`yaml-lite dòng ${lines[pos].no}: thụt lề không khớp`);
    return obj;
  }
  function list(indent) {
    const arr = [];
    while (pos < lines.length && lines[pos].indent === indent && isItem(lines[pos])) {
      const l = lines[pos];
      const rest = l.text.slice(1).trim();
      if (rest === '') throw new Error(`yaml-lite dòng ${l.no}: phần tử list rỗng`);
      if (keyOf(rest)) {
        // phần tử là map: coi phần sau "- " như dòng đầu của map thụt thêm 2
        lines[pos] = { indent: indent + 2, text: rest, no: l.no };
        arr.push(map(indent + 2));
      } else {
        pos++;
        const v = parseScalar(rest, l.no);
        if (Array.isArray(v)) throw new Error(`yaml-lite dòng ${l.no}: không hỗ trợ list lồng trực tiếp trong list`);
        arr.push(v);
      }
    }
    if (pos < lines.length && lines[pos].indent > indent) throw new Error(`yaml-lite dòng ${lines[pos].no}: thụt lề không khớp`);
    return arr;
  }

  if (!lines.length) return {};
  if (lines[0].indent !== 0 || isItem(lines[0])) throw new Error(`yaml-lite dòng ${lines[0].no}: gốc tài liệu phải là map không thụt lề`);
  const root = map(0);
  if (pos < lines.length) throw new Error(`yaml-lite dòng ${lines[pos].no}: nội dung thừa hoặc thụt lề sai`);
  return root;
}

module.exports = { stringify, parse };
