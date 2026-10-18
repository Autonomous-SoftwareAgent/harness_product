'use strict';
// spec: GATE-S-006
// spec: GATE-S-005
// spec: GATE-S-001
// spec: GATE-S-002
// spec: GATE-S-004
// Lõi của gate phê duyệt (bước xác nhận): hàm thuần, không đọc file, không gọi mạng, để test được.
//
// Luồng: người dùng nêu yêu cầu -> cổng ĐÓNG -> model tổng hợp và trình kế hoạch -> lượt sau người dùng đồng ý
// hoàn toàn -> cổng MỞ -> sửa code được. Người dùng góp ý, hỏi, hoặc đổi việc thì cổng đóng lại (xem onPrompt).
//
// Trạng thái: { open, lastAssistant, approved, pending, pendingAge }. `pending` là kế hoạch ĐÚNG KHUÔN gần nhất còn chờ duyệt: nó
// sống qua các câu trả lời chen giữa (người dùng hỏi thêm một câu rồi mới duyệt), tới khi được duyệt, bị sửa hoặc từ chối, hoặc quá cũ.
// Trạng thái cũ: { open, lastAssistant, approved }. `approved` lưu CÁI ĐÃ ĐƯỢC DUYỆT (bản kế hoạch và băm của nó), nên cờ
// open:true bị giả mạo mà không khớp một kế hoạch có thật sẽ bị phát hiện (verifyOpen). Chỉ hook ghi trạng thái.
const crypto = require('node:crypto');
const path = require('node:path');
const paths = require('./gate-paths');
const { analyzeBash } = require('./bash-targets');
const { parsePlan, mergeAddendum } = require('./plan-format');

const ALLOW = { decision: 'allow' };
const deny = (reason, code) => ({ decision: 'deny', reason, code });
const ask = (reason, code) => ({ decision: 'ask', reason, code });

const MAX_ASSISTANT_CHARS = 4000;
const MAX_PLAN_CHARS = 20000; // trần cho riêng khối kế hoạch theo khuôn
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

const initialState = () => ({ open: false, lastAssistant: '', approved: null, pending: '', pendingAge: 0, repair: null });
// Kế hoạch chờ duyệt bị bỏ sau ngần này tin nhắn của người dùng mà không tin nào là lời duyệt: lời "ok" quá muộn không mở lại một kế hoạch đã trôi xa.
const MAX_PENDING_AGE = 4;

// Tin nhắn cuối của model (từ hook Stop): ngữ cảnh để biết người dùng đang trả lời kế hoạch nào.
function onStop(state, lastAssistantMessage) {
  const text = String(lastAssistantMessage || '').trim();
  if (!text) return state;
  // Tin dài hơn giới hạn mà có khối kế hoạch theo khuôn: đưa khối lên đầu để phần được lưu (và được băm khi duyệt) luôn chứa nó.
  if (text.length > MAX_ASSISTANT_CHARS) {
    const { block } = parsePlan(text);
    // Khối kế hoạch tự nó dài hơn giới hạn thì giữ TRỌN khối (tới MAX_PLAN_CHARS): trước đây khối bị cắt ngang, mất các mục cuối, và lời
    // "duyệt" của người dùng bị báo "thiếu mục: Rủi ro" dù kế hoạch có đủ (gặp ba lần ngày 2026-10-13).
    if (block) { const kept = block.length > MAX_ASSISTANT_CHARS - 40 ? block.slice(0, MAX_PLAN_CHARS) : `${block}\n\n[tin dài, phần còn lại bị cắt]\n${text}`.slice(0, MAX_ASSISTANT_CHARS); return { ...state, lastAssistant: kept, pending: parsePlan(kept).ok ? kept : (state.pending || ''), pendingAge: parsePlan(kept).ok ? 0 : (state.pendingAge || 0) }; }
  }
  const kept = text.slice(0, MAX_ASSISTANT_CHARS);
  // Tin này là một kế hoạch đúng khuôn: nó thành kế hoạch đang chờ (thay kế hoạch chờ cũ). Tin khác (trả lời một câu hỏi, báo cáo) không xóa kế hoạch đang chờ.
  if (parsePlan(kept).ok) return { ...state, lastAssistant: kept, pending: kept, pendingAge: 0, repair: null };
  // Cổng đang chờ model bù mục thiếu: tin này có đủ các mục đó thì ghép vào kế hoạch cũ; bản ghép thành kế hoạch đang chờ, người dùng duyệt lại bản đầy đủ.
  if (state.repair) {
    const merged = mergeAddendum(state.repair.base, kept, state.repair.fix);
    if (merged) return { ...state, lastAssistant: kept, pending: merged, pendingAge: 0, repair: null };
  }
  return { ...state, lastAssistant: kept };
}

