'use strict';
// spec: HOOK-S-006
// LÕI của bảng phiên (S-024, S-054, S-055): từ một ẢNH CHỤP dữ liệu do bộ chuyển gom sẵn, ghép thành bảng "phiên nào ở đâu, đang làm
// dịch vụ nào, còn sống hay đã dừng". Thuần: không đọc tệp của công cụ chủ, không hỏi hệ điều hành, không mở sổ, không hỏi giờ.
// Ảnh chụp (bộ chuyển của công cụ chủ gom; hôm nay là adapters/claude-code/sessions.js):
//   { error }                                  không đọc được sổ phiên của công cụ chủ; hoặc
//   { host, bad, records, starts, background, info }
//     host        tên máy đang chạy (chuỗi)
//     bad         số bản ghi phiên không đúng định dạng đã biết
//     records     phiên mở ở thư mục dự án, đã bỏ phiên có tiến trình đã mất:
//                 [{ sid, name, nameByUser, status, pid, procStart, hostName, at: 'here'|'other'|'unknown', via, remote: true|false|null }]
//     starts      { <số tiến trình>: <giờ khởi động thật> } cho các tiến trình cần đối chiếu
//     background  không có (không gộp phiên nền) | { error } | { list: [{ sid, bgId, name, status, running, sameRoot, cwd }] }
//     info        { <mã phiên>: { edits: [{ service, lastAt }], registered: [tên] | null, skills: [tên], title: { title, by } | null } }
const ACTIVE_MS = 2 * 60 * 60 * 1000; // coi là "đang làm" nếu sửa trong 2 giờ gần đây

function ago(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 1) return 'vừa xong';
  if (m < 60) return `${m} phút trước`;
  return `${Math.floor(m / 60)} giờ ${m % 60} phút trước`;
}

const SAME_START = 10_000_000n; // 1 giây, tính bằng đơn vị 100 nano giây của FILETIME
function sameStart(a, b) {
  try { const d = BigInt(a) - BigInt(b); return (d < 0n ? -d : d) <= SAME_START; } catch { return String(a) === String(b); }
}

// "stopped" do bảng đặt cho phiên nền không còn tiến trình. Chữ khác của công cụ chủ (ví dụ "blocked") in nguyên, không tự diễn giải.
const statusText = (s, r) => (s === 'busy' ? 'đang bận' : s === 'idle' ? 'đang rảnh' : s === 'stopped' ? `ĐÃ DỪNG, không nhận tin (chạy lại: claude respawn ${(r && r.bgId) || '<mã>'})` : s || '?');
function whereText(r) {
  const w = r.where || {};
  const host = w.host === 'here' ? 'máy này' : w.host === 'other' ? `KHÔNG PHẢI MÁY NÀY (${w.hostName})` : 'không rõ máy';
  const rc = w.remote === true ? 'bật' : w.remote === false ? 'không' : 'không rõ';
  const live = r.live === 'unconfirmed' ? ' · chưa xác nhận còn sống' : '';
  return `${host} · ${w.via || 'không rõ'}${r.bgId ? ` ${r.bgId}` : ''} · Remote Control: ${rc}${live}`;
}

