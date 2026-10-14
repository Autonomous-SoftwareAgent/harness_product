'use strict';
// spec: LEDG-S-003
// BỘ CHUYỂN lưu trữ, phần sổ phạm vi. Lời từ chối của luật phạm vi nằm ở core/rules/scope.js.
// Sổ phạm vi: một phiên chỉ được sửa dịch vụ mà KẾ HOẠCH ĐÃ DUYỆT của nó nêu ra và phiên đã ĐĂNG KÝ.
//   phiên -> kế hoạch đã duyệt (bảng rec_plans) -> dịch vụ đã đăng ký (bảng rec_plan_services) -> lần sửa (guard-scope.js đối soát).
// Các bảng thuộc schema `session`: hồ sơ kế hoạch ở nhóm rec_, ghi chú một lần ở nhóm act_; tạo và nâng phiên bản ở ledger-db.js.
// Nguồn sự thật "kế hoạch nào đang hiệu lực" là trạng thái của cổng duyệt (kế hoạch người dùng vừa đồng ý, kèm băm); sổ chỉ ghi lại
// và giữ lịch sử. Vì vậy dòng trong sổ được tạo lại được từ trạng thái cổng (activePlan), không phụ thuộc việc cổng ghi sổ thành công.
// Sổ không lưu nguyên văn kế hoạch: chỉ băm, lý do, phạm vi và danh sách dịch vụ. Chỉ hook và công cụ của harness ghi sổ.
// Sổ không mở được (Node cũ, tệp hỏng): mọi hàm trả null, bên gọi KHÔNG chặn và phép kiểm sức khỏe báo.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const P = require('../../gate/gate-paths');
const L = require('./ledger-db');
// Bộ đọc khuôn và trạng thái cổng nằm ở thư mục gate/. Thiếu chúng (cài dở, cây thử chỉ có một phần) thì coi như phiên không có kế hoạch
// nào đang được duyệt: không đăng ký được, không chặn theo sổ; việc ghi lần sửa và commit vẫn chạy.
let parsePlan = () => ({ ok: false, errors: ['không nạp được bộ đọc khuôn kế hoạch'], services: [], reason: '', scope: '', block: '' });
let EXAMPLE = '';
let NAME_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
try { ({ parsePlan, EXAMPLE, NAME_RE } = require('../../gate/plan-format')); } catch { /* giữ mặc định */ }

// Chế độ: enforce (chặn theo sổ) | legacy (cách cũ: hỏi khi phiên sửa dịch vụ khác dịch vụ đang làm) | off.
// Tệp cấu hình thiếu hoặc hỏng = enforce.
const configPath = P.scopeConfigPath;
const mode = P.scopeMode;

const parseList = (s) => { try { const a = JSON.parse(s); return Array.isArray(a) ? a.filter((x) => typeof x === 'string') : []; } catch { return []; } };
const row = (r) => (r ? { id: r.id, sid: r.sid, sha: r.sha, reason: r.reason, scope: r.scope, services: parseList(r.services), status: r.status, at: r.at } : null);

// Ghi một lần phán xét. status: approved | rejected | invalid. Kế hoạch được duyệt thay kế hoạch được duyệt trước đó của phiên.
// Cùng (phiên, băm, trạng thái) không ghi hai lần. Trả dòng vừa có.
function recordVerdict(db, { sid, sha, parsed, status, now = Date.now() }) {
  if (!sid || !sha) return null;
  const find = () => db.prepare('SELECT * FROM rec_plans WHERE sid = ? AND sha = ? AND status = ? ORDER BY id DESC LIMIT 1').get(sid, sha, status);
  const had = find();
  if (had) return row(had);
  // Nhiều hook cùng thấy "chưa có dòng" một lúc: giữ khóa ghi rồi kiểm lại, để không sinh hai dòng cho một kế hoạch
  // (dòng sau sẽ đẩy dòng trước thành superseded và làm mồ côi đăng ký của nó).
  db.exec('BEGIN IMMEDIATE');
  try {
    const again = find();
    if (again) { db.exec('COMMIT'); return row(again); }
    if (status === 'approved') db.prepare("UPDATE rec_plans SET status = 'superseded', superseded_at = ? WHERE sid = ? AND status = 'approved'").run(now, sid);
    const p = parsed || { services: [], reason: '', scope: '' };
    L.chainInsert(db, 'rec_plans', { sid, sha, reason: p.reason || '', scope: p.scope || '', services: JSON.stringify(p.services || []), status, at: now });
    db.exec('COMMIT');
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch { /* bỏ qua */ }
    throw e;
  }
  return row(find());
}