// Kế hoạch mà một lời đồng ý lúc này sẽ duyệt: tin cuối nếu nó là kế hoạch đúng khuôn; nếu không thì kế hoạch đang chờ (còn hạn).
// Trả { plan, held }: held là true khi kế hoạch được lấy từ chỗ chờ, tức là KHÔNG phải tin cuối của model.
function planInQuestion(state) {
  const last = state.lastAssistant || '';
  if (last && parsePlan(last).ok) return { plan: last, held: false };
  const p = state.pending || '';
  if (p && (state.pendingAge || 0) < MAX_PENDING_AGE && parsePlan(p).ok && !(state.approved && state.approved.sha === sha(p))) return { plan: p, held: true };
  return { plan: last, held: false };
}

// verdict do người phán xét trả về cho tin nhắn của người dùng:
//   approve   đồng ý hoàn toàn, không điều kiện       -> mở cổng, lưu kế hoạch đã duyệt kèm băm
//   question  hỏi thêm, chưa quyết                    -> giữ nguyên
//   revise    đồng ý kèm sửa/điều kiện, hoặc từ chối  -> đóng cổng (kế hoạch đổi thì phải duyệt lại)
//   new_task  việc khác                               -> đóng cổng
//   error     không phán xét được                     -> giữ nguyên, không bao giờ mở cổng
// opts.requireFormat (luật phạm vi đang ở chế độ enforce): kế hoạch không đọc được theo khuôn chuẩn thì lời đồng ý KHÔNG mở cổng.
function onPrompt(state, verdict, now = Date.now(), opts = {}) {
  // Kế hoạch đang xét: mặc định là tin cuối; khi tin cuối không phải kế hoạch đúng khuôn mà còn một kế hoạch đang chờ thì xét kế hoạch đó.
  const q = opts.requireFormat ? planInQuestion(state) : { plan: state.lastAssistant, held: false };
  const target = q.plan;
  const age = state.pending ? (state.pendingAge || 0) + 1 : 0;
  const aged = age >= MAX_PENDING_AGE ? { ...state, pending: '', pendingAge: 0 } : { ...state, pendingAge: age };
  switch (verdict) {
    case 'approve':
      // Chưa có kế hoạch nào (model chưa nói gì) thì "ok" không có gì để duyệt. Đã mở rồi thì giữ phê duyệt gốc.
      if (!state.lastAssistant) return state;
      if (state.open && state.approved) {
        // Cổng đang mở mà người dùng đồng ý một kế hoạch MỚI đúng khuôn (khác kế hoạch đang giữ): kế hoạch mới thay kế hoạch cũ.
        // Không có bước này thì phiên không đăng ký được dịch vụ theo kế hoạch vừa duyệt (gặp 2026-10-09, ngay sau khi bật luật).
        // Tin cuối không phải một kế hoạch đúng khuôn (báo cáo, câu hỏi) thì giữ phê duyệt gốc như trước.
        if (opts.requireFormat && target && sha(target) !== state.approved.sha && parsePlan(target).ok) {
          return { ...state, approved: { sha: sha(target), plan: target, at: now }, pending: '', pendingAge: 0 };
        }
        return state;
      }
      if (opts.requireFormat) {
        const pp = parsePlan(target);
        if (!pp.ok) {
          // Kế hoạch có tiêu đề mà thiếu hoặc trống một số mục: nhớ kế hoạch và các mục cần bù, để lượt sau model chỉ viết thêm đúng các mục đó.
          // Lỗi không sửa theo từng mục được (không có tiêu đề) thì không nhớ gì: model phải trình lại kế hoạch.
          return { ...state, repair: pp.headingOk && pp.fix.length ? { base: target, fix: pp.fix, age: 0 } : null };
        }
      }
      return { ...state, open: true, approved: { sha: sha(target), plan: target, at: now }, pending: '', pendingAge: 0, repair: null };
    case 'question': {
      // Hỏi thêm: kế hoạch đang chờ vẫn chờ, nhưng già đi một nấc; việc chờ bù mục cũng già đi.
      const repair = state.repair && state.repair.age + 1 < MAX_PENDING_AGE ? { ...state.repair, age: state.repair.age + 1 } : null;
      const base = state.pending ? aged : state;
      return state.repair ? { ...base, repair } : base;
    }
    case 'error':
      return state;
    case 'new_task':
      // Việc khác, hoặc một câu hỏi không liên quan: đóng cổng. Kế hoạch đang chờ CHƯA bị bỏ (người dùng có thể hỏi chen rồi quay lại duyệt), chỉ già đi.
      return { ...aged, open: false, approved: null, repair: null };
    case 'revise':
    default:
      // Đòi sửa hoặc từ chối: kế hoạch đang chờ không còn giá trị.
      return { ...state, open: false, approved: null, pending: '', pendingAge: 0, repair: null };
  }
}

