'use strict';
// spec: HOOK-S-019
// TỜ THAY ĐỔI của một bản phát hành, cho MÁY đọc. Sổ phát hành (RELEASES.md) viết cho người; tờ này để lệnh nâng cấp và agent biết
// CỤ THỂ bản mới đổi gì, đổi ở tệp nào, hành vi trước và sau ra sao, dự án đã cài bị ảnh hưởng thế nào và người dùng phải quyết điều gì.
// Hàm thuần: nhận dữ liệu, trả dữ liệu; không đọc đĩa.
//
// Một tờ (tệp releases/<số bản>.json của khối lõi):
//   { "version": "1.7.0", "date": "YYYY-MM-DD", "summary": "một câu",
//     "changes": [ {
//         "id": "ten-ngan-khong-dau",            duy nhất trong tờ
//         "kind": "added | changed | removed | fixed",
//         "block": "core",                        khối chứa phần chính của thay đổi
//         "title": "một dòng",
//         "before": "hành vi trước",              bắt buộc trừ khi kind = added
//         "after": "hành vi sau",                 bắt buộc trừ khi kind = removed
//         "files": ["core/cli/upgrade.js", "context/mcp/context/recognizers/sources/"],
//                                                 đường dẫn tính từ thư mục mã; kết thúc bằng "/" là cả thư mục
//         "surface": { "config": [], "commands": [], "tools": [], "skills": [], "hooks": [] },   thứ người cài nhìn thấy (tùy chọn)
//         "impact": "dự án đã cài thấy gì khác sau khi lên bản này",
//         "migrations": ["id bước chuyển"],       tùy chọn
//         "decisions": [ { "id", "question", "options": [ { "value", "label" } ], "default": "value | bỏ trống" } ],   tùy chọn
//         "verified": "đã kiểm bằng gì", "unverified": "điều chưa kiểm" } ],
//     "migrations": [ ... ],                      xem migrate.js
//     "housekeeping": ["core/module.json"] }      tệp đổi ở mọi bản mà không đổi hành vi; chỉ nhận đường dẫn tệp, không nhận thư mục
const migrate = require('./migrate');

const KINDS = ['added', 'changed', 'removed', 'fixed'];
const SURFACES = ['config', 'commands', 'tools', 'skills', 'hooks'];
const ID_RE = /^[a-z][a-z0-9-]{1,60}$/;
const VERSION_RE = /^\d+\.\d+\.\d+$/;
const text = (v) => typeof v === 'string' && v.trim().length > 0;
const list = (v) => (Array.isArray(v) ? v : []);

const key = (v) => String(v).split('.').map(Number);
const cmp = (a, b) => { const x = key(a); const y = key(b); for (let i = 0; i < 3; i += 1) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d < 0 ? -1 : 1; } return 0; };

// Một mục `files` có phủ đường dẫn `rel` không: trùng hẳn, hoặc mục là thư mục (kết thúc "/") chứa nó.
const covers = (entry, rel) => (entry.endsWith('/') ? rel.startsWith(entry) : rel === entry);

