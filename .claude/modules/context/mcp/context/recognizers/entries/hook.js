'use strict';
// spec: CTX-S-003
// Bộ nhận dạng CỬA VÀO: hook của Claude Code (đoạn mã Claude Code gọi ở một sự kiện của phiên). Hai cách nhận, đều bằng mẫu văn bản:
//   Tệp cấu hình JSON có khóa `hooks` theo hình dạng của Claude Code ({ "hooks": { "<Sự kiện>": [{ matcher?, hooks: [{ command }] }] } }):
//     mỗi lệnh là một cửa vào "<Sự kiện> [bộ lọc] → <tệp được gọi>".
//   Tệp JavaScript in ra `hookSpecificOutput` hoặc `hookEventName` (câu trả lời của một hook): tệp đó là một cửa vào; sự kiện lấy từ chuỗi
//     `hookEventName: '<Sự kiện>'` viết rõ trong mã, không thấy thì ghi "sự kiện không rõ".
// Cách thứ hai chỉ là ĐOÁN từ mã (đánh dấu weak): khi một tệp cấu hình đã khai hook trỏ tới cùng tệp (target) thì bản đoán bị bỏ, không vẽ trùng.
// Giới hạn: bộ này chỉ thấy tệp nằm TRONG thư mục của đơn vị, cộng các tệp đơn vị khai đọc thêm (units.json, trường reads). Tệp cấu hình hook
// nằm ngoài mà không được khai (ví dụ .claude/settings.json ở gốc dự án, trong khi đơn vị là một thư mục con) thì chỉ còn cách nhận thứ hai.
const { path } = require('../kit');

function fromConfig(text) {
  let doc;
  try { doc = JSON.parse(text); } catch { return []; }
  const hooks = doc && typeof doc === 'object' && !Array.isArray(doc) ? doc.hooks : null;
  if (!hooks || typeof hooks !== 'object' || Array.isArray(hooks)) return [];
  const out = [];
  for (const [event, groups] of Object.entries(hooks)) {
    for (const grp of Array.isArray(groups) ? groups : []) {
      for (const h of (grp && Array.isArray(grp.hooks) ? grp.hooks : [])) {
        if (!h || typeof h.command !== 'string') continue;
        const target = (/([\w.-]+\.(?:c?js|mjs|py|sh))["']?(\s+[\w-]+)?\s*$/.exec(h.command) || [])[0] || h.command;
        const at = text.indexOf(JSON.stringify(h.command).slice(1, -1));
        out.push({ name: `${event}${grp.matcher ? ` [${grp.matcher}]` : ''} → ${target.replace(/["']/g, '').trim()}`, line: at < 0 ? 1 : text.slice(0, at).split('\n').length, event, target: (/([\w.-]+\.(?:c?js|mjs|py|sh))/.exec(target) || [])[1] || '' });
      }
    }
  }
  return out;
}

function find(file, text, lang) {
  if (lang === null) return file.endsWith('.json') && /"hooks"\s*:/.test(text) ? fromConfig(text) : [];
  if (lang !== 'js') return [];
  const base = path.basename(file);
  // Dòng chú thích không tính (một tệp chỉ NHẮC tới các từ này trong chú thích không phải hook).
  const rows = text.split('\n').map((l) => (/^\s*(\/\/|\*|\/\*)/.test(l) ? '' : l));
  if (!rows.some((l) => /\bhook(SpecificOutput|EventName)\b/.test(l))) return [];
  const events = new Map();
  rows.forEach((l, i) => { for (const m of l.matchAll(/\bhookEventName['"]?\s*:\s*(['"])([A-Za-z]+)\1/g)) if (!events.has(m[2])) events.set(m[2], i + 1); });
  if (!events.size) return [{ name: `${base} (sự kiện không rõ)`, line: rows.findIndex((l) => /\bhook(SpecificOutput|EventName)\b/.test(l)) + 1, event: 'sự kiện không rõ', weak: true, target: base }];
  return [...events.entries()].map(([event, line]) => ({ name: `${event} → ${base}`, line, event, weak: true, target: base }));
}

// Trên sơ đồ, hook gom theo sự kiện.
const bucket = (name) => (name.includes(' → ') ? name.split(' → ')[0].replace(/\s*\[.*\]$/, '') : 'sự kiện không rõ');

module.exports = { id: 'hook', label: 'hook của Claude Code', group: 'Cửa vào: hook do Claude Code gọi (đọc từ mã)', unit: 'hook', order: 40, find, bucket };
