'use strict';
// spec: PORT-S-003
// DÒ GÓI PUBLISH trước khi một phiên Claude đẩy cổng lên claude.ai (bổ sung S-005). Người dùng chốt ngày 2026-10-09: thà báo nhầm còn hơn sót;
// chỗ bị báo phải dò lại; đủ BA LƯỢT dò đều sạch thì mới được đẩy. Chạy cùng một phép dò ba lần thì vô nghĩa, nên ba lượt là ba CÁCH khác nhau,
// cùng chạy trên đúng những tệp sẽ gửi đi:
//   1. theo mẫu:      từ cấm (S-034) và các dạng bí mật đã biết, trên văn bản nguyên trạng;
//   2. lột lớp vỏ:    bỏ thẻ HTML, giải mã ký tự mã hóa (thực thể HTML, %XX, \uXXXX, base64), bỏ ký tự vô hình, rồi dò lại như lượt 1;
//   3. theo dấu hiệu: giá trị đứng sau chữ kiểu password, token, secret; và chuỗi dài trông ngẫu nhiên. Lượt này cố ý báo rộng.
// Kết quả chỉ nêu TỆP, DÒNG, LOẠI và mã băm ngắn của chuỗi bị báo; không bao giờ in lại chuỗi đó (kẻo chính kết quả làm lộ).
// Chỗ báo nhầm của lượt 3 chỉ được bỏ qua khi NGƯỜI DÙNG ghi mã băm của nó vào .claude/local/publish-allow.json (tệp ở máy, cổng duyệt
// không cho phiên Claude ghi). Chỗ bị báo ở lượt 1 và 2 không có đường bỏ qua: phải sửa nguồn.
// Không quét được (thiếu danh sách từ cấm, tệp không đọc được) thì kết quả là KHÔNG sạch: không quét được thì không đẩy.
// Giới hạn: đây là dò bằng máy theo mẫu chữ; nó không chứng minh được là không có bí mật. Lưới chính vẫn là không ghi bí mật vào tài liệu.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const P = require('../../gate/gate-paths');
const { sha, lineAt, PLACEHOLDER, SECRETS, URL_CRED, patternHits, ENTITIES, fromCode, unwrap, base64Texts, unwrappedHits, KEYWORD, entropy, MIN_RANDOM, MIN_ENTROPY, signHits, PASSES, report } = require('../../core/portal/publish-scan');

// ---------- chạy ba lượt trên một gói ----------
// Thư viện của bên thứ ba đã khóa bằng mã băm (vendor/README.md) được miễn lượt 3: nó là mã rút gọn, đầy chuỗi trông ngẫu nhiên, và đã được kiểm danh tính.
function pinnedHashes() {
  try { return new Set([...fs.readFileSync(path.join(__dirname, '..', 'vendor', 'README.md'), 'utf8').matchAll(/\b[0-9a-f]{64}\b/gi)].map((m) => m[0].toLowerCase())); } catch { return new Set(); }
}
const allowPath = (root) => path.join(P.localDir(root), 'publish-allow.json');
// { "allow": [{ "hash": "<16 ký tự>", "note": "vì sao vô hại" }] }. Tệp thiếu hay hỏng = không có gì được bỏ qua.
function loadAllow(root) {
  try { const raw = JSON.parse(fs.readFileSync(allowPath(root), 'utf8')); return new Set((Array.isArray(raw && raw.allow) ? raw.allow : []).map((x) => String((x && x.hash) || x)).filter((h) => /^[0-9a-f]{16}$/.test(h))); } catch { return new Set(); }
}

// files: { "<đường dẫn trong gói>": "<đường dẫn tuyệt đối>" }. words: bộ khớp từ cấm (banned-scan.matcher) hoặc null khi máy không có danh sách.
// Trả { ok, problems: [..lý do không sạch ngoài các chỗ bị báo..], passes: [{ id, title, hits: [{ file, line, type, hash }] }], allowed, scanned }.
function scan(files, { words = null, allow = new Set(), pinned = pinnedHashes() } = {}) {
  const passes = PASSES.map((p) => ({ ...p, hits: [] }));
  const problems = [];
  let allowed = 0; let scanned = 0;
  if (!words) problems.push('máy không có danh sách từ cấm (.claude/local/cam-tu.json): CHƯA QUÉT được từ cấm');
  for (const [rel, abs] of Object.entries(files).sort()) {
    let buf;
    try { buf = fs.readFileSync(abs); } catch (e) { problems.push(`không đọc được ${rel}: ${e.code || e.message}`); continue; }
    scanned += 1;
    const text = buf.toString('utf8').replace(/\r\n/g, '\n');
    const add = (i, hits) => { for (const h of hits) passes[i].hits.push({ file: rel, ...h }); };
    add(0, patternHits(text, words));
    add(1, unwrappedHits(text, words));
    if (pinned.has(sha(buf))) continue;
    for (const h of signHits(text)) { if (allow.has(h.hash)) allowed += 1; else passes[2].hits.push({ file: rel, ...h }); }
  }
  if (!scanned) problems.push('gói không có tệp nào đọc được');
  return { ok: !problems.length && passes.every((p) => !p.hits.length), problems, passes, allowed, scanned };
}

// Chạy trên gói publish của cây thật: nạp danh sách từ cấm và danh sách "đã xem, vô hại" của máy.
function scanBundle(root, files) {
  let words = null;
  try { const b = require('../../cli/banned-scan'); const list = b.loadWords(root); words = list ? b.matcher(list) : null; } catch { words = null; }
  return scan(files, { words, allow: loadAllow(root) });
}

module.exports = { scan, scanBundle, report, loadAllow, allowPath, patternHits, unwrappedHits, signHits, unwrap, PASSES };
