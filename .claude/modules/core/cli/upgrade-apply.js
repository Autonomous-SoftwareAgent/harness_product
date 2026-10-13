'use strict';
// spec: HOOK-S-017
// spec: HOOK-S-019
// BƯỚC CÀI CỦA NÂNG CẤP. Lệnh "cli.js upgrade apply" gọi tệp này sau khi đã đối chiếu lời duyệt của người dùng; người dùng cũng tự chạy
// được ở terminal:   node <thư mục dựng sẵn>/apply.js [--dry-run]
// Tệp này được chép nguyên vào thư mục dựng sẵn cạnh plan.json, package/ (gói mới) và overlay/ (phần của bạn). Nó không cần gì ngoài Node.
// Thứ tự, dừng ngay ở bước đầu tiên hỏng. Trước bước 4 dự án chưa bị đụng; từ bước 4, hỏng bước nào thì TỰ QUAY LẠI bản cũ:
//   1. Kiểm: các tệp của bạn không đổi từ lúc dựng sẵn; overlay/ không còn dấu đụng nhau; mã JavaScript trong overlay/ qua kiểm cú pháp;
//      mọi điểm cần quyết đã có câu trả lời; mọi bước chuyển cấu hình chạy thử được.
//   2. In việc sắp làm.
//   3. Cất các tệp sắp đổi mà lệnh cài không cất (skill bạn đã sửa, tệp cấu hình của dự án).
//   4. Chạy lệnh cài của GÓI MỚI (nó cất bản cũ để quay lại được).
//   5. Chép overlay/ đè lên (tệp bạn giữ, tệp đã gộp, tệp và khối bạn tự thêm).
//   6. Ghi lại dấu vân tay của cổng duyệt NẾU overlay có tệp của cổng duyệt (bạn chủ động giữ bản sửa của mình).
//   7. Chạy các bước chuyển cấu hình của các bản vừa đi qua.
//   8. Sinh lại cấu hình (khối bạn tự thêm có thể khai hook).
//   9. Kiểm: toàn vẹn cổng duyệt, sức khỏe, và các lệnh kiểm dự án tự khai. Hỏng thì quay lại bản cũ, in nguyên văn lỗi, thoát mã 2.
// Thêm --dry-run: chỉ làm bước 1 và 2.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const stage = __dirname;
const dry = process.argv.includes('--dry-run');
const plan = JSON.parse(fs.readFileSync(path.join(stage, 'plan.json'), 'utf8'));
const project = plan.project;
const at = (base, rel) => path.join(base, ...rel.split('/'));
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return undefined; } };
const stop = (msg) => { console.error(`DỪNG: ${msg}`); process.exit(1); };
// Chạy một lệnh, giữ lại lời nó in (để báo nguyên văn khi hỏng) và in ra ngay.
const node = (args, opts = {}) => {
  const r = spawnSync(process.execPath, args, { cwd: project, encoding: 'utf8', windowsHide: true, timeout: 10 * 60 * 1000, ...opts });
  const out = `${r.stdout || ''}${r.stderr || ''}${r.error ? `\n${r.error.message}` : ''}`;
  if (out.trim()) console.log(out.trimEnd());
  return { status: r.status === null ? 1 : r.status, out };
};

console.log(`Nâng cấp harness của ${project}: bản ${plan.from} -> ${plan.to}`);

