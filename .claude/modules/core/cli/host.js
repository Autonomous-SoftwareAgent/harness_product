'use strict';
// spec: MCP-S-001
// Việc của các công cụ MCP host_* (khai ở mcp/mcp-tools.js; mã ở đây vì mcp/ chỉ giữ giao thức). Agent đổi định nghĩa gốc qua đây, không sửa tay tệp sinh:
//   host_status  chỉ đọc: kiểm kê .claude/ của team, tệp harness sinh, chỗ trùng tên, chỗ lệch, và BẢNG VÒNG ĐỜI của từng skill và note.
//   host_define  tạo hoặc sửa MỘT skill (<đơn vị>/.harness/skills/<tên>/SKILL.md, kèm điều kiện ép) hoặc MỘT note (<đơn vị>/.harness/notes/<tên>.md) rồi sinh tệp công cụ.
//   host_rename  đổi tên: bản gốc, bản sinh và điều kiện ép đi cùng nhau.
//   host_remove  gỡ: xóa bản gốc; bản sinh còn nguyên thì tự xóa theo, bản đã bị sửa tay thì giữ lại và báo.
//   host_adopt   nhận skill team viết ở <đơn vị>/.claude/skills/ về .harness/ để harness quản (chạy khô trừ khi confirm=true).
// Mỗi thao tác ghi một dòng sự kiện vào sổ phiên (nhóm act_, luật "host"): chỉ tên đơn vị, tên mục và loại thao tác, không ghi nội dung.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const P = require('../gate/gate-paths');

const ROOT = P.rootFrom(__dirname);
const mods = () => ({
  defs: require('../adapters/hosts/definitions'),
  sync: require('../adapters/hosts/sync'),
  claude: require('../adapters/hosts/claude'),
  enforce: require('../adapters/project/enforce'),
});

const readText = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } };
function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}
const entryOf = (unit) => {
  const entry = P.serviceEntries(ROOT).find((e) => e.name === unit);
  if (!entry) throw new Error(`Không có đơn vị "${unit}" theo cấu hình dự án. Đơn vị có: ${P.serviceEntries(ROOT).map((e) => e.name).join(', ') || '(chưa có)'}.`);
  return entry;
};
const skillFile = (dir, name) => path.join(dir, P.UNIT_EXT_DIR, 'skills', name, 'SKILL.md');
const noteFile = (dir, name) => path.join(dir, P.UNIT_EXT_DIR, 'notes', `${name}.md`);
const agentFile = (dir, name) => path.join(dir, P.UNIT_EXT_DIR, 'agents', `${name}.md`);
// Tệp nguồn của một mục theo loại; skill là thư mục (SKILL.md), note và agent là một tệp.
const srcFile = (kind, dir, name) => (kind === 'note' ? noteFile(dir, name) : kind === 'agent' ? agentFile(dir, name) : skillFile(dir, name));
const srcRemoval = (kind, file) => (kind === 'skill' ? path.dirname(file) : file);
const LABEL = { skill: 'Skill', note: 'Note', agent: 'Agent' };

// Ghi một dòng sự kiện vào sổ phiên. Không có mã phiên hay không mở được sổ thì bỏ qua: sự kiện là để tra cứu, không bắt buộc.
function logEvent(kind, unit, name) {
  const sid = process.env.CLAUDE_CODE_SESSION_ID;
  if (!sid) return;
  try {
    const L = require('../adapters/storage/ledger-db');
    if (!fs.existsSync(P.ledgerPath(ROOT))) return;
    const db = L.open(ROOT);
    if (!db) return;
    try { L.touch(db, sid); L.addDecision(db, { sid, rule: 'host', kind, service: unit, verdict: 'allow', detail: name }); } finally { try { db.close(); } catch { /* bỏ qua */ } }
  } catch { /* sổ không ghi được: bỏ qua */ }
}
function markUnit(unit) { try { require('../hooks/sessions-lib').mark(ROOT, process.env.CLAUDE_CODE_SESSION_ID, unit); } catch { /* không có mã phiên: bỏ qua */ } }

// ---------- host_status ----------
// Số lần mở và lần mở cuối của từng skill (từ sổ phiên). Không có sổ thì rỗng.
function opens() {
  const out = new Map();
  try {
    const L = require('../adapters/storage/ledger-db');
    if (!fs.existsSync(P.ledgerPath(ROOT))) return out;
    const db = L.open(ROOT);
    if (!db) return out;
    try { for (const r of db.prepare('SELECT skill, COUNT(*) AS n, MAX(at) AS last FROM act_skill_loads GROUP BY skill').all()) out.set(r.skill, r); } finally { try { db.close(); } catch { /* bỏ qua */ } }
  } catch { /* bỏ qua */ }
  return out;
}