// Kiểm một tờ. Trả danh sách lỗi (rỗng là đạt).
//   version       số bản tờ này phải mang (bỏ trống thì không so)
//   changed       [{ status: 'A'|'M'|'D', path }] tệp của gói đã đổi so với bản liền trước (đường dẫn tính từ thư mục mã); null = không biết,
//                 khi đó chỉ kiểm khuôn và kiểm tệp có trong gói
//   packageFiles  mảng đường dẫn mọi tệp của gói (tính từ thư mục mã); null = không kiểm
function check(sheet, { version = '', changed = null, packageFiles = null } = {}) {
  const errs = [];
  if (!sheet || typeof sheet !== 'object' || Array.isArray(sheet)) return ['tờ thay đổi không phải một đối tượng JSON'];
  if (!VERSION_RE.test(String(sheet.version || ''))) errs.push('thiếu "version" dạng x.y.z');
  else if (version && sheet.version !== version) errs.push(`"version" là ${sheet.version}, phải là ${version}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(sheet.date || ''))) errs.push('thiếu "date" dạng YYYY-MM-DD');
  if (!text(sheet.summary)) errs.push('thiếu "summary"');
  const changes = list(sheet.changes);
  if (!changes.length) errs.push('"changes" trống: bản nào cũng phải nói đã đổi gì');
  const migrationIds = new Set(list(sheet.migrations).map((m) => m && m.id));
  const seen = new Set();
  const used = new Set();
  for (const [i, c] of changes.entries()) {
    const at = `mục ${c && ID_RE.test(String(c.id || '')) ? c.id : `thứ ${i + 1}`}`;
    if (!c || typeof c !== 'object') { errs.push(`${at}: không phải đối tượng`); continue; }
    if (!ID_RE.test(String(c.id || ''))) errs.push(`${at}: "id" phải là chữ thường, số, gạch ngang`);
    else if (seen.has(c.id)) errs.push(`${at}: "id" bị trùng`);
    seen.add(c.id);
    if (!KINDS.includes(c.kind)) errs.push(`${at}: "kind" phải là một trong ${KINDS.join(', ')}`);
    for (const f of ['block', 'title', 'impact', 'verified', 'unverified']) if (!text(c[f])) errs.push(`${at}: thiếu "${f}"`);
    if (c.kind !== 'added' && !text(c.before)) errs.push(`${at}: thiếu "before" (hành vi trước)`);
    if (c.kind !== 'removed' && !text(c.after)) errs.push(`${at}: thiếu "after" (hành vi sau)`);
    const files = list(c.files).filter((f) => typeof f === 'string');
    if (!files.length) errs.push(`${at}: "files" trống, không biết thay đổi nằm ở đâu`);
    for (const f of files) {
      if (changed) { if (!changed.some((x) => covers(f, x.path))) errs.push(`${at}: "${f}" không khớp tệp nào đã đổi ở bản này`); }
      else if (packageFiles && !packageFiles.some((p) => covers(f, p))) errs.push(`${at}: "${f}" không có trong gói`);
    }
    if (c.surface !== undefined) {
      if (!c.surface || typeof c.surface !== 'object' || Array.isArray(c.surface)) errs.push(`${at}: "surface" phải là đối tượng`);
      else for (const k of Object.keys(c.surface)) if (!SURFACES.includes(k) || !Array.isArray(c.surface[k])) errs.push(`${at}: "surface.${k}" lạ hoặc không phải mảng`);
    }
    for (const m of list(c.migrations)) { used.add(m); if (!migrationIds.has(m)) errs.push(`${at}: bước chuyển "${m}" không có trong "migrations" của tờ`); }
    for (const d of list(c.decisions)) {
      if (!d || !ID_RE.test(String(d.id || '')) || !text(d.question)) { errs.push(`${at}: điểm cần quyết thiếu "id" hoặc "question"`); continue; }
      const opts = list(d.options);
      if (opts.length < 2 || opts.some((o) => !o || !text(o.value) || !text(o.label))) errs.push(`${at}: điểm cần quyết "${d.id}" phải có ít nhất hai lựa chọn, mỗi lựa chọn có "value" và "label"`);
      if (d.default !== undefined && d.default !== '' && !opts.some((o) => o && o.value === d.default)) errs.push(`${at}: "default" của "${d.id}" không nằm trong các lựa chọn`);
    }
  }
  for (const m of migrationIds) if (m && !used.has(m)) errs.push(`bước chuyển "${m}" không thuộc mục thay đổi nào: người đọc không biết vì sao có nó`);
  const decisionIds = new Set(changes.flatMap((c) => list(c && c.decisions).map((d) => d && d.id)));
  const dup = new Set();
  for (const m of list(sheet.migrations)) {
    errs.push(...migrate.check(m));
    if (m && dup.has(m.id)) errs.push(`bước chuyển "${m.id}" bị trùng`);
    if (m) dup.add(m.id);
    if (m && m.when && !decisionIds.has(m.when.decision)) errs.push(`bước chuyển "${m.id}": điều kiện dựa vào điểm cần quyết "${m.when.decision}" không có trong tờ`);
  }
  const house = list(sheet.housekeeping);
  for (const h of house) if (typeof h !== 'string' || h.endsWith('/')) errs.push(`"housekeeping" chỉ nhận đường dẫn tệp: ${h}`);
  if (changed) {
    const all = [...changes.flatMap((c) => list(c && c.files)), ...house].filter((f) => typeof f === 'string');
    const orphan = changed.filter((x) => !all.some((f) => covers(f, x.path))).map((x) => x.path).sort();
    if (orphan.length) errs.push(`${orphan.length} tệp đã đổi mà không mục nào nói tới: ${orphan.join(', ')}`);
    for (const h of house) if (!changed.some((x) => x.path === h)) errs.push(`"housekeeping" nêu "${h}" nhưng tệp đó không đổi ở bản này`);
  }
  return errs;
}

// Các tờ phải đọc khi đi từ bản `from` lên bản `to`, theo thứ tự tăng dần. `versions`: mọi số bản mà sổ phát hành của gói mới có.
// Trả { sheets, missing }: `missing` là các bản nằm trong khoảng mà gói không có tờ (bản phát hành trước khi có tờ thay đổi).
function collect(sheets, from, to, versions = []) {
  const inRange = (v) => VERSION_RE.test(String(v)) && cmp(v, from) > 0 && cmp(v, to) <= 0;
  const have = list(sheets).filter((s) => s && inRange(s.version)).sort((a, b) => cmp(a.version, b.version));
  const got = new Set(have.map((s) => s.version));
  const missing = [...new Set(versions.filter(inRange))].filter((v) => !got.has(v)).sort(cmp);
  return { sheets: have, missing };
}

// Đường dẫn của một mục nâng cấp (tính từ gốc dự án) -> đường dẫn tính từ thư mục mã, để so với "files" của tờ. Bản cài của một skill
// (.claude/skills/<tên>/SKILL.md) ứng với bản gốc trong khối: <khối>/skills/<tên>.md, khối nào cũng được.
function relOf(itemPath) {
  const m = /^\.claude\/modules\/(.+)$/.exec(itemPath);
  if (m) return { rel: m[1], skill: '' };
  const s = /^\.claude\/skills\/([^/]+)\/SKILL\.md$/.exec(itemPath);
  return s ? { rel: '', skill: s[1] } : { rel: '', skill: '' };
}
const touches = (change, itemPath) => {
  const { rel, skill } = relOf(itemPath);
  if (rel) return list(change.files).some((f) => covers(f, rel));
  if (skill) return list(change.files).some((f) => new RegExp(`^[^/]+/skills/${skill.replace(/[^a-z0-9-]/gi, '')}\\.md$`).test(f)) || list((change.surface || {}).skills).includes(skill);
  return false;
};

const YOURS = ['local-changed', 'local-added', 'both-changed', 'both-added', 'removed-vs-changed', 'local-removed', 'changed-vs-removed'];
const resultOf = (i) => {
  if (i.action === 'merge') return i.unmergeable ? 'không gộp tự động được' : i.conflicts ? `${i.conflicts} đoạn đụng nhau` : i.broken ? `gộp sạch nhưng hỏng: ${i.broken}` : 'gộp sạch';
  if (i.action === 'conflict') return 'gói bỏ tệp bạn đã sửa';
  if (i.action === 'keep') return 'giữ bản của bạn';
  return 'lấy bản mới';
};

// Ghép các tờ với tình trạng của chính dự án. Trả dữ liệu cho agent (briefing) để trình người dùng THEO TỪNG MỤC thay đổi.
//   items     các mục của upgrade-plan (đã qua withMerge)
//   project   { blocks: [khối đang cài], configKeys: [khóa dạng a.b đang có trong cấu hình dự án], skills: [skill đang có] }
//   migrations { id: { file, willChange, notes: [dòng], problem } } kết quả chạy thử từng bước chuyển trên tệp thật của dự án
//   answers   { id điểm cần quyết: value } các điểm người dùng đã trả lời
//   verify    các lệnh kiểm dự án tự khai sẽ chạy sau khi cài (mảng các mảng đối số); null = bên gọi không nói
function briefing({ from, to, sheets = [], missing = [], items = [], project = {}, migrations = {}, answers = {}, verify = null }) {
  const blocks = new Set(project.blocks || []);
  const keys = new Set(project.configKeys || []);
  const explained = new Set();
  const changes = [];
  for (const s of sheets) {
    for (const c of list(s.changes)) {
      const mine = items.filter((i) => touches(c, i.path));
      for (const i of mine) explained.add(i.path);
      const yours = mine.filter((i) => YOURS.includes(i.state)).map((i) => ({ path: i.path, state: i.state, result: resultOf(i), needsHuman: Boolean(i.needsHuman) }));
      const surface = c.surface || {};
      const decisions = list(c.decisions).map((d) => ({ id: d.id, question: d.question, options: d.options, default: d.default || '', answer: answers[d.id] !== undefined ? answers[d.id] : '' }));
      changes.push({
        version: s.version, id: c.id, kind: c.kind, block: c.block, title: c.title, before: c.before || '', after: c.after || '', impact: c.impact,
        surface: Object.fromEntries(SURFACES.filter((k) => list(surface[k]).length).map((k) => [k, surface[k]])),
        blockInstalled: blocks.has(c.block),
        configInUse: list(surface.config).filter((k) => keys.has(k)),
        files: mine.length, yours,
        migrations: list(c.migrations).map((id) => ({ id, ...(migrations[id] || { file: '', willChange: false, notes: [], problem: 'không chạy thử được' }) })),
        decisions, verified: c.verified, unverified: c.unverified,
      });
    }
  }
  // Tệp gói đổi mà không tờ nào giải thích (bản trước khi có tờ thay đổi, hoặc tờ viết thiếu): chỉ nêu được tên tệp.
  // Tệp "đổi ở mọi bản" mà các tờ đã khai, và chính các tờ thay đổi, không cần lời giải thích riêng.
  const quiet = (p) => { const { rel } = relOf(p); return Boolean(rel) && (/^[^/]+\/releases\/\d+\.\d+\.\d+\.json$/.test(rel) || sheets.some((s) => list(s.housekeeping).includes(rel))); };
  const PRODUCT = ['product-changed', 'product-added', 'product-removed', 'both-changed', 'both-added', 'removed-vs-changed', 'changed-vs-removed'];
  const unexplained = items.filter((i) => PRODUCT.includes(i.state) && !explained.has(i.path) && !quiet(i.path)).map((i) => i.path);
  // Tệp của gói mà bạn đã xóa trong khi gói không đổi: bản mới đặt lại (gói cần đủ tệp).
  const restored = items.filter((i) => i.state === 'local-removed').map((i) => i.path);
  const yoursOnly = items.filter((i) => ['local-changed', 'local-added'].includes(i.state) && !explained.has(i.path)).map((i) => i.path);
  const open = changes.flatMap((c) => c.decisions.filter((d) => !d.answer && !d.default).map((d) => ({ change: c.id, ...d })));
  const human = items.filter((i) => i.needsHuman).map((i) => ({ path: i.path, state: i.state, result: resultOf(i) }));
  return { from, to, sheets: sheets.map((s) => ({ version: s.version, date: s.date, summary: s.summary })), missing, changes, unexplained, yoursOnly, restored, needsHuman: human, openDecisions: open, verify };
}

const KIND_LABEL = { added: 'THÊM', changed: 'ĐỔI', removed: 'BỎ', fixed: 'SỬA LỖI' };
const SURFACE_LABEL = { config: 'khóa cấu hình', commands: 'lệnh', tools: 'công cụ', skills: 'skill', hooks: 'hook' };

// Báo cáo cho agent và người đọc, theo từng mục thay đổi. Trả mảng dòng.
function render(b) {
  const lines = [`# Nâng cấp harness từ bản ${b.from} lên bản ${b.to}`, ''];
  for (const s of b.sheets) lines.push(`- Bản ${s.version} (${s.date}): ${s.summary}`);
  if (b.missing.length) lines.push(`- Bản ${b.missing.join(', ')}: gói KHÔNG có tờ thay đổi cho các bản này; phần đổi của chúng chỉ có danh sách tệp ở cuối báo cáo và lời văn trong RELEASES.md.`);
  const attention = b.changes.filter((c) => c.yours.length || c.configInUse.length || c.migrations.some((m) => m.willChange || m.problem) || c.decisions.length);
  lines.push('', `Tổng: ${b.changes.length} mục thay đổi; ${attention.length} mục CHẠM TỚI DỰ ÁN NÀY (tệp bạn đã sửa, cấu hình đang dùng, bước chuyển, điểm cần quyết); ${b.needsHuman.length} tệp cần xử lý tay; ${b.openDecisions.length} điểm chờ người dùng quyết.`);
  for (const c of b.changes) {
    lines.push('', `## [${c.version}] ${KIND_LABEL[c.kind] || c.kind}: ${c.title}`, `- Mã mục: ${c.id}; khối ${c.block}${c.blockInstalled ? '' : ' (dự án KHÔNG cài khối này: không ảnh hưởng)'}; ${c.files} tệp của gói.`);
    if (c.before) lines.push(`- Trước: ${c.before}`);
    if (c.after) lines.push(`- Sau: ${c.after}`);
    lines.push(`- Dự án đã cài thấy gì: ${c.impact}`);
    for (const k of Object.keys(c.surface)) lines.push(`- ${SURFACE_LABEL[k]} mới hoặc đổi: ${c.surface[k].join(', ')}`);
    if (c.configInUse.length) lines.push(`- Dự án này ĐANG DÙNG khóa bị đổi: ${c.configInUse.join(', ')}`);
    if (c.yours.length) { lines.push('- Chạm tệp bạn đã sửa hoặc tự thêm:'); for (const y of c.yours) lines.push(`  - ${y.path}: ${y.result}${y.needsHuman ? ' (CẦN XỬ LÝ)' : ''}`); }
    for (const m of c.migrations) {
      lines.push(`- Bước chuyển cấu hình ${m.id}${m.file ? ` (${m.file})` : ''}: ${m.problem ? `KHÔNG CHẠY ĐƯỢC: ${m.problem}` : m.willChange ? 'sẽ sửa' : 'không có gì phải sửa ở dự án này'}`);
      for (const n of m.notes || []) lines.push(`  - ${n}`);
    }
    for (const d of c.decisions) {
      lines.push(`- CẦN NGƯỜI DÙNG QUYẾT (${d.id}): ${d.question}`);
      for (const o of d.options) lines.push(`  - ${o.value}: ${o.label}${o.value === d.default ? ' (mặc định)' : ''}${o.value === d.answer ? ' <- ĐÃ CHỌN' : ''}`);
    }
    lines.push(`- Đã kiểm: ${c.verified}`, `- Chưa kiểm: ${c.unverified}`);
  }
  if (b.unexplained.length) lines.push('', `## Tệp gói đổi mà không có mục giải thích (${b.unexplained.length})`, 'Chỉ biết tên tệp; muốn biết đổi gì thì so tệp trong package/ với bản đang cài.', ...b.unexplained.map((p) => `- ${p}`));
  if (b.yoursOnly.length) lines.push('', `## Phần của bạn mà bản mới không đụng tới (${b.yoursOnly.length}): giữ nguyên`, ...b.yoursOnly.map((p) => `- ${p}`));
  if ((b.restored || []).length) lines.push('', `## Tệp của gói bạn đã xóa, gói không đổi (${b.restored.length}): được đặt lại`, ...b.restored.map((p) => `- ${p}`));
  // Phép kiểm chạy sau khi cài (bên gọi đưa vào `verify`: các lệnh kiểm dự án tự khai). Nói rõ cả khi dự án chưa khai lệnh nào.
  if (Array.isArray(b.verify)) {
    lines.push('', '## Kiểm sau khi cài', '- Toàn vẹn cổng duyệt, kiểm sức khỏe, và so từng tệp là phần của bạn với bản đã gộp. Hỏng thì tự quay lại bản cũ.');
    if (b.verify.length) lines.push(`- Dự án ĐÃ khai ${b.verify.length} lệnh kiểm riêng (upgrade.verify), sẽ chạy sau khi cài:`, ...b.verify.map((c) => `  - ${c.join(' ')}`));
    else lines.push('- Dự án CHƯA khai lệnh kiểm riêng nào (upgrade.verify): phần bạn đã sửa trong mã của gói sẽ không được test nào chạy thử với bản mới.');
  }
  lines.push('', '## Việc phải xong trước khi cài');
  if (!b.needsHuman.length && !b.openDecisions.length) lines.push('Không có: mọi tệp gộp sạch, không điểm nào chờ quyết.');
  for (const h of b.needsHuman) lines.push(`- Xử lý tệp ${h.path}: ${h.result}`);
  for (const d of b.openDecisions) lines.push(`- Hỏi người dùng (${d.id}): ${d.question}`);
  return lines;
}

module.exports = { KINDS, SURFACES, check, collect, briefing, render, covers, touches, cmp };
