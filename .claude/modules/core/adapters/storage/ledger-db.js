'use strict';
// spec: LEDG-S-001
// spec: LEDG-S-002
// spec: LEDG-S-003
// spec: LEDG-S-004
// BỘ CHUYỂN lưu trữ, schema `session`. Tệp này chỉ lo SQLite: mở sổ, nâng phiên bản, ghi, đọc. Phần "nghĩ" (việc nào cần gì,
// còn thiếu gì, lời từ chối) nằm ở core/rules/lib/knowledge.js; hàm đọc ghi của phần kế hoạch ở scope-db.js.
//
// Schema `session` kể chuyện của từng phiên, chia hai nhóm theo câu hỏi "có cần nhớ sau khi phiên kết thúc không":
//   sessions             gốc: một dòng cho mỗi phiên, kèm dự án và bản harness lúc phiên bắt đầu
//   act_*  AGENT ĐÃ LÀM GÌ (giữ có hạn; dùng để hàng rào đối chiếu ngay và làm nguyên liệu đánh giá)
//     act_skill_loads      phiên (hoặc agent con) đã mở skill nào, trong đợt nào
//     act_doc_reads        đã đọc tài liệu bắt buộc nào của dịch vụ
//     act_tool_calls       đã gọi công cụ nào, ở dịch vụ nào, dưới kế hoạch nào
//     act_rule_decisions   luật nào của hàng rào đã chặn, hỏi, giữ lượt hay nhắc, vì sao
//     act_notes            ghi chú một lần theo phiên ("đã nhắc điều X")
//   rec_*  KẾT QUẢ (giữ mãi; dùng để truy vết kế hoạch ra commit)
//     rec_plans            kế hoạch người dùng đã phán (duyệt, trả về, sai khuôn, bị thay)
//     rec_plan_services    dịch vụ phiên đã đăng ký cho một kế hoạch
//     rec_edits            phiên đã thật sự sửa dịch vụ nào theo kế hoạch nào
//     rec_commits          commit sinh ra theo một kế hoạch
// Mỗi dòng act_ và rec_ có `uid` duy nhất (gửi về máy chủ chung sau này không bị trùng). rec_plans và rec_commits mang chuỗi băm
// (prev_hash, hash): sửa một dòng là đứt chuỗi và verifyChain() thấy. Đo lường (`eval`) ở tệp riêng (eval-db.js), chỉ đọc sổ này.
//
// Đã đo trên Claude Code thật (2026-10-07), đây là căn cứ của cách ghi:
//   - Mở skill bằng công cụ Skill: PostToolUse có tool_name "Skill", tool_input.skill = tên skill.
//   - Người dùng gõ /<tên-skill>: KHÔNG có sự kiện công cụ nào; chỉ có UserPromptSubmit với prompt bắt đầu bằng "/<tên>".
//   - Agent con dùng CHUNG session_id với phiên chính, thêm agent_id. Ngữ cảnh của nó riêng, nên sổ ghi theo cặp (phiên, agent).
//   - Nén ngữ cảnh: SessionStart có source "compact". Từ đó nội dung skill có thể đã mất, nên sổ tăng "đợt" (epoch) của phiên;
//     chỉ những gì nạp trong đợt hiện tại mới được tính.
// Giới hạn: sổ biết phiên ĐÃ MỞ, không biết phiên có làm theo. Lệnh ghi qua Bash không đi qua đây. Node không có node:sqlite
// (trước 22.5) thì open() trả null: không ghi, không chặn.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const P = require('../../gate/gate-paths');

