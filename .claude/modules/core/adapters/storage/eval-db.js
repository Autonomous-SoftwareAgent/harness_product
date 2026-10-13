'use strict';
// spec: LEDG-S-004
// BỘ CHUYỂN lưu trữ, schema `eval`: đo hiệu quả của công cụ, skill và luật của harness. Tệp riêng (.claude/.state/eval.db), không
// nằm chung sổ phiên: đo lường ghi theo đợt, nhiều dòng một lúc, nên không được làm hook trên đường nóng phải chờ khóa của sổ phiên.
// Đi MỘT CHIỀU: sổ này đọc sổ phiên (gắn tạm bằng ATTACH, chỉ đọc); sổ phiên và các luật không bao giờ đọc sổ này.
//
//   usage_daily   số liệu theo ngày (UTC) gom từ nhóm act_ của sổ phiên trước khi act_ bị xóa theo hạn; giữ mãi, để thấy xu hướng dài hạn.
//                 kind: tool (lời gọi công cụ) | skill (lần mở skill) | rule (quyết định của luật; blocks = số lần chặn, hỏi hoặc giữ lượt)
//   rolled_days   ngày đã gom: mỗi ngày gom ĐÚNG MỘT LẦN, sau khi ngày đó đã hết, nên chạy lại không đếm trùng
//   questions, answers, runs, results   bộ chấm điểm (suite `search` là bộ đầu tiên; thêm phép đo là thêm suite, không thêm bảng).
//                 Bộ câu gốc nằm trong git (JSON); bảng ở đây là bản nạp theo phiên bản. Lệnh chấm điểm chưa có (kế hoạch sau).
//   scores        view: điểm tính từ results, không lưu riêng
const fs = require('node:fs');
const P = require('../../gate/gate-paths');

