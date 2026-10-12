'use strict';
// spec: CTX-S-003
// Đồ dùng chung của các bộ nhận dạng (recognizers/): cách đặt mã nút, cách đọc Markdown có khuôn, vài hàm chữ.
// Đây là phần "hợp đồng" mà bộ nhận dạng được phép nhập. Hàm thuần, không đọc đĩa, không biết bộ nhận dạng nào tồn tại.
// Bộ nhận dạng KHÔNG nhập lẫn nhau và không nhập lõi của kho (context*.js); test quét lệnh nhập giữ điều đó.
const path = require('path').posix;

const cut = (s, n = 200) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const listField = (v) => String(v || '').split(',').map((x) => x.trim()).filter(Boolean);
const lineOf = (text, index) => text.slice(0, index).split('\n').length;
// Dòng chỉ là chú thích thì bỏ qua, kẻo ví dụ trong chú thích thành lệnh nhập giả.
const codeLines = (text, isComment) => text.split('\n').map((l, i) => ({ l, n: i + 1 })).filter((x) => !isComment(x.l.trim()));
const isTestPath = (p) => /(^|\/)(tests?|__tests__|e2e|spec)\//.test(p) || /\.(test|spec)\.[cm]?[jt]s$/.test(p) || /(^|\/)(test_[^/]*|[^/]*_test|conftest)\.py$/.test(p);

// Mã nút. Mỗi loại vật có một cách đặt mã duy nhất, để hai bộ nhận dạng nói về cùng một vật thì ra cùng một mã.
const ID = {
  svc: (s) => `svc:${s}`, file: (s, p) => `file:${s}:${p}`, sym: (s, p, n) => `sym:${s}:${p}#${n}`, api: (s, m, p) => `api:${s}:${m} ${p}`,
  topic: (t) => `topic:${t}`, table: (s, t) => `table:${s}.${t}`, ext: (n) => `ext:${n}`,
  doc: (kind, s, id) => `${kind}:${s}:${id}`,
  // Cửa vào: loại 'api' giữ cách đặt mã có từ trước (api:<dịch-vụ>:<tên>); các loại khác là entry:<dịch-vụ>:<loại>:<tên>.
  entry: (nodeType, s, kind, name) => (nodeType === 'entry' ? `entry:${s}:${kind}:${name}` : `${nodeType}:${s}:${name}`),
};

// Markdown có khuôn "## MÃ: tiêu đề" theo sau là các dòng "- khóa: giá trị" (ba tầng thiết kế, sổ quyết định).
function mdItems(text, idRe) {
  const lines = text.split('\n');
  const out = [];
  lines.forEach((l, i) => {
    const m = /^## (\S+?):\s*(.*)$/.exec(l);
    if (!m || !idRe.test(m[1])) return;
    const item = { id: m[1], title: m[2].trim(), line: i + 1, fields: {}, body: '' };
    let key = null;
    for (let j = i + 1; j < lines.length && !/^## /.test(lines[j]); j++) {
      const f = /^- ([A-Za-zÀ-ỹ_ ]{1,30}):\s?(.*)$/.exec(lines[j]);
      if (f) { key = f[1].trim().toLowerCase(); item.fields[key] = f[2]; } else if (key && lines[j].trim()) item.fields[key] += ` ${lines[j].trim()}`;
      item.body += `${lines[j]}\n`;
    }
    out.push(item);
  });
  return out;
}

module.exports = { path, cut, listField, lineOf, codeLines, isTestPath, ID, mdItems };
