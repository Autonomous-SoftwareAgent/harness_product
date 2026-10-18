'use strict';
// spec: GATE-S-009
// ỦY QUYỀN DUYỆT KẾ HOẠCH. Người dùng trao cho MỘT phiên (phiên điều phối) quyền duyệt kế hoạch của CÁC PHIÊN DO CHÍNH NÓ TẠO RA, trong thời hạn
// do người dùng nêu. Quyền đi theo phiên chứ không theo dịch vụ: phiên điều phối tạo phiên mới bằng công cụ của harness, công cụ gắn vào lời mở đầu của
// phiên mới một dấu ký "phiên này do X tạo"; hook của phiên mới ghi quan hệ đó; plan_approve chỉ duyệt được phiên có quan hệ đúng.
// Cách trao quyền: người dùng DUYỆT một kế hoạch có dòng "Ủy quyền: ..." (gate-rule gọi planGrant), hoặc gõ tay "ỦY QUYỀN: [dịch vụ] | 8h". Tệp này là phần của cổng duyệt (gate/ tự chứa: không nhập ports/ hay adapters/), vì nó quyết định khi nào cổng mở.
//
// Ba bên, mỗi bên một việc, không ai làm thay ai:
//   - HOOK nhận lời người dùng (gate-hook prompt): CHỈ lời người dùng gõ (hoặc lời duyệt một kế hoạch có dòng Ủy quyền) mới tạo được bản ghi ủy quyền.
//     Công cụ MCP không có đường nào tạo hay nới ủy quyền. Tin của phiên khác và thông báo hệ thống không bao giờ là lời trao quyền.
//   - CÔNG CỤ MCP plan_approve (phiên điều phối) chỉ ĐỌC ủy quyền: kiểm dữ liệu rồi ghi một "lệnh duyệt" gắn dấu băm của đúng kế hoạch, phiên nhận,
//     dịch vụ, hạn; dùng một lần.
//   - HOOK của phiên làm việc (gate-rule beforeAction) nhận lệnh duyệt khi phiên sắp sửa tệp: kiểm lại mọi thứ rồi mới mở cổng.
// Mọi bản ghi ký HMAC bằng khóa nằm NGOÀI cây dự án (~/.claude/harness-delegate.key). Sổ sự kiện xâu chuỗi dấu băm: xóa hay chèn một dòng là đứt.
// Giới hạn đã biết: phiên chạy cùng tài khoản hệ điều hành và có Bash, nên một agent cố tình phá vẫn có thể đọc khóa nếu lọt hook; lớp này chặn lỗi vô tình,
// tấn công qua nội dung và sửa tay thô sơ, và để lại dấu vết cho phần còn lại.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const paths = require('./gate-paths');
const core = require('./gate-core');
const { parsePlan } = require('./plan-format');
const { loadState } = require('./gate-state');

const NAME_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const DEFAULT_HOURS = 8;
const MAX_HOURS = 24;
const MAX_APPROVALS = 20; // số lệnh duyệt tối đa cho một ủy quyền
const CLAIM_WINDOW_MS = 30 * 60 * 1000; // lệnh duyệt không dùng thì hết hạn sau ngần này
// Không còn đơn vị nào "không bao giờ ủy quyền được": quyền theo kế hoạch người dùng đã duyệt (mục Dịch vụ và dòng Được làm). Giữ tên cho nơi gọi cũ.
const NEVER = new Set();
const MAX_PER_WORKER = 6; // một phiên làm thay: lần duyệt đầu và tối đa 5 kế hoạch nối tiếp trong cùng một ủy quyền
const { DEFAULT_ACTIONS } = require('./plan-format');
const ACTION_LABEL = { commit: 'commit', push: 'đẩy', tag: 'gắn nhãn', deploy: 'deploy', rollback: 'quay lui', delete: 'xóa', overwrite: 'ghi đè', gate: 'sửa cổng duyệt' };
// Dấu vân tay của mã cổng duyệt đang chạy (mọi tệp .js trong thư mục này). Ủy quyền ghi dấu lúc cấp; mã cổng đổi thì ủy quyền ngưng duyệt thêm
// cho tới khi người dùng duyệt lại: máy không được vừa đổi luật vừa dùng luật mới để duyệt tiếp.
function gateFp() {
  try {
    const h = crypto.createHash('sha256');
    for (const f of fs.readdirSync(__dirname).filter((n) => n.endsWith('.js')).sort()) h.update(f).update(fs.readFileSync(path.join(__dirname, f)));
    return h.digest('hex').slice(0, 16);
  } catch { return ''; }
}

const stateDir = (root) => paths.stateDir(root);
const grantsFile = (root) => path.join(stateDir(root), 'gate-delegate-grants.json');
const chainFile = (root) => path.join(stateDir(root), 'gate-delegate-chain.jsonl');
const approvalFile = (root, worker) => path.join(stateDir(root), `gate-delegate-ap-${paths.safeId(worker)}.json`);
const usedFile = (root, worker) => path.join(stateDir(root), `gate-delegate-used-${paths.safeId(worker)}.json`);