// Kế hoạch đang hiệu lực của phiên, theo trạng thái cổng duyệt. Trả:
//   { closed: true }                 cổng đang đóng (cổng duyệt tự chặn việc sửa)
//   { invalid: true, errors: [...] } kế hoạch đã duyệt không đọc được theo khuôn (phiên duyệt trước khi có khuôn kế hoạch, hoặc khuôn sai)
//   { plan: {...} }                  dòng trong sổ (tạo nếu chưa có)
function activePlan(db, root, sid, { now = Date.now() } = {}) {
  let st = null;
  try { st = require('../../gate/gate-state').loadState(root, sid); } catch { return { closed: true }; }
  if (!st.open || !st.approved) return { closed: true };
  const had = db.prepare("SELECT * FROM rec_plans WHERE sid = ? AND sha = ? AND status = 'approved' ORDER BY id DESC LIMIT 1").get(sid, st.approved.sha);
  if (had) return { plan: row(had) };
  const parsed = parsePlan(st.approved.plan);
  if (!parsed.ok) return { invalid: true, errors: parsed.errors };
  return { plan: recordVerdict(db, { sid, sha: st.approved.sha, parsed, status: 'approved', now: st.approved.at || now }) };
}

const registered = (db, planId) => new Set(db.prepare('SELECT service FROM rec_plan_services WHERE plan_id = ?').all(planId).map((r) => r.service));

// Commit hiện tại của repo chứa dịch vụ (điểm bắt đầu của kế hoạch trong repo đó). Dịch vụ chưa có thư mục hay chưa có commit: chuỗi rỗng.
function headOf(root, service) {
  try {
    const dir = P.serviceDir(root, service);
    if (!fs.existsSync(dir)) return '';
    const r = spawnSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8', timeout: 10000, windowsHide: true });
    return r.status === 0 ? r.stdout.trim() : '';
  } catch { return ''; }
}

// Đăng ký dịch vụ cho kế hoạch đang hiệu lực. Chỉ nhận dịch vụ có trong kế hoạch đã duyệt. Trả { ok, text }.
function register(root, sid, services, { now = Date.now() } = {}) {
  if (!sid) return { ok: false, text: 'Không biết mã phiên (Claude Code không truyền CLAUDE_CODE_SESSION_ID cho công cụ này). Báo người dùng; đừng tìm đường khác.' };
  const want = [...new Set((Array.isArray(services) ? services : []).map((s) => String(s).trim()).filter(Boolean))];
  if (!want.length) return { ok: false, text: 'Nêu ít nhất một dịch vụ để đăng ký (tham số services).' };
  const bad = want.filter((s) => !NAME_RE.test(s));
  if (bad.length) return { ok: false, text: `Tên dịch vụ không hợp lệ: ${bad.join(', ')}.` };
  const db = L.open(root);
  if (!db) return { ok: false, text: 'Không mở được sổ phiên của harness, nên không ghi được đăng ký. Báo người dùng.' };
  try {
    const a = activePlan(db, root, sid, { now });
    if (a.closed) return { ok: false, text: 'Chưa có kế hoạch nào được người dùng duyệt. Thứ tự: trình kế hoạch theo khuôn, người dùng duyệt, rồi mới đăng ký.' };
    if (a.invalid) return { ok: false, text: `Kế hoạch đã duyệt không theo khuôn (${a.errors.join('; ')}). Trình lại kế hoạch theo khuôn và chờ người dùng duyệt:\n${EXAMPLE}` };
    const outside = want.filter((s) => !a.plan.services.includes(s));
    if (outside.length) {
      return { ok: false, text: `Không đăng ký được ${outside.join(', ')}: kế hoạch người dùng đã duyệt chỉ nêu ${a.plan.services.length ? a.plan.services.join(', ') : 'KHÔNG dịch vụ nào (chỉ phần dùng chung)'}. Muốn làm dịch vụ khác thì trình kế hoạch mới có mục "Dịch vụ" đúng và chờ duyệt.` };
    }
    const had = registered(db, a.plan.id);
    const ins = db.prepare('INSERT OR IGNORE INTO rec_plan_services(uid, plan_id, service, base, at) VALUES(?, ?, ?, ?, ?)');
    for (const s of want) if (!had.has(s)) ins.run(crypto.randomUUID(), a.plan.id, s, headOf(root, s), now);
    const all = [...registered(db, a.plan.id)].sort();
    return { ok: true, text: `Đã đăng ký cho kế hoạch #${a.plan.id}: ${all.join(', ')}. Sửa dịch vụ ngoài danh sách này sẽ bị chặn.` };
  } finally { try { db.close(); } catch { /* bỏ qua */ } }
}