// Bảng vòng đời: một dòng cho mỗi skill và note do harness quản. Hàm thuần theo (root, sổ, kết quả kiểm tệp sinh): trả { rows, lines }.
function lifecycle(now = Date.now()) {
  const { sync, enforce } = mods();
  const check = sync.syncAll(ROOT, { check: true });
  const bad = (needle) => check.problems.filter((p) => p.includes(needle));
  const forced = new Map(enforce.collect(ROOT).map((x) => [`${x.unit}/${x.skill}`, x]));
  const seen = opens();
  const rows = [];
  for (const u of sync.gather(ROOT, null)) {
    for (const s of u.skills) {
      const rel = `${u.name}/.claude/skills/${s.name}/SKILL.md`;
      const f = forced.get(`${u.name}/${s.name}`);
      const o = seen.get(s.name);
      const state = bad(rel).length ? (bad(rel).some((p) => p.includes('sửa tay')) ? 'sửa tay' : 'lệch') : 'khớp';
      rows.push({ unit: u.name, kind: 'skill', name: s.name, state, enforced: !!(f && f.files.length), badPatterns: f ? f.bad : [], opens: o ? o.n : 0, last: o ? o.last : 0, now });
    }
    for (const n of u.notes || []) {
      const rel = `${u.name}/.claude/rules/${n.name}.md`;
      rows.push({ unit: u.name, kind: 'note', name: n.name, state: bad(rel).length ? (bad(rel).some((p) => p.includes('sửa tay')) ? 'sửa tay' : 'lệch') : 'khớp', enforced: false, badPatterns: [], opens: 0, last: 0, now });
    }
  }
  for (const u of sync.gather(ROOT, null)) {
    for (const a of u.agents || []) {
      const rel = `.claude/agents/${u.name}-${a.name}.md`;
      const d = mods().defs.readAgent(a.text);
      rows.push({ unit: u.name, kind: 'agent', name: a.name, state: bad(rel).length ? (bad(rel).some((p) => p.includes('sửa tay')) ? 'sửa tay' : 'lệch') : 'khớp', enforced: false, badPatterns: [], opens: 0, last: 0, now, tools: d.tools, model: d.model });
    }
  }
  const lines = rows.map((r) => {
    const days = r.last ? Math.floor((now - r.last) / 86400000) : null;
    if (r.kind === 'agent') return `  ${r.unit}/agent ${r.name}: bản sinh ${r.state}; tên ${r.unit}-${r.name}; công cụ ${r.tools.join(', ') || '(chưa khai)'}; model ${r.model || 'thừa hưởng'}`;
    const use = r.kind === 'note' ? 'tự nạp khi chạm tệp' : r.opens ? `đã mở ${r.opens} lần, lần cuối ${days === 0 ? 'hôm nay' : `${days} ngày trước`}` : 'chưa ai mở';
    return `  ${r.unit}/${r.kind} ${r.name}: bản sinh ${r.state}; ${r.kind === 'note' ? 'chỉ nhắc' : r.enforced ? 'có ép' : 'chưa ép'}; ${use}${r.badPatterns.length ? `; mẫu ép hỏng: ${r.badPatterns.join(', ')}` : ''}`;
  });
  return { rows, lines };
}

const status = () => {
  const { sync } = mods();
  const inv = require('../adapters/hosts/inventory');
  const sy = sync.syncAll(ROOT, { check: true });
  const out = [inv.render(inv.inventory(ROOT))];
  const lc = lifecycle();
  if (lc.lines.length) out.push('Vòng đời skill và note do harness quản:', ...lc.lines);
  if (sy.notes.length) out.push('Trùng tên:', ...sy.notes.map((n) => `  ${n}`));
  out.push(sy.problems.length ? `Cần xử lý:\n${sy.problems.map((p) => `  ${p}`).join('\n')}` : 'Tệp sinh khớp định nghĩa gốc.');
  return out.join('\n');
};