const DAY_MS = 24 * 60 * 60 * 1000;
// Hạn cứng cho nhật ký act_ (lời gọi công cụ, quyết định của luật) khi lệnh bảo trì hằng ngày không chạy. Lệnh bảo trì (db-maintain.js)
// gom số liệu theo ngày vào eval.db rồi mới xóa ở hạn 60 ngày; hạn cứng này chỉ để sổ không phình mãi khi lệnh đó không bao giờ chạy.
const HARD_KEEP_MS = 180 * DAY_MS;
const VERSION = 5;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS sessions(sid TEXT PRIMARY KEY, started_at INTEGER NOT NULL, last_at INTEGER NOT NULL, epoch INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS skill_loads(sid TEXT NOT NULL, agent TEXT NOT NULL DEFAULT '', skill TEXT NOT NULL, via TEXT NOT NULL, epoch INTEGER NOT NULL, at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS doc_reads(sid TEXT NOT NULL, agent TEXT NOT NULL DEFAULT '', service TEXT NOT NULL, doc TEXT NOT NULL, epoch INTEGER NOT NULL, at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS tool_calls(sid TEXT NOT NULL, agent TEXT NOT NULL DEFAULT '', tool TEXT NOT NULL, service TEXT NOT NULL DEFAULT '', blocked INTEGER NOT NULL DEFAULT 0, missing TEXT NOT NULL DEFAULT '', at INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS skill_loads_sid ON skill_loads(sid, agent, epoch);
  CREATE INDEX IF NOT EXISTS doc_reads_sid ON doc_reads(sid, agent, epoch);
  CREATE INDEX IF NOT EXISTS tool_calls_at ON tool_calls(at);
  PRAGMA user_version = 1;
`;
// Phiên bản 2: phạm vi theo chuỗi phiên -> kế hoạch đã duyệt -> dịch vụ. Hàm đọc ghi ở scope-db.js.
// Mọi lệnh đều "IF NOT EXISTS": hai hook cùng nâng sổ một lúc thì lần sau không làm gì.
const SCHEMA_V2 = `
  CREATE TABLE IF NOT EXISTS plans(id INTEGER PRIMARY KEY AUTOINCREMENT, sid TEXT NOT NULL, sha TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '', scope TEXT NOT NULL DEFAULT '', services TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL, at INTEGER NOT NULL, superseded_at INTEGER);
  CREATE INDEX IF NOT EXISTS plans_sid ON plans(sid, status);
  CREATE TABLE IF NOT EXISTS plan_services(plan_id INTEGER NOT NULL, service TEXT NOT NULL, base TEXT NOT NULL DEFAULT '', at INTEGER NOT NULL, PRIMARY KEY(plan_id, service));
  CREATE TABLE IF NOT EXISTS service_edits(sid TEXT NOT NULL, plan_id INTEGER NOT NULL DEFAULT 0, service TEXT NOT NULL, first_at INTEGER NOT NULL, last_at INTEGER NOT NULL, edits INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(sid, plan_id, service));
  CREATE INDEX IF NOT EXISTS service_edits_service ON service_edits(service, last_at);
  CREATE TABLE IF NOT EXISTS plan_commits(plan_id INTEGER NOT NULL, service TEXT NOT NULL, commit_sha TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY(plan_id, service, commit_sha));
  PRAGMA user_version = 2;
`;
// Phiên bản 3: ghi chú theo phiên, thay phần "đã nhắc gì" từng nằm trong tệp scope-<phiên>.json.
const SCHEMA_V3 = `
  CREATE TABLE IF NOT EXISTS session_notes(sid TEXT NOT NULL, key TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY(sid, key));
  PRAGMA user_version = 3;
`;
// Phiên bản 4: đổi tên theo hai nhóm act_, rec_; thêm uid, dự án, bản harness, kế hoạch của lời gọi công cụ, quyết định của
// mọi luật, chuỗi băm. Chỉ đổi tên và thêm cột; dữ liệu cũ giữ nguyên. Hai việc duy nhất có chuyển dữ liệu: dòng "bị chặn hay được nhắc"
// mà luật đủ kiến thức từng ghi vào tool_calls (cột blocked, missing) chuyển sang act_rule_decisions, vì đó là QUYẾT ĐỊNH của luật chứ không
// phải lời gọi công cụ (lời gọi thật được luật ghi sổ ghi riêng, sau khi công cụ chạy); và hai bảng rec_ có chuỗi băm được tính từ đầu.
const UID_SQL = 'lower(hex(randomblob(16)))';
const SCHEMA_V4 = `
  ALTER TABLE skill_loads RENAME TO act_skill_loads;
  ALTER TABLE act_skill_loads ADD COLUMN uid TEXT;
  UPDATE act_skill_loads SET uid = ${UID_SQL};
  ALTER TABLE doc_reads RENAME TO act_doc_reads;
  ALTER TABLE act_doc_reads ADD COLUMN uid TEXT;
  UPDATE act_doc_reads SET uid = ${UID_SQL};
  CREATE TABLE act_rule_decisions(uid TEXT PRIMARY KEY, sid TEXT NOT NULL, agent TEXT NOT NULL DEFAULT '', plan_id INTEGER NOT NULL DEFAULT 0,
    rule TEXT NOT NULL, kind TEXT NOT NULL DEFAULT '', tool TEXT NOT NULL DEFAULT '', service TEXT NOT NULL DEFAULT '',
    verdict TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', at INTEGER NOT NULL);
  CREATE INDEX act_rule_decisions_at ON act_rule_decisions(at);
  INSERT INTO act_rule_decisions(uid, sid, agent, plan_id, rule, kind, tool, service, verdict, detail, at)
    SELECT ${UID_SQL}, sid, agent, 0, 'skill', 'before-action', tool, service, CASE WHEN blocked = 1 THEN 'deny' ELSE 'note' END, missing, at
    FROM tool_calls WHERE blocked = 1 OR missing != '';
  DELETE FROM tool_calls WHERE blocked = 1 OR missing != '';
  ALTER TABLE tool_calls RENAME TO act_tool_calls;
  ALTER TABLE act_tool_calls DROP COLUMN blocked;
  ALTER TABLE act_tool_calls DROP COLUMN missing;
  ALTER TABLE act_tool_calls ADD COLUMN plan_id INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE act_tool_calls ADD COLUMN uid TEXT;
  UPDATE act_tool_calls SET uid = ${UID_SQL};
  ALTER TABLE session_notes RENAME TO act_notes;
  ALTER TABLE act_notes ADD COLUMN uid TEXT;
  UPDATE act_notes SET uid = ${UID_SQL};
  ALTER TABLE plans RENAME TO rec_plans;
  ALTER TABLE rec_plans ADD COLUMN uid TEXT;
  ALTER TABLE rec_plans ADD COLUMN prev_hash TEXT NOT NULL DEFAULT '';
  ALTER TABLE rec_plans ADD COLUMN hash TEXT NOT NULL DEFAULT '';
  UPDATE rec_plans SET uid = ${UID_SQL};
  ALTER TABLE plan_services RENAME TO rec_plan_services;
  ALTER TABLE rec_plan_services ADD COLUMN uid TEXT;
  UPDATE rec_plan_services SET uid = ${UID_SQL};
  ALTER TABLE service_edits RENAME TO rec_edits;
  ALTER TABLE rec_edits ADD COLUMN uid TEXT;
  UPDATE rec_edits SET uid = ${UID_SQL};
  ALTER TABLE plan_commits RENAME TO rec_commits;
  ALTER TABLE rec_commits ADD COLUMN uid TEXT;
  ALTER TABLE rec_commits ADD COLUMN prev_hash TEXT NOT NULL DEFAULT '';
  ALTER TABLE rec_commits ADD COLUMN hash TEXT NOT NULL DEFAULT '';
  UPDATE rec_commits SET uid = ${UID_SQL};
  ALTER TABLE sessions ADD COLUMN project TEXT NOT NULL DEFAULT '';
  ALTER TABLE sessions ADD COLUMN harness_ver TEXT NOT NULL DEFAULT '';
`;

// Phiên bản 5: bảng việc của phiên điều phối (việc con giao cho phiên làm việc: ai giao, ai nhận, tới đâu, báo cáo). Có thể đổi (trạng thái, báo cáo), nên thuộc nhóm act_.
const SCHEMA_V5 = `
  CREATE TABLE IF NOT EXISTS act_tasks(uid TEXT PRIMARY KEY, task TEXT NOT NULL, sid TEXT NOT NULL, service TEXT NOT NULL, worker TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL, status TEXT NOT NULL, report TEXT NOT NULL DEFAULT '', at INTEGER NOT NULL, updated INTEGER NOT NULL);
  CREATE UNIQUE INDEX IF NOT EXISTS act_tasks_task ON act_tasks(task);
  CREATE INDEX IF NOT EXISTS act_tasks_sid ON act_tasks(sid, status);
`;

const uid = () => crypto.randomUUID();
const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const ROOT_OF = new WeakMap();

// ---------- Dự án và bản harness (khóa để sau này gom số liệu của nhiều dự án, nhiều bản) ----------
// Dự án: mã commit gốc của repo chứa harness (giống nhau trên mọi máy có cùng repo); không có git thì băm đường dẫn (chỉ đúng trên máy này).
// Bản harness: 12 ký tự đầu của băm MANIFEST.json (dấu vân tay của cổng duyệt). Tính một lần cho mỗi tiến trình.
const META = new Map();
function projectMeta(root) {
  if (META.has(root)) return META.get(root);
  let project = '';
  try {
    const r = spawnSync('git', ['-C', root, 'rev-list', '--max-parents=0', 'HEAD'], { encoding: 'utf8', timeout: 5000, windowsHide: true });
    if (r.status === 0) project = (r.stdout.trim().split(/\r?\n/).pop() || '').slice(0, 16);
  } catch { /* không có git */ }
  if (!project) project = `path:${crypto.createHash('sha256').update(path.resolve(root).toLowerCase()).digest('hex').slice(0, 12)}`;
  let harnessVer = '';
  try { harnessVer = crypto.createHash('sha256').update(fs.readFileSync(P.manifestPath(root))).digest('hex').slice(0, 12); } catch { /* chưa cài cổng duyệt */ }
  const m = { project, harnessVer };
  META.set(root, m);
  return m;
}

// ---------- Chuỗi băm của hồ sơ rec_ ----------
// Băm chỉ phủ các cột KHÔNG BAO GIỜ đổi sau khi ghi. rec_plans.status và superseded_at đổi khi kế hoạch bị thay (approved -> superseded),
// nên không nằm trong băm: việc thay suy ra được từ kế hoạch được duyệt sau của cùng phiên.
const CHAINS = {
  rec_plans: { order: 'id', fields: ['uid', 'sid', 'sha', 'reason', 'scope', 'services', 'at'] },
  rec_commits: { order: 'rowid', fields: ['uid', 'plan_id', 'service', 'commit_sha', 'at'] },
};
const linkHash = (prev, table, row) => crypto.createHash('sha256').update(`${prev}\n${JSON.stringify(CHAINS[table].fields.map((f) => row[f]))}`).digest('hex');
const lastHash = (db, table) => (db.prepare(`SELECT hash FROM ${table} ORDER BY ${CHAINS[table].order} DESC LIMIT 1`).get() || { hash: '' }).hash;

// Thêm một dòng vào bảng có chuỗi băm. Bên gọi PHẢI đang giữ khóa ghi (BEGIN IMMEDIATE), để hai tiến trình không cùng nối vào một mắt.
function chainInsert(db, table, row, { orIgnore = false } = {}) {
  const r = { uid: uid(), ...row };
  const prev = lastHash(db, table);
  const hash = linkHash(prev, table, r);
  const cols = [...Object.keys(r), 'prev_hash', 'hash'];
  const res = db.prepare(`INSERT ${orIgnore ? 'OR IGNORE ' : ''}INTO ${table}(${cols.join(', ')}) VALUES(${cols.map(() => '?').join(', ')})`).run(...Object.values(r), prev, hash);
  return res.changes > 0;
}

// Tính chuỗi băm cho các dòng chưa có (lúc nâng lên phiên bản 4). Không động tới dòng đã có băm.
function sealChains(db) {
  for (const table of Object.keys(CHAINS)) {
    let prev = '';
    for (const row of db.prepare(`SELECT rowid AS _r, * FROM ${table} ORDER BY ${CHAINS[table].order}`).all()) {
      if (row.hash) { prev = row.hash; continue; }
      const hash = linkHash(prev, table, row);
      db.prepare(`UPDATE ${table} SET prev_hash = ?, hash = ? WHERE rowid = ?`).run(prev, hash, row._r);
      prev = hash;
    }
  }
}

// Kiểm chuỗi băm. Trả [{ table, rows, broken: uid của dòng đầu tiên bị đứt | null }].
function verifyChain(db) {
  return Object.keys(CHAINS).map((table) => {
    let prev = '';
    let broken = null;
    const rows = db.prepare(`SELECT * FROM ${table} ORDER BY ${CHAINS[table].order}`).all();
    for (const row of rows) {
      if (row.prev_hash !== prev || row.hash !== linkHash(prev, table, row)) { broken = row.uid || '(không có uid)'; break; }
      prev = row.hash;
    }
    return { table, rows: rows.length, broken };
  });
}

// ---------- Mở sổ và nâng phiên bản ----------
function migrate(db, root) {
  let version = db.prepare('PRAGMA user_version').get().user_version;
  if (version >= VERSION) return;
  // Sổ đã có dữ liệu ở phiên bản cũ: chụp một bản sao trước khi đổi tên bảng. Hai tiến trình cùng chụp thì tiến trình sau gặp tệp đã có và bỏ qua.
  if (version >= 1) {
    try {
      fs.mkdirSync(P.dbBackupsDir(root), { recursive: true });
      const file = path.join(P.dbBackupsDir(root), `${P.LEDGER_FILE}.v${version}-truoc-khi-nang.db`);
      if (!fs.existsSync(file)) db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    } catch { /* không chụp được thì vẫn nâng: để mã mới chạy trên sổ cũ còn tệ hơn */ }
  }
  // MỌI bước nâng nằm trong một khóa ghi, và đọc lại phiên bản sau khi đã giữ khóa: tiến trình tới sau thấy sổ đã nâng thì thôi.
  // (Đã gặp khi viết: tạo bảng ngoài khóa thì một tiến trình chậm tạo lại bảng cũ sau khi tiến trình khác đã đổi tên nó.)
  db.exec('BEGIN IMMEDIATE');
  try {
    version = db.prepare('PRAGMA user_version').get().user_version;
    if (version < 1) db.exec(SCHEMA);
    if (version < 2) db.exec(SCHEMA_V2);
    if (version < 3) db.exec(SCHEMA_V3);
    if (version < 4) {
      db.exec(SCHEMA_V4);
      const { project } = projectMeta(root);
      db.prepare("UPDATE sessions SET project = ? WHERE project = ''").run(project);
      sealChains(db);
    }
    if (version < 5) db.exec(SCHEMA_V5);
    db.exec(`PRAGMA user_version = ${VERSION}`);
    db.exec('COMMIT');
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch { /* bỏ qua */ }
    throw e;
  }
}

// Mở sổ. Nhiều hook chạy CÙNG LÚC là chuyện thường (model gọi vài công cụ trong một lượt, mỗi công cụ một tiến trình hook), nên:
// đặt thời gian chờ khóa TRƯỚC mọi lệnh khác, chỉ nâng phiên bản khi sổ còn cũ, và thử lại vài lần khi sổ đang bị tiến trình khác giữ.
// Đã gặp thật: ba công cụ gọi song song mà chỉ hai lần được ghi, vì lệnh đặt chế độ ghi chạy trước khi có thời gian chờ khóa.
function open(root) {
  let sqlite;
  try { sqlite = require('node:sqlite'); } catch { return null; }
  try { fs.mkdirSync(P.stateDir(root), { recursive: true }); } catch { return null; }
  for (let attempt = 0; attempt < 8; attempt += 1) {
    let db = null;
    try {
      db = new sqlite.DatabaseSync(P.ledgerPath(root));
      db.exec('PRAGMA busy_timeout = 5000;');
      db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
      migrate(db, root);
      ROOT_OF.set(db, root);
      return db;
    } catch {
      try { if (db) db.close(); } catch { /* bỏ qua */ }
      pause(30 * (attempt + 1));
    }
  }
  return null;
}

// Bảo đảm phiên có trong sổ; trả đợt hiện tại. Phiên mới được ghi kèm dự án và bản harness.
function touch(db, sid, now = Date.now()) {
  const had = db.prepare('SELECT epoch FROM sessions WHERE sid = ?').get(sid);
  if (had) {
    db.prepare('UPDATE sessions SET last_at = ? WHERE sid = ?').run(now, sid);
    return had.epoch;
  }
  const root = ROOT_OF.get(db);
  const m = root ? projectMeta(root) : { project: '', harnessVer: '' };
  db.prepare('INSERT INTO sessions(sid, started_at, last_at, project, harness_ver) VALUES(?, ?, ?, ?, ?) ON CONFLICT(sid) DO UPDATE SET last_at = excluded.last_at').run(sid, now, now, m.project, m.harnessVer);
  return db.prepare('SELECT epoch FROM sessions WHERE sid = ?').get(sid).epoch;
}
// Ngữ cảnh của phiên vừa bị nén hoặc xóa: những gì đã nạp không còn chắc nằm trong trí nhớ của phiên.
function bumpEpoch(db, sid, now = Date.now()) {
  touch(db, sid, now);
  db.prepare('UPDATE sessions SET epoch = epoch + 1 WHERE sid = ?').run(sid);
}
const addSkill = (db, { sid, agent = '', skill, via, now = Date.now() }) => db.prepare('INSERT INTO act_skill_loads(uid, sid, agent, skill, via, epoch, at) VALUES(?, ?, ?, ?, ?, ?, ?)').run(uid(), sid, agent, skill, via, touch(db, sid, now), now);
const addDoc = (db, { sid, agent = '', service, doc, now = Date.now() }) => db.prepare('INSERT INTO act_doc_reads(uid, sid, agent, service, doc, epoch, at) VALUES(?, ?, ?, ?, ?, ?, ?)').run(uid(), sid, agent, service, doc, touch(db, sid, now), now);
const addTool = (db, { sid, agent = '', tool, service = '', planId = 0, now = Date.now() }) => db.prepare('INSERT INTO act_tool_calls(uid, sid, agent, tool, service, plan_id, at) VALUES(?, ?, ?, ?, ?, ?, ?)').run(uid(), sid, agent, tool, service || '', planId || 0, now);
// Một quyết định của một luật (không phải cổng duyệt: lời phán của cổng duyệt nằm ở rec_plans). `detail` là một dòng ngắn do luật đưa,
// không phải nội dung tệp hay lệnh.
const addDecision = (db, { sid, agent = '', planId = 0, rule, kind = '', tool = '', service = '', verdict, detail = '', now = Date.now() }) =>
  db.prepare('INSERT INTO act_rule_decisions(uid, sid, agent, plan_id, rule, kind, tool, service, verdict, detail, at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(uid(), sid, agent, planId || 0, rule, kind, tool, service || '', verdict, String(detail).slice(0, 300), now);
// ---------- Bảng việc (act_tasks) ----------
const TASK_STATUS = ['queued', 'running', 'done', 'blocked', 'failed'];
// Thêm một việc do phiên điều phối `sid` giao cho dịch vụ `service`. Trả mã việc ngắn.
function addTask(db, { sid, service, title, worker = '', now = Date.now() }) {
  const task = crypto.randomBytes(3).toString('hex');
  touch(db, sid, now);
  db.prepare('INSERT INTO act_tasks(uid, task, sid, service, worker, title, status, report, at, updated) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(uid(), task, sid, service, worker, String(title).slice(0, 300), 'queued', '', now, now);
  return task;
}
const getTask = (db, task) => db.prepare('SELECT * FROM act_tasks WHERE task = ?').get(task) || null;
// Cập nhật trạng thái và báo cáo; gán người nhận nếu chưa có. Trả dòng sau khi cập nhật.
function setTask(db, { task, status, report, worker, now = Date.now() }) {
  const cur = getTask(db, task);
  if (!cur) return null;
  db.prepare('UPDATE act_tasks SET status = ?, report = ?, worker = ?, updated = ? WHERE task = ?')
    .run(status || cur.status, report === undefined ? cur.report : String(report).slice(0, 4000), cur.worker || worker || '', now, task);
  return getTask(db, task);
}
const listTasks = (db, { sid, limit = 50 } = {}) => (sid
  ? db.prepare('SELECT * FROM act_tasks WHERE sid = ? ORDER BY at DESC LIMIT ?').all(sid, limit)
  : db.prepare('SELECT * FROM act_tasks ORDER BY at DESC LIMIT ?').all(limit));

// Xóa nhật ký act_ cũ. Mặc định là hạn cứng; lệnh bảo trì gọi với hạn ngắn hơn SAU KHI đã gom số liệu theo ngày.
function prune(db, now = Date.now(), keepMs = HARD_KEEP_MS) {
  for (const t of ['act_tool_calls', 'act_rule_decisions']) db.prepare(`DELETE FROM ${t} WHERE at < ?`).run(now - keepMs);
}

// Những gì (phiên, agent) đã nạp trong đợt hiện tại: { skills: Set<tên>, docs: Set<"dịch-vụ|tệp"> }.
function have(db, sid, agent = '') {
  const row = db.prepare('SELECT epoch FROM sessions WHERE sid = ?').get(sid);
  const epoch = row ? row.epoch : 0;
  const skills = new Set(db.prepare('SELECT DISTINCT skill FROM act_skill_loads WHERE sid = ? AND agent = ? AND epoch = ?').all(sid, agent, epoch).map((r) => r.skill));
  const docs = new Set(db.prepare('SELECT DISTINCT service, doc FROM act_doc_reads WHERE sid = ? AND agent = ? AND epoch = ?').all(sid, agent, epoch).map((r) => `${r.service}|${r.doc}`));
  return { skills, docs };
}

// ---------- Số liệu ----------
// `skills` = { all: [tên skill đang có], exists(tên) }: do bên gọi đưa vào (bộ chuyển này không biết skill nằm ở đâu).
function stats(db, skills, { now = Date.now(), days = 30 } = {}) {
  const since = now - days * DAY_MS;
  const bySkill = new Map(skills.all.map((s) => [s, { skill: s, loads: 0, sessions: 0, last: 0 }]));
  for (const r of db.prepare('SELECT skill, COUNT(*) AS loads, COUNT(DISTINCT sid) AS sessions, MAX(at) AS last FROM act_skill_loads WHERE at >= ? GROUP BY skill').all(since)) {
    bySkill.set(r.skill, { skill: r.skill, loads: r.loads, sessions: r.sessions, last: r.last, gone: !skills.exists(r.skill) });
  }
  const blocked = db.prepare("SELECT tool, service, detail AS missing, COUNT(*) AS n FROM act_rule_decisions WHERE rule = 'skill' AND verdict = 'deny' AND at >= ? GROUP BY tool, service, detail ORDER BY n DESC").all(since);
  const tools = db.prepare('SELECT tool, COUNT(*) AS n, COUNT(DISTINCT sid) AS sessions FROM act_tool_calls WHERE at >= ? GROUP BY tool ORDER BY n DESC').all(since);
  const rules = db.prepare('SELECT rule, verdict, COUNT(*) AS n FROM act_rule_decisions WHERE at >= ? GROUP BY rule, verdict ORDER BY rule, verdict').all(since);
  const sessions = db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE last_at >= ?').get(since).n;
  return { days, sessions, skills: [...bySkill.values()].sort((a, b) => b.loads - a.loads || a.skill.localeCompare(b.skill)), blocked, tools, rules };
}

// Skill phiên chính (không tính agent con) đã mở trong đợt hiện tại; dùng cho bảng phiên. Lỗi thì trả [].
function skillsOf(root, sid) {
  if (!fs.existsSync(P.ledgerPath(root))) return [];
  const db = open(root);
  if (!db) return [];
  try { return [...have(db, sid, '').skills].sort(); } catch { return []; } finally { try { db.close(); } catch { /* bỏ qua */ } }
}

module.exports = { VERSION, open, touch, bumpEpoch, addSkill, addDoc, addTool, addDecision, TASK_STATUS, addTask, getTask, setTask, listTasks, prune, have, stats, skillsOf, chainInsert, verifyChain, projectMeta, HARD_KEEP_MS, DAY_MS };
