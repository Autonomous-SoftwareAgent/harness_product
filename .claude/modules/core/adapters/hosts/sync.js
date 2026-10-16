'use strict';
// spec: HOOK-S-010
// ĐỒNG BỘ ĐỊNH NGHĨA GỐC SANG TỆP CỦA TỪNG CÔNG CỤ. Dùng chung cho mọi bộ chuyển (adapters/hosts/<công cụ>.js): đọc định nghĩa gốc của các đơn vị
// (<đơn vị>/.harness/skills, tệp cửa vào), hỏi bộ chuyển cần tệp nào, rồi ghi có kiểm:
//   - tệp đã có mà KHÔNG phải bản do bộ chuyển sinh: không đụng, báo;
//   - bản sinh còn nguyên (khớp mã băm ghi ngay trong tệp): ghi đè khi định nghĩa gốc đổi;
//   - bản sinh bị người dùng sửa tay: không ghi đè, báo;
//   - tệp sinh mà định nghĩa gốc đã bỏ: xóa nếu còn nguyên, báo nếu đã bị sửa.
// Tệp sinh được loại khỏi git của đơn vị (.git/info/exclude) khi đơn vị là một repo riêng.
const fs = require('node:fs');
const path = require('node:path');
const P = require('../../gate/gate-paths');
const contract = require('../../ports/host-adapter');
const defs = require('./definitions');

const ADAPTERS = [require('./claude')];

const readText = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } };
const norm = (t) => String(t).replace(/\r\n/g, '\n');

