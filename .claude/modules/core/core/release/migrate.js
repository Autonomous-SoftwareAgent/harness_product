'use strict';
// spec: HOOK-S-019
// BƯỚC CHUYỂN CẤU HÌNH của một bản phát hành: khi bản mới đổi tên một khóa, một công cụ hay một máy chủ, dự án đã cài không phải sửa tay.
// Mỗi bước là DỮ LIỆU (không phải mã): một tệp JSON của dự án và một dãy thao tác. Hàm thuần: nhận nội dung đã đọc, trả nội dung mới và
// lời kể từng chỗ đã đổi; bên gọi đọc và ghi tệp. Chạy lại bao nhiêu lần cũng cho cùng kết quả.
//
//   { "id": "ten-buoc", "file": ".claude/settings.json",
//     "when": { "decision": "id điểm cần quyết", "equals": "value" },      tùy chọn: chỉ chạy khi người dùng đã chọn đúng giá trị đó
//     "ops": [
//       { "op": "set",     "path": ["a", "b"], "value": <bất kỳ>, "when": "missing" | "always" },   mặc định "missing": không đè thứ đã có
//       { "op": "remove",  "path": ["a", "b"] },
//       { "op": "rename",  "path": ["a", "b"], "to": "c" },                khóa b của a đổi tên thành c; đã có c thì giữ c, bỏ b
//       { "op": "replace", "path": ["a"], "from": "chuỗi cũ", "to": "chuỗi mới", "keys": true | false }
//                                           thay trong MỌI chuỗi nằm dưới đường dẫn đó (kể cả trong mảng); keys: thay cả trong tên khóa
//     ] }
// Tệp được phép: .mcp.json, .claude/settings.json và tệp JSON nằm ngay trong .claude/project/. Không tệp nào khác.
const OPS = ['set', 'remove', 'rename', 'replace'];
const ID_RE = /^[a-z][a-z0-9-]{1,60}$/;
const allowedFile = (rel) => rel === '.mcp.json' || rel === '.claude/settings.json' || /^\.claude\/project\/[A-Za-z0-9._-]+\.json$/.test(String(rel));
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const pathOk = (p) => Array.isArray(p) && p.every((k) => typeof k === 'string' && k.length > 0 && !['__proto__', 'constructor', 'prototype'].includes(k));
const show = (p) => (p.length ? p.join('.') : '(gốc)');
const brief = (v) => { const s = JSON.stringify(v); return s.length > 120 ? `${s.slice(0, 117)}...` : s; };

function check(m) {
  const errs = [];
  if (!m || typeof m !== 'object') return ['bước chuyển không phải đối tượng'];
  const at = `bước chuyển ${m.id || '(không tên)'}`;
  if (!ID_RE.test(String(m.id || ''))) errs.push(`${at}: "id" phải là chữ thường, số, gạch ngang`);
  if (!allowedFile(m.file)) errs.push(`${at}: "file" phải là .mcp.json, .claude/settings.json hoặc một tệp JSON trong .claude/project/`);
  if (m.when !== undefined && !(isObj(m.when) && typeof m.when.decision === 'string' && typeof m.when.equals === 'string')) errs.push(`${at}: "when" phải có "decision" và "equals"`);
  const ops = Array.isArray(m.ops) ? m.ops : [];
  if (!ops.length) errs.push(`${at}: "ops" trống`);
  ops.forEach((o, i) => {
    const w = `${at}, thao tác ${i + 1}`;
    if (!o || !OPS.includes(o.op)) { errs.push(`${w}: "op" phải là một trong ${OPS.join(', ')}`); return; }
    if (!pathOk(o.path)) { errs.push(`${w}: "path" phải là mảng tên khóa`); return; }
    if (o.op !== 'replace' && !o.path.length) errs.push(`${w}: "path" không được rỗng`);
    if (o.op === 'set' && (o.value === undefined || (o.when !== undefined && !['missing', 'always'].includes(o.when)))) errs.push(`${w}: "set" cần "value"; "when" là missing hoặc always`);
    if (o.op === 'rename' && (typeof o.to !== 'string' || !pathOk([o.to]))) errs.push(`${w}: "rename" cần "to" là tên khóa`);
    if (o.op === 'replace' && (typeof o.from !== 'string' || !o.from || typeof o.to !== 'string')) errs.push(`${w}: "replace" cần "from" (không rỗng) và "to"`);
    if (o.op === 'replace' && typeof o.from === 'string' && typeof o.to === 'string' && o.to.includes(o.from)) errs.push(`${w}: "to" chứa "from" nên chạy lại sẽ thay thêm lần nữa`);
  });
  return errs;
}