// ---------- host_define ----------
function define(a) {
  const { defs, sync, claude } = mods();
  const unit = String(a.service || '');
  const entry = entryOf(unit);
  const kind = a.kind || 'skill';
  const bad = defs.problems({ ...a, kind });
  if (bad.length) throw new Error(`${LABEL[kind] || 'Mục'} không hợp lệ: ${bad.join('; ')}.`);
  if (kind === 'skill') {
    const native = claude.importNative(sync.nativeFiles(entry.dir)).find((d) => d.name === a.name);
    if (native) throw new Error(`Đơn vị ${unit} đã có skill "${a.name}" do team viết ở ${native.src}. Bản của team được dùng, nên harness không ghi bản trùng tên. Đặt tên khác, hoặc nhờ người dùng quyết định nhận skill đó vào .harness/ (host_adopt).`);
  }
  const file = srcFile(kind, entry.dir, a.name);
  const existed = fs.existsSync(file);
  writeAtomic(file, kind === 'note' ? defs.noteText(a) : kind === 'agent' ? defs.agentText(a) : defs.skillText(a));
  markUnit(unit);
  logEvent(existed ? 'update' : 'define', unit, `${kind}:${a.name}`);
  const r = sync.syncAll(ROOT);
  const where = path.relative(entry.dir, file).split(path.sep).join('/');
  const ep = kind === 'skill' && a.enforce && Array.isArray(a.enforce.files) && a.enforce.files.length
    ? ` Ép: sửa tệp khớp ${a.enforce.files.join(', ')} trong ${unit} thì phải mở skill trước.` : '';
  const ag = kind === 'agent' ? ` Agent sinh ra tên ${unit}-${a.name} ở .claude/agents/ (gọi bằng subagent_type="${unit}-${a.name}"); chỉ làm trong ${unit}, dùng đúng các công cụ: ${(a.tools || []).join(', ')}.` : '';
  return [`${existed ? 'Đã cập nhật' : 'Đã tạo'} ${kind} "${a.name}" ở ${unit}/${where}.${ep}${ag}`, r.text || 'Tệp công cụ đã khớp.'].join('\n');
}

// ---------- host_rename ----------
function rename(a) {
  const { defs, sync } = mods();
  const unit = String(a.service || '');
  const entry = entryOf(unit);
  const kind = a.kind || 'skill';
  const to = String(a.to || '');
  if (!defs.NAME_RE.test(to)) throw new Error('Tên mới chỉ gồm chữ thường, số, gạch ngang, bắt đầu bằng chữ.');
  if (kind === 'note' && to === 'harness') throw new Error('Tên "harness" dành cho tệp nhắc cửa vào do harness sinh.');
  const from = srcFile(kind, entry.dir, a.name);
  const dest = srcFile(kind, entry.dir, to);
  const text = readText(from);
  if (text === null) throw new Error(`Không có ${kind} "${a.name}" ở ${unit}/.harness (chỉ đổi tên được định nghĩa do harness quản; skill của team thì dùng host_adopt trước).`);
  if (fs.existsSync(dest)) throw new Error(`Đã có ${kind} tên "${to}" ở ${unit}.`);
  if (kind === 'skill' && sync.nativeFiles(entry.dir).some((f) => f.rel === `.claude/skills/${to}/SKILL.md` && !mods().claude.read(f.text))) throw new Error(`Team đã có skill "${to}" ở ${unit}/.claude/skills/.`);
  const next = kind === 'note' ? text : text.replace(/^name:.*$/m, `name: ${to}`);
  writeAtomic(dest, next); // bước 1: ghi tên mới; hỏng ở đây thì chưa mất gì
  try { fs.rmSync(srcRemoval(kind, from), { recursive: true, force: true }); } catch (e) { fs.rmSync(srcRemoval(kind, dest), { recursive: true, force: true }); throw new Error(`Không xóa được bản cũ, đã hoàn tác: ${e.message}`); }
  markUnit(unit);
  logEvent('rename', unit, `${kind}:${a.name}->${to}`);
  const r = sync.syncAll(ROOT);
  return [`Đã đổi ${kind} "${a.name}" thành "${to}" ở ${unit}; điều kiện ép (nếu có) nằm trong chính tệp nên đi theo.`, r.text || 'Tệp công cụ đã khớp.'].join('\n');
}

// ---------- host_remove ----------
function remove(a) {
  const { sync } = mods();
  const unit = String(a.service || '');
  const entry = entryOf(unit);
  const kind = a.kind || 'skill';
  const from = srcFile(kind, entry.dir, a.name);
  if (readText(from) === null) throw new Error(`Không có ${kind} "${a.name}" ở ${unit}/.harness (tệp của team không gỡ bằng công cụ này).`);
  fs.rmSync(srcRemoval(kind, from), { recursive: true, force: true });
  markUnit(unit);
  logEvent('remove', unit, `${kind}:${a.name}`);
  const r = sync.syncAll(ROOT);
  return [`Đã gỡ ${kind} "${a.name}" ở ${unit} (bản gốc và điều kiện ép đi cùng).`, r.text || 'Không còn bản sinh nào.'].join('\n');
}

