'use strict';
// spec: HOOK-S-004
// Phần "nghĩ" của việc quét từ cấm (S-034): một từ trong danh sách khớp những cách viết nào. Thuần: không biết danh sách nằm ở đâu
// và không chứa từ nào; bên gọi đưa danh sách vào.
// Một từ trong danh sách khớp nhiều cách viết, vì người viết hiếm khi gõ đúng một dạng:
//   - không phân biệt hoa thường;
//   - dấu cách, gạch dưới, gạch ngang, dấu chấm trong từ là tùy ý: khai "ab_cd" thì "ab cd", "ab-cd", "abcd" đều khớp;
//   - thêm "s" hoặc "'s" ở cuối vẫn khớp;
//   - ranh giới là ký tự KHÔNG phải chữ cái: chữ số sát bên vẫn khớp ("ab2"), và chỗ chuyển chữ thường sang chữ hoa cũng là ranh giới ("myAb", "abRollout");
//   - từ DÀI (từ LONG chữ cái trở lên, không tính dấu phân cách): khớp cả khi dính liền trong từ khác ("myabcdefg", "abcdefgs"),
//     và khớp khi bị chen dấu phân cách ở bất kỳ đâu ("abc defg", "abc_defg") miễn hai đầu là ranh giới.
// Từ NGẮN không khớp khi dính liền chữ khác: nếu không, một từ ba chữ cái sẽ bắt nhầm vô số từ thông thường.
const LONG = 6;
const SEP = '[\\s_.\\-]';
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function patternOf(word) {
  const parts = word.toLowerCase().split(/[\s_.-]+/).filter(Boolean);
  if (!parts.length) return [];
  const bounded = (body) => `(?<!\\p{L})${body}(?:'?s)?(?!\\p{L})`;
  const out = [bounded(parts.map(escRe).join(`${SEP}*`))];
  const letters = parts.join('');
  if (letters.length >= LONG) {
    out.push(escRe(letters)); // dính liền trong từ khác
    out.push(bounded([...letters].map(escRe).join(`${SEP}*`))); // chen dấu phân cách ở bất kỳ đâu
  }
  return out;
}

// Trả vật có .test(chuỗi). Thử cả chuỗi gốc lẫn bản đã tách chỗ chuyển chữ thường sang chữ hoa (camelCase).
function matcher(words) {
  const pats = [...new Set(words.flatMap(patternOf))].sort((a, b) => b.length - a.length);
  const re = new RegExp(pats.join('|') || '(?!)', 'iu');
  return { test: (s) => { const t = String(s); return re.test(t) || re.test(t.replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2')); } };
}

// Các dòng (đếm từ 1) của `text` có từ cấm.
function linesWith(text, re) {
  const out = [];
  const lines = String(text).split('\n');
  for (let i = 0; i < lines.length; i++) if (re.test(lines[i])) out.push(i + 1);
  return out;
}

module.exports = { LONG, patternOf, matcher, linesWith };