const DAY_MS = 24 * 60 * 60 * 1000;
const VERSION = 1;
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS usage_daily(day TEXT NOT NULL, project TEXT NOT NULL DEFAULT '', harness_ver TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL, name TEXT NOT NULL, service TEXT NOT NULL DEFAULT '', calls INTEGER NOT NULL DEFAULT 0, sessions INTEGER NOT NULL DEFAULT 0,
    blocks INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(day, project, harness_ver, kind, name, service));
  CREATE TABLE IF NOT EXISTS rolled_days(day TEXT PRIMARY KEY, at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS questions(suite TEXT NOT NULL, unit TEXT NOT NULL, qid TEXT NOT NULL, ver TEXT NOT NULL, q TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT '', PRIMARY KEY(suite, unit, qid, ver));
  CREATE TABLE IF NOT EXISTS answers(suite TEXT NOT NULL, unit TEXT NOT NULL, qid TEXT NOT NULL, ver TEXT NOT NULL, path TEXT NOT NULL,
    grade TEXT NOT NULL DEFAULT 'dung', PRIMARY KEY(suite, unit, qid, ver, path));
  CREATE TABLE IF NOT EXISTS runs(id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, suite TEXT NOT NULL, unit TEXT NOT NULL,
    commit_sha TEXT NOT NULL DEFAULT '', set_ver TEXT NOT NULL DEFAULT '');
  CREATE TABLE IF NOT EXISTS results(run_id INTEGER NOT NULL, qid TEXT NOT NULL, ver TEXT NOT NULL, searcher TEXT NOT NULL, rank INTEGER,
    grade TEXT, n_results INTEGER NOT NULL DEFAULT 0, chars INTEGER NOT NULL DEFAULT 0, ms INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(run_id, qid, searcher));
  CREATE VIEW IF NOT EXISTS scores AS
    SELECT r.run_id, u.suite, u.unit, r.searcher, q.kind, q.source, COUNT(*) AS questions,
      SUM(CASE WHEN r.rank = 1 THEN 1 ELSE 0 END) AS top1, SUM(CASE WHEN r.rank BETWEEN 1 AND 5 THEN 1 ELSE 0 END) AS top5,
      SUM(CASE WHEN r.n_results = 0 THEN 1 ELSE 0 END) AS empty, AVG(r.chars) AS avg_chars, AVG(r.ms) AS avg_ms
    FROM results r JOIN runs u ON u.id = r.run_id
    LEFT JOIN questions q ON q.suite = u.suite AND q.unit = u.unit AND q.qid = r.qid AND q.ver = r.ver
    GROUP BY r.run_id, u.suite, u.unit, r.searcher, q.kind, q.source;
`;

function open(root) {
  let sqlite;
  try { sqlite = require('node:sqlite'); } catch { return null; }
  try {
    fs.mkdirSync(P.stateDir(root), { recursive: true });
    const db = new sqlite.DatabaseSync(P.evalDbPath(root));
    db.exec('PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;');
    if (db.prepare('PRAGMA user_version').get().user_version < VERSION) db.exec(`${SCHEMA} PRAGMA user_version = ${VERSION};`);
    return db;
  } catch { return null; }
}

const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);
const DAY_SQL = (col) => `strftime('%Y-%m-%d', ${col} / 1000, 'unixepoch')`;

// Gom các ngày ĐÃ HẾT (trước hôm nay, giờ UTC) mà chưa gom, từ nhóm act_ của sổ phiên `ledgerFile`. Trả danh sách ngày vừa gom.
function rollUp(db, ledgerFile, now = Date.now()) {
  if (!fs.existsSync(ledgerFile)) return [];
  db.prepare("ATTACH DATABASE ? AS s").run(ledgerFile);
  try {
    const today = dayOf(now);
    const tables = new Set(db.prepare("SELECT name FROM s.sqlite_master WHERE type = 'table'").all().map((r) => r.name));
    if (!tables.has('act_tool_calls')) return []; // sổ chưa nâng lên schema `session`
    const days = new Set();
    for (const t of ['act_tool_calls', 'act_skill_loads', 'act_rule_decisions']) {
      for (const r of db.prepare(`SELECT DISTINCT ${DAY_SQL('at')} AS day FROM s.${t}`).all()) if (r.day < today) days.add(r.day);
    }
    const done = new Set(db.prepare('SELECT day FROM rolled_days').all().map((r) => r.day));
    const todo = [...days].filter((d) => !done.has(d)).sort();
    if (!todo.length) return [];
    // Mỗi loại: (bảng act_, tên gom theo, dịch vụ, số lần chặn). Dự án và bản harness lấy từ dòng của phiên.
    const KINDS = [
      ['tool', 'act_tool_calls', 'x.tool', 'x.service', '0'],
      ['skill', 'act_skill_loads', 'x.skill', "''", '0'],
      ['rule', 'act_rule_decisions', 'x.rule', 'x.service', "SUM(CASE WHEN x.verdict IN ('deny', 'ask', 'block') THEN 1 ELSE 0 END)"],
    ];
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const day of todo) {
        for (const [kind, table, name, service, blocks] of KINDS) {
          db.prepare(`INSERT INTO usage_daily(day, project, harness_ver, kind, name, service, calls, sessions, blocks)
            SELECT ?, COALESCE(ss.project, ''), COALESCE(ss.harness_ver, ''), '${kind}', ${name}, ${service}, COUNT(*), COUNT(DISTINCT x.sid), ${blocks}
            FROM s.${table} x LEFT JOIN s.sessions ss ON ss.sid = x.sid WHERE ${DAY_SQL('x.at')} = ?
            GROUP BY COALESCE(ss.project, ''), COALESCE(ss.harness_ver, ''), ${name}, ${service}
            ON CONFLICT(day, project, harness_ver, kind, name, service) DO UPDATE SET calls = calls + excluded.calls, sessions = MAX(sessions, excluded.sessions), blocks = blocks + excluded.blocks`).run(day, day);
        }
        db.prepare('INSERT INTO rolled_days(day, at) VALUES(?, ?)').run(day, now);
      }
      db.exec('COMMIT');
    } catch (e) { try { db.exec('ROLLBACK'); } catch { /* bỏ qua */ } throw e; }
    return todo;
  } finally { try { db.exec('DETACH DATABASE s'); } catch { /* bỏ qua */ } }
}

// Tổng theo tên trong hai khoảng 7 ngày (đã gom) gần nhất: [{ kind, name, recent, before, blocksRecent, blocksBefore }], và ngày gom gần nhất.
function trend(db, { days = 7 } = {}) {
  const last = (db.prepare('SELECT MAX(day) AS d FROM rolled_days').get() || {}).d || null;
  if (!last) return { last: null, rows: [] };
  const end = Date.parse(`${last}T00:00:00Z`);
  const from1 = dayOf(end - (days - 1) * DAY_MS);
  const from2 = dayOf(end - (2 * days - 1) * DAY_MS);
  const rows = db.prepare(`SELECT kind, name,
      SUM(CASE WHEN day >= ? THEN calls ELSE 0 END) AS recent, SUM(CASE WHEN day < ? THEN calls ELSE 0 END) AS before,
      SUM(CASE WHEN day >= ? THEN blocks ELSE 0 END) AS blocksRecent, SUM(CASE WHEN day < ? THEN blocks ELSE 0 END) AS blocksBefore
    FROM usage_daily WHERE day >= ? AND day <= ? GROUP BY kind, name ORDER BY kind, recent DESC, name`).all(from1, from1, from1, from1, from2, last);
  return { last, rows: rows.map((r) => ({ ...r })) };
}

module.exports = { VERSION, open, rollUp, trend, dayOf };
