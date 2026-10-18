'use strict';
// LUẬT nhắc đầu phiên về token GitHub: chỉ nói khi có vấn đề (chưa có token, GitHub không nhận, sắp hết hạn, quyền thừa hay thiếu,
// kho không mã hóa). Việc phải làm luôn là của NGƯỜI DÙNG, trong terminal của họ; phiên không đọc, không đổi token.
// params: { health() -> { level, lines, store } } (cửa vào cấp; dùng bản tạm 6 giờ nên đầu phiên ít khi gọi mạng).
const { note } = require('../../../core/ports/events');

async function run(event, ports, params) {
  if (!params || typeof params.health !== 'function') return null;
  const h = await params.health();
  if (!h || h.level === 'ok') return null;
  // Chưa từng nạp token thì im lặng: dự án không dùng GitHub qua harness thì không nhắc.
  if (h.level === 'bad' && /chưa có token/.test(h.lines.join(' '))) return null;
  return note(`Token GitHub của máy (${h.store}) ${h.level === 'bad' ? 'KHÔNG DÙNG ĐƯỢC' : 'cần xem'}: ${h.lines.join('; ')}. Báo người dùng; phiên không đọc, không đổi token (người dùng chạy \`cli.js secret rotate\` trong terminal của họ).`);
}

module.exports = { id: 'secrets-brief', on: 'session-start', run };
