'use strict';
// spec: MCP-S-006
// LỆNH CỦA CỔNG MCP: node <harness>/cli/cli.js mcp <việc> ...
//   list                          mọi máy chủ đã khai: đã xác nhận chưa, đang chạy hay hỏng (vì gì, từ lúc nào), mã để ghi vào kế hoạch;
//                                 kèm các kết nối của tài khoản claude.ai mà phiên ở dự án này đã dùng (máy chủ cần đăng nhập)
//   add <tên> --command <lệnh> [--arg <đối số>]... [--env TÊN=giá-trị]... [--cwd <thư mục>]        máy chủ chạy trên máy (stdio)
//   add <tên> --url <địa chỉ> [--type http|sse] [--header TÊN=giá-trị]...                           máy chủ từ xa
//       tùy biến: [--include <mẫu>]... [--exclude <mẫu>]... [--writes <mẫu>]... [--timeout <ms>]; hoặc --json '<khai báo>'
//       giá trị có khóa thì viết ${BIẾN_MÔI_TRƯỜNG}, không ghi khóa vào tệp
//   remove <tên>                  gỡ khỏi khai báo (thôi chạy ngay)
//   trust <tên>                   xác nhận cho chạy. Người dùng (ngoài phiên Claude): luôn được. Phiên Claude: chỉ khi kế hoạch người dùng
//                                 vừa duyệt của chính phiên đó có ghi mã mcp:<tên>@<dấu> mà list và add in ra
//   untrust <tên>                 gỡ xác nhận (thôi chạy ngay)
//   test <tên>                    nối thử và đếm công cụ; chỉ với máy chủ đã xác nhận, trừ khi người dùng chạy ngoài phiên Claude
// Máy chủ CẦN ĐĂNG NHẬP (OAuth) không đi qua cổng này: người dùng nối ở tài khoản claude.ai, công cụ tự có trong Claude Code.
const fs = require('node:fs');
const path = require('node:path');
const P = require('../gate/gate-paths');
const C = require('../adapters/project/mcp-servers');

const inClaude = (env) => Boolean(env.CLAUDECODE || env.CLAUDE_CODE_SESSION_ID);
const pidAlive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const FRESH_MS = 90 * 1000;

// Tình trạng thật của từng máy chủ, gộp từ mọi tiến trình cổng đang sống (mỗi phiên Claude Code một tiến trình).
// Trả { tên: { status, error, since, tools, sessions } }; status xấu nhất trong các phiên thắng (một phiên thấy hỏng là đáng báo).
function live(root, now = Date.now()) {
  const out = {};
  let files = [];
  try { files = fs.readdirSync(P.mcpStateDir(root)).filter((n) => /^\d+\.json$/.test(n)); } catch { return out; }
  const rank = { ok: 0, starting: 1, paused: 2, broken: 3 };
  for (const n of files) {
    let j;
    try { j = JSON.parse(fs.readFileSync(path.join(P.mcpStateDir(root), n), 'utf8')); } catch { continue; }
    if (!j || now - j.at > FRESH_MS || !pidAlive(j.pid)) continue;
    for (const s of j.servers || []) {
      const cur = out[s.name];
      if (!cur) { out[s.name] = { ...s, sessions: 1 }; continue; }
      cur.sessions++;
      if ((rank[s.status] || 0) > (rank[cur.status] || 0)) Object.assign(cur, s, { sessions: cur.sessions });
    }
  }
  return out;
}

// Kết nối của tài khoản claude.ai mà phiên ở dự án này đã gọi (đọc sổ phiên; sổ chỉ ghi tên công cụ). [{ name, tools, lastAt }]
function accountConnectors(root) {
  try {
    const db = require('../hooks/ledger-lib').open(root);
    try {
      return db.prepare("SELECT tool, MAX(at) AS at FROM act_tool_calls WHERE tool LIKE 'mcp__claude_ai_%' GROUP BY tool").all()
        .reduce((acc, r) => { const name = String(r.tool).split('__')[1]; const x = acc.find((a) => a.name === name) || (acc.push({ name, tools: 0, lastAt: 0 }), acc[acc.length - 1]); x.tools++; x.lastAt = Math.max(x.lastAt, r.at); return acc; }, [])
        .sort((a, b) => a.name.localeCompare(b.name));
    } finally { db.close(); }
  } catch { return []; }
}

