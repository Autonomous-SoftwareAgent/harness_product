'use strict';
// spec: HOOK-S-012
// LUẬT nhắc nạp lại. Không bao giờ chặn.
// Phần lớn harness có hiệu lực ngay ở phiên đang mở (mã hook, hook khai trong settings, mã công cụ, phần xử lý của máy chủ MCP, skill
// đều được đọc lại; đã đo 2026-10-13). Hai thứ công cụ chủ chỉ nạp MỘT lần lúc phiên mở: tệp hướng dẫn ở gốc dự án, và tệp mồi của máy
// chủ công cụ (đóng băng, gần như không bao giờ đổi). Thứ đó đổi giữa phiên thì luật này tự đưa phần mới tới phiên:
//   - tệp hướng dẫn: ĐƯA THẲNG các dòng đã đổi vào ngữ cảnh của phiên ở lượt kế tiếp (không ai phải nhắc, phiên không phải đọc lại);
//     phần đổi quá dài thì bảo phiên tự đọc lại tệp bằng công cụ Read;
//   - tệp mồi của máy chủ công cụ: chỉ còn cách nối lại, nên nhắn một lần.
//   session-start  ghi dấu hiện tại và bản phiên vừa nạp (mở mới, nối lại, nén hay xóa ngữ cảnh đều là lúc công cụ chủ nạp lại tệp hướng dẫn)
//   user-prompt    so dấu; phiên chưa có dấu gốc (mở từ trước khi có luật này) thì chỉ ghi, không đoán
// Lõi không biết tên tệp nào: cổng "dự án" trả danh sách [{ id, label, stamp }] và phần đã đổi (loadedDiff).
const { note } = require('../../ports/events');

const BASE = 'loaded-base:';
const prefix = (id) => `loaded:${id}:`;
const MAX_DIFF_CHARS = 3000;

// Lời đưa phần đã đổi của tệp hướng dẫn; '' nếu không có gì để đưa hoặc phần đổi quá dài.
function diffText(label, diff) {
  if (!diff || (!diff.added.length && !diff.removed.length)) return '';
  const lines = [`${label} (quy tắc chung của dự án) vừa đổi. Làm theo BẢN MỚI từ lượt này; chỗ nào bản mới khác điều bạn đang làm thì báo người dùng.`];
  if (diff.added.length) lines.push('Dòng MỚI hoặc đã sửa:', ...diff.added.map((l) => `+ ${l}`));
  if (diff.removed.length) lines.push('Dòng đã BỎ hoặc bị thay (không còn hiệu lực):', ...diff.removed.map((l) => `- ${l}`));
  const text = lines.join('\n');
  return text.length > MAX_DIFF_CHARS ? '' : text;
}

async function run(event, { workspace: ws, store }) {
  const sid = event.session;
  if (!sid || event.agent) return null; // agent con dùng chung phần đã nạp của phiên chính
  let items = [];
  try { items = ws.loadedOnce().filter((x) => x && x.id && x.stamp); } catch { return null; }
  if (!items.length) return null;
  const mark = async (x) => store.noteOnce(sid, prefix(x.id), `${prefix(x.id)}${x.stamp}`);
  const keep = (id) => { try { return ws.loadedDiff(sid, id); } catch { return null; } }; // cũng ghi bản hiện tại làm bản phiên đã nạp
  if (event.kind === 'session-start') {
    // Nén hay xóa ngữ cảnh: tệp hướng dẫn được nạp lại, nhưng tiến trình của phiên (và máy chủ công cụ nó giữ) vẫn là tiến trình cũ.
    const sameProcess = event.source === 'compact' || event.source === 'clear';
    const fresh = await store.noteOnce(sid, BASE, `${BASE}1`);
    for (const x of items) if (fresh || !sameProcess || x.id === 'instructions') await mark(x);
    keep('instructions');
    return null;
  }
  if (event.kind !== 'user-prompt') return null;
  // Chưa có dấu gốc: không biết phiên đã nạp bản nào, nên không đoán. Ghi dấu bây giờ để lần đổi sau được đưa tới.
  const noBase = await store.noteOnce(sid, BASE, `${BASE}1`);
  const changed = [];
  for (const x of items) if (await mark(x) && !noBase) changed.push(x);
  if (noBase) { keep('instructions'); return null; }
  if (!changed.length) return null;
  const parts = [];
  for (const x of changed) {
    if (x.id === 'instructions') {
      const t = diffText(x.label, keep('instructions'));
      parts.push(t || `${x.label} (quy tắc chung của dự án) đã đổi nhiều: đọc lại ngay bằng công cụ Read rồi làm theo bản mới; chỗ nào bản mới khác điều bạn đang làm thì báo người dùng.`);
    } else if (x.id === 'mcp') {
      parts.push(`${x.label}: tệp mồi hoặc tệp khai máy chủ đã đổi, phiên đang giữ tiến trình cũ. Công cụ vẫn gọi được và vẫn chạy mã mới nhất; để nhận tệp mồi mới thì người dùng gõ /mcp và nối lại (chỉ cần khi kết quả công cụ có dòng "CẢNH BÁO bsn-docs").`);
    } else parts.push(`${x.label} đã đổi.`);
  }
  return {
    ...note(`HARNESS ĐÃ ĐỔI từ lúc phiên này nạp. Lời này chỉ hiện một lần cho mỗi bản mới.\n${parts.join('\n\n')}`),
    detail: `đổi sau khi nạp: ${changed.map((x) => x.id).join(', ')}`,
  };
}

// Những thứ phiên `noted` (các ghi chú của phiên, dạng chuỗi) đang giữ bản cũ so với `items` hiện tại. Phiên chưa có dấu gốc thì trả null (không rõ).
function staleOf(items, noted) {
  const set = new Set(noted || []);
  if (!set.has(`${BASE}1`)) return null;
  return (items || []).filter((x) => x && x.id && x.stamp && !set.has(`${prefix(x.id)}${x.stamp}`)).map((x) => x.label);
}

module.exports = { id: 'reload', on: ['session-start', 'user-prompt'], run, staleOf, diffText, NOTE_PREFIXES: [BASE, 'loaded:'], MAX_DIFF_CHARS };