// Khóa ký. Mặc định ở thư mục của người dùng, ngoài cây dự án. Biến BSN_DELEGATE_KEY_FILE chỉ để test cô lập khóa.
function keyPath() { return process.env.BSN_DELEGATE_KEY_FILE || path.join(os.homedir(), '.claude', 'harness-delegate.key'); }
function loadKey({ create = true } = {}) {
  const file = keyPath();
  try { const k = fs.readFileSync(file, 'utf8').trim(); if (/^[0-9a-f]{64}$/.test(k)) return k; } catch { /* chưa có */ }
  if (!create) return '';
  const k = crypto.randomBytes(32).toString('hex');
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${k}\n`, { mode: 0o600, flag: 'wx' });
  } catch { /* tiến trình khác vừa tạo: đọc lại */ }
  try { const again = fs.readFileSync(file, 'utf8').trim(); if (/^[0-9a-f]{64}$/.test(again)) return again; } catch { /* không ghi được */ }
  return '';
}

const canon = (o) => JSON.stringify(Object.keys(o).filter((k) => k !== 'sig').sort().reduce((a, k) => { a[k] = o[k]; return a; }, {}));
function sign(rec) { const k = loadKey(); return k ? crypto.createHmac('sha256', k).update(canon(rec)).digest('hex') : ''; }
function verified(rec) {
  if (!rec || typeof rec !== 'object' || typeof rec.sig !== 'string') return false;
  const k = loadKey({ create: false });
  if (!k) return false;
  const want = crypto.createHmac('sha256', k).update(canon(rec)).digest('hex');
  return want.length === rec.sig.length && crypto.timingSafeEqual(Buffer.from(want), Buffer.from(rec.sig));
}
const signed = (rec) => ({ ...rec, sig: sign(rec) });

function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}
const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };

// ---------- Sổ sự kiện xâu chuỗi ----------
function chainTail(root) {
  try {
    const lines = fs.readFileSync(chainFile(root), 'utf8').split('\n').filter(Boolean);
    const last = JSON.parse(lines[lines.length - 1]);
    return { n: last.n, hash: last.hash };
  } catch { return { n: 0, hash: '' }; }
}
function chainAdd(root, event, now = Date.now()) {
  const tail = chainTail(root);
  const row = { n: tail.n + 1, at: now, prev: tail.hash, ...event };
  row.hash = crypto.createHash('sha256').update(`${tail.hash}\n${canon(row)}`).digest('hex');
  row.sig = sign(row);
  fs.mkdirSync(stateDir(root), { recursive: true });
  fs.appendFileSync(chainFile(root), `${JSON.stringify(row)}\n`);
  return row;
}
// Kiểm sổ: { rows, broken } (broken: số thứ tự dòng đầu tiên bị đứt hoặc ký sai, 0 nếu sạch).
function verifyChain(root) {
  let lines = [];
  try { lines = fs.readFileSync(chainFile(root), 'utf8').split('\n').filter(Boolean); } catch { return { rows: 0, broken: 0 }; }
  let prev = '';
  for (let i = 0; i < lines.length; i += 1) {
    let row;
    try { row = JSON.parse(lines[i]); } catch { return { rows: lines.length, broken: i + 1 }; }
    const body = { ...row }; delete body.hash; delete body.sig;
    const want = crypto.createHash('sha256').update(`${prev}\n${canon(body)}`).digest('hex');
    if (row.prev !== prev || row.hash !== want || row.n !== i + 1 || !verified(row)) return { rows: lines.length, broken: i + 1 };
    prev = row.hash;
  }
  return { rows: lines.length, broken: 0 };
}

// ---------- Ủy quyền ----------
const grants = (root) => { const g = readJson(grantsFile(root)); return Array.isArray(g) ? g : []; };
const saveGrants = (root, list) => writeAtomic(grantsFile(root), JSON.stringify(list, null, 1));
// usable: còn hiệu lực cho việc ĐÃ duyệt thay (phiên làm thay làm nốt); live: còn duyệt thêm được. Kế hoạch mới không có dòng Ủy quyền làm ủy quyền
// cũ thành "đã thay" (superseded): không duyệt thêm, việc đang làm vẫn tiếp. Thu hồi thì dừng cả hai.
const usable = (g, now) => verified(g) && !g.revoked && g.from <= now && now < g.until;
const live = (g, now) => usable(g, now) && !g.superseded;
const paused = (g) => Boolean(g && g.gateFp && g.gateFp !== gateFp());
// Ủy quyền còn hiệu lực của một phiên (bản ghi mới nhất); null nếu không có.
function activeGrant(root, sid, now = Date.now()) {
  if (!sid) return null;
  const mine = grants(root).filter((g) => g.sid === sid).sort((a, b) => b.from - a.from);
  return mine.find((g) => live(g, now)) || null;
}
const isOrchestrator = (root, sid, now = Date.now()) => Boolean(activeGrant(root, sid, now));

const strip = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
const HOURS_RE = /(\d{1,3})\s*(h|gio|hours?)\b/;
// Lời người dùng có phải một chỉ thị ủy quyền không. Chỉ xét dòng đầu; phải đứng ĐẦU tin. Trả null | {kind:'grant', services, hours} | {kind:'revoke'} | {kind:'bad', why}.
function directive(msg) {
  // Người dùng hay dán cả khối mã (```): bỏ dòng mở khối và dấu nháy ngược quanh dòng đầu.
  const body = String(msg || '').trim().replace(/^```[A-Za-z]*[ \t]*\r?\n/, '');
  const first = (body.split(/\r?\n/)[0] || '').trim().replace(/^`+|`+$/g, '').trim();
  if (first.length > 300 || first.startsWith('<')) return null;
  const s = strip(first);
  if (/^(thu hoi uy quyen|revoke delegation)\b/.test(s)) {
    // Phần còn lại của tin (cùng dòng sau cụm từ, và các dòng sau) là lời khác của người dùng, ví dụ "THU HỒI ỦY QUYỀN, duyệt": trả về để xét tiếp.
    const lines = body.split(/\r?\n/).filter((l) => !/^```/.test(l.trim()));
    const head = (lines[0] || '').trim().replace(/^`+|`+$/g, '').trim().normalize('NFC')
      .replace(/^(?:thu\s+h[ồo]i\s+[ủu][yỷ]?\s*quy[ềe]n|thu\s+h[ồo]i\s+u[ỷy]\s+quy[ềe]n|revoke\s+delegation)/i, '');
    const rest = [head, ...lines.slice(1)].join('\n').replace(/^[\s,.;:–—-]*(?:và|va|and|\+|&)?[\s,.;:"“”'‘’]*/i, '').replace(/["“”'‘’]+/g, '').trim();
    return { kind: 'revoke', rest };
  }
  const m = /^(?:uy quyen|delegate)\s*[:：]\s*(.*)$/.exec(s);
  if (!m) return null;
  const [listPart, ...rest] = m[1].split('|');
  const h = HOURS_RE.exec(rest.join('|') || m[1]);
  const hours = h ? Number(h[1]) : DEFAULT_HOURS;
  const services = [...new Set(listPart.replace(new RegExp(HOURS_RE.source, 'g'), ' ').split(/[,\s;]+/).filter(Boolean))];
  const badName = services.find((x) => !NAME_RE.test(x));
  if (badName) return { kind: 'bad', why: `tên dịch vụ "${badName}" không hợp lệ` };
  const never = services.find((x) => NEVER.has(x));
  if (never) return { kind: 'bad', why: `"${never}" không bao giờ ủy quyền được (sửa harness là việc của chính người dùng)` };
  if (!(hours >= 1 && hours <= MAX_HOURS)) return { kind: 'bad', why: `thời hạn phải từ 1 đến ${MAX_HOURS} giờ` };
  return { kind: 'grant', services, hours };
}