// Tình trạng phạm vi của phiên, dạng chữ cho model và người đọc.
function statusText(root, sid) {
  if (!sid) return 'Không biết mã phiên (thiếu CLAUDE_CODE_SESSION_ID).';
  const m = mode(root);
  const db = L.open(root);
  if (!db) return 'Không mở được sổ phiên của harness: hook phạm vi đang KHÔNG chặn.';
  try {
    const head = m === 'enforce' ? '' : `Chế độ phạm vi: ${m} (KHÔNG chặn theo sổ). `;
    const a = activePlan(db, root, sid);
    if (a.closed) return `${head}Chưa có kế hoạch nào đang được duyệt. Trình kế hoạch theo khuôn:\n${EXAMPLE}`;
    if (a.invalid) return `${head}Kế hoạch đã duyệt KHÔNG theo khuôn (${a.errors.join('; ')}): mọi lần sửa trong dịch vụ sẽ bị chặn cho tới khi trình lại theo khuôn và được duyệt:\n${EXAMPLE}`;
    const reg = [...registered(db, a.plan.id)].sort();
    const todo = a.plan.services.filter((s) => !reg.includes(s));
    return `${head}Kế hoạch #${a.plan.id} (duyệt ${new Date(a.plan.at).toISOString().slice(0, 16).replace('T', ' ')} UTC). Việc: ${a.plan.reason || '(trống)'}. ` +
      `Dịch vụ trong kế hoạch: ${a.plan.services.join(', ') || 'không (chỉ phần dùng chung)'}. Đã đăng ký: ${reg.join(', ') || 'chưa'}.` +
      (todo.length ? ` CHƯA đăng ký: ${todo.join(', ')} (gọi công cụ scope_register).` : '') +
      codeRange(db, a.plan.id).map((r) => ` Mã của ${r.service}: từ ${r.base ? r.base.slice(0, 12) : '(chưa có commit lúc đăng ký)'}, ${r.commits.length ? `${r.commits.length} commit theo kế hoạch (mới nhất ${r.commits[r.commits.length - 1].slice(0, 12)})` : 'chưa có commit theo kế hoạch'}.`).join('');
  } finally { try { db.close(); } catch { /* bỏ qua */ } }
}

// ---------- Điều đã xảy ra (đợt 2): lần sửa, commit, ghi chú ----------
// Mọi hàm dưới đây tự mở và đóng sổ; không mở được sổ thì trả giá trị rỗng, bên gọi không chặn gì.
function withDb(root, fn, fallback) {
  const db = L.open(root);
  if (!db) return fallback;
  try { return fn(db); } catch { return fallback; } finally { try { db.close(); } catch { /* bỏ qua */ } }
}
const planIdOf = (db, root, sid) => { try { const a = activePlan(db, root, sid); return a.plan ? a.plan.id : 0; } catch { return 0; } };

// Ghi "phiên vừa làm dịch vụ này" theo kế hoạch đang hiệu lực (0 nếu không có). count=false: chỉ làm mới thời điểm (việc ghi qua công cụ
// bsn-docs, hook sửa tệp không thấy) mà không tính là một lần sửa tệp. Trả { first } = lần sửa tệp đầu tiên của phiên ở dịch vụ này.
function noteEdit(root, sid, service, { count = true, now = Date.now() } = {}) {
  if (!sid || !service) return { first: false };
  return withDb(root, (db) => {
    const before = db.prepare('SELECT COALESCE(SUM(edits), 0) AS n FROM rec_edits WHERE sid = ? AND service = ?').get(sid, service).n;
    db.prepare('INSERT INTO rec_edits(uid, sid, plan_id, service, first_at, last_at, edits) VALUES(?, ?, ?, ?, ?, ?, ?) ON CONFLICT(sid, plan_id, service) DO UPDATE SET last_at = excluded.last_at, edits = edits + excluded.edits')
      .run(crypto.randomUUID(), sid, planIdOf(db, root, sid), service, now, now, count ? 1 : 0);
    return { first: count && before === 0 };
  }, { first: false });
}