// Tin do PHIÊN CLAUDE KHÁC gửi tới (SendMessage) cũng đi qua UserPromptSubmit, nhưng không phải lời của người dùng:
// nó không được mở cổng, và cũng không được hủy lời duyệt người dùng vừa cho. Nhận ra thì giữ nguyên trạng thái.
// Nhận theo thẻ <cross-session-message from="..."> ... </cross-session-message> mà hook THẬT SỰ nhận được. Đã đo trên 3 tin thật
// (2026-10-04): trường `prompt` của hook là thẻ mở + thân tin + thẻ đóng (dài hơn thân tin đúng 156 ký tự), KHÔNG có dòng
// "Another Claude session sent a message:" đứng trước (dòng đó chỉ có trong bản model đọc). Vẫn nhận cả dạng có dòng đó và dạng
// bọc trong system-reminder, phòng khi Claude Code đổi cách đưa tin. Người gõ tay giả được thẻ này cũng chỉ đạt "không đổi gì",
// không bao giờ mở được cổng.
// Hai dạng nữa cũng KHÔNG phải lời người dùng và đã từng đóng cổng giữa lúc đang làm (2026-10-05, xem nhật ký chẩn đoán):
//   - báo cáo của tác nhân phụ quay về: thẻ <agent-message from="..."> ... </agent-message> (đã đóng cổng với verdict new_task, dài 14875)
//   - thông báo tự động của hệ thống: <task-notification> ... </task-notification> (đã đóng cổng với verdict new_task, dài 726)
// Hình dạng chính xác mà hook nhận cho hai dạng này CHƯA đo được từng byte, nên nhận cả dạng trần lẫn dạng bọc system-reminder.
const PEER_HEAD = /^(?:<system-reminder\b[^>]*>\s*)?(?:Another Claude session sent a message(?: while you were working)?:\s*)?<(cross-session-message|agent-message)\s+from="/;
const NOTICE_HEAD = /^(?:<system-reminder\b[^>]*>\s*)?(?:\[SYSTEM NOTIFICATION - NOT USER INPUT\][^<]*)?<task-notification>/;
function isPeerMessage(msg) {
  const s = String(msg || '').trim();
  const m = PEER_HEAD.exec(s);
  if (m) return s.includes(`</${m[1]}>`);
  return NOTICE_HEAD.test(s) && s.includes('</task-notification>');
}

// Cờ open phải đi kèm đúng kế hoạch đã duyệt. Không khớp = trạng thái bị sửa ngoài hook.
function verifyOpen(state) {
  if (!state.open) return { ok: true };
  const a = state.approved;
  if (!a || typeof a.plan !== 'string' || typeof a.sha !== 'string') return { ok: false, reason: 'thiếu kế hoạch đã duyệt' };
  if (sha(a.plan) !== a.sha) return { ok: false, reason: 'băm kế hoạch đã duyệt không khớp' };
  return { ok: true };
}

// Chữ trong mã nội tuyến cho thấy nó nhắm vào tệp được bảo vệ của gate.
const MENTIONS_PROTECTED = /gate\.config\.json|manifest\.json|migrated_at|gate-diag|\.claude[\\/]+\.state|\.claude[\\/]+plugin[\\/]+gate|harness-delegate|gate-delegate/i;
// Lệnh nhắc tới khóa ký ủy quyền hay tệp ủy quyền: chặn dù cổng đóng hay mở, dù đọc hay ghi (đọc khóa là tự ký được lệnh duyệt).
const MENTIONS_SECRET = /harness-delegate|gate-delegate-/i;

// Lệnh Bash trông như có ghi/thay đổi hệ thống (để HỎI khi cổng đóng). Dựa trên phân tích, không khớp chuỗi thô:
// nhắc tới "rm -rf" trong một chuỗi hay thân heredoc không tính.
const COARSE = /(^|[\s;])(sudo\s+)?(sed\s+-i|perl\s+-[a-z]*i|npx|pnpm|yarn)\b/i;