// Áp một chỉ thị cho phiên `sid` (phiên người dùng vừa gõ). Trả { text }.
function applyDirective(root, sid, d, now = Date.now()) {
  if (!sid) return { text: 'GATE: không biết mã phiên nên không ghi được ủy quyền.' };
  if (d.kind === 'bad') return { text: `GATE: chỉ thị ủy quyền không hợp lệ (${d.why}). Cú pháp: "ỦY QUYỀN: 8h" (tối đa ${MAX_HOURS}h; có thể thêm tên dịch vụ để chỉ cho phép các dịch vụ đó). Chưa ghi gì.` };
  if (!loadKey()) return { text: 'GATE: không tạo được khóa ký ủy quyền (thư mục của người dùng không ghi được). Chưa ghi gì.' };
  const list = grants(root);
  if (d.kind === 'revoke') {
    let n = 0;
    const next = list.map((g) => { if (g.sid === sid && !g.revoked) { n += 1; return signed({ ...g, revoked: true, revokedAt: now }); } return g; });
    if (n) { saveGrants(root, next); chainAdd(root, { ev: 'revoke', sid }, now); }
    return { text: n ? `GATE: đã THU HỒI ${n} ủy quyền của phiên này. Các lệnh duyệt chưa dùng mất hiệu lực; phiên làm việc đang chạy theo lệnh duyệt đó sẽ bị đóng cổng ở lần sửa kế tiếp.` : 'GATE: phiên này không có ủy quyền nào để thu hồi.' };
  }
  const id = crypto.randomBytes(6).toString('hex');
  const actions = Array.isArray(d.actions) ? d.actions : [...DEFAULT_ACTIONS];
  // Ủy quyền mới thay ủy quyền cũ của cùng phiên (kế hoạch mới thay kế hoạch cũ): cái cũ thành "đã thay".
  const kept = list.filter((x) => x.until > now - 86400000).map((x) => (x.sid === sid && !x.revoked && !x.superseded ? signed({ ...x, superseded: true, supersededAt: now }) : x));
  const g = signed({ id, kind: 'grant', sid, services: d.services, actions, gateFp: gateFp(), from: now, until: now + d.hours * 3600 * 1000, max: MAX_APPROVALS, revoked: false });
  saveGrants(root, [...kept, g]);
  chainAdd(root, { ev: 'grant', sid, grant: id, services: d.services, actions, hours: d.hours }, now);
  const can = actions.length ? actions.map((a) => ACTION_LABEL[a] || a).join(', ') : 'chỉ sửa tệp';
  return { text: `GATE: người dùng đã ỦY QUYỀN cho phiên này (mã ${id}) duyệt kế hoạch của các phiên do CHÍNH PHIÊN NÀY tạo ra${d.services.length ? `, chỉ cho dịch vụ: ${d.services.join(', ')}` : ''}, trong ${d.hours} giờ, tối đa ${MAX_APPROVALS} lệnh duyệt. ` +
    `Việc rủi ro các phiên đó được làm (dòng "Được làm"): ${can}; việc khác bị hook chặn lúc làm. ` +
    'Kế hoạch này giao việc cho phiên khác nên phiên này chỉ ĐIỀU PHỐI, không tự sửa tệp; muốn tự làm thì người dùng duyệt một kế hoạch không có dòng Ủy quyền. Tạo phiên làm việc bằng session_spawn, duyệt bằng plan_view rồi plan_approve (skill orchestrate).' };
}

