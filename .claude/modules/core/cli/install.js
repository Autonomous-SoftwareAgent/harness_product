'use strict';
// spec: HOOK-S-010
// harness-export: giữ đường dẫn bố cục cũ
// CÀI, NÂNG CẤP, CHUYỂN BỐ CỤC (S-064). Chạy TỪ BẢN MỚI (gói harness_product, bố cục khối) vào một dự án:
//   node <gói>/.claude/modules/core/cli/cli.js install <dự án> [--apply | --undo]
// Ba trường hợp, tự nhận:
//   - mới: dự án chưa có harness. Chép mã, khuôn phần của dự án, skill; sinh settings.json và .mcp.json.
//   - bố cục cũ: mọi thứ ở <dự án>/.claude/plugin/. Chuyển phần của dự án (cấu hình, bảng đơn vị, bảng skill, công tắc, bộ sinh riêng,
//     luật mở rộng) sang .claude/project/; cất .claude/plugin/ cũ; nêu tệp cổng duyệt đã bị sửa so với dấu vân tay cũ và tệp lạ.
//   - bố cục khối: thay .claude/modules/ bằng bản mới; nêu tệp mã người dùng đã sửa so với FILES.json của bản đang cài.
// Không bao giờ đụng: .claude/project/ đang có, thư mục trạng thái (sổ phiên), .claude/local/, skill khác bản của sản phẩm, phần settings
// và .mcp.json của người dùng. Mặc định chỉ in việc sẽ làm; --apply làm thật và cất bản cũ vào <thư mục trạng thái>/install-backup/<lúc>/
// (bản ghi <thư mục trạng thái>/install-last.json); --undo quay lại đúng lần cài gần nhất.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const P = require('../gate/gate-paths');

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const posix = (p) => p.split(path.sep).join('/');
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return undefined; } };
const exists = (p) => fs.existsSync(p);
// Đường dẫn của bố cục cũ, ghép từng phần (lệnh đóng gói không viết lại chúng).
const LEGACY = (dest, ...rel) => path.join(dest, '.claude', 'plugin', ...rel);
// Phần của dự án ở bố cục cũ -> chỗ mới (tính từ .claude/project/).
const LEGACY_PROJECT = [
  ['project.json', 'project.json'], ['units.json', 'units.json'], ['skills-map.json', 'skills-map.json'], ['scope.config.json', 'scope.config.json'],
  [path.join('gate', 'gate.config.json'), 'gate.config.json'], [path.join('gate', 'MIGRATED_AT'), 'MIGRATED_AT'],
  [path.join('mcp', 'context.config.json'), 'context.config.json'], [path.join('mcp', 'portal', 'generators'), 'generators'], ['rules', 'rules'],
  // Khối mở rộng của dự án (S-065). Dấu vân tay tính theo nội dung, nên khối đã xác nhận vẫn còn hiệu lực sau khi dời chỗ.
  ['extensions', 'extensions'],
];
const GIT_HOOKS = ['post-commit', 'pre-commit', 'commit-msg', 'pre-push'];

function kindOf(dest) {
  if (exists(path.join(dest, '.claude', 'modules', 'core', 'module.json'))) return 'modular';
  if (exists(LEGACY(dest, 'gate')) || exists(LEGACY(dest, 'cli')) || exists(LEGACY(dest, 'hooks'))) return 'legacy';
  return 'fresh';
}