function isMutatingCommand(cmd) {
  const a = analyzeBash(cmd);
  return a.changing || a.targets.length > 0 || a.inline.some((i) => i.writes) || COARSE.test(a.skeleton);
}

// Quyết định cho một VIỆC phiên sắp làm, theo dạng chung: action = { type: 'run-command', command } hoặc { type khác, file }
// với file là đường dẫn tuyệt đối ('' nếu việc đó không đụng tệp nào). Không biết tên công cụ của công cụ chủ.
// ctx: { cwd, exemptDirs: string[] }  (exemptDirs: thư mục tạm, ~/.claude, docs/handoff, scratchpad...)
function decideAction(state, action, ctx) {
  const act = action || {};
  const cwd = (ctx && ctx.cwd) || process.cwd();

  if (act.type === 'run-command') {
    const cmd = String(act.command || '');
    if (MENTIONS_SECRET.test(cmd)) {
      return deny('Lệnh này nhắc tới khóa ký hoặc tệp ủy quyền duyệt kế hoạch. Chỉ cổng duyệt và công cụ plan_approve được đụng tới chúng; xem tình trạng bằng công cụ delegate_status.', 'protected-delegate');
    }
    const a = analyzeBash(cmd);
    const hitsProtected =
      a.targets.some((t) => paths.isProtectedTarget(paths.resolveToken(t, cwd)) || paths.isProtectedTarget(t)) ||
      a.inline.some((i) => i.writes && MENTIONS_PROTECTED.test(i.code)) ||
      (a.unparsable && MENTIONS_PROTECTED.test(cmd));
    if (hitsProtected) {
      return deny('Lệnh này ghi vào trạng thái hoặc cấu hình của gate phê duyệt (hoặc không phân tích được mà nhắc tới chúng). Chỉ người dùng được đổi các tệp đó.', 'protected-bash');
    }
    if (state.open) {
      const v = verifyOpen(state);
      if (!v.ok) return deny(`Trạng thái gate không nhất quán (${v.reason}); nghi bị sửa ngoài hook. Hãy trình kế hoạch lại và chờ người dùng duyệt.`, 'tamper');
      return ALLOW;
    }
    const mutating = a.changing || a.targets.length > 0 || a.inline.some((i) => i.writes) || COARSE.test(a.skeleton);
    if (!mutating) return ALLOW;
    return ask('Chưa được người dùng duyệt kế hoạch mà lệnh Bash này có vẻ ghi/thay đổi hệ thống. Hãy trình kế hoạch và chờ người dùng đồng ý trước.', 'closed-bash');
  }

  const abs = act.file;
  if (!abs) return ALLOW;

  if (paths.isProtectedPath(abs)) {
    return deny(`Tệp này là trạng thái/cấu hình của gate phê duyệt, chỉ người dùng được sửa: ${abs}`, 'protected-file');
  }
  if (state.open) {
    const v = verifyOpen(state);
    if (!v.ok) return deny(`Trạng thái gate không nhất quán (${v.reason}); nghi bị sửa ngoài hook. Hãy trình kế hoạch lại và chờ người dùng duyệt.`, 'tamper');
    return ALLOW;
  }
  if (((ctx && ctx.exemptDirs) || []).some((d) => paths.inside(abs, d))) return ALLOW;

  return deny(
    'Chưa được người dùng duyệt nên chưa được sửa tệp. Hãy tổng hợp yêu cầu và trình kế hoạch (làm gì, sửa tệp nào, ' +
    'không làm gì, rủi ro) rồi dừng lại chờ người dùng đồng ý ở lượt sau. Không vừa nghĩ vừa làm.',
    'closed-file',
  );
}

// Cùng quyết định, nhận tên công cụ và tham số theo cách gọi của Claude Code (giữ cho nơi gọi cũ và test).
function decideTool(state, toolName, toolInput, ctx) {
  const input = toolInput || {};
  const cwd = (ctx && ctx.cwd) || process.cwd();
  if (toolName === 'Bash') return decideAction(state, { type: 'run-command', command: String(input.command || '') }, ctx);
  const target = input.file_path || input.notebook_path;
  return decideAction(state, { type: 'write-file', file: target ? path.resolve(cwd, target) : '' }, ctx);
}

module.exports = {
  initialState, onStop, onPrompt, planInQuestion, MAX_PENDING_AGE, verifyOpen, decideTool, decideAction, isMutatingCommand, isPeerMessage, sha, MAX_ASSISTANT_CHARS,
  // giữ tên cũ cho test và nơi gọi khác
  isProtectedPath: paths.isProtectedPath, inside: paths.inside,
};