// Người dùng vừa duyệt cho phiên `sid` một kế hoạch KHÔNG có dòng Ủy quyền: phiên tự làm. Ủy quyền đang có thành "đã thay": không duyệt thêm,
// việc đã duyệt thay thì các phiên làm nốt. Trả { text } ('' nếu không có gì để thay).
function supersede(root, sid, now = Date.now()) {
  if (!sid) return { text: '' };
  let n = 0;
  const next = grants(root).map((g) => { if (g.sid === sid && live(g, now)) { n += 1; return signed({ ...g, superseded: true, supersededAt: now }); } return g; });
  if (!n) return { text: '' };
  saveGrants(root, next);
  chainAdd(root, { ev: 'supersede', sid }, now);
  return { text: 'GATE: kế hoạch vừa duyệt không có dòng Ủy quyền nên phiên này tự làm; ủy quyền của kế hoạch trước thôi duyệt thêm (việc đã duyệt thay thì các phiên làm nốt).' };
}

// Người dùng vừa DUYỆT một kế hoạch có dòng "Ủy quyền" bật: ghi ủy quyền cho phiên `sid`. `parsed` là kết quả parsePlan. Dịch vụ của kế hoạch thành giới hạn
// (kế hoạch con của phiên được tạo phải nằm trong đó, kể cả harness nếu kế hoạch nêu); kế hoạch không nêu dịch vụ nào thì không giới hạn theo dịch vụ.
// Dòng "Được làm" của kế hoạch thành giới hạn việc rủi ro của các phiên làm thay.
function planGrant(root, sid, parsed, now = Date.now()) {
  const d = parsed && parsed.delegation;
  if (!d || !d.enabled) return { granted: false, text: '' };
  const actions = parsed.allowed ? parsed.allowed.actions : [...DEFAULT_ACTIONS];
  const r = applyDirective(root, sid, { kind: 'grant', services: parsed.services || [], hours: d.hours, actions }, now);
  if (parsed.allowed && parsed.allowed.unknown.length) r.text += ` (dòng Được làm có món không nhận ra, bỏ qua: ${parsed.allowed.unknown.join(', ')}.)`;
  return { granted: /ỦY QUYỀN cho phiên này/.test(r.text), text: r.text };
}