// ---------- 1. kiểm ----------
// Trong một phiên Claude, bước cài chỉ chạy qua lệnh "upgrade apply" (lệnh đó đối chiếu kế hoạch người dùng đã duyệt rồi mới gọi tệp này).
const inClaude = Boolean(process.env.CLAUDECODE || process.env.CLAUDE_CODE_SESSION_ID);
if (inClaude && !dry && !process.env.HARNESS_UPGRADE_APPROVED) stop('trong phiên Claude, không chạy thẳng tệp này. Trình người dùng báo cáo nâng cấp kèm mã duyệt, được duyệt thì chạy: cli.js upgrade apply');
if (!fs.existsSync(at(project, '.claude/modules/core/module.json'))) stop(`không thấy harness đã cài ở ${project}`);
const drift = Object.entries(plan.mine).filter(([rel, want]) => { try { return sha256(fs.readFileSync(at(project, rel))) !== want; } catch { return true; } }).map(([rel]) => rel);
if (drift.length) stop(`các tệp sau đã đổi từ lúc dựng sẵn, bản gộp không còn đúng. Chạy lại "upgrade prepare":\n  ${drift.join('\n  ')}`);
const overlayDir = path.join(stage, 'overlay');
const overlay = plan.overlay.filter((rel) => fs.existsSync(at(overlayDir, rel))); // tệp bạn xóa khỏi overlay = bỏ theo gói
const marked = overlay.filter((rel) => /^(<<<<<<<|>>>>>>>) /m.test(fs.readFileSync(at(overlayDir, rel), 'utf8')));
if (marked.length) stop(`còn dấu đụng nhau (<<<<<<< >>>>>>>) trong overlay, sửa xong rồi chạy lại:\n  ${marked.map((r) => path.join('overlay', r)).join('\n  ')}`);
const broken = overlay.filter((rel) => /\.(c|m)?js$/.test(rel)).filter((rel) => spawnSync(process.execPath, ['--check', at(overlayDir, rel)], { encoding: 'utf8' }).status !== 0);
if (broken.length) stop(`mã trong overlay không qua kiểm cú pháp (node --check), sửa rồi chạy lại:\n  ${broken.map((r) => path.join('overlay', r)).join('\n  ')}`);
const installer = at(path.join(stage, 'package'), '.claude/modules/core/cli/cli.js');
if (!fs.existsSync(installer)) stop('thư mục dựng sẵn thiếu gói mới (package/). Chạy lại "upgrade prepare".');

// Điểm cần quyết và bước chuyển cấu hình. Bộ chạy bước chuyển đi cùng GÓI MỚI (dữ liệu và bộ đọc nó cùng một bản); gói không có thì dùng
// bản được chép sẵn cạnh tệp này.
const answers = readJson(path.join(stage, 'decisions.json')) || {};
const open = (plan.decisions || []).filter((d) => !d.default && answers[d.id] === undefined);
if (open.length) stop(`còn ${open.length} điểm chờ người dùng quyết: ${open.map((d) => d.id).join(', ')}. Hỏi người dùng rồi ghi bằng: cli.js upgrade decide <id> <giá trị>`);
const chosen = { ...Object.fromEntries((plan.decisions || []).filter((d) => d.default).map((d) => [d.id, d.default])), ...answers };
const migrations = plan.migrations || [];
let migrate = null;
if (migrations.length) {
  const cand = [at(path.join(stage, 'package'), '.claude/modules/core/core/release/migrate.js'), path.join(stage, 'migrate.js')].find((f) => fs.existsSync(f));
  if (!cand) stop('có bước chuyển cấu hình mà thư mục dựng sẵn thiếu bộ chạy (migrate.js). Chạy lại "upgrade prepare".');
  migrate = require(cand);
}
// Chạy thử từng bước trên tệp thật: tệp không đọc được hay bước sai khuôn thì dừng TRƯỚC khi đụng gì.
const todo = [];
for (const m of migrations) {
  const errs = migrate.check(m);
  if (errs.length) stop(`bước chuyển cấu hình sai khuôn: ${errs.join('; ')}`);
  const file = at(project, m.file);
  if (!fs.existsSync(file)) { todo.push({ m, file, skip: 'tệp không có ở dự án' }); continue; }
  const doc = readJson(file);
  if (doc === undefined) stop(`bước chuyển ${m.id}: ${m.file} không phải JSON đọc được. Sửa tệp đó rồi chạy lại.`);
  const r = migrate.run(m, doc, chosen);
  todo.push({ m, file, skip: r.skipped, changed: r.changed, notes: r.notes });
}

// ---------- 2. việc sắp làm ----------
console.log(`  - cài gói ${plan.to} (bản cũ được cất, quay lại được)`);
console.log(`  - chép đè ${overlay.length} tệp là phần của bạn${plan.overlay.length !== overlay.length ? ` (${plan.overlay.length - overlay.length} tệp bạn đã bỏ khỏi overlay: theo gói)` : ''}`);
const gate = overlay.filter((rel) => rel.startsWith('.claude/modules/core/gate/'));
if (gate.length) console.log(`  - ghi lại dấu vân tay cổng duyệt, vì bạn giữ bản sửa của: ${gate.join(', ')}`);
for (const t of todo) console.log(`  - bước chuyển cấu hình ${t.m.id} (${t.m.file}): ${t.skip ? `bỏ qua, ${t.skip}` : t.changed ? t.notes.join('; ') : 'không có gì phải sửa'}`);
const verify = (plan.verify || []).filter((c) => Array.isArray(c) && c.length && c.every((x) => typeof x === 'string'));
console.log(`  - sinh lại cấu hình, kiểm toàn vẹn cổng duyệt và sức khỏe${verify.length ? `, chạy ${verify.length} lệnh kiểm dự án tự khai` : ''}; hỏng thì tự quay lại bản cũ`);
if (dry) { console.log('Chạy thử (--dry-run): chưa làm gì.'); process.exit(0); }

