'use strict';
// spec: PORT-S-003
// LÕI của việc dò gói publish (S-053, S-055): ba lượt dò khác cách trên MỘT đoạn văn bản, và lời báo kết quả.
// Thuần: không đọc tệp, không biết danh sách từ cấm hay danh sách "đã xem, vô hại" nằm ở đâu; bên gọi (mcp/publish-scan.js) đưa vào.
// Kết quả chỉ nêu dòng, loại và mã băm ngắn của chuỗi bị báo; không bao giờ in lại chuỗi đó.
const crypto = require('node:crypto');

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const lineAt = (text, index) => { let n = 1; for (let i = text.indexOf('\n'); i >= 0 && i < index; i = text.indexOf('\n', i + 1)) n += 1; return n; };

// ---------- lượt 1: mẫu bí mật đã biết ----------
// Giá trị chỉ là chỗ giữ chỗ thì không phải bí mật: {password}, <mật-khẩu>, ${VAR}, $VAR, ***, xxx, TÊN_BIẾN_MÔI_TRƯỜNG.
const PLACEHOLDER = /^(?:\{[^}]*\}|<[^>]*>|&lt;.*&gt;|\$\{?[A-Za-z_][A-Za-z0-9_]*\}?|\*{3,}|x{3,}|\.{3,}|[A-Z][A-Z0-9_]*|%[A-Za-z0-9_]+%|…+)$/;
const SECRETS = [
  ['khóa riêng (PEM)', /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/g],
  ['token GitHub', /\bgh[pousr]_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{40,}\b/g],
  ['token Docker Hub', /\bdckr_pat_[A-Za-z0-9_-]{20,}/g],
  ['khóa API dạng sk-', /\bsk-(?:ant-)?[A-Za-z0-9_-]{24,}/g],
  ['khóa AWS', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g],
  ['khóa API Google', /\bAIza[0-9A-Za-z_-]{35}\b/g],
  ['token Slack', /\bxox[abprs]-[A-Za-z0-9-]{10,}/g],
  ['token JWT', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g],
];
// Địa chỉ có kèm mật khẩu: giao-thức://tên:mật-khẩu@máy. Mật khẩu là chỗ giữ chỗ thì bỏ qua.
const URL_CRED = /\b[a-z][a-z0-9+.-]{1,20}:\/\/([^\s:@/"'<>]{1,80}):([^\s@/"'<>]{1,200})@[^\s"'<>]/gi;

function patternHits(text, words) {
  const hits = [];
  for (const [type, re] of SECRETS) for (const m of text.matchAll(re)) hits.push({ line: lineAt(text, m.index), type, hash: sha(m[0]).slice(0, 16) });
  for (const m of text.matchAll(URL_CRED)) if (!PLACEHOLDER.test(m[2])) hits.push({ line: lineAt(text, m.index), type: 'địa chỉ có kèm mật khẩu', hash: sha(m[2]).slice(0, 16) });
  if (words) text.split('\n').forEach((l, i) => { if (words.test(l)) hits.push({ line: i + 1, type: 'từ cấm', hash: sha(l).slice(0, 16) }); });
  return hits;
}

// ---------- lượt 2: lột lớp vỏ rồi dò lại ----------
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const fromCode = (n) => { try { return n === 10 || n === 13 ? ' ' : String.fromCodePoint(n); } catch { return ''; } };
function unwrap(text) {
  let t = text.replace(/<[^>\n]{0,2000}>/g, ''); // bỏ thẻ trên một dòng: chữ bị ngắt bởi thẻ được nối lại; số dòng giữ nguyên
  t = t.replace(/&#x([0-9a-f]{1,6});/gi, (_, h) => fromCode(parseInt(h, 16))).replace(/&#(\d{1,7});/g, (_, d) => fromCode(Number(d)))
    .replace(/&([a-z]{2,6});/gi, (m, n) => (n.toLowerCase() in ENTITIES ? ENTITIES[n.toLowerCase()] : m));
  t = t.replace(/\\u\{([0-9a-f]{1,6})\}/gi, (_, h) => fromCode(parseInt(h, 16))).replace(/\\u([0-9a-f]{4})/gi, (_, h) => fromCode(parseInt(h, 16))).replace(/\\x([0-9a-f]{2})/gi, (_, h) => fromCode(parseInt(h, 16)));
  t = t.replace(/(?:%[0-9a-f]{2})+/gi, (m) => { try { return decodeURIComponent(m).replace(/[\r\n]/g, ' '); } catch { return m; } });
  return t.replace(/[\u200b-\u200f\u2060\ufeff\u00ad]/g, ''); // ký tự vô hình chen giữa chữ
}
// Khối base64 đủ dài: giải mã, nếu ra văn bản đọc được thì dò tiếp trong đó (kết quả mang số dòng của khối).
function base64Texts(text) {
  const out = [];
  for (const m of text.matchAll(/[A-Za-z0-9+/]{24,}={0,2}/g)) {
    if (m[0].length % 4 === 1) continue;
    let dec;
    try { dec = Buffer.from(m[0], 'base64').toString('utf8'); } catch { continue; }
    if (dec.length < 12 || /[\u0000-\u0008\u000e-\u001f\ufffd]/.test(dec)) continue;
    out.push({ line: lineAt(text, m.index), text: dec.replace(/[\r\n]/g, ' ') });
  }
  return out;
}
function unwrappedHits(text, words) {
  const plain = unwrap(text);
  const hits = patternHits(plain, words).map((h) => ({ ...h, type: `${h.type} (sau khi bỏ lớp vỏ)` }));
  for (const b of [...base64Texts(text), ...base64Texts(plain)]) for (const h of patternHits(b.text, words)) hits.push({ line: b.line, type: `${h.type} (trong khối base64)`, hash: h.hash });
  const seen = new Set();
  return hits.filter((h) => { const k = `${h.line}|${h.type}|${h.hash}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

// ---------- lượt 3: dấu hiệu ----------
const KEYWORD = /(?:pass(?:word|wd|phrase)?|mat[_-]?khau|mật khẩu|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|client[_-]?secret|credential|authorization|bearer)["'`]?\s*(?:[:=]|=>)\s*["'`]?([^\s"'`<>&,;)\]}]{8,200})/gi;
const entropy = (s) => { const f = new Map(); for (const c of s) f.set(c, (f.get(c) || 0) + 1); let e = 0; for (const n of f.values()) { const p = n / s.length; e -= p * Math.log2(p); } return e; };
const MIN_RANDOM = 24; // chuỗi liền từ độ dài này trở lên mới xét "trông ngẫu nhiên"
const MIN_ENTROPY = 4.2; // bit mỗi ký tự; chữ thường và đường dẫn nằm dưới ngưỡng này, khóa và token nằm trên
function signHits(text) {
  const hits = [];
  for (const m of text.matchAll(KEYWORD)) {
    const v = m[1];
    if (PLACEHOLDER.test(v) || !(/[0-9]/.test(v) && /[A-Za-z]/.test(v)) || /^[0-9a-f]+$/i.test(v)) continue; // chỗ giữ chỗ, chữ thường, mã băm thì bỏ
    hits.push({ line: lineAt(text, m.index), type: 'giá trị đứng sau chữ kiểu mật khẩu, token', hash: sha(v).slice(0, 16) });
  }
  // Bỏ phần dữ liệu của ảnh và phông nhúng (data:...;base64,...): lượt 2 đã giải mã và dò trong đó.
  const body = text.replace(/data:[a-z0-9.+/-]{3,40};base64,[A-Za-z0-9+/=]+/gi, (m) => ' '.repeat(m.length));
  for (const m of body.matchAll(/[A-Za-z0-9+/_=-]{24,}/g)) {
    const s = m[0];
    if (s.length < MIN_RANDOM || /^[0-9a-f]+$/i.test(s) || /^[0-9a-f-]+$/i.test(s)) continue; // mã commit, mã băm, UUID
    if (!(/[0-9]/.test(s) && /[a-z]/.test(s) && /[A-Z]/.test(s)) || entropy(s) < MIN_ENTROPY) continue;
    hits.push({ line: lineAt(body, m.index), type: 'chuỗi dài trông ngẫu nhiên', hash: sha(s).slice(0, 16) });
  }
  return hits;
}

const PASSES = [
  { id: 'theo-mau', title: 'Lượt 1: theo mẫu (từ cấm, dạng bí mật đã biết)' },
  { id: 'lot-vo', title: 'Lượt 2: sau khi bỏ thẻ và giải mã ký tự' },
  { id: 'dau-hieu', title: 'Lượt 3: theo dấu hiệu (giá trị sau chữ kiểu mật khẩu, chuỗi trông ngẫu nhiên)' },
];

// Văn bản cho người và cho phiên: từng lượt sạch hay có bao nhiêu chỗ, ở tệp và dòng nào. Không in nội dung bị báo.
function report(r, { max = 12 } = {}) {
  const out = [];
  for (const p of r.passes) {
    out.push(`${p.title}: ${p.hits.length ? `${p.hits.length} CHỖ BỊ BÁO` : 'sạch'}`);
    for (const h of p.hits.slice(0, max)) out.push(`    ${h.file}:${h.line} · ${h.type} · mã ${h.hash}`);
    if (p.hits.length > max) out.push(`    … còn ${p.hits.length - max} chỗ`);
  }
  for (const x of r.problems) out.push(`KHÔNG QUÉT ĐỦ: ${x}`);
  if (r.allowed) out.push(`(${r.allowed} chỗ của lượt 3 đã được người dùng ghi là vô hại trong .claude/local/publish-allow.json)`);
  out.push(r.ok ? `Ba lượt đều sạch trên ${r.scanned} tệp.` : 'CHƯA SẠCH. Dò lại từng chỗ bị báo ở đúng tệp và dòng đó: là bí mật hay từ cấm thật thì sửa NGUỒN (tài liệu của dịch vụ, rồi commit); là báo nhầm của lượt 3 thì trình người dùng, chỉ người dùng ghi mã của nó vào .claude/local/publish-allow.json. Chỗ của lượt 1 và 2 không có đường bỏ qua.');
  return out.join('\n');
}


module.exports = { sha, lineAt, PLACEHOLDER, SECRETS, URL_CRED, patternHits, ENTITIES, fromCode, unwrap, base64Texts, unwrappedHits, KEYWORD, entropy, MIN_RANDOM, MIN_ENTROPY, signHits, PASSES, report };