const ago = (ms) => { const m = Math.max(0, Math.round(ms / 60000)); return m < 1 ? 'vừa xong' : m < 60 ? `${m} phút trước` : `${Math.floor(m / 60)} giờ ${m % 60} phút trước`; };
const STATE_TEXT = { trusted: 'đã xác nhận', changed: 'ĐÃ SỬA sau lần xác nhận (bản đã xác nhận vẫn chạy; bản mới chờ duyệt lại)', untrusted: 'CHƯA xác nhận nên KHÔNG chạy', disabled: 'đang tắt (disabled)' };
const LIVE_TEXT = { ok: 'đang chạy', starting: 'đang nối', broken: 'HỎNG', paused: 'TẠM NGẮT' };

function list(root, now = Date.now()) {
  const { list: servers, problems, file } = C.status(root);
  const lv = live(root, now);
  const rel = path.relative(root, file).split(path.sep).join('/');
  const lines = [`Máy chủ MCP sau cổng của harness (khai báo: ${rel}; xác nhận xong thì phiên đang mở có công cụ trong vài giây, không phải gõ /mcp):`];
  if (!servers.length) lines.push('  (chưa khai máy chủ nào; thêm: cli.js mcp add <tên> --command ... hoặc --url ...)');
  for (const s of servers) {
    const d = s.decl;
    const where = d.type === 'stdio' ? `${d.command} ${(d.args || []).join(' ')}`.trim() : d.url;
    const l = lv[s.name];
    const run = !s.run ? '' : !l ? ' | chưa phiên nào đang nối (mở một phiên, hoặc phiên đang mở tự nối trong vài giây)' : ` | ${LIVE_TEXT[l.status] || l.status}${l.status === 'ok' ? `, ${l.tools} công cụ` : `: ${l.error || 'chưa rõ'} (từ ${ago(now - l.since)}; cổng tự thử lại)`}${l.sessions > 1 ? ` | ${l.sessions} phiên` : ''}`;
    lines.push(`  ${s.name} | ${d.type} | ${where} | ${STATE_TEXT[s.state]}${run}`);
    if (s.state !== 'trusted' && s.state !== 'disabled') lines.push(`      mã để ghi vào kế hoạch trình người dùng: ${s.token}   (rồi: cli.js mcp trust ${s.name})`);
    if ((d.writes || []).length) lines.push(`      công cụ ghi ra ngoài (qua cổng duyệt kế hoạch): ${d.writes.join(', ')}`);
  }
  for (const p of problems) lines.push(`  KHAI BÁO HỎNG, bị bỏ qua: ${p}`);
  const acc = accountConnectors(root);
  lines.push('Kết nối của tài khoản claude.ai (máy chủ cần đăng nhập: người dùng nối trên web, công cụ tự có trong Claude Code; harness không điều khiển và không kiểm sức khỏe được):');
  if (!acc.length) lines.push('  (sổ phiên chưa ghi lời gọi nào tới kết nối của tài khoản)');
  for (const a of acc) lines.push(`  ${a.name} | đã dùng ${a.tools} công cụ | gần nhất ${ago(now - a.lastAt)} | tên công cụ: mcp__${a.name}__<công cụ>`);
  return { ok: !problems.length, text: lines.join('\n') };
}

// Đọc các cờ lặp được: --arg a --arg b -> { arg: ['a', 'b'] }; cờ đơn lấy giá trị cuối.
function flags(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const k = argv[i].slice(2);
    const v = argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[++i] : '';
    (out[k] = out[k] || []).push(v);
  }
  return out;
}
const pairs = (list, what) => Object.fromEntries((list || []).map((x) => { const i = x.indexOf('='); if (i < 1) throw new Error(`--${what} phải có dạng TÊN=giá-trị`); return [x.slice(0, i), x.slice(i + 1)]; }));