// { rows: [{ skills, registered, services: [{ name, ageMs }], title, titleBy, sid, name, nameBy, status, me, where: { host, hostName, via, remote }, live }],
//   host, background?: { error }, error? }.
// where.host: 'here' | 'other' | 'unknown'. live: 'yes' (số tiến trình VÀ giờ khởi động khớp, hoặc công cụ chủ báo phiên nền đang chạy),
// 'unconfirmed' (chỉ biết số tiến trình còn tồn tại), 'unchecked' (phiên ở máy khác: không kiểm tiến trình), 'stopped' (phiên nền đã dừng).
function build(snap, { now, mySid } = {}) {
  if (snap.error) return { rows: [], error: snap.error };
  const { host, records, starts, info } = snap;
  const enrich = (sid) => {
    const i = info[sid] || {};
    const services = (i.edits || []).map((e) => ({ name: e.service, ageMs: now - e.lastAt })).sort((a, b) => a.ageMs - b.ageMs);
    return { skills: i.skills || [], registered: i.registered === undefined ? null : i.registered, services, title: i.title ? i.title.title : null, titleBy: i.title ? i.title.by : null };
  };
  const rows = [];
  for (const o of records) {
    let live = o.at === 'other' ? 'unchecked' : 'unconfirmed';
    // Số tiến trình còn tồn tại chưa đủ: hệ điều hành có thể đã cấp lại số đó cho chương trình khác. Đối chiếu giờ khởi động.
    if (o.at !== 'other' && typeof o.pid === 'number' && o.procStart) {
      const actual = starts[o.pid];
      if (actual && !sameStart(actual, o.procStart)) continue; // số tiến trình đã về tay chương trình khác: phiên này đã tắt
      if (actual) live = 'yes';
    }
    rows.push({ ...enrich(o.sid), sid: o.sid, name: o.name, nameBy: o.nameByUser ? 'người dùng đặt' : 'máy đặt', status: o.status || '?', me: o.sid === mySid, where: { host: o.at, hostName: o.hostName, via: o.via, remote: o.remote }, live });
  }
  const result = { rows, host };
  if (snap.background) {
    if (snap.background.error) result.background = { error: snap.background.error };
    else {
      for (const a of snap.background.list) {
        const via = a.sameRoot ? 'phiên nền' : `phiên nền ở bản sao làm việc ${a.cwd}`;
        // Phiên nền đang chạy cũng có trong sổ, nhưng sổ ghi nó như một phiên dòng lệnh (đã đo 2026-10-10): sửa nhãn theo danh sách này.
        const had = rows.find((r) => r.sid === a.sid);
        if (had) { had.bgId = a.bgId; had.where.via = via; continue; }
        // Không có tiến trình sống thì là đã dừng, bất kể công cụ chủ ghi trạng thái gì. Danh sách này do công cụ chủ trên máy này trả về,
        // nên phiên nền trong đó ở máy này. Nó không nói Remote Control bật hay không.
        rows.push({ ...enrich(a.sid), sid: a.sid, bgId: a.bgId, name: a.name, nameBy: 'người dùng đặt', status: a.running ? a.status : 'stopped', me: a.sid === mySid, where: { host: 'here', hostName: host, via, remote: null }, live: a.running ? 'yes' : 'stopped' });
      }
    }
  }
  rows.sort((a, b) => a.name.localeCompare(b.name));
  if (!rows.length && snap.bad) return { rows, host, error: `sổ phiên của Claude Code có ${snap.bad} tệp không đúng định dạng đã biết (có thể Claude Code đã đổi định dạng)` };
  return result;
}

// Các phiên đã làm một dịch vụ, mới nhất trước, không tính phiên đang hỏi và phiên không ở máy này. active = đã làm trong 2 giờ gần đây.
const forService = (rows, service) => rows.filter((r) => !r.me && r.where.host !== 'other' && r.services.some((s) => s.name === service))
  .map((r) => { const ageMs = r.services.find((s) => s.name === service).ageMs; return { ...r, ageMs, active: ageMs <= ACTIVE_MS }; }).sort((a, b) => a.ageMs - b.ageMs);

// Bảng ở dạng chữ. `withBackground`: bảng này có gộp phiên nền không (để dòng cuối nói đúng giới hạn).
function text({ rows, error, host, background }, { withBackground } = {}) {
  if (error) return `Bảng phiên: ${error}. Không đoán phiên nào làm dịch vụ nào; hỏi người dùng.`;
  const foot = [`Bảng chỉ gồm phiên Claude Code chạy trên máy này (${host}) ở thư mục này${withBackground ? ', kể cả phiên nền' : '; phiên nền xem bằng lệnh bg'}. Phiên chạy trên đám mây của tài khoản và phiên ở máy khác KHÔNG có ở đây: tên thấy trong danh sách nhắn tin mà không có trong bảng thì đừng coi là phiên của máy này.`];
  if (background && background.error) foot.push(`Phiên nền: KHÔNG đọc được danh sách (${background.error}); bảng có thể thiếu phiên nền.`);
  if (!rows.length) return ['Bảng phiên: không có phiên Claude Code nào đang mở ở thư mục này.', ...foot].join('\n');
  const line = (r) => {
    const svc = r.services.length ? r.services.map((s) => `${s.name} (sửa ${ago(s.ageMs)}${s.ageMs > ACTIVE_MS ? ', đã cũ' : ''})`).join(', ') : 'chưa sửa dịch vụ nào';
    const reg = r.registered ? ` | đăng ký theo kế hoạch: ${r.registered.join(', ') || 'chưa'}` : '';
    return `  ${r.name}${r.me ? ' (phiên này)' : ''} | ${whereText(r)} | tiêu đề: ${r.title ? `"${r.title}" (${r.titleBy})` : 'chưa có'} | ${svc}${reg} | ${statusText(r.status, r)} | skill đã mở: ${(r.skills || []).join(', ') || 'chưa'}`;
  };
  return ['Bảng phiên (tên nhắn tin | ở đâu | tiêu đề | dịch vụ đã sửa | trạng thái | skill đã mở):', ...rows.map(line), ...foot].join('\n');
}

module.exports = { ACTIVE_MS, ago, sameStart, statusText, whereText, build, forService, text };