// ---------- 3. cất thứ lệnh cài không cất ----------
const backupDir = path.join(stage, 'backup');
fs.rmSync(backupDir, { recursive: true, force: true });
const saved = []; const created = [];
const save = (rel) => {
  if (saved.includes(rel) || created.includes(rel)) return;
  const abs = at(project, rel);
  if (!fs.existsSync(abs)) { created.push(rel); return; }
  fs.mkdirSync(path.dirname(at(backupDir, rel)), { recursive: true });
  fs.copyFileSync(abs, at(backupDir, rel));
  saved.push(rel);
};
for (const rel of overlay.filter((r) => !r.startsWith('.claude/modules/'))) save(rel);
for (const t of todo) if (!t.skip) save(t.m.file);
const cliOf = (root) => at(root, '.claude/modules/core/cli/cli.js');
// Sức khỏe TRƯỚC khi cài: dự án vốn đã có lỗi thì lỗi đó không phải lý do để quay lại.
const healthBefore = spawnSync(process.execPath, [cliOf(project), 'doctor'], { cwd: project, encoding: 'utf8', windowsHide: true, timeout: 5 * 60 * 1000 }).status;
// Bản ghi lần cài gần nhất của lệnh cài (đường dẫn do lệnh dựng sẵn ghi vào plan.json): đổi sau bước 4 nghĩa là có thứ để --undo.
const lastFile = plan.installRecord || path.join(stage, 'khong-co-ban-ghi');
const lastBefore = fs.existsSync(lastFile) ? fs.readFileSync(lastFile, 'utf8') : '';

const record = (result, extra = {}) => fs.writeFileSync(path.join(stage, 'DA-CHAY.json'), `${JSON.stringify({
  at: new Date().toISOString(), result, from: plan.from, to: plan.to, overlay,
  by: inClaude ? 'session' : 'user', sid: process.env.CLAUDE_CODE_SESSION_ID || '', code: process.env.HARNESS_UPGRADE_APPROVED || '', ...extra,
}, null, 2)}\n`);
const undoCmd = `node "${installer}" install "${project}" --undo`;

// Quay lại bản cũ: lệnh --undo của gói mới trả mã, settings, .mcp.json, git hook, skill nó đã thay; rồi trả các tệp cất ở bước 3.
function rollback(why, detail) {
  console.log(`\nKIỂM HỎNG: ${why}. Đang quay lại bản ${plan.from}...`);
  const lastNow = fs.existsSync(lastFile) ? fs.readFileSync(lastFile, 'utf8') : '';
  let undone = true;
  if (lastNow && lastNow !== lastBefore) undone = node([installer, 'install', project, '--undo']).status === 0;
  for (const rel of saved) { fs.mkdirSync(path.dirname(at(project, rel)), { recursive: true }); fs.copyFileSync(at(backupDir, rel), at(project, rel)); }
  for (const rel of created) fs.rmSync(at(project, rel), { force: true });
  const back = spawnSync(process.execPath, [at(project, '.claude/modules/core/gate/install.js'), '--verify', project], { cwd: project, encoding: 'utf8', windowsHide: true });
  const clean = undone && back.status === 0;
  record('rolled-back', { why, detail: String(detail || '').slice(-6000), restored: clean });
  console.log(clean
    ? `ĐÃ QUAY LẠI bản ${plan.from}: mã, cấu hình và phần của bạn như trước khi cài. Chưa có gì thay đổi. Lý do: ${why}.`
    : `KHÔNG quay lại sạch được (lý do ban đầu: ${why}). Chạy tay: ${undoCmd}; các tệp cấu hình đã cất ở ${backupDir}`);
  process.exit(clean ? 2 : 3); // 2 = đã quay lại sạch; 3 = cài hỏng và KHÔNG quay lại sạch được
}

// ---------- 4. cài gói mới ----------
const inst = node([installer, 'install', project, '--apply']);
if (inst.status !== 0) rollback('lệnh cài của gói mới báo có vấn đề', inst.out);