// Dịch vụ phiên đã làm, mới nhất trước: [{ service, lastAt, edits }] (edits = 0 nghĩa là chỉ ghi qua công cụ, chưa sửa tệp).
const editsOf = (root, sid) => (sid ? withDb(root, (db) => db.prepare('SELECT service, MAX(last_at) AS lastAt, SUM(edits) AS edits FROM rec_edits WHERE sid = ? GROUP BY service ORDER BY lastAt DESC').all(sid).map((r) => ({ service: r.service, lastAt: r.lastAt, edits: r.edits })), []) : []);
// Dịch vụ phiên sửa tệp gần đây nhất (chế độ legacy coi đó là dịch vụ phiên đang làm).
const currentService = (root, sid) => { const r = editsOf(root, sid).find((x) => x.edits > 0); return r ? r.service : ''; };

// Các phiên KHÁC đã sửa tệp của dịch vụ nào trong khoảng gần đây, mới nhất trước: [{ sid, services, ageMs }].
function recentOthers(root, mySid, { withinMs, now = Date.now() } = {}) {
  return withDb(root, (db) => {
    const rows = db.prepare('SELECT sid, service, MAX(last_at) AS lastAt, SUM(edits) AS edits FROM rec_edits WHERE sid != ? AND last_at >= ? GROUP BY sid, service').all(String(mySid || ''), now - withinMs);
    const by = new Map();
    for (const r of rows) {
      if (!(r.edits > 0)) continue;
      const o = by.get(r.sid) || { sid: r.sid, services: [], lastAt: 0 };
      o.services.push(r.service); o.lastAt = Math.max(o.lastAt, r.lastAt);
      by.set(r.sid, o);
    }
    return [...by.values()].map((o) => ({ sid: o.sid, services: o.services.sort(), ageMs: now - o.lastAt })).sort((a, b) => a.ageMs - b.ageMs);
  }, []);
}

// Ghi chú một lần cho phiên (ví dụ "đã nhắc về sơ đồ tự sinh của dịch vụ X ở bản Y"). Ghi chú cùng tiền tố bị thay.
// Trả true nếu đây là ghi chú MỚI (bên gọi mới nhắc), false nếu đã có.
function noteOnce(root, sid, prefix, key, now = Date.now()) {
  if (!sid) return false;
  return withDb(root, (db) => {
    if (db.prepare('SELECT 1 AS x FROM act_notes WHERE sid = ? AND key = ?').get(sid, key)) return false;
    db.prepare("DELETE FROM act_notes WHERE sid = ? AND substr(key, 1, ?) = ?").run(sid, prefix.length, prefix);
    db.prepare('INSERT OR IGNORE INTO act_notes(uid, sid, key, at) VALUES(?, ?, ?, ?)').run(crypto.randomUUID(), sid, key, now);
    return true;
  }, false);
}

// Mọi ghi chú của phiên có tiền tố thuộc `prefixes` (chỉ đọc): bảng phiên dùng để biết phiên đang giữ bản nào của thứ chỉ nạp một lần.
function notesOf(root, sid, prefixes) {
  if (!sid) return [];
  return withDb(root, (db) => db.prepare('SELECT key FROM act_notes WHERE sid = ?').all(sid).map((r) => r.key).filter((k) => prefixes.some((p) => k.startsWith(p))), []);
}