// ---------- host_adopt ----------
const tracked = (dir, rel) => { try { return spawnSync('git', ['ls-files', '--error-unmatch', rel], { cwd: dir, encoding: 'utf8', stdio: 'pipe' }).status === 0; } catch { return false; } };
function adopt(a) {
  const { defs, sync, claude } = mods();
  const unit = String(a.service || '');
  const entry = entryOf(unit);
  const name = String(a.name || '');
  const rel = `.claude/skills/${name}/SKILL.md`;
  const native = claude.importNative(sync.nativeFiles(entry.dir)).find((d) => d.name === name);
  if (!native) throw new Error(`Không có skill "${name}" của team ở ${unit}/.claude/skills/ (hoặc đó là bản harness sinh).`);
  if (fs.existsSync(skillFile(entry.dir, name))) throw new Error(`Đã có định nghĩa gốc "${name}" ở ${unit}/.harness/skills/; xóa hoặc đặt tên khác rồi nhận lại.`);
  const dir = path.dirname(path.join(entry.dir, ...rel.split('/')));
  const extras = fs.readdirSync(dir).filter((f) => f !== 'SKILL.md');
  if (extras.length) throw new Error(`Skill "${name}" của team có thêm tệp kèm theo (${extras.join(', ')}); bộ sinh chỉ chép SKILL.md nên chưa nhận được, để khỏi mất chúng. Giữ nguyên là skill của team.`);
  const bad = defs.problems({ name, description: defs.front(native.text).fields.get('description') || '', body: defs.front(native.text).body });
  if (bad.length) throw new Error(`Chưa nhận được "${name}": ${bad.join('; ')}.`);
  const git = tracked(entry.dir, rel);
  const plan = [
    `Nhận skill "${name}" của team ở ${unit} về harness quản:`,
    `  1. Chép nguyên văn ${rel} vào ${unit}/.harness/skills/${name}/SKILL.md.`,
    `  2. Thay ${rel} bằng bản harness sinh (cùng nội dung, thêm dấu harness-host).`,
    git ? `  Tệp đang được git của ${unit} theo dõi: bước 2 hiện thành một thay đổi để người dùng tự xem và commit; lùi lại bằng git.` : `  Tệp chưa được git theo dõi: bản gốc nằm nguyên văn ở .harness/skills/${name}/SKILL.md nên lùi lại được bằng cách chép ngược.`,
  ];
  if (a.confirm !== true) return `${plan.join('\n')}\n(Chạy khô, chưa đổi gì. Gọi lại với confirm=true sau khi người dùng đồng ý.)`;
  writeAtomic(skillFile(entry.dir, name), native.text);
  fs.rmSync(path.join(entry.dir, ...rel.split('/')), { force: true }); // chỉ sau khi bản gốc đã ghi xong
  try { fs.rmdirSync(dir); } catch { /* còn gì đó: để nguyên */ }
  markUnit(unit);
  logEvent('adopt', unit, `skill:${name}`);
  const r = sync.syncAll(ROOT);
  return [`Đã nhận skill "${name}" của ${unit} về .harness/skills/.`, r.text || 'Tệp công cụ đã khớp.'].join('\n');
}

// ---------- doctor ----------
// Danh sách tệp của đơn vị (tối đa 5000), bỏ .git, node_modules, .claude, .harness: để biết mẫu ép có khớp tệp nào không.
function filesOf(dir, cap = 5000) {
  const out = [];
  const walk = (d, rel) => {
    let ents = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (out.length >= cap) return;
      if (['.git', 'node_modules', '.claude', '.harness'].includes(e.name)) continue;
      if (e.isDirectory()) walk(path.join(d, e.name), `${rel}${e.name}/`); else out.push(`${rel}${e.name}`);
    }
  };
  walk(dir, '');
  return out;
}