try {
  // ---------- 5. lớp phủ ----------
  for (const rel of overlay) { fs.mkdirSync(path.dirname(at(project, rel)), { recursive: true }); fs.copyFileSync(at(overlayDir, rel), at(project, rel)); }
  console.log(`Đã chép ${overlay.length} tệp là phần của bạn. (Lệnh cài ở trên nói các tệp bạn đã sửa "sẽ bị thay" và skill của dự án "được giữ": đó là lời của lệnh cài trần. Ở đây cả hai đã được thay bằng bản GỘP trong overlay, có cả phần của bạn lẫn thay đổi của gói.)`);

  // ---------- 6. dấu vân tay cổng duyệt ----------
  if (gate.length) { const s = node([at(project, '.claude/modules/core/gate/install.js'), '--stamp', project]); if (s.status !== 0) rollback('không ghi lại được dấu vân tay cổng duyệt', s.out); }

  // ---------- 7. bước chuyển cấu hình ----------
  for (const t of todo) {
    if (t.skip || !t.changed) continue;
    // Chạy lại trên nội dung ĐANG CÓ (lệnh cài vừa sinh lại phần của harness trong settings và .mcp.json).
    const doc = readJson(t.file);
    if (doc === undefined) rollback(`bước chuyển ${t.m.id}: ${t.m.file} không còn đọc được sau khi cài`, '');
    const r = migrate.run(t.m, doc, chosen);
    if (r.changed) { fs.writeFileSync(t.file, `${JSON.stringify(r.doc, null, 2)}\n`); console.log(`Bước chuyển ${t.m.id} (${t.m.file}): ${r.notes.join('; ')}`); }
  }

  // ---------- 8. cấu hình ----------
  const cli = cliOf(project);
  const setup = node([cli, 'setup']);
  if (setup.status !== 0) rollback('không sinh lại được cấu hình (setup)', setup.out);

  // ---------- 9. kiểm ----------
  const integrity = node([at(project, '.claude/modules/core/gate/install.js'), '--verify', project]);
  if (integrity.status !== 0) rollback('kiểm toàn vẹn cổng duyệt không sạch', integrity.out);
  // Phần của bạn phải đang nằm trên đĩa đúng từng byte như trong overlay (không bước nào ở trên được ghi đè lên nó).
  const lost = overlay.filter((rel) => { try { return sha256(fs.readFileSync(at(project, rel))) !== sha256(fs.readFileSync(at(overlayDir, rel))); } catch { return true; } });
  if (lost.length) rollback(`phần của bạn không còn đúng sau khi cài: ${lost.join(', ')}`, '');
  console.log(`Phần của bạn: ${overlay.length} tệp đang trên đĩa đúng như bản đã gộp (đã so từng tệp).`);
  const health = node([cli, 'doctor']);
  if (health.status !== 0 && healthBefore === 0) rollback('kiểm sức khỏe báo LỖI mà trước khi cài không có', health.out);
  const ran = [];
  for (const cmd of verify) {
    console.log(`Lệnh kiểm của dự án: ${cmd.join(' ')}`);
    const r = spawnSync(cmd[0], cmd.slice(1), { cwd: project, encoding: 'utf8', windowsHide: true, timeout: 20 * 60 * 1000, shell: false });
    const out = `${r.stdout || ''}${r.stderr || ''}${r.error ? `\n${r.error.message}` : ''}`;
    if (out.trim()) console.log(out.trimEnd().split('\n').slice(-40).join('\n'));
    ran.push({ cmd, status: r.status });
    if (r.status !== 0) rollback(`lệnh kiểm của dự án hỏng: ${cmd.join(' ')}`, out);
  }
  record('applied', { doctor: health.status, doctorBefore: healthBefore, migrations: todo.map((t) => ({ id: t.m.id, file: t.m.file, changed: Boolean(t.changed), skipped: t.skip || '' })), verify: ran });
  console.log(`XONG: đang chạy bản ${plan.to} kèm phần của bạn.${health.status !== 0 ? ' Kiểm sức khỏe còn LỖI có từ TRƯỚC khi cài (xem ở trên).' : ''}`);
  console.log(`Phiên Claude Code đang mở: mã hook và công cụ mới có hiệu lực ngay; kết quả công cụ có dòng cảnh báo thì gõ /mcp một lần. Quay lại bản cũ: ${undoCmd}`);
  process.exit(0);
} catch (e) {
  rollback(`lỗi khi đang cài: ${e.message}`, e.stack);
}