function add(root, name, argv) {
  const f = flags(argv);
  let decl;
  if (f.json) { try { decl = JSON.parse(f.json[0]); } catch (e) { return { ok: false, text: `--json không phải JSON: ${e.message}` }; } } else {
    decl = f.command ? { type: 'stdio', command: f.command[0] } : { type: (f.type && f.type[0]) || 'http', url: f.url ? f.url[0] : '' };
    if (f.command && f.arg) decl.args = f.arg;
    if (f.cwd) decl.cwd = f.cwd[0];
    if (f.env) decl.env = pairs(f.env, 'env');
    if (f.header) decl.headers = pairs(f.header, 'header');
    if (f.include || f.exclude) decl.tools = { ...(f.include ? { include: f.include } : {}), ...(f.exclude ? { exclude: f.exclude } : {}) };
    if (f.writes) decl.writes = f.writes;
    if (f.timeout) decl.timeoutMs = Number(f.timeout[0]);
  }
  // Khóa viết thẳng vào khai báo sẽ vào git: chỉ nhận dạng ${BIẾN} cho giá trị trông như khóa.
  for (const [k, v] of Object.entries({ ...(decl.headers || {}), ...(decl.env || {}) })) {
    if (/(authorization|token|secret|password|api[-_]?key)/i.test(k) && !/\$\{[A-Za-z_][A-Za-z0-9_]*\}/.test(v)) return { ok: false, text: `"${k}" trông như khóa truy cập: không ghi giá trị vào tệp. Đặt khóa vào một biến môi trường rồi viết \${TÊN_BIẾN}.` };
  }
  const r = C.save(root, name, decl);
  if (!r.ok) return r;
  const s = C.status(root).list.find((x) => x.name === name);
  return { ok: true, text: `${r.text}\nMáy chủ CHƯA chạy cho tới khi được xác nhận. Trong phiên Claude: trình kế hoạch có ghi mã ${s.token} kèm ${decl.type === 'stdio' ? `lệnh chạy "${decl.command} ${(decl.args || []).join(' ')}"` : `địa chỉ ${decl.url}`}, chờ người dùng duyệt, rồi chạy: cli.js mcp trust ${name}` };
}

async function test(root, name, env) {
  const s = C.status(root).list.find((x) => x.name === name);
  if (!s) return { ok: false, text: `Không có máy chủ "${name}" trong khai báo.` };
  if (!s.run && inClaude(env)) return { ok: false, text: `"${name}" chưa được xác nhận: nối thử là chạy mã của nó, nên phiên Claude không tự làm. Xác nhận trước (mã ${s.token}).` };
  const decl = s.run || s.decl;
  const client = require('../mcp/gateway/client').create(decl, { root });
  const t0 = Date.now();
  try {
    await client.start(decl.startTimeoutMs || 30000);
    const r = await client.request('tools/list', {}, { timeoutMs: decl.startTimeoutMs || 30000 });
    const names = ((r && r.tools) || []).map((t) => t.name);
    return { ok: true, text: `"${name}" nối được sau ${Date.now() - t0} ms: ${names.length} công cụ (${names.slice(0, 12).join(', ')}${names.length > 12 ? ', ...' : ''}).` };
  } catch (e) {
    return { ok: false, text: `"${name}" KHÔNG nối được sau ${Date.now() - t0} ms: ${e.message}` };
  } finally { try { client.close(); } catch { /* bỏ qua */ } }
}

// Kế hoạch người dùng vừa duyệt của phiên `sid` (cổng duyệt đang mở cho đúng kế hoạch đó); '' nếu không có.
function approvedPlan(root, sid) {
  try {
    const st = require('../gate/gate-state').loadState(root, sid);
    const core = require('../gate/gate-core');
    // Cổng phải đang MỞ và kế hoạch phải khớp băm đã duyệt (cờ open giả mạo không qua được).
    return st && st.open && core.verifyOpen(st).ok && st.approved && typeof st.approved.plan === 'string' ? st.approved.plan : '';
  } catch { return ''; }
}

async function run(root, argv, { env = process.env, now = Date.now() } = {}) {
  const [verb, name] = argv;
  // Bảng việc của lệnh mcp (một lệnh con của cli.js; sổ tính năng ghi lệnh `mcp`, kịch bản ảnh chụp chạy từng việc).
  const VERBS = {
    add: () => { try { return add(root, name, argv.slice(2)); } catch (e) { return { ok: false, text: e.message }; } },
    remove: () => C.save(root, name, null),
    trust: () => {
      const sid = env.CLAUDE_CODE_SESSION_ID || '';
      return C.trust(root, name, inClaude(env) ? { by: 'session', sid, planText: sid ? approvedPlan(root, sid) : '' } : { by: 'user' }, now);
    },
    untrust: () => C.untrust(root, name),
    test: () => test(root, name, env),
  };
  if (!verb || verb === 'list') return list(root, now);
  if (!VERBS[verb]) return { ok: false, text: 'Dùng: cli.js mcp <list | add | remove | trust | untrust | test> ...' };
  if (!name) return { ok: false, text: `Dùng: cli.js mcp ${verb} <tên máy chủ>` };
  return VERBS[verb]();
}

module.exports = { run, list, live, accountConnectors, approvedPlan };