// Một commit vừa xong ở repo của dịch vụ. Có mã phiên (commit do một phiên Claude chạy) thì gắn với kế hoạch đang hiệu lực của phiên;
// không có (người dùng tự commit, hoặc phiên chưa có kế hoạch) thì ghi với plan_id = 0. Trả plan_id đã ghi, hoặc -1 nếu không ghi được.
function recordCommit(root, { sid, service, sha, now = Date.now() }) {
  if (!service || !/^[0-9a-f]{7,64}$/i.test(String(sha || ''))) return -1;
  return withDb(root, (db) => {
    const pid = sid ? planIdOf(db, root, sid) : 0;
    // Giữ khóa ghi trong lúc đọc mắt cuối của chuỗi băm và nối thêm, để hai commit cùng lúc không nối vào cùng một mắt.
    db.exec('BEGIN IMMEDIATE');
    try {
      const had = db.prepare('SELECT 1 AS x FROM rec_commits WHERE plan_id = ? AND service = ? AND commit_sha = ?').get(pid, service, sha);
      if (!had) L.chainInsert(db, 'rec_commits', { plan_id: pid, service, commit_sha: sha, at: now });
      db.exec('COMMIT');
    } catch (e) { try { db.exec('ROLLBACK'); } catch { /* bỏ qua */ } throw e; }
    return pid;
  }, -1);
}
// Khoảng mã của một kế hoạch ở từng dịch vụ: [{ service, base, commits: [sha...] }] (base = commit lúc đăng ký; chi tiết tệp và dòng hỏi git).
function codeRange(db, planId) {
  const reg = db.prepare('SELECT service, base FROM rec_plan_services WHERE plan_id = ?').all(planId);
  const commits = db.prepare('SELECT service, commit_sha FROM rec_commits WHERE plan_id = ? ORDER BY at, rowid').all(planId);  const names = [...new Set([...reg.map((r) => r.service), ...commits.map((c) => c.service)])].sort();
  return names.map((s) => ({ service: s, base: (reg.find((r) => r.service === s) || {}).base || '', commits: commits.filter((c) => c.service === s).map((c) => c.commit_sha) }));
}

// Dịch vụ phiên đã đăng ký theo kế hoạch đang hiệu lực (mảng), hoặc null nếu phiên không có kế hoạch đang được duyệt.
const registeredOf = (root, sid) => (sid ? withDb(root, (db) => { const a = activePlan(db, root, sid); return a.plan ? [...registered(db, a.plan.id)].sort() : null; }, null) : null);

// Chuyển dữ liệu của các tệp scope-<phiên>.json (cách lưu trước đợt 2) vào sổ rồi xóa tệp. Gọi lại nhiều lần không sao. Trả số tệp đã chuyển.
function importScopeFiles(root) {
  let names = [];
  try { names = fs.readdirSync(P.stateDir(root)).filter((n) => /^scope-.+\.json$/.test(n)); } catch { return 0; }
  if (!names.length) return 0;
  return withDb(root, (db) => {
    let moved = 0;
    const ins = db.prepare('INSERT OR IGNORE INTO rec_edits(uid, sid, plan_id, service, first_at, last_at, edits) VALUES(lower(hex(randomblob(16))), ?, 0, ?, ?, ?, ?)');
    for (const n of names) {
      const file = path.join(P.stateDir(root), n);
      const sid = n.slice('scope-'.length, -'.json'.length);
      try {
        const st = JSON.parse(fs.readFileSync(file, 'utf8'));
        const mtime = Math.round(fs.statSync(file).mtimeMs);
        const edited = (Array.isArray(st.services) ? st.services : []).filter((s) => typeof s === 'string');
        const at = st.at && typeof st.at === 'object' ? st.at : {};
        for (const s of new Set([...edited, ...Object.keys(at)])) { const t = Number(at[s]) || mtime; ins.run(sid, s, t, t, edited.includes(s) ? 1 : 0); }
        for (const k of Array.isArray(st.noticed) ? st.noticed : []) if (typeof k === 'string') db.prepare('INSERT OR IGNORE INTO act_notes(uid, sid, key, at) VALUES(lower(hex(randomblob(16))), ?, ?, ?)').run(sid, k, mtime);
      } catch { /* tệp hỏng: bỏ, vẫn xóa */ }
      try { fs.unlinkSync(file); moved += 1; } catch { /* không xóa được: lần sau thử lại (INSERT OR IGNORE nên không ghi trùng) */ }
    }
    return moved;
  }, 0);
}

module.exports = {
  mode, configPath, recordVerdict, activePlan, registered, register, statusText, headOf, EXAMPLE,
  noteEdit, editsOf, currentService, recentOthers, noteOnce, notesOf, recordCommit, codeRange, importScopeFiles, registeredOf, planIdOf,
};
