'use strict';
// spec: HOOK-S-017
// spec: HOOK-S-019
// NÂNG CẤP CÓ GỘP. Người cài được sửa mã của gói và thêm khối riêng; lệnh này đưa bản mới của gói vào mà không đè lên phần đó.
//   cli.js upgrade status                       tệp gói bạn đã sửa và khối bạn tự thêm, so với dấu của bản đang cài (không cần kho gói)
//   cli.js upgrade check   [--fetch]            có bản mới không (--fetch: lấy bản mới về bản clone trước; chỉ lệnh này và auto chạm mạng)
//   cli.js upgrade preview                      TỪNG MỤC THAY ĐỔI của bản mới (đổi gì, ở đâu, hành vi trước và sau) ghép với tình trạng dự án
//                                               này; rồi từng khối: gói đổi tệp nào, bạn đã sửa tệp nào, gộp tới đâu. KHÔNG ghi gì vào mã
//   cli.js upgrade prepare                      dựng sẵn gói mới, bản đã gộp, báo cáo cho agent và mã duyệt. Chưa thay mã đang chạy
//   cli.js upgrade review  [--to <bản>]         đọc lại bản dựng sẵn sau khi đã xử lý chỗ đụng nhau: báo cáo mới, việc còn chặn, mã duyệt
//   cli.js upgrade decide <id> <giá trị>        ghi câu trả lời của người dùng cho một điểm cần quyết của bản mới
//   cli.js upgrade apply   [--to <bản>]         CÀI bản đã dựng sẵn, kiểm, hỏng thì tự quay lại. Trong phiên Claude: chỉ chạy khi kế hoạch
//                                               người dùng vừa duyệt của chính phiên đó có ghi mã duyệt của đúng bản dựng sẵn này
//   cli.js upgrade auto                         việc chạy nền đầu phiên: kiểm bản mới, có thì dựng sẵn (theo khóa upgrade.auto của dự án)
// Tham số chung: --from <bản clone của kho gói> (nhớ lại cho lần sau), --ref <bản muốn lên> (mặc định bản mới nhất của kho),
// --project <dự án đã cài> (khi chạy lệnh từ chính bản clone, cho dự án đang cài bản chưa có lệnh này).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const P = require('../gate/gate-paths');
const src = require('../adapters/git/package-source');
const plan = require('../core/release/upgrade-plan');
const sheetsLib = require('../core/release/change-sheet');

const posix = (p) => p.split(path.sep).join('/');
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return undefined; } };
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const MODULES = '.claude/modules';
const SKILLS = '.claude/skills';
const CLI = `${MODULES}/core/cli/cli.js`;
// Tệp do lệnh đóng gói và lệnh cài sinh ra: luôn lấy của bản mới, không so, không gộp.
const GENERATED = new Set([`${MODULES}/FILES.json`, `${MODULES}/MANIFEST.json`, `${MODULES}/index.json`, `${MODULES}/VERSION`]);
const tracked = (rel) => !GENERATED.has(rel) && (rel.startsWith(`${MODULES}/`) || /^\.claude\/skills\/[^/]+\/SKILL\.md$/.test(rel));
const inClaude = (env) => Boolean(env.CLAUDECODE || env.CLAUDE_CODE_SESSION_ID);
const samePath = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

function walk(dir, base, out = []) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== '.git') walk(abs, base, out); } else out.push(posix(path.relative(base, abs)));
  }
  return out;
}
const projectFiles = (project) => [...walk(path.join(project, ...MODULES.split('/')), project), ...walk(path.join(project, ...SKILLS.split('/')), project)].filter(tracked).sort();
const installedVersion = (project) => { const f = readJson(path.join(project, ...MODULES.split('/'), 'FILES.json')); if (f && f.version) return String(f.version); try { return fs.readFileSync(path.join(project, ...src.VERSION_FILE.split('/')), 'utf8').trim(); } catch { return ''; } };
const cmp = (a, b) => { const x = String(a).split('.').map(Number); const y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d < 0 ? -1 : 1; } return 0; };