function walkFiles(dir, base = dir, out = []) {
  if (!exists(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkFiles(p, base, out); else out.push(posix(path.relative(base, p)));
  }
  return out;
}

function copyDir(from, to) { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.cpSync(from, to, { recursive: true }); }
function moveDir(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  try { fs.renameSync(from, to); } catch { fs.cpSync(from, to, { recursive: true }); fs.rmSync(from, { recursive: true, force: true }); }
}

// Repo git có hook của harness cần cài lại theo đường dẫn mới: repo gốc và các đơn vị có .git riêng.
function repos(dest) {
  const out = [dest];
  try { for (const u of P.serviceEntries(dest)) if (exists(path.join(u.dir, '.git'))) out.push(u.dir); } catch { /* chưa khai đơn vị */ }
  return out.filter((d) => exists(path.join(d, '.git', 'hooks')));
}

function plan(src, dest) {
  const kind = kindOf(dest);
  const steps = [];
  const notes = [];
  const srcFiles = readJson(path.join(src, '.claude', 'modules', 'FILES.json'));
  const version = (srcFiles && srcFiles.version) || String(fs.readFileSync(path.join(src, '.claude', 'modules', 'VERSION'), 'utf8')).trim();
  if (kind === 'modular') {
    const old = readJson(path.join(dest, '.claude', 'modules', 'FILES.json'));
    steps.push(`thay .claude/modules/ (bản đang cài ${old ? old.version : 'không rõ'}) bằng bản ${version}; bản cũ được cất`);
    if (old && old.files) {
      const changed = Object.entries(old.files).filter(([f, h]) => f.startsWith('.claude/modules/') && exists(path.join(dest, ...f.split('/'))) && sha(fs.readFileSync(path.join(dest, ...f.split('/')))) !== h).map(([f]) => f);
      const extra = walkFiles(path.join(dest, '.claude', 'modules')).map((f) => `.claude/modules/${f}`).filter((f) => !old.files[f] && !/^\.claude\/modules\/(FILES|MANIFEST|index)\.json$|VERSION$/.test(f));
      if (changed.length) notes.push(`tệp mã của sản phẩm bạn đã sửa tay (sẽ bị thay; bản đang có nằm trong chỗ cất): ${changed.join(', ')}`);
      if (extra.length) notes.push(`tệp lạ trong .claude/modules/ (sẽ chuyển vào chỗ cất; luật riêng nên đặt ở .claude/project/rules/): ${extra.join(', ')}`);
    } else notes.push('bản đang cài không có FILES.json: không phân biệt được tệp nào bạn đã sửa; bản cũ được cất nguyên để so');
  } else if (kind === 'legacy') {
    steps.push(`chuyển bố cục cũ .claude/plugin/ sang bố cục khối (bản ${version}); .claude/plugin/ cũ được cất nguyên`);
    for (const [from, to] of LEGACY_PROJECT) if (exists(LEGACY(dest, from))) steps.push(`chuyển phần của dự án .claude/plugin/${posix(from)} -> .claude/project/${to}`);
    if (!exists(LEGACY(dest, 'project.json'))) steps.push('dự án cũ chưa có project.json: ghi project.json mô tả đúng bố cục cũ đang dùng (để hành vi không đổi)');
    // Tệp cổng duyệt khác dấu vân tay cũ = đã bị sửa tay.
    const man = readJson(LEGACY(dest, 'gate', 'MANIFEST.json'));
    if (man && man.files) {
      const changed = Object.entries(man.files).filter(([f, h]) => exists(LEGACY(dest, 'gate', f)) && sha(fs.readFileSync(LEGACY(dest, 'gate', f))) !== h).map(([f]) => `gate/${f}`);
      if (changed.length) notes.push(`tệp cổng duyệt bạn đã sửa so với dấu vân tay cũ (KHÔNG mang sang bản mới; xem lại và đặt phần riêng thành luật ở .claude/project/rules/): ${changed.join(', ')}`);
    }
    const idx = readJson(path.join(src, '.claude', 'modules', 'index.json')) || {};
    const known = new Set([...Object.keys(idx), 'modules', 'presets']);
    const odd = walkFiles(LEGACY(dest)).filter((f) => !known.has(f) && !/(^|\/)test\//.test(f) && !/^(docs|acceptance|product)\//.test(f) && !LEGACY_PROJECT.some(([a]) => f === posix(a) || f.startsWith(`${posix(a)}/`)) && !/^(gate\/(MANIFEST\.json|VERSION)|CLAUDE\.md|FORMAT\.md|features\.json|layout\.json|\.gitignore|modules\/.*|presets\/.*)$/.test(f));
    if (odd.length) notes.push(`tệp trong .claude/plugin/ mà bản mới không có (có thể bạn tự thêm; KHÔNG mang sang, nằm trong chỗ cất): ${odd.slice(0, 30).join(', ')}${odd.length > 30 ? ` ... (${odd.length})` : ''}`);
    notes.push('các tệp mã khác của bản cũ không có dấu vân tay từng tệp: nếu bạn đã sửa chúng, so với chỗ cất sau khi cài');
  } else {
    steps.push(`cài mới bản ${version} vào .claude/modules/; tạo .claude/project/ từ khuôn`);
  }
  const skills = fs.readdirSync(path.join(src, '.claude', 'skills')).filter((n) => exists(path.join(src, '.claude', 'skills', n, 'SKILL.md')));
  const skillModule = {};
  for (const m of fs.readdirSync(path.join(src, '.claude', 'modules'))) { const man = readJson(path.join(src, '.claude', 'modules', m, 'module.json')); for (const n of (man && man.skills) || []) skillModule[n] = m; }
  const oldFiles = (readJson(path.join(dest, '.claude', 'modules', 'FILES.json')) || {}).files || {};
  const skillPlan = [];
  for (const n of skills) {
    const mine = path.join(dest, '.claude', 'skills', n, 'SKILL.md');
    const rel = `.claude/skills/${n}/SKILL.md`;
    if (!exists(mine)) skillPlan.push({ name: n, act: 'add' });
    else {
      const now = sha(fs.readFileSync(mine));
      const fresh = sha(fs.readFileSync(path.join(src, '.claude', 'skills', n, 'SKILL.md')));
      if (now === fresh) continue;
      if (oldFiles[rel] && oldFiles[rel] === now) skillPlan.push({ name: n, act: 'replace' });
      else skillPlan.push({ name: n, act: 'keep' });
    }
  }
  for (const s of skillPlan) steps.push(s.act === 'add' ? `thêm skill ${s.name}` : s.act === 'replace' ? `thay skill ${s.name} bằng bản mới (bản đang có là bản của sản phẩm, chưa sửa)` : `GIỮ skill ${s.name} của dự án (khác bản của sản phẩm; bản mới ở .claude/modules/${skillModule[s.name] || 'core'}/skills/${s.name}.md, chép đè tay nếu muốn dùng)`);
  steps.push('sinh lại phần của harness trong .claude/settings.json và .mcp.json (giữ phần của bạn)');
  steps.push(`cài lại git hook của harness theo đường dẫn mới ở ${repos(dest).length} repo`);
  return { kind, version, steps, notes, skillPlan };
}

function apply(src, dest, p) {
  const at = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = path.join(P.stateDir(dest), 'install-backup', at);
  const rec = { at, from: src, kind: p.kind, version: p.version, backup: posix(path.relative(dest, backup)), created: [], restore: [] };
  fs.mkdirSync(backup, { recursive: true });
  const save = (abs) => { if (!exists(abs)) { rec.created.push(posix(path.relative(dest, abs))); return; } const b = path.join(backup, path.relative(dest, abs)); fs.mkdirSync(path.dirname(b), { recursive: true }); fs.cpSync(abs, b, { recursive: true }); rec.restore.push(posix(path.relative(dest, abs))); };
  // settings, .mcp.json, git hook, skill sẽ thay: chép vào chỗ cất trước khi đụng.
  save(path.join(dest, '.claude', 'settings.json'));
  save(path.join(dest, '.mcp.json'));
  for (const r of repos(dest)) for (const h of GIT_HOOKS) { const f = path.join(r, '.git', 'hooks', h); if (exists(f)) save(f); }
  for (const s of p.skillPlan.filter((x) => x.act !== 'keep')) save(path.join(dest, '.claude', 'skills', s.name));
  const projectDir = path.join(dest, '.claude', 'project');
  const projectExisted = exists(projectDir);
  if (!projectExisted) rec.created.push('.claude/project');
  // Mã: cất bản cũ (bố cục cũ hoặc khối), chép bản mới.
  if (p.kind === 'legacy') { moveDir(LEGACY(dest), path.join(backup, '.claude', 'plugin')); rec.restore.push('.claude/plugin'); rec.removed = ['.claude/plugin']; }
  if (p.kind === 'modular') { moveDir(path.join(dest, '.claude', 'modules'), path.join(backup, '.claude', 'modules')); rec.restore.push('.claude/modules'); }
  copyDir(path.join(src, '.claude', 'modules'), path.join(dest, '.claude', 'modules'));
  if (p.kind !== 'modular') rec.created.push('.claude/modules');
  // Phần của dự án.
  fs.mkdirSync(projectDir, { recursive: true });
  if (p.kind === 'legacy') {
    const old = path.join(backup, '.claude', 'plugin');
    for (const [from, to] of LEGACY_PROJECT) {
      const a = path.join(old, from);
      const b = path.join(projectDir, to);
      if (exists(a) && !exists(b)) fs.cpSync(a, b, { recursive: true });
    }
    // Đơn vị harness của bố cục cũ trỏ .claude/plugin: đổi sang chỗ mới.
    const units = path.join(projectDir, 'units.json');
    const u = readJson(units);
    if (u && typeof u === 'object') {
      let changed = false;
      for (const [k, v] of Object.entries(u)) {
        if (v === '.claude/plugin') { u[k] = '.claude/modules'; changed = true; }
        else if (v && typeof v === 'object' && v.dir === '.claude/plugin') { v.dir = '.claude/modules'; changed = true; }
      }
      if (changed) fs.writeFileSync(units, `${JSON.stringify(u, null, 2)}\n`);
    }
    if (!exists(path.join(projectDir, 'project.json'))) {
      // Bố cục cũ không có project.json nghĩa là harness đang dùng cấu hình mặc định cũ: ghi nó ra để hành vi không đổi.
      fs.writeFileSync(path.join(projectDir, 'project.json'), `${JSON.stringify(P.LEGACY_CONFIG, null, 2)}\n`);
    }
  }
  for (const f of walkFiles(path.join(src, '.claude', 'project'))) {
    const b = path.join(projectDir, ...f.split('/'));
    if (!exists(b)) { fs.mkdirSync(path.dirname(b), { recursive: true }); fs.copyFileSync(path.join(src, '.claude', 'project', ...f.split('/')), b); }
  }
  // Skill.
  for (const s of p.skillPlan.filter((x) => x.act !== 'keep')) {
    fs.mkdirSync(path.join(dest, '.claude', 'skills', s.name), { recursive: true });
    fs.copyFileSync(path.join(src, '.claude', 'skills', s.name, 'SKILL.md'), path.join(dest, '.claude', 'skills', s.name, 'SKILL.md'));
  }
  // .gitignore của .claude: thêm dòng còn thiếu.
  const gi = path.join(dest, '.claude', '.gitignore');
  const want = fs.readFileSync(path.join(src, '.claude', '.gitignore'), 'utf8').split('\n').filter(Boolean);
  const have = exists(gi) ? fs.readFileSync(gi, 'utf8').split(/\r?\n/) : [];
  const add = want.filter((l) => !have.includes(l));
  if (add.length) { save(gi); fs.writeFileSync(gi, `${[...have.filter(Boolean), ...add].join('\n')}\n`); }
  fs.writeFileSync(path.join(P.stateDir(dest), 'install-last.json'), `${JSON.stringify(rec, null, 2)}\n`);
  // Bằng mã MỚI vừa chép: sinh settings và .mcp.json, cài lại git hook, kiểm.
  const cli = path.join(dest, '.claude', 'modules', 'core', 'cli', 'cli.js');
  const log = [];
  const runNode = (args) => spawnSync(process.execPath, args, { cwd: dest, encoding: 'utf8', timeout: 120000, windowsHide: true });
  const s = runNode([cli, 'setup']);
  log.push(`setup: ${(s.stdout || s.stderr || '').trim().split('\n').pop()}`);
  for (const r of repos(dest)) {
    const g = runNode([path.join(dest, '.claude', 'modules', 'core', 'cli', 'install-git-hooks.js'), r]);
    log.push(`git hook ${posix(path.relative(dest, r)) || '(gốc)'}: ${(g.stdout || g.stderr || '').trim().split('\n').pop() || 'xong'}`);
  }
  const v = runNode([path.join(dest, '.claude', 'modules', 'core', 'gate', 'install.js'), '--verify', dest]);
  log.push(v.status === 0 ? 'kiểm toàn vẹn: sạch' : `kiểm toàn vẹn: CÓ VẤN ĐỀ\n${(v.stdout || '').trim()}`);
  return { rec, log, ok: v.status === 0 };
}

function undo(dest) {
  const recFile = path.join(P.stateDir(dest), 'install-last.json');
  const rec = readJson(recFile);
  if (!rec) return { ok: false, text: `Không có bản ghi lần cài gần nhất (${posix(path.relative(dest, recFile))}): không có gì để quay lại.` };
  const backup = path.join(dest, ...rec.backup.split('/'));
  if (!exists(backup)) return { ok: false, text: `Chỗ cất ${rec.backup} không còn: không quay lại được.` };
  const lines = [];
  for (const c of rec.created) { const a = path.join(dest, ...c.split('/')); if (exists(a)) { fs.rmSync(a, { recursive: true, force: true }); lines.push(`xóa ${c} (lần cài đã tạo)`); } }
  if (rec.kind === 'modular' || rec.kind === 'legacy') { const m = path.join(dest, '.claude', 'modules'); if (exists(m)) { fs.rmSync(m, { recursive: true, force: true }); lines.push('xóa .claude/modules/ của lần cài'); } }
  for (const r of rec.restore) {
    const from = path.join(backup, ...r.split('/'));
    const to = path.join(dest, ...r.split('/'));
    if (!exists(from)) continue;
    if (exists(to)) fs.rmSync(to, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.cpSync(from, to, { recursive: true });
    lines.push(`trả lại ${r}`);
  }
  fs.renameSync(recFile, path.join(backup, 'install-last.json'));
  return { ok: true, text: [`Đã quay lại trạng thái trước lần cài lúc ${rec.at}:`, ...lines.map((l) => `  - ${l}`), `Chỗ cất giữ nguyên ở ${rec.backup} (xóa tay khi không cần).`].join('\n') };
}

function run(src, dest, { apply: doApply = false, undo: doUndo = false } = {}) {
  if (!P.isModular(src)) return { ok: false, text: 'Lệnh install chạy từ GÓI đã đóng (bố cục khối, .claude/modules/), không chạy từ bản mã nguồn. Đóng gói trước: cli.js public-export <thư mục>.' };
  if (!exists(dest) || !fs.statSync(dest).isDirectory()) return { ok: false, text: `Không có thư mục dự án: ${dest}` };
  if (path.resolve(src).toLowerCase() === path.resolve(dest).toLowerCase()) return { ok: false, text: 'Dự án đích chính là gói đang chạy: chọn thư mục dự án khác.' };
  if (doUndo) return undo(dest);
  const p = plan(src, dest);
  const head = `${doApply ? 'CÀI' : 'SẼ CÀI (chạy thử, chưa ghi gì; thêm --apply để làm thật)'}: ${p.kind === 'fresh' ? 'cài mới' : p.kind === 'legacy' ? 'chuyển từ bố cục cũ' : 'nâng cấp'} vào ${dest}`;
  const body = [...p.steps.map((s) => `  - ${s}`), ...p.notes.map((n) => `  ! ${n}`)];
  if (!doApply) return { ok: true, kind: p.kind, text: [head, ...body].join('\n') };
  const r = apply(src, dest, p);
  return { ok: r.ok, kind: p.kind, text: [head, ...body, ...r.log.map((l) => `  = ${l}`), `Bản cũ cất ở ${r.rec.backup}. Quay lại: node ${posix(path.relative(dest, path.join(src, '.claude', 'modules', 'core', 'cli', 'cli.js')))} install ${dest} --undo. Mở lại Claude Code (hoặc gõ /mcp) để nạp hook và máy chủ mới.`].join('\n') };
}

module.exports = { run, kindOf, plan };
