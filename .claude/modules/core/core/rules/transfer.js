'use strict';
// spec: HOOK-S-013
// LUẬT nhắc đọc tờ bàn giao. Không bao giờ chặn.
// Phiên được tạo bằng lệnh chuyển phiên nhận một tờ bàn giao ở máy. Lời mở đầu của phiên đã trỏ tới tờ đó, nhưng lời mở đầu trôi đi
// (nén ngữ cảnh, phiên dựng lại): luật này nhắc ở đầu phiên và ở mỗi lượt cho tới khi phiên ĐỌC tệp bằng công cụ đọc (luật ghi sổ ghi nhận
// lần đọc). Lõi không biết tờ nằm ở đâu: cổng "dự án" trả tờ chưa đọc của phiên.
const { note } = require('../../ports/events');
const T = require('../sessions/transfer');

async function run(event, { workspace: ws }) {
  const sid = event.session;
  if (!sid || event.agent) return null; // agent con không nhận bàn giao
  if (event.kind !== 'session-start' && event.kind !== 'user-prompt') return null;
  let p = null;
  try { p = ws.transferPending(sid); } catch { return null; }
  if (!p) return null;
  return { ...note(T.reminder(p)), detail: `chưa đọc tờ bàn giao ${p.id}` };
}

module.exports = { id: 'transfer', on: ['session-start', 'user-prompt'], run };