// PHẦN CỦA BẠN trong mã của gói, so với dấu của bản đang cài (FILES.json): tệp đã sửa, tệp tự thêm, khối tự thêm. Không cần kho gói.
function localChanges(project) {
  const files = readJson(path.join(project, ...MODULES.split('/'), 'FILES.json'));
  if (!files || !files.files) return { known: false, modified: [], added: [], blocks: [], missing: [] };
  const modified = []; const added = []; const missing = [];
  for (const rel of projectFiles(project)) {
    const want = files.files[rel];
    if (!want) { if (rel.startsWith(`${MODULES}/`)) added.push(rel); continue; }
    const buf = fs.readFileSync(path.join(project, ...rel.split('/')));
    if (sha256(buf) !== want && sha256(src.toLf(buf)) !== want) modified.push(rel);
  }
  for (const rel of Object.keys(files.files)) if (tracked(rel) && rel.startsWith(`${MODULES}/`) && !fs.existsSync(path.join(project, ...rel.split('/')))) missing.push(rel);
  const productBlocks = new Set(Object.keys(files.files).map((f) => (/^\.claude\/modules\/([^/]+)\//.exec(f) || [])[1]).filter(Boolean));
  const blocks = P.moduleDirs(project).filter((m) => !productBlocks.has(m));
  return { known: true, version: files.version, modified, added, blocks, missing };
}

function locate(root, opts) {
  const project = path.resolve(opts.project || root);
  const memo = path.join(P.localDir(project), 'upgrade.json');
  const remembered = (readJson(memo) || {}).source || '';
  // Chạy từ chính bản clone cho một dự án khác (--project): kho gói là nơi lệnh đang chạy.
  const source = opts.from ? path.resolve(opts.from) : (opts.project && src.isRepo(root) ? root : remembered);
  return { project, source, memo, remembered };
}
function remember(loc) {
  if (!loc.source || loc.source === loc.remembered) return;
  try { fs.mkdirSync(path.dirname(loc.memo), { recursive: true }); fs.writeFileSync(loc.memo, `${JSON.stringify({ source: loc.source }, null, 2)}\n`); } catch { /* không nhớ được thì lần sau truyền lại --from */ }
}
const NEED_SOURCE = 'Chưa biết kho gói ở đâu. Clone kho gói về máy một lần rồi truyền: --from <thư mục bản clone> (lệnh nhớ lại cho lần sau).';

// Kế hoạch người dùng vừa duyệt của phiên đang chạy lệnh ('' nếu không có). Cổng phải đang mở cho đúng kế hoạch đó.
// `roots`: nơi có thể giữ trạng thái cổng duyệt của phiên (thư mục lệnh đang chạy, và dự án đích khi truyền --project).
function approvedPlan(roots, env) {
  const sid = env.CLAUDE_CODE_SESSION_ID || '';
  if (!sid) return { sid: '', text: '' };
  for (const root of [].concat(roots)) {
    try {
      const st = require('../gate/gate-state').loadState(root, sid);
      const core = require('../gate/gate-core');
      if (st && st.open && core.verifyOpen(st).ok && st.approved && typeof st.approved.plan === 'string') return { sid, text: st.approved.plan };
    } catch { /* nơi này không có trạng thái của phiên */ }
  }
  return { sid, text: '' };
}
const sourceToken = (dir) => `upgrade-source@${sha256(path.resolve(dir).toLowerCase()).slice(0, 8)}`;

// Tờ thay đổi của các bản trong gói mới và danh sách số bản mà sổ phát hành của nó có.
function sheetsAt(source, commit) {
  const dir = `${MODULES}/core/releases`;
  const sheets = [];
  for (const rel of Object.keys(src.tree(source, commit, [dir])).sort()) {
    if (!/\/\d+\.\d+\.\d+\.json$/.test(rel)) continue;
    const buf = src.read(source, commit, rel);
    try { const s = JSON.parse(buf.toString('utf8')); if (s && typeof s === 'object' && s.version) sheets.push(s); } catch { /* tờ hỏng: coi như bản đó không có tờ */ }
  }
  const notes = src.read(source, commit, 'RELEASES.md');
  const versions = notes ? require('../core/release/notes').parse(notes.toString('utf8')).map((r) => r.version) : [];
  return { sheets, versions };
}

// Tình trạng của dự án mà báo cáo cần: khối đang cài, khóa cấu hình đang khai (dạng a.b; cấu hình cổng duyệt có tiền tố "gate.").
function flatten(obj, prefix, out) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;
  for (const [k, v] of Object.entries(obj)) { const key = prefix ? `${prefix}.${k}` : k; out.push(key); flatten(v, key, out); }
  return out;
}
function projectFacts(project) {
  const keys = flatten(readJson(P.projectConfigPath(project)), '', []);
  flatten(readJson(P.configPath(project)), 'gate', keys);
  let skills = [];
  try { skills = fs.readdirSync(path.join(project, ...SKILLS.split('/'))); } catch { /* không có skill */ }
  return { blocks: P.moduleDirs(project), configKeys: keys, skills };
}

// Chạy THỬ các bước chuyển cấu hình trên tệp thật của dự án (không ghi gì). `lib`: bộ chạy (của gói mới nếu có).
function tryMigrations(project, list, answers, lib) {
  const out = {};
  for (const m of list) {
    const errs = lib.check(m);
    if (errs.length) { out[m.id] = { file: m.file || '', willChange: false, notes: [], problem: errs.join('; ') }; continue; }
    const file = path.join(project, ...m.file.split('/'));
    if (!fs.existsSync(file)) { out[m.id] = { file: m.file, willChange: false, notes: ['tệp không có ở dự án: bỏ qua'], problem: '' }; continue; }
    const doc = readJson(file);
    if (doc === undefined) { out[m.id] = { file: m.file, willChange: false, notes: [], problem: 'tệp không phải JSON đọc được' }; continue; }
    const r = lib.run(m, doc, answers);
    out[m.id] = { file: m.file, willChange: r.changed, notes: r.skipped ? [r.skipped] : r.notes, problem: '' };
  }
  return out;
}

// So ba bản của mọi tệp. Trả { ok, text } khi không làm được, hoặc dữ liệu đủ cho báo cáo và cho bước dựng sẵn.
function compare(loc, opts) {
  if (!loc.source) return { ok: false, text: NEED_SOURCE };
  if (!src.isRepo(loc.source)) return { ok: false, text: `Không phải một kho git: ${loc.source}. Lệnh cần LỊCH SỬ của kho gói để lấy bản gốc của bản đang cài (thư mục gói chép tay không dùng được).` };
  const from = installedVersion(loc.project);
  if (!from) return { ok: false, text: `Không đọc được số bản đang cài ở ${loc.project} (thiếu ${MODULES}/FILES.json và VERSION).` };
  const tip = opts.ref || src.defaultRef(loc.source);
  const tipCommit = tip ? src.resolve(loc.source, tip) : '';
  if (!tipCommit) return { ok: false, text: `Kho gói không có bản "${opts.ref || 'mới nhất'}".` };
  const to = src.versionAt(loc.source, tipCommit);
  if (!to) return { ok: false, text: `Bản ${tip} của kho gói không có tệp số bản: đây không phải kho của gói harness.` };
  // Cùng bản hoặc kho gói cũ hơn: không có gì để gộp (và bản đang cài không nằm trong lịch sử của một bản cũ hơn nó).
  if (cmp(to, from) === 0) return { ok: true, same: true, from, to, items: [] };
  if (cmp(to, from) < 0) return { ok: false, text: `Kho gói ở bản ${to}, CŨ hơn bản đang cài ${from}: lệnh này không hạ bản.` };
  const base = src.findVersion(loc.source, from, tipCommit);
  if (!base) return { ok: false, text: `Không tìm thấy bản ${from} (bản đang cài) trong lịch sử của kho gói ${loc.source}. Không có bản gốc thì không gộp được; chạy "upgrade check --fetch", hoặc clone đủ lịch sử (không dùng --depth).` };
  const B = src.tree(loc.source, base.commit, [MODULES, SKILLS]);
  const T = src.tree(loc.source, tipCommit, [MODULES, SKILLS]);
  const pick = (t) => Object.fromEntries(Object.entries(t).filter(([rel]) => tracked(rel)));
  const baseIds = pick(B); const theirIds = pick(T);
  const mineIds = {}; const bufs = {};
  for (const rel of projectFiles(loc.project)) {
    // Skill không thuộc gói (dự án tự viết) thì không phải việc của lệnh này.
    if (rel.startsWith(`${SKILLS}/`) && !baseIds[rel] && !theirIds[rel]) continue;
    const buf = fs.readFileSync(path.join(loc.project, ...rel.split('/')));
    const ids = src.blobIds(buf);
    // Khác kho chỉ ở ký tự xuống dòng (bản clone trên Windows) thì coi là cùng nội dung.
    mineIds[rel] = [baseIds[rel], theirIds[rel]].includes(ids.lf) ? ids.lf : ids.raw;
    bufs[rel] = buf;
  }
  const items = plan.classify({ base: baseIds, mine: mineIds, theirs: theirIds }).map((item) => {
    if (item.action !== 'merge') return { ...plan.withMerge(item), mineId: mineIds[item.path] || '' };
    const mine = bufs[item.path];
    const baseBuf = item.state === 'both-added' ? Buffer.alloc(0) : src.read(loc.source, base.commit, item.path);
    const theirs = src.read(loc.source, tipCommit, item.path);
    const m = src.mergeFile(item.path, mine, baseBuf || Buffer.alloc(0), theirs || Buffer.alloc(0), { mine: 'ban-cua-ban', base: `ban-goc-${from}`, theirs: `ban-moi-${to}` });
    const broken = !m.unmergeable && !m.conflicts ? src.syntaxProblem(item.path, m.text) : '';
    return { ...plan.withMerge(item, { conflicts: m.conflicts, broken, unmergeable: m.unmergeable }), mineId: mineIds[item.path], merged: m.unmergeable ? null : m.text };
  });
  const changedMd = src.read(loc.source, tipCommit, 'CHANGED.md');
  const exportsNote = changedMd ? 'Tệp mã và tên hàm công khai mà gói đổi ở bản này: CHANGED.md của gói mới (đọc nếu khối riêng của bạn gọi hàm của gói).' : '';
  // Tờ thay đổi của mọi bản đi qua (bản đang cài < bản <= bản mới), theo thứ tự tăng dần.
  const all = sheetsAt(loc.source, tipCommit);
  const picked = sheetsLib.collect(all.sheets, from, to, all.versions);
  return { ok: true, from, to, base, tip, tipCommit, items, bufs, exportsNote, same: false, sheets: picked.sheets, missing: picked.missing };
}

const verifyOf = (project) => { try { return P.projectConfig(project).upgrade.verify; } catch { return []; } };
// Báo cáo theo từng mục thay đổi, ghép với tình trạng dự án.
function briefingOf(c, project, answers, lib) {
  const migrations = c.sheets.flatMap((s) => (Array.isArray(s.migrations) ? s.migrations : []));
  return sheetsLib.briefing({ from: c.from, to: c.to, sheets: c.sheets, missing: c.missing, items: c.items, project: projectFacts(project), migrations: tryMigrations(project, migrations, answers, lib), answers, verify: verifyOf(project) });
}

function status(loc) {
  const c = localChanges(loc.project);
  if (!c.known) return { ok: true, text: `Bản đang cài không có ${MODULES}/FILES.json nên không biết tệp nào bạn đã sửa (bản mã nguồn, hoặc bản cài rất cũ).` };
  const lines = [`Bản đang cài: ${c.version}. Phần của bạn trong mã của gói:`];
  lines.push(c.modified.length ? `- ${c.modified.length} tệp của gói bạn đã SỬA:` : '- Không tệp nào của gói bị sửa.', ...c.modified.map((f) => `    ${f}`));
  if (c.blocks.length) lines.push(`- Khối bạn tự thêm: ${c.blocks.join(', ')}`);
  const loose = c.added.filter((f) => !c.blocks.some((b) => f.startsWith(`${MODULES}/${b}/`)));
  if (loose.length) lines.push(`- ${loose.length} tệp bạn tự thêm vào khối của gói:`, ...loose.map((f) => `    ${f}`));
  if (c.missing.length) lines.push(`- ${c.missing.length} tệp của gói đang THIẾU trên đĩa:`, ...c.missing.map((f) => `    ${f}`));
  lines.push('Khi có bản mới, "upgrade preview" cho biết phần này gộp được tới đâu. Bản mới không đè lên phần này.');
  return { ok: true, text: lines.join('\n'), changes: c };
}

const checkFile = (project) => path.join(P.stateDir(project), 'upgrade-check.json');
const stageRoot = (project) => path.join(P.stateDir(project), 'upgrade');
function check(loc, opts) {
  if (!loc.source) return { ok: false, text: NEED_SOURCE };
  if (!src.isRepo(loc.source)) return { ok: false, text: `Không phải một kho git: ${loc.source}.` };
  let fetched = '';
  if (opts.fetch) { const f = src.fetch(loc.source); fetched = f.ok ? ' (đã lấy bản mới về bản clone)' : ` (KHÔNG lấy được bản mới về: ${f.text}; so với bản đang có trong bản clone)`; }
  const from = installedVersion(loc.project);
  const tip = opts.ref || src.defaultRef(loc.source);
  const to = tip ? src.versionAt(loc.source, tip) : '';
  if (!from || !to) return { ok: false, text: `Không đọc được số bản (đang cài: "${from}", kho gói: "${to}").` };
  const newer = cmp(to, from) > 0;
  try { fs.mkdirSync(P.stateDir(loc.project), { recursive: true }); fs.writeFileSync(checkFile(loc.project), `${JSON.stringify({ installed: from, latest: to, newer, source: loc.source, at: new Date().toISOString() }, null, 2)}\n`); } catch { /* không ghi được: lần sau kiểm lại */ }
  const text = newer
    ? `Có bản mới: ${to} (đang cài ${from})${fetched}. Xem trước: node ${CLI} upgrade preview`
    : `Đang cài bản ${from}; kho gói ở bản ${to}${fetched}: không có gì mới.`;
  return { ok: true, text, newer, from, to };
}
// Kết quả lần kiểm gần nhất (tóm tắt đầu phiên đọc): { installed, latest, newer, at } hoặc null. Bản đang cài đã đổi thì kết quả cũ hết giá trị.
function lastCheck(project) {
  const c = readJson(checkFile(project));
  return c && c.installed === installedVersion(project) ? c : null;
}

const migrateLib = (stage) => { const f = stage ? path.join(stage, 'package', ...MODULES.split('/'), 'core', 'core', 'release', 'migrate.js') : ''; return f && fs.existsSync(f) ? require(f) : require('../core/release/migrate'); };

function preview(loc, opts) {
  const c = compare(loc, opts);
  if (!c.ok) return c;
  if (c.same) return { ok: true, text: `Đang cài đúng bản ${c.from} của kho gói: không có gì để nâng cấp. (Phần bạn đã sửa: "upgrade status".)`, items: [] };
  const b = briefingOf(c, loc.project, {}, migrateLib(''));
  const lines = [...sheetsLib.render(b), '', '# Theo từng tệp'];
  const files = plan.report({ from: c.from, to: c.to, items: c.items, exportsNote: c.exportsNote });
  files.splice(1, 0, `Bản gốc ${c.from} lấy theo ${c.base.by} (${c.base.commit.slice(0, 12)}); bản mới ${c.to} là ${c.tip} (${c.tipCommit.slice(0, 12)}). Lệnh này chưa ghi gì vào mã.`);
  lines.push(...files, '', `Bước kế: node ${CLI} upgrade prepare  (dựng sẵn bản gộp, báo cáo và mã duyệt; vẫn chưa thay mã đang chạy)`);
  return { ok: true, text: lines.join('\n'), items: c.items, from: c.from, to: c.to, briefing: b };
}

// MÃ DUYỆT của một bản dựng sẵn: tính từ TOÀN BỘ thứ sẽ được cài (gói mới, phần đã gộp, bản kê, script, câu trả lời các điểm cần quyết).
// Sau lúc người dùng duyệt mà một byte trong đó đổi thì mã đổi, và lời duyệt cũ không còn dùng được.
function stageCode(stage, to) {
  const h = crypto.createHash('sha256');
  const add = (rel) => { h.update(`${rel}\0${sha256(fs.readFileSync(path.join(stage, ...rel.split('/'))))}\n`); };
  for (const top of ['package', 'overlay']) for (const rel of walk(path.join(stage, top), stage).sort()) add(rel);
  for (const f of ['plan.json', 'apply.js', 'migrate.js', 'decisions.json']) if (fs.existsSync(path.join(stage, f))) add(f);
  return `upgrade:${to}@${h.digest('hex').slice(0, 8)}`;
}

const MARK = /^<<<<<<< /gm;
// Đọc lại một bản dựng sẵn ĐÚNG NHƯ ĐANG CÓ trên đĩa (agent có thể đã xử lý chỗ đụng nhau trong overlay): việc còn chặn, báo cáo, mã duyệt.
function evaluate(stage, project) {
  const rec = readJson(path.join(stage, 'plan.json'));
  if (!rec || !rec.to) return null;
  const done = readJson(path.join(stage, 'DA-CHAY.json'));
  const at = (rel) => path.join(stage, 'overlay', ...rel.split('/'));
  const drift = Object.entries(rec.mine || {}).filter(([rel, want]) => { try { return sha256(fs.readFileSync(path.join(project, ...rel.split('/')))) !== want; } catch { return true; } }).map(([rel]) => rel);
  const items = (rec.items || []).map((i) => {
    if (!(rec.overlay || []).includes(i.path)) return i;
    if (!fs.existsSync(at(i.path))) return { ...i, needsHuman: false, dropped: true }; // bỏ khỏi overlay = theo gói
    if (i.action !== 'merge' || i.unmergeable) return i;
    const buf = fs.readFileSync(at(i.path));
    const conflicts = (buf.toString('utf8').match(MARK) || []).length;
    const broken = conflicts ? '' : src.syntaxProblem(i.path, buf);
    return { ...i, conflicts, broken, needsHuman: conflicts > 0 || Boolean(broken) };
  });
  const answers = readJson(path.join(stage, 'decisions.json')) || {};
  const lib = migrateLib(stage);
  const b = sheetsLib.briefing({ from: rec.from, to: rec.to, sheets: rec.sheets || [], missing: rec.missing || [], items, project: projectFacts(project), migrations: tryMigrations(project, rec.migrations || [], answers, lib), answers, verify: Array.isArray(rec.verify) ? rec.verify : [] });
  const blockers = [];
  if (drift.length) blockers.push(`${drift.length} tệp của dự án đã đổi sau lúc dựng sẵn (bản gộp không còn đúng); chạy lại "upgrade prepare": ${drift.join(', ')}`);
  for (const i of items) if (i.action === 'merge' && !i.unmergeable && (i.conflicts || i.broken)) blockers.push(`${i.path}: ${i.conflicts ? `còn ${i.conflicts} đoạn đụng nhau` : `bản gộp hỏng (${i.broken})`}; sửa tệp trong overlay/ của thư mục dựng sẵn`);
  for (const d of b.openDecisions) blockers.push(`điểm chờ người dùng quyết "${d.id}": ${d.question}`);
  for (const c of b.changes) for (const m of c.migrations) if (m.problem) blockers.push(`bước chuyển cấu hình ${m.id}: ${m.problem}`);
  return { rec, done, items, briefing: b, blockers, drift, code: blockers.length ? '' : stageCode(stage, rec.to) };
}

// Thư mục dựng sẵn còn đúng nguồn không: package/ trùng từng tệp với bản `tip` của kho gói, script cài và bộ chạy bước chuyển trùng bản
// đang cài. Trả danh sách chỗ lệch (rỗng là đạt).
function stageIntegrity(stage, rec) {
  const out = [];
  if (!rec.source || !src.isRepo(rec.source)) return [`không đọc được kho gói ${rec.source || '(không ghi)'}`];
  const want = src.tree(rec.source, rec.tip, []);
  const pkg = path.join(stage, 'package');
  const have = walk(pkg, pkg);
  for (const rel of have) {
    if (!want[rel]) { out.push(`package/${rel}: không có trong bản ${rec.to} của kho gói`); continue; }
    if (src.blobId(fs.readFileSync(path.join(pkg, ...rel.split('/')))) !== want[rel]) out.push(`package/${rel}: khác bản của kho gói`);
  }
  for (const rel of Object.keys(want)) if (!have.includes(rel)) out.push(`package/${rel}: thiếu`);
  for (const [name, own] of [['apply.js', path.join(__dirname, 'upgrade-apply.js')], ['migrate.js', path.join(__dirname, '..', 'core', 'release', 'migrate.js')]]) {
    try { if (sha256(fs.readFileSync(path.join(stage, name))) !== sha256(fs.readFileSync(own))) out.push(`${name}: khác bản của harness đang cài`); } catch { out.push(`${name}: thiếu`); }
  }
  return out;
}

// Bản dựng sẵn đang chờ: --to <bản>, hoặc bản mới nhất chưa cài trong thư mục dựng sẵn.
function findStage(project, to) {
  const root = stageRoot(project);
  if (to) return fs.existsSync(path.join(root, to, 'plan.json')) ? path.join(root, to) : '';
  let dirs = [];
  try { dirs = fs.readdirSync(root).filter((d) => /^\d+\.\d+\.\d+$/.test(d) && fs.existsSync(path.join(root, d, 'plan.json'))); } catch { return ''; }
  const from = installedVersion(project);
  dirs = dirs.filter((d) => cmp(d, from) > 0).sort(cmp);
  return dirs.length ? path.join(root, dirs[dirs.length - 1]) : '';
}

const NEXT = (code, rel) => [
  '', 'BƯỚC KẾ (skill harness-upgrade):',
  `  1. Đọc ${rel}/BAO-CAO.md; trình người dùng TỪNG MỤC thay đổi chạm tới dự án này (trước, sau, ảnh hưởng) và các điểm cần họ quyết.`,
  code ? `  2. Kế hoạch trình người dùng phải ghi nguyên mã duyệt: ${code}` : '  2. Xử lý xong các việc còn chặn ở trên, chạy "upgrade review" để lấy mã duyệt.',
  `  3. Người dùng duyệt xong thì cài: node ${CLI} upgrade apply   (kiểm sau khi cài; hỏng thì tự quay lại bản cũ)`,
  '  Người dùng tự chạy lệnh apply ở terminal, ngoài phiên Claude, thì không cần mã.',
];

// Ghi lại báo cáo của một bản dựng sẵn theo tình trạng đang có, trả lời in ra.
function writeReport(stage, project, ev) {
  const rel = posix(path.relative(project, stage));
  const head = sheetsLib.render(ev.briefing);
  const body = [...head, '', '# Theo từng tệp', ...plan.report({ from: ev.rec.from, to: ev.rec.to, items: ev.items.filter((i) => !i.dropped), exportsNote: ev.rec.exportsNote || '' })];
  fs.writeFileSync(path.join(stage, 'BAO-CAO.md'), `${body.join('\n')}\n`);
  fs.writeFileSync(path.join(stage, 'briefing.json'), `${JSON.stringify({ ...ev.briefing, blockers: ev.blockers, code: ev.code }, null, 2)}\n`);
  const lines = [...body, '', `Đã dựng sẵn ở ${rel}/ (chưa thay mã đang chạy):`, `  - package/   gói ${ev.rec.to} nguyên vẹn`, `  - overlay/   ${(ev.rec.overlay || []).length} tệp là phần của bạn (giữ, đã gộp, tự thêm), sẽ chép đè lên sau khi cài`, '  - BAO-CAO.md (báo cáo này), briefing.json (cùng nội dung cho máy), plan.json, apply.js'];
  if (ev.blockers.length) {
    lines.push('', `CÒN ${ev.blockers.length} VIỆC CHẶN, chưa có mã duyệt:`, ...ev.blockers.map((b) => `  - ${b}`));
    const human = ev.items.filter((i) => i.needsHuman && !i.dropped);
    if (human.length) lines.push(`Sửa trong ${rel}/overlay/ (không sửa trong ${MODULES}/); tìm dấu <<<<<<< và >>>>>>>. Tệp gói đã bỏ mà bạn đã sửa: giữ thì để nguyên, bỏ theo gói thì xóa tệp trong overlay.`);
  } else lines.push('', `MÃ DUYỆT của bản dựng sẵn này: ${ev.code}`);
  lines.push(...NEXT(ev.code, rel));
  return lines.join('\n');
}

// Dựng sẵn: gói mới (để chạy lệnh cài của nó), lớp phủ (phần của bạn: tệp giữ, tệp đã gộp, tệp và khối tự thêm), bản kê, báo cáo và script.
function prepare(loc, opts) {
  const c = compare(loc, opts);
  if (!c.ok) return c;
  if (c.same) return preview(loc, opts);
  const stage = path.join(stageRoot(loc.project), c.to);
  fs.rmSync(stage, { recursive: true, force: true });
  const put = (rel, buf) => { const f = path.join(stage, ...rel.split('/')); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, buf); };
  // 1. Gói mới, nguyên vẹn từ kho (mọi tệp của bản đó).
  for (const rel of Object.keys(src.tree(loc.source, c.tipCommit, []))) { const buf = src.read(loc.source, c.tipCommit, rel); if (buf) put(`package/${rel}`, buf); }
  // 2. Lớp phủ: chép đè lên sau khi lệnh cài đã thay mã của gói.
  const overlay = [];
  for (const i of c.items) {
    if (i.action === 'keep' || i.action === 'conflict') { put(`overlay/${i.path}`, c.bufs[i.path]); overlay.push(i.path); }
    else if (i.action === 'merge') { put(`overlay/${i.path}`, i.merged || c.bufs[i.path]); overlay.push(i.path); }
  }
  const human = c.items.filter((i) => i.needsHuman);
  const migrations = c.sheets.flatMap((s) => (Array.isArray(s.migrations) ? s.migrations : []));
  const decisions = c.sheets.flatMap((s) => (s.changes || []).flatMap((ch) => (ch.decisions || []).map((d) => ({ id: d.id, question: d.question, options: d.options, default: d.default || '' }))));
  const verify = verifyOf(loc.project);
  const record = {
    format: 2, from: c.from, to: c.to, project: loc.project, source: loc.source, base: c.base.commit, tip: c.tipCommit, at: new Date().toISOString(),
    overlay, needsHuman: human.map((i) => ({ path: i.path, state: i.state, conflicts: i.conflicts || 0, broken: i.broken || '', unmergeable: Boolean(i.unmergeable) })),
    // Dấu của từng tệp của bạn lúc dựng: bước cài từ chối chạy nếu tệp đổi sau đó (bản gộp sẽ thiếu phần vừa sửa).
    mine: Object.fromEntries(c.items.filter((i) => i.mineId).map((i) => [i.path, sha256(c.bufs[i.path])])),
    items: c.items.map((i) => ({ path: i.path, block: i.block, state: i.state, action: i.action, conflicts: i.conflicts || 0, broken: i.broken || '', unmergeable: Boolean(i.unmergeable), needsHuman: Boolean(i.needsHuman) })),
    sheets: c.sheets, missing: c.missing, migrations, decisions, verify, exportsNote: c.exportsNote,
    installRecord: path.join(P.stateDir(loc.project), 'install-last.json'),
  };
  put('plan.json', `${JSON.stringify(record, null, 2)}\n`);
  fs.copyFileSync(path.join(__dirname, 'upgrade-apply.js'), path.join(stage, 'apply.js'));
  fs.copyFileSync(path.join(__dirname, '..', 'core', 'release', 'migrate.js'), path.join(stage, 'migrate.js'));
  const ev = evaluate(stage, loc.project);
  const text = writeReport(stage, loc.project, ev);
  return { ok: true, text, stage, needsHuman: human.length, items: c.items, to: c.to, code: ev.code, blockers: ev.blockers, briefing: ev.briefing };
}

function review(loc, opts) {
  const stage = findStage(loc.project, opts.to);
  if (!stage) return { ok: false, text: `Chưa có bản dựng sẵn nào${opts.to ? ` cho bản ${opts.to}` : ''}. Chạy: node ${CLI} upgrade prepare` };
  const ev = evaluate(stage, loc.project);
  if (ev.done && ev.done.result === 'applied') return { ok: true, text: `Bản ${ev.rec.to} đã được cài lúc ${ev.done.at}. Không còn gì để duyệt.`, stage, applied: true };
  return { ok: true, text: writeReport(stage, loc.project, ev), stage, code: ev.code, blockers: ev.blockers, briefing: ev.briefing };
}

function decide(loc, opts, id, value) {
  const stage = findStage(loc.project, opts.to);
  if (!stage) return { ok: false, text: `Chưa có bản dựng sẵn nào. Chạy: node ${CLI} upgrade prepare` };
  const rec = readJson(path.join(stage, 'plan.json')) || {};
  const d = (rec.decisions || []).find((x) => x.id === id);
  if (!d) return { ok: false, text: `Bản dựng sẵn ${rec.to} không có điểm cần quyết "${id || ''}". Các điểm đang có: ${(rec.decisions || []).map((x) => x.id).join(', ') || 'không có'}.` };
  if (!d.options.some((o) => o.value === value)) return { ok: false, text: `"${value || ''}" không phải một lựa chọn của "${id}". Lựa chọn: ${d.options.map((o) => `${o.value} (${o.label})`).join('; ')}.` };
  const file = path.join(stage, 'decisions.json');
  fs.writeFileSync(file, `${JSON.stringify({ ...(readJson(file) || {}), [id]: value }, null, 2)}\n`);
  const r = review(loc, opts);
  return { ...r, text: `Đã ghi: ${id} = ${value}. Mã duyệt đổi theo câu trả lời.\n\n${r.text}` };
}

// CÀI bản đã dựng sẵn. Ngoài phiên Claude (người dùng tự chạy): chạy luôn. Trong phiên Claude: chỉ khi kế hoạch người dùng vừa duyệt
// của chính phiên đó ghi đúng mã duyệt của bản dựng sẵn ĐANG CÓ trên đĩa.
function apply(root, loc, opts, env) {
  const stage = findStage(loc.project, opts.to);
  if (!stage) return { ok: false, text: `Chưa có bản dựng sẵn nào${opts.to ? ` cho bản ${opts.to}` : ''}. Chạy: node ${CLI} upgrade prepare` };
  const ev = evaluate(stage, loc.project);
  if (ev.done && ev.done.result === 'applied') return { ok: false, text: `Bản ${ev.rec.to} đã được cài lúc ${ev.done.at}.` };
  if (!samePath(ev.rec.project, loc.project)) return { ok: false, text: `Bản dựng sẵn này là của dự án ${ev.rec.project}, không phải ${loc.project}.` };
  if (ev.blockers.length) return { ok: false, text: [`Chưa cài được bản ${ev.rec.to}: còn ${ev.blockers.length} việc chặn.`, ...ev.blockers.map((b) => `  - ${b}`), `Xử lý xong thì: node ${CLI} upgrade review`].join('\n') };
  const by = inClaude(env) ? 'session' : 'user';
  if (by === 'session') {
    // Nguồn của gói phải là nguồn dự án đã ghi nhận: một phiên không tự cài từ nơi khác.
    if (loc.remembered && !samePath(ev.rec.source, loc.remembered)) return { ok: false, text: `Bản dựng sẵn lấy từ ${ev.rec.source}, khác kho gói dự án đã ghi nhận (${loc.remembered}). Dựng sẵn lại từ kho đã ghi nhận.` };
    const ap = approvedPlan([root, loc.project], env);
    if (!ap.sid) return { ok: false, text: 'Không biết mã phiên nên không đối chiếu được với kế hoạch đã duyệt. Người dùng chạy lệnh này ngoài phiên Claude thì được.' };
    if (!ap.text) return { ok: false, text: `Phiên này chưa có kế hoạch nào đang được người dùng duyệt. Trình người dùng báo cáo nâng cấp (từng mục thay đổi) kèm kế hoạch có ghi mã ${ev.code}, chờ duyệt, rồi chạy lại.` };
    if (!ap.text.includes(ev.code)) return { ok: false, text: `Kế hoạch người dùng đã duyệt KHÔNG nêu mã ${ev.code} của bản dựng sẵn hiện tại (nội dung sắp cài đổi thì mã đổi). Trình lại kế hoạch có ghi đúng mã đó, chờ duyệt, rồi chạy lại.` };
    // Gói trong thư mục dựng sẵn phải đúng từng byte là bản của kho gói, và script cài phải là bản đang cài: phiên chỉ được đổi overlay/.
    const tampered = stageIntegrity(stage, ev.rec);
    if (tampered.length) return { ok: false, text: [`Thư mục dựng sẵn KHÔNG còn đúng với kho gói (${tampered.length} chỗ); không cài. Chạy lại "upgrade prepare".`, ...tampered.slice(0, 20).map((x) => `  - ${x}`)].join('\n') };
  }
  const r = spawnSync(process.execPath, [path.join(stage, 'apply.js')], { cwd: loc.project, encoding: 'utf8', windowsHide: true, timeout: 60 * 60 * 1000, env: { ...env, HARNESS_UPGRADE_APPROVED: ev.code } });
  const out = [`${r.stdout || ''}${r.stderr || ''}`.trimEnd()];
  if (r.error) out.push(`Không chạy được bước cài: ${r.error.message}`);
  const ok = r.status === 0;
  if (ok && !opts.noRefresh) {
    // Phiên nền đang rảnh còn giữ lớp cũ: dựng lại bằng mã MỚI vừa cài; phiên khác chỉ nêu tên.
    const s = spawnSync(process.execPath, [path.join(loc.project, ...MODULES.split('/'), 'core', 'cli', 'session.js'), 'refresh'], { cwd: loc.project, encoding: 'utf8', windowsHide: true, timeout: 5 * 60 * 1000, env });
    const t = `${s.stdout || ''}`.trim();
    if (t) out.push('', 'Phiên đang mở:', t);
  }
  if (r.status === 2) out.push('', 'Kết quả: ĐÃ QUAY LẠI bản cũ. Báo người dùng nguyên văn lý do ở trên; không thử cài lại khi chưa sửa nguyên nhân.');
  if (r.status === 3) out.push('', 'Kết quả: cài HỎNG và KHÔNG quay lại sạch được. Harness có thể đang lẫn hai bản: báo người dùng NGAY kèm lệnh quay lại ở trên, không làm việc gì khác.');
  return { ok, text: out.join('\n'), stage, by, code: ev.code, rolledBack: r.status === 2, dirty: r.status === 3 };
}

// Việc chạy nền đầu phiên: kiểm bản mới; có thì dựng sẵn để agent có báo cáo cụ thể mà trình người dùng. Không bao giờ cài.
function auto(loc, opts) {
  let mode = 'prepare';
  try { mode = P.projectConfig(loc.project).upgrade.auto; } catch { /* không đọc được cấu hình: mặc định */ }
  if (mode === 'off') return { ok: true, text: 'Dự án tắt việc tự kiểm bản mới (upgrade.auto: off).' };
  const c = check(loc, { ...opts, fetch: true });
  if (!c.ok || !c.newer || mode === 'check') return c;
  const mark = (extra) => { try { const f = checkFile(loc.project); fs.writeFileSync(f, `${JSON.stringify({ ...(readJson(f) || {}), ...extra }, null, 2)}\n`); } catch { /* lần sau làm lại */ } };
  const tipCommit = src.resolve(loc.source, opts.ref || src.defaultRef(loc.source));
  const have = path.join(stageRoot(loc.project), c.to);
  const old = fs.existsSync(path.join(have, 'plan.json')) ? evaluate(have, loc.project) : null;
  if (old && old.rec.tip === tipCommit && !old.drift.length && !old.done) { mark({ prepared: { to: c.to, at: old.rec.at } }); return { ok: true, text: `Bản ${c.to} đã dựng sẵn từ trước, vẫn còn đúng.`, stage: have }; }
  const p = prepare(loc, opts);
  if (p.ok && p.stage) mark({ prepared: { to: c.to, at: new Date().toISOString() } });
  else mark({ prepareError: String(p.text || '').slice(0, 600) });
  return p;
}

function run(root, argv, { env = process.env } = {}) {
  const [action, ...rest] = argv;
  const val = (name) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : undefined; };
  const opts = { from: val('--from'), ref: val('--ref'), project: val('--project'), to: val('--to'), fetch: rest.includes('--fetch'), noRefresh: rest.includes('--no-refresh') };
  const loc = locate(root, opts);
  if (!fs.existsSync(path.join(loc.project, ...MODULES.split('/'), 'core', 'module.json'))) return { ok: false, text: `Không thấy harness đã cài ở ${loc.project} (thiếu ${MODULES}/core/module.json). Cài lần đầu thì dùng lệnh install của gói.` };
  // Trong phiên Claude, đổi kho gói (nơi lấy mã về cài) cần người dùng duyệt đúng nơi đó: kế hoạch đã duyệt phải ghi mã của kho mới.
  // Xem (status, check, preview) thì được, nhưng không ghi nhớ kho mới; dựng sẵn và cài từ kho chưa duyệt thì từ chối.
  let sourceOk = true;
  if (inClaude(env) && loc.source && !(loc.remembered && samePath(loc.source, loc.remembered))) {
    const token = sourceToken(loc.source);
    sourceOk = approvedPlan([root, loc.project], env).text.includes(token);
    if (!sourceOk && ['prepare', 'apply', 'auto'].includes(action)) return { ok: false, text: `${loc.remembered ? `Dự án đã ghi nhận kho gói ${loc.remembered}. Đổi sang` : 'Dự án chưa ghi nhận kho gói nào. Dùng'} ${loc.source} là chọn nơi lấy mã về cài: trình người dùng kế hoạch có ghi đường dẫn đó và mã ${token}, chờ duyệt, rồi chạy lại. Người dùng tự chạy ngoài phiên Claude thì không cần mã.` };
  }
  const positional = rest.filter((a, i) => !a.startsWith('--') && !(i > 0 && ['--from', '--ref', '--project', '--to'].includes(rest[i - 1])));
  let r;
  if (action === 'status') r = status(loc);
  else if (action === 'check') r = check(loc, opts);
  else if (action === 'preview') r = preview(loc, opts);
  else if (action === 'prepare') r = prepare(loc, opts);
  else if (action === 'review') r = review(loc, opts);
  else if (action === 'decide') r = decide(loc, opts, positional[0], positional[1]);
  else if (action === 'apply') r = apply(root, loc, opts, env);
  else if (action === 'auto') r = auto(loc, opts);
  else return { ok: false, text: 'Dùng: cli.js upgrade <status | check [--fetch] | preview | prepare | review | decide <id> <giá trị> | apply | auto> [--from <bản clone kho gói>] [--ref <bản>] [--project <dự án>] [--to <bản đã dựng sẵn>]' };
  if (r.ok && sourceOk && ['check', 'preview', 'prepare', 'auto'].includes(action)) remember(loc);
  return r;
}

module.exports = { run, localChanges, lastCheck, installedVersion, compare, tracked, GENERATED, stageCode, evaluate, findStage, sourceToken };