// Lỗi, cảnh báo và ghi chú về vòng đời skill, cho doctor. Trả { errors, warns, notes }.
function health(now = Date.now()) {
  const { enforce } = mods();
  const errors = []; const warns = []; const notes = [];
  const seen = opens();
  const dirs = new Map(P.serviceEntries(ROOT).map((e) => [e.name, e.dir]));
  for (const x of enforce.collect(ROOT)) {
    const tag = `${x.unit}/${x.skill}`;
    for (const p of x.bad) errors.push(`skill ${tag}: mẫu ép "${p}" không phải biểu thức chính quy hợp lệ, nên điều kiện ép của nó bị bỏ`);
    if (x.files.length && !x.generated) errors.push(`skill ${tag} khai điều kiện ép nhưng chưa được sinh ra ở ${x.unit}/.claude/skills/, nên hook chặn theo skill KHÔNG ép nó (chạy host-sync)`);
    if (x.files.length && dirs.has(x.unit)) {
      const all = filesOf(dirs.get(x.unit));
      for (const p of x.files) {
        let re;
        try { re = new RegExp(p, 'i'); } catch { continue; }
        if (!all.some((f) => re.test(f))) warns.push(`skill ${tag}: mẫu ép "${p}" không khớp tệp nào trong đơn vị (nghi mẫu sai)`);
      }
    }
  }
  // Đơn vị nằm trong thư mục bị .gitignore ở gốc dự án: Claude Code không liệt kê skill của đơn vị đó (đã đo), chỉ rule (note) nạp.
  for (const [unit, dir] of dirs) {
    if (!P.unitSkills(ROOT, unit).length) continue;
    let ignored = false;
    try { ignored = spawnSync('git', ['check-ignore', '-q', path.relative(ROOT, dir).split(path.sep).join('/')], { cwd: ROOT, stdio: 'ignore' }).status === 0; } catch { /* không có git: bỏ qua */ }
    if (ignored) notes.push(`đơn vị ${unit} nằm trong thư mục bị .gitignore ở gốc dự án: Claude Code KHÔNG liệt kê skill của đơn vị này (công cụ Skill báo "Unknown skill"); mở skill bằng cách đọc trọn SKILL.md bằng công cụ Read (hook tính cả hai cách), còn note vẫn nạp bình thường`);
  }
  // Mô tả có ": " hay " #" chưa bọc nháy làm phần đầu tệp không phải YAML hợp lệ: Claude Code bỏ qua cả skill, nên báo là LỖI.
  for (const [unit, dir] of dirs) {
    for (const name of P.unitSkills(ROOT, unit)) {
      const bad = mods().defs.brokenDescription(readText(skillFile(dir, name)) || '');
      if (bad) errors.push(`skill ${unit}/${name}: mô tả có dấu ": " hoặc " #" mà chưa bọc nháy kép, nên Claude Code không đọc được skill (bọc cả mô tả trong dấu nháy kép, hoặc gọi lại host_define: công cụ tự bọc)`);
    }
  }
  for (const r of lifecycle(now).rows) {
    if (r.kind === 'agent') {
      const tag = `${r.unit}/${r.name}`;
      if (!r.tools.length) errors.push(`agent ${tag} không khai tools, nên thừa hưởng MỌI công cụ của phiên (khai lại bằng host_define kind=agent)`);
      else if (!r.tools.includes('Read')) warns.push(`agent ${tag} không có công cụ Read nên không đọc được cửa vào và skill của đơn vị (phần mở đầu do harness sinh đòi đọc)`);
      if (r.tools.some((t) => /plan_approve|delegate/.test(t))) errors.push(`agent ${tag} khai công cụ duyệt kế hoạch; chỉ phiên chính được duyệt (luật delegate-guard sẽ chặn)`);
      if (r.tools.includes('Agent')) notes.push(`agent ${tag} được gọi agent khác: nhiều tầng thì mỗi tầng phải nạp lại skill và tài liệu`);
      if (r.state !== 'khớp') warns.push(`agent ${tag}: bản sinh ${r.state} (chạy host-sync)`);
      continue;
    }
    if (r.kind !== 'skill') continue;
    if (!r.enforced) notes.push(`skill ${r.unit}/${r.name} chưa khai điều kiện ép (chỉ là gợi ý)`);
    let age = 0;
    try { age = now - fs.statSync(skillFile(dirs.get(r.unit) || '', r.name)).mtimeMs; } catch { /* không đọc được */ }
    const last = seen.get(r.name);
    if (age > 30 * 86400000 && !(last && now - last.last < 30 * 86400000)) warns.push(`skill ${r.unit}/${r.name} 30 ngày chưa ai mở`);
  }
  return { errors, warns, notes };
}

module.exports = { status, define, rename, remove, adopt, lifecycle, health, filesOf };