// Các tệp team tự viết ở <đơn vị>/.claude/skills/*/SKILL.md: [{ rel, text }], rel tính từ thư mục đơn vị. Chỉ ĐỌC.
function nativeFiles(dir) {
  const out = [];
  const base = path.join(dir, '.claude', 'skills');
  let names = [];
  try { names = fs.readdirSync(base, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { /* chưa có */ }
  for (const n of names) { const text = readText(path.join(base, n, 'SKILL.md')); if (text !== null) out.push({ rel: `.claude/skills/${n}/SKILL.md`, text }); }
  return out;
}

// Tên các note của một đơn vị: <đơn vị>/.harness/notes/<tên>.md.
function unitNotes(dir) {
  try { return fs.readdirSync(path.join(dir, P.UNIT_EXT_DIR, 'notes')).filter((f) => /^[a-z][a-z0-9-]*\.md$/.test(f)).map((f) => f.slice(0, -3)).sort(); } catch { return []; }
}

// Mô tả các đơn vị cho bộ chuyển. Mọi đơn vị đều có mặt (kể cả đơn vị không còn định nghĩa gốc nào) để dọn được tệp sinh mồ côi.
// Hai nguồn định nghĩa: native (team viết ở .claude/, bộ chuyển đọc qua importNative) và harness (.harness/skills/). Trùng tên thì native thắng:
// skill của harness bị che không được sinh, và được ghi vào `shadowed` để báo (không báo mỗi phiên: chỉ ở host-sync, doctor, host_status).
function gather(root, adapter) {
  const units = [];
  for (const { name, dir } of P.serviceEntries(root)) {
    const lay = P.unitLayout(root, name);
    const mine = P.unitSkills(root, name).map((n) => ({ kind: 'skill', name: n, text: readText(path.join(dir, P.UNIT_EXT_DIR, 'skills', n, 'SKILL.md')), src: `${P.UNIT_EXT_DIR}/skills/${n}/SKILL.md` })).filter((x) => x.text !== null);
    const native = adapter && typeof adapter.importNative === 'function' ? adapter.importNative(nativeFiles(dir)) : [];
    const notes = unitNotes(dir).map((n) => ({ kind: 'note', name: n, text: readText(path.join(dir, P.UNIT_EXT_DIR, 'notes', `${n}.md`)), src: `${P.UNIT_EXT_DIR}/notes/${n}.md` })).filter((x) => x.text !== null);
    const merged = defs.merge(native, [...mine, ...notes]);
    const entryAbs = path.join(dir, ...lay.entryRel.split('/'));
    units.push({
      name, dir, native, shadowed: merged.shadowed,
      skills: merged.defs.filter((d) => d.origin === 'harness' && d.kind === 'skill').map((d) => ({ name: d.name, text: d.text })),
      notes: merged.defs.filter((d) => d.origin === 'harness' && d.kind === 'note').map((d) => ({ name: d.name, text: d.text })),
      entry: { rel: lay.entryRel, exists: lay.layout === 'harness' && fs.existsSync(entryAbs) },
    });
  }
  return units;
}

function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

// Thêm mẫu vào .git/info/exclude của đơn vị (chỉ khi đơn vị có thư mục .git riêng). Trả true khi đã ghi thêm.
function exclude(dir, pattern) {
  const gitDir = path.join(dir, '.git');
  try { if (!fs.statSync(gitDir).isDirectory()) return false; } catch { return false; }
  const file = path.join(gitDir, 'info', 'exclude');
  const cur = readText(file) || '';
  if (cur.split(/\r?\n/).includes(pattern)) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${cur}${cur && !cur.endsWith('\n') ? '\n' : ''}${pattern}\n`);
  return true;
}

// Các tệp sinh có thể tồn tại ở một đơn vị theo bộ chuyển: quét để tìm tệp mồ côi. Bộ chuyển nào có `scan(dir)` thì dùng; mặc định quét
// .claude/skills/*/SKILL.md và .claude/rules/*.md.
function candidates(dir) {
  const out = [];
  const skills = path.join(dir, '.claude', 'skills');
  try { for (const d of fs.readdirSync(skills, { withFileTypes: true })) if (d.isDirectory()) out.push(path.join(skills, d.name, 'SKILL.md')); } catch { /* chưa có */ }
  const rules = path.join(dir, '.claude', 'rules');
  try { for (const f of fs.readdirSync(rules)) if (f.endsWith('.md')) out.push(path.join(rules, f)); } catch { /* chưa có */ }
  return out;
}

// Chạy mọi bộ chuyển. `check`: chỉ báo, không ghi. Trả { written, removed, problems, text }; text rỗng khi không có gì để nói.
function syncAll(root, { check = false } = {}) {
  const written = []; const removed = []; const problems = []; const notes = [];
  for (const adapter of ADAPTERS) {
    const bad = contract.problems(adapter);
    if (bad.length) { problems.push(`bộ chuyển ${adapter.name} sai hợp đồng: ${bad.join('; ')}`); continue; }
    const units = gather(root, adapter);
    for (const u of units) for (const x of u.shadowed) notes.push(`${u.name}: skill "${x.name}" ở ${x.src} bị che vì team đã có skill cùng tên ở ${x.by}; bản của team được dùng, harness không sinh bản của nó.`);
    const files = adapter.plan(units);
    const wanted = new Set();
    const byUnit = new Map(units.map((u) => [u.name, u]));
    for (const f of files) {
      const u = byUnit.get(f.unit);
      const abs = path.join(u.dir, ...f.rel.split('/'));
      wanted.add(abs.toLowerCase());
      const shown = `${u.name}/${f.rel}`;
      const cur = readText(abs);
      if (cur !== null && norm(cur) === norm(f.text)) { if (!check) exclude(u.dir, f.exclude); continue; }
      if (cur !== null) {
        const old = adapter.read(cur);
        if (!old) { problems.push(`${shown} đã có nhưng không phải bản do harness sinh, nên không ghi đè.`); continue; }
        if (!old.pristine) { problems.push(`${shown} đã bị sửa tay, nên không ghi đè; sửa định nghĩa gốc ở ${old.src} rồi xóa tệp này để sinh lại.`); continue; }
      }
      if (check) { problems.push(`${shown} ${cur === null ? 'chưa được sinh' : 'đã cũ so với định nghĩa gốc'}.`); continue; }
      writeAtomic(abs, f.text);
      exclude(u.dir, f.exclude);
      written.push(shown);
    }
    // Tệp sinh mà định nghĩa gốc không còn.
    for (const u of units) {
      for (const abs of candidates(u.dir)) {
        if (wanted.has(abs.toLowerCase())) continue;
        const cur = readText(abs);
        const old = cur === null ? null : adapter.read(cur);
        if (!old) continue;
        const shown = `${u.name}/${path.relative(u.dir, abs).split(path.sep).join('/')}`;
        if (!old.pristine) { problems.push(`${shown} là bản sinh cũ nhưng đã bị sửa tay, nên không xóa.`); continue; }
        if (check) { problems.push(`${shown} là bản sinh mồ côi (định nghĩa gốc ${old.src} đã bỏ).`); continue; }
        try { fs.rmSync(abs, { force: true }); if (path.basename(abs) === 'SKILL.md') fs.rmdirSync(path.dirname(abs)); } catch { /* thư mục còn tệp khác: để nguyên */ }
        removed.push(shown);
      }
    }
  }
  const lines = [];
  if (written.length) lines.push(`Đã sinh ${written.length} tệp cho công cụ từ định nghĩa gốc ở .harness/: ${written.slice(0, 5).join(', ')}${written.length > 5 ? ', ...' : ''}.`);
  if (removed.length) lines.push(`Đã xóa ${removed.length} tệp sinh mồ côi: ${removed.slice(0, 5).join(', ')}${removed.length > 5 ? ', ...' : ''}.`);
  for (const p of problems) lines.push(p);
  return { written, removed, problems, notes, text: lines.join('\n') };
}

module.exports = { syncAll, gather, nativeFiles, ADAPTERS };
