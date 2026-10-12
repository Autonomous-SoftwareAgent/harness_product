'use strict';
// spec: HOOK-S-004
// Tách một chuỗi lệnh shell thành các lệnh con, mỗi lệnh con là danh sách từ. Thuần: chỉ xử lý chuỗi.
// HIỂU DẤU NHÁY: dấu ngăn lệnh (&& || ; | & xuống dòng, ngoặc đơn) chỉ có nghĩa khi nằm NGOÀI nháy; chữ trong nháy là một phần của một từ.
// Bản đầu tách theo biểu thức chính quy nên cắt ngang chuỗi trong nháy có chứa "&&" và chặn nhầm lệnh chỉ NHẮC tới việc đẩy (lời nhắn
// commit, lệnh echo, lệnh thử). Lệnh trong $( ) và trong dấu huyền là lệnh thật, kể cả khi nằm trong nháy kép, nên được tách ra xét riêng.
// Không hiểu hết cú pháp shell; không chắc thì bên gọi cho qua.
// Trả [[{ v: chữ, q: có phần nào nằm trong nháy không }]].
function parse(cmd) {
  const s = String(cmd);
  const out = [];
  let seg = [];
  let cur = null; // từ đang ghép: { v, q }
  const add = (ch, quoted) => { if (!cur) cur = { v: '', q: false }; cur.v += ch; if (quoted) cur.q = true; };
  const endWord = () => { if (cur) { seg.push(cur); cur = null; } };
  const endSeg = () => { endWord(); if (seg.length) out.push(seg); seg = []; };
  // vị trí dấu đóng khớp với "$(" mở ở `from` (đếm ngoặc lồng nhau, bỏ qua ngoặc trong nháy đơn)
  const closeOf = (from) => {
    let depth = 1;
    for (let j = from; j < s.length; j++) {
      if (s[j] === "'") { const k = s.indexOf("'", j + 1); if (k < 0) return -1; j = k; continue; }
      if (s[j] === '(') depth++;
      else if (s[j] === ')' && --depth === 0) return j;
    }
    return -1;
  };
  let i = 0;
  let dq = false; // đang trong nháy kép
  while (i < s.length) {
    const ch = s[i];
    // dấu \ : ngoài nháy thì thoát ký tự kế tiếp; trong nháy kép chỉ thoát $ ` " \ (đường dẫn Windows trong nháy kép giữ nguyên dấu \)
    if (ch === '\\' && i + 1 < s.length && (!dq || '$`"\\'.includes(s[i + 1]))) { add(s[i + 1], dq); i += 2; continue; }
    if (ch === '$' && s[i + 1] === '(') {
      const end = closeOf(i + 2);
      if (end < 0) { add(ch, dq); i++; continue; }
      out.push(...parse(s.slice(i + 2, end)));
      add('$()', dq); i = end + 1; continue;
    }
    if (ch === '`') {
      const end = s.indexOf('`', i + 1);
      if (end < 0) { add(ch, dq); i++; continue; }
      out.push(...parse(s.slice(i + 1, end)));
      add('$()', dq); i = end + 1; continue;
    }
    if (dq) { if (ch === '"') { dq = false; if (!cur) cur = { v: '', q: true }; cur.q = true; } else add(ch, true); i++; continue; }
    if (ch === '"') { dq = true; if (!cur) cur = { v: '', q: true }; cur.q = true; i++; continue; }
    if (ch === "'") {
      const end = s.indexOf("'", i + 1);
      if (end < 0) { add(ch, false); i++; continue; } // nháy lẻ: coi là chữ thường
      if (!cur) cur = { v: '', q: true };
      cur.v += s.slice(i + 1, end); cur.q = true; i = end + 1; continue;
    }
    if (ch === '&' && s[i + 1] === '&') { endSeg(); i += 2; continue; }
    if (ch === '|' && s[i + 1] === '|') { endSeg(); i += 2; continue; }
    if (ch === ';' || ch === '|' || ch === '\n' || ch === '&' || ch === '(' || ch === ')' || ch === '{' || ch === '}') { endSeg(); i++; continue; }
    if (/\s/.test(ch)) { endWord(); i++; continue; }
    add(ch, false); i++;
  }
  endSeg();
  return out;
}
const segments = (cmd) => parse(cmd).map((seg) => seg.map((w) => w.v).join(' '));

// Các cờ của `git commit`, bỏ GIÁ TRỊ đi sau cờ nhận giá trị (-m, -F, -C, -c, --message, --file, --author, --date...):
// lời nhắn "-n" hay "--no-verify" không phải là cờ.
function commitFlags(rest) {
  const flags = [];
  for (let i = 0; i < rest.length; i++) {
    const x = rest[i];
    if (!x.startsWith('-')) continue;
    flags.push(x);
    if (/^--(message|file|author|date|reuse-message|reedit-message|fixup|squash|template|cleanup|pathspec-from-file)$/.test(x)) i++;
    else if (/^-[a-zA-Z]*[mFCct]$/.test(x)) i++;
  }
  return flags;
}

module.exports = { parse, segments, commitFlags };