// ---------- Phiên do phiên điều phối tạo ----------
const spawnFile = (root, worker) => path.join(stateDir(root), `gate-delegate-sp-${paths.safeId(worker)}.json`);
const TOKEN_RE = /\[harness-spawn v1 spawner=([A-Za-z0-9_-]{6,64}) nonce=([0-9a-f]{16}) sig=([0-9a-f]{64})\]/;
const tokenSig = (spawner, nonce) => sign({ t: 'spawn', spawner, nonce });
// Công cụ tạo phiên của phiên điều phối `spawner` gọi: có ủy quyền còn hiệu lực thì trả dấu để gắn vào lời mở đầu của phiên mới, không thì ''.
function mintSpawn(root, spawner, name = '', now = Date.now()) {
  const g = activeGrant(root, spawner, now);
  if (!g || paused(g)) return '';
  const nonce = crypto.randomBytes(8).toString('hex');
  chainAdd(root, { ev: 'spawn', spawner, nonce, name: String(name).slice(0, 40) }, now);
  return `[harness-spawn v1 spawner=${spawner} nonce=${nonce} sig=${tokenSig(spawner, nonce)}]`;
}
// Hook của phiên mới `worker` thấy dấu trong lời người dùng (không phải tin của phiên khác): kiểm chữ ký, nonce chưa dùng, người tạo còn được ủy quyền; ghi quan hệ.
function bindSpawn(root, worker, msg, now = Date.now()) {
  const m = TOKEN_RE.exec(String(msg || ''));
  if (!m || !worker) return { bound: false };
  const [, spawner, nonce, sig] = m;
  const want = tokenSig(spawner, nonce);
  if (!want || want.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(sig))) return { bound: false, why: 'chữ ký sai' };
  if (spawner === worker) return { bound: false, why: 'không tự tạo ra chính mình' };
  if (!activeGrant(root, spawner, now)) return { bound: false, why: 'phiên tạo không còn được ủy quyền' };
  let rows = [];
  try { rows = fs.readFileSync(chainFile(root), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { rows = []; }
  if (!rows.some((r) => r.ev === 'spawn' && r.nonce === nonce && r.spawner === spawner)) return { bound: false, why: 'dấu chưa từng được cấp' };
  if (rows.some((r) => r.ev === 'bind' && r.nonce === nonce)) return { bound: false, why: 'dấu đã dùng' };
  writeAtomic(spawnFile(root, worker), JSON.stringify(signed({ kind: 'spawn', worker, spawner, nonce, at: now }), null, 1));
  chainAdd(root, { ev: 'bind', worker, spawner, nonce }, now);
  return { bound: true, spawner };
}
// Quan hệ đã ghi của phiên `worker`: { spawner } nếu còn nguyên (chữ ký đúng), không thì null.
function spawnerOf(root, worker) {
  const rec = readJson(spawnFile(root, worker));
  return rec && verified(rec) && rec.worker === worker ? rec.spawner : null;
}

// ---------- Kiểm kế hoạch ----------
const SKIP_LABELS = ['dich vu', 'khong lam', 'rui ro', 'uy quyen', 'delegation', 'delegate', 'duyet thay'];
const KNOWN_LABELS = ['dich vu', 'lam gi', 'sua tep', 'khong lam', 'rui ro', ...SKIP_LABELS.slice(3)];
// Giới hạn của việc làm thay: KHÔNG đọc chữ trong kế hoạch; phiên chạy theo lệnh duyệt thay bị kiểm ngay ở lúc làm, theo lệnh và đường dẫn thật,
// so với kế hoạch người dùng đã duyệt cho phiên điều phối: việc rủi ro phải có trong dòng "Được làm", harness ở gốc phải có trong mục "Dịch vụ".
// Mỗi mẫu: [biểu thức trên khung lệnh đã bỏ chuỗi, việc cần có trong "Được làm", lời mô tả].
const CMD_LIMITS = [
  [/\bgit\b[^;&|]*\bpush\b/, 'push', 'đẩy git'],
  [/\bgit\b[^;&|]*\btag\b/, 'tag', 'gắn nhãn git'],
  [/\bgit\b[^;&|]*(\breset\s+--hard|\bclean\s+-\w*f|\bbranch\s+-D\b|--force|\bfilter-branch|\bcheckout\s+--\s|\brestore\b)/, 'overwrite', 'git làm mất thay đổi'],
  [/\bgit\b[^;&|]*\bcommit\b/, 'commit', 'commit git'],
  [/\bgh\s+(release|repo|workflow|pr|api|secret|auth)\b/, 'push', 'lệnh gh đưa việc ra GitHub'],
  [/\bdocker\s+(push|login)\b/, 'push', 'đẩy bản docker'],
  [/\bdocker\s+(rmi|system\s+prune|volume\s+rm)\b/, 'delete', 'xóa bản docker'],
  [/\bbsn\.js\s+rollback\b/, 'rollback', 'quay lui'],
  [/\bbsn\.js\s+(deploy|up|down|pin|console)\b/, 'deploy', 'deploy hay đổi hệ đang chạy'],
  [/\bgcloud\b|\bkubectl\b|\bterraform\b|\bssh\b|\bscp\b/, 'deploy', 'lệnh tới máy chủ ngoài'],
  [/\b(rm|rmdir|del|rd|unlink|shred)\b/, 'delete', 'xóa tệp'],
  [/\bcurl\b[^;&|]*(-X\s*(POST|PUT|PATCH|DELETE)|\s-d\b|--data|\s-T\b|--upload-file|\s-F\b)/, 'push', 'gửi dữ liệu ra ngoài máy'],
];
// Đường dẫn tương đối so với gốc dự án ('' nếu nằm ngoài).
function relToRoot(root, abs) {
  const rel = path.relative(root, abs).split(path.sep).join('/');
  return !rel || rel.startsWith('..') || path.isAbsolute(rel) ? '' : rel;
}
const isRootHarness = (rel) => rel === '.mcp.json' || rel === '.claude' || rel.startsWith('.claude/') || rel === 'CLAUDE.md'; // gốc dự án: harness của dự án nằm đúng ở đây (không phải của đơn vị)
const isGateCode = (rel) => /^\.claude\/modules\/core\/gate(\/|$)/.test(rel); // gốc dự án: mã cổng duyệt
const need = (key) => `kế hoạch người dùng duyệt cho phiên điều phối không có "${ACTION_LABEL[key] || key}" ở dòng Được làm`;
// Một đích ghi: '' nếu được, lời lý do nếu không. Ghi vào mã cổng duyệt mà được phép thì báo qua onGate.
function checkTarget(root, abs, ctx, onGate) {
  if (!abs) return '';
  if (paths.isSecretPath(abs)) return 'ghi vào khóa ký ủy quyền (không kế hoạch nào mở được)';
  const rel = relToRoot(root, abs);
  if (!rel || !isRootHarness(rel)) return '';
  if (ctx.services.length && !ctx.services.includes('harness')) return `ghi vào harness ở gốc dự án (${rel}): kế hoạch người dùng duyệt cho phiên điều phối không nêu harness ở mục Dịch vụ`;
  if (isGateCode(rel)) {
    if (!ctx.actions.includes('gate')) return `sửa mã cổng duyệt (${rel}): ${need('gate')}`;
    onGate(rel);
  }
  return '';
}
// Kiểm một việc theo giới hạn ctx = { actions, services } của ủy quyền. Trả lời lý do, '' nếu được. Chỉ xét đích ghi thật của lệnh, không xét chữ
// trong nội dung (mã nội tuyến ghi một tờ tài liệu có nhắc ".claude/" không phải là ghi vào .claude).
function delegatedLimit(root, action, cwd, ctx = {}, onGate = () => {}) {
  const c = { actions: Array.isArray(ctx.actions) ? ctx.actions : [...DEFAULT_ACTIONS], services: Array.isArray(ctx.services) ? ctx.services : [] };
  const act = action || {};
  const base = cwd || root;
  if (act.type === 'run-command') {
    const a = require('./bash-targets').analyzeBash(String(act.command || ''));
    for (const [re, key, what] of CMD_LIMITS) if (re.test(a.skeleton) && !c.actions.includes(key)) return `${what}: ${need(key)}`;
    for (const t of a.targets) {
      const why = checkTarget(root, paths.resolveToken(t, base), c, onGate);
      if (why) return why;
    }
    return '';
  }
  return checkTarget(root, act.file, c, onGate);
}
// Bản dùng trong hook: giới hạn lấy từ ủy quyền đứng sau lệnh duyệt mà phiên `sid` đang chạy theo. Sửa mã cổng duyệt (đã được phép) thì ghi sổ duyệt.
function delegatedLimitFor(root, sid, action, cwd, now = Date.now()) {
  const rec = readJson(approvalFile(root, sid));
  const g = rec && verified(rec) && rec.worker === sid ? grants(root).find((x) => x.id === rec.grant) : null;
  if (!g) return 'không tìm thấy ủy quyền đứng sau lệnh duyệt của phiên này';
  return delegatedLimit(root, action, cwd, { actions: g.actions, services: g.services }, (rel) => chainAdd(root, { ev: 'gate-edit', worker: sid, grant: g.id, file: rel }, now));
}

const chainRows = (root) => { try { return fs.readFileSync(chainFile(root), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };

// Kế hoạch của phiên làm việc đang chờ duyệt: { plan, sha, parsed, followUp } hoặc { error }. Phiên đã mở cổng theo một lệnh duyệt thay mà trình kế hoạch
// MỚI thì đó là kế hoạch nối tiếp (duyệt được); phiên mở cổng theo lời của chính người dùng thì kế hoạch mới của nó do người dùng duyệt.
function pendingPlan(root, worker) {
  const st = loadState(root, worker);
  const byDelegate = st.open && st.approved && String(st.approved.by || '').startsWith('delegate:');
  if (st.open && !byDelegate) return { error: 'cổng của phiên đó đang MỞ theo lời duyệt của chính người dùng; kế hoạch mới của nó do người dùng duyệt' };
  const plan = core.planInQuestion(st).plan;
  if (!plan) return { error: 'phiên đó chưa trình kế hoạch nào' };
  const parsed = parsePlan(plan);
  if (!parsed.ok) return { error: `kế hoạch của phiên đó không đúng khuôn (${parsed.errors.join('; ')})` };
  const sha = core.sha(plan);
  if (byDelegate && st.approved.sha === sha) return { error: 'phiên đó đang làm đúng kế hoạch này (đã duyệt); chưa trình kế hoạch nối tiếp nào' };
  return { plan, sha, parsed, followUp: Boolean(byDelegate) };
}

function approvalsOf(root, grantId, worker) {
  return chainRows(root).filter((r) => r.ev === 'approve' && r.grant === grantId && (!worker || r.worker === worker)).length;
}
// Dịch vụ đang có phiên làm thay KHÁC (cùng phiên điều phối) giữ: { dịch vụ: phiên }. Một dịch vụ chỉ một bên ghi.
function busyServices(root, caller, worker) {
  const last = new Map();
  for (const r of chainRows(root)) if (r.ev === 'approve' && r.caller === caller && r.worker !== worker) last.set(r.worker, r);
  const out = {};
  for (const [w, r] of last) {
    const st = loadState(root, w);
    if (st.open && st.approved && String(st.approved.by || '') === `delegate:${r.approval}`) for (const s of r.services || []) out[s] = w;
  }
  return out;
}

// Xem xét một kế hoạch theo ủy quyền của phiên `caller`: { ok, reasons[], plan, sha, parsed, grant, followUp }. Dùng cho plan_view và plan_approve.
function review(root, caller, worker, now = Date.now()) {
  const reasons = [];
  const grant = activeGrant(root, caller, now);
  if (!grant) return { ok: false, reasons: ['phiên này chưa được người dùng ủy quyền, hoặc ủy quyền đã hết hạn, bị thu hồi hay bị kế hoạch mới thay'] };
  if (!worker) return { ok: false, grant, reasons: ['thiếu mã phiên làm việc'] };
  if (worker === caller) return { ok: false, grant, reasons: ['không tự duyệt kế hoạch của chính mình'] };
  if (paused(grant)) return { ok: false, grant, reasons: ['mã cổng duyệt đã đổi sau khi người dùng ủy quyền: ủy quyền ngưng duyệt thêm cho tới khi người dùng duyệt lại một kế hoạch có dòng Ủy quyền'] };
  const p = pendingPlan(root, worker);
  if (p.error) return { ok: false, grant, reasons: [p.error] };
  const services = p.parsed.services;
  if (!services.length) reasons.push('kế hoạch không nêu dịch vụ nào (chỉ phần dùng chung): cần người dùng duyệt');
  if (spawnerOf(root, worker) !== caller) reasons.push('phiên đó không do phiên này tạo ra (không có dấu "phiên do bạn tạo" hợp lệ): tạo phiên làm việc bằng công cụ session_spawn rồi mới duyệt được; phiên khác thì người dùng duyệt');
  for (const s of services) if (grant.services.length && !grant.services.includes(s)) reasons.push(`dịch vụ "${s}" ngoài kế hoạch người dùng đã duyệt cho phiên điều phối (${grant.services.join(', ')})`);
  const busy = busyServices(root, caller, worker);
  for (const s of services) if (busy[s]) reasons.push(`dịch vụ "${s}" đang do phiên ${busy[s]} làm theo một lệnh duyệt khác (một dịch vụ chỉ một bên ghi)`);
  const grantActions = Array.isArray(grant.actions) ? grant.actions : [...DEFAULT_ACTIONS];
  const extra = p.parsed.allowed && p.parsed.allowed.present ? p.parsed.allowed.actions.filter((a) => !grantActions.includes(a)) : [];
  if (extra.length) reasons.push(`kế hoạch xin việc ngoài dòng Được làm của kế hoạch người dùng đã duyệt: ${extra.map((a) => ACTION_LABEL[a] || a).join(', ')}`);
  if (approvalsOf(root, grant.id) >= grant.max) reasons.push(`ủy quyền đã dùng hết ${grant.max} lệnh duyệt`);
  if (approvalsOf(root, grant.id, worker) >= MAX_PER_WORKER) reasons.push(`phiên đó đã được duyệt ${MAX_PER_WORKER} kế hoạch trong ủy quyền này: kế hoạch tiếp theo cần người dùng duyệt`);
  return { ok: reasons.length === 0, reasons, plan: p.plan, sha: p.sha, parsed: p.parsed, grant, followUp: p.followUp };
}

// Ghi lệnh duyệt. `planSha`: ít nhất 8 ký tự đầu băm kế hoạch mà phiên điều phối ĐÃ ĐỌC (plan_view); lệch nghĩa là kế hoạch đã đổi.
function approve(root, { caller, worker, planSha }, now = Date.now()) {
  const r = review(root, caller, worker, now);
  if (!r.ok) return { ok: false, text: `Chưa duyệt: ${r.reasons.join('; ')}.` };
  const want = String(planSha || '').toLowerCase();
  if (want.length < 8 || !r.sha.startsWith(want)) return { ok: false, text: `Chưa duyệt: băm kế hoạch bạn nêu (${want || 'trống'}) không khớp kế hoạch hiện có của phiên đó (${r.sha.slice(0, 12)}). Có thể phiên đó vừa sửa kế hoạch: đọc lại bằng plan_view.` };
  const id = crypto.randomBytes(6).toString('hex');
  const rec = signed({ id, kind: 'approval', grant: r.grant.id, caller, worker, sha: r.sha, services: r.parsed.services, at: now, until: now + CLAIM_WINDOW_MS });
  writeAtomic(approvalFile(root, worker), JSON.stringify(rec, null, 1));
  try { fs.rmSync(usedFile(root, worker), { force: true }); } catch { /* chưa có */ }
  chainAdd(root, { ev: 'approve', caller, worker, grant: r.grant.id, approval: id, sha: r.sha.slice(0, 12), services: r.parsed.services, followUp: Boolean(r.followUp) }, now);
  return { ok: true, id, text: `Đã ghi lệnh duyệt ${id} cho phiên ${worker} (dịch vụ ${r.parsed.services.join(', ')}, kế hoạch ${r.sha.slice(0, 12)}${r.followUp ? ', kế hoạch nối tiếp: thay kế hoạch phiên đó đang làm' : ''}). Lệnh có hiệu lực ${CLAIM_WINDOW_MS / 60000} phút, dùng một lần; phiên đó nhận ở lần sửa kế tiếp. Nhắn phiên đó một dòng báo đã duyệt (tin nhắn không phải lời duyệt, chỉ là lời báo).` };
}

// ---------- Phía phiên làm việc ----------
// Có lệnh duyệt hợp lệ, chưa dùng, cho đúng kế hoạch phiên `sid` đang trình (cổng đóng, hoặc cổng mở theo kế hoạch trước và đây là kế hoạch nối tiếp)?
// Có thì ĐÁNH DẤU ĐÃ DÙNG và trả { id, sha, plan }; không thì null. Ủy quyền "đã thay" vẫn nhận được lệnh đã cấp trước đó (việc đã duyệt thì làm nốt).
function claim(root, sid, state, now = Date.now()) {
  const rec = readJson(approvalFile(root, sid));
  if (!rec || !verified(rec) || rec.worker !== sid || now >= rec.until) return null;
  if (fs.existsSync(usedFile(root, sid))) return null;
  const g = grants(root).find((x) => x.id === rec.grant);
  if (!g || !usable(g, now) || g.sid !== rec.caller) return null;
  const plan = core.planInQuestion(state).plan;
  if (!plan || core.sha(plan) !== rec.sha || !parsePlan(plan).ok) return null;
  if (state.open && state.approved && state.approved.sha === rec.sha) return null;
  try { fs.writeFileSync(usedFile(root, sid), JSON.stringify({ id: rec.id, at: now }), { flag: 'wx' }); } catch { return null; } // tiến trình khác vừa dùng
  chainAdd(root, { ev: 'claim', worker: sid, approval: rec.id, grant: rec.grant, sha: rec.sha.slice(0, 12) }, now);
  return { id: rec.id, sha: rec.sha, plan };
}
// Cổng đang mở theo lệnh duyệt `by` ("delegate:<id>"): vẫn hợp lệ không (lệnh còn nguyên, đã dùng, ủy quyền chưa bị thu hồi hay hết hạn)?
function stillValid(root, sid, by, now = Date.now()) {
  const id = String(by || '').replace(/^delegate:/, '');
  const rec = readJson(approvalFile(root, sid));
  if (!rec || rec.id !== id || !verified(rec) || rec.worker !== sid) return false;
  const u = readJson(usedFile(root, sid));
  if (!u || u.id !== id) return false;
  const g = grants(root).find((x) => x.id === rec.grant);
  return Boolean(g && usable(g, now));
}

// Tóm tắt cho người và agent: ủy quyền còn hiệu lực, việc được làm, lệnh duyệt, lần sửa cổng duyệt, sổ có sạch không.
function status(root, now = Date.now()) {
  const gs = grants(root).filter((g) => g.until > now - 86400000);
  const chain = verifyChain(root);
  const rows = chainRows(root);
  const state = (g) => (!verified(g) ? 'CHỮ KÝ SAI' : g.revoked ? 'đã thu hồi' : now >= g.until ? 'hết hạn' : g.superseded ? 'đã bị kế hoạch mới thay (việc đã duyệt thì làm nốt)' : paused(g) ? 'TẠM NGƯNG: mã cổng duyệt đã đổi, chờ người dùng duyệt lại' : `còn ${Math.ceil((g.until - now) / 60000)} phút`);
  const lines = gs.map((g) => {
    const acts = Array.isArray(g.actions) ? g.actions : [...DEFAULT_ACTIONS];
    const edits = rows.filter((r) => r.ev === 'gate-edit' && r.grant === g.id);
    return `ủy quyền ${g.id}: phiên ${g.sid} · ${g.services.length ? `chỉ dịch vụ ${g.services.join(', ')}` : 'mọi dịch vụ của các phiên do nó tạo'} · được làm: ${acts.length ? acts.map((a) => ACTION_LABEL[a] || a).join(', ') : 'chỉ sửa tệp'} · ${state(g)} · đã duyệt ${approvalsOf(root, g.id)}/${g.max}`
      + (edits.length ? `\n  SỬA CỔNG DUYỆT ${edits.length} lần: ${[...new Set(edits.map((e) => `${e.worker.slice(0, 8)} ${e.file}`))].slice(0, 5).join('; ')}` : '');
  });
  return { grants: gs, chain, text: [lines.length ? lines.join('\n') : 'Không có ủy quyền nào còn trong 24 giờ qua.', `Sổ duyệt: ${chain.rows} dòng, ${chain.broken ? `ĐỨT ở dòng ${chain.broken} (nghi bị sửa tay)` : 'sạch'}.`].join('\n') };
}

module.exports = {
  NAME_RE, KNOWN_LABELS, DEFAULT_HOURS, MAX_HOURS, MAX_APPROVALS, MAX_PER_WORKER, NEVER, ACTION_LABEL, keyPath, loadKey, sign, verified, directive, applyDirective, activeGrant, isOrchestrator,
  delegatedLimit, delegatedLimitFor, pendingPlan, review, approve, claim, stillValid, status, verifyChain, chainAdd, planGrant, supersede, gateFp, mintSpawn, bindSpawn, spawnerOf,
};