const parentOf = (doc, p) => { let cur = doc; for (const k of p.slice(0, -1)) { if (!isObj(cur) || !(k in cur)) return null; cur = cur[k]; } return isObj(cur) ? cur : null; };
const getAt = (doc, p) => { let cur = doc; for (const k of p) { if (!isObj(cur) || !Object.prototype.hasOwnProperty.call(cur, k)) return undefined; cur = cur[k]; } return cur; };

function replaceDeep(v, from, to, keys, count) {
  if (typeof v === 'string') { if (!v.includes(from)) return v; count.n += 1; return v.split(from).join(to); }
  if (Array.isArray(v)) return v.map((x) => replaceDeep(x, from, to, keys, count));
  if (isObj(v)) {
    const out = {};
    for (const [k, x] of Object.entries(v)) {
      let nk = k;
      if (keys && k.includes(from)) { nk = k.split(from).join(to); count.n += 1; }
      // Tên mới đã có sẵn: giữ thứ đã có (không đè), bỏ khóa cũ.
      if (nk !== k && Object.prototype.hasOwnProperty.call(v, nk)) continue;
      out[nk] = replaceDeep(x, from, to, keys, count);
    }
    return out;
  }
  return v;
}

// Chạy một bước trên nội dung `doc` (đã đọc từ tệp; không bị sửa). `answers`: { id điểm cần quyết: value }.
// Trả { doc, changed, notes, skipped }: `notes` kể từng chỗ đổi; `skipped` có chữ khi điều kiện "when" không thỏa.
function run(m, doc, answers = {}) {
  if (m.when && answers[m.when.decision] !== m.when.equals) return { doc, changed: false, notes: [], skipped: `chỉ chạy khi "${m.when.decision}" là "${m.when.equals}"` };
  if (!isObj(doc)) return { doc, changed: false, notes: [], skipped: 'nội dung tệp không phải một đối tượng JSON' };
  let cur = JSON.parse(JSON.stringify(doc));
  const notes = [];
  for (const o of m.ops) {
    if (o.op === 'set') {
      const has = getAt(cur, o.path) !== undefined;
      if (has && (o.when || 'missing') === 'missing') continue;
      if (has && JSON.stringify(getAt(cur, o.path)) === JSON.stringify(o.value)) continue;
      let node = cur;
      for (const k of o.path.slice(0, -1)) { if (!isObj(node[k])) node[k] = {}; node = node[k]; }
      node[o.path[o.path.length - 1]] = JSON.parse(JSON.stringify(o.value));
      notes.push(`${has ? 'đặt lại' : 'thêm'} ${show(o.path)} = ${brief(o.value)}`);
    } else if (o.op === 'remove') {
      const par = parentOf(cur, o.path); const k = o.path[o.path.length - 1];
      if (par && Object.prototype.hasOwnProperty.call(par, k)) { delete par[k]; notes.push(`bỏ ${show(o.path)}`); }
    } else if (o.op === 'rename') {
      const par = parentOf(cur, o.path); const k = o.path[o.path.length - 1];
      if (!par || !Object.prototype.hasOwnProperty.call(par, k)) continue;
      if (Object.prototype.hasOwnProperty.call(par, o.to)) notes.push(`bỏ ${show(o.path)} (đã có ${o.to}, giữ cái đã có)`);
      else {
        // Giữ thứ tự khóa: khóa mới đứng đúng chỗ khóa cũ.
        const entries = Object.entries(par).map(([a, b]) => [a === k ? o.to : a, b]);
        for (const a of Object.keys(par)) delete par[a];
        for (const [a, b] of entries) par[a] = b;
        notes.push(`đổi tên ${show(o.path)} thành ${o.to}`);
        continue;
      }
      delete par[k];
    } else if (o.op === 'replace') {
      const target = o.path.length ? getAt(cur, o.path) : cur;
      if (target === undefined) continue;
      const count = { n: 0 };
      const next = replaceDeep(target, o.from, o.to, o.keys === true, count);
      if (!count.n) continue;
      if (o.path.length) parentOf(cur, o.path)[o.path[o.path.length - 1]] = next; else cur = next;
      notes.push(`thay "${o.from}" bằng "${o.to}" ở ${count.n} chỗ dưới ${show(o.path)}`);
    }
  }
  return { doc: cur, changed: notes.length > 0, notes, skipped: '' };
}

module.exports = { OPS, check, run, allowedFile };
