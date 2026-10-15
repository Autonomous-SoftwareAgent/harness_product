'use strict';
// spec: HOOK-S-009
// spec: HOOK-S-010
// KIỂM SỨC KHỎE của harness trên MỘT dự án bất kỳ: cấu hình dự án, đơn vị, bảng việc -> skill, cổng duyệt, máy chủ MCP, git hook.
// Chỉ ĐỌC; không sửa gì. Mỗi dòng bắt đầu bằng LỖI (harness đang không chặn hay không chạy được), CẢNH BÁO (thiếu phần nên có) hoặc OK.
//   node .claude/modules/core/cli/cli.js doctor      thoát mã 1 khi có LỖI
const fs = require('node:fs');
const path = require('node:path');
const P = require('../gate/gate-paths');

function run(root) {
  const out = [];
  const err = (s) => out.push(`LỖI: ${s}`);
  const warn = (s) => out.push(`CẢNH BÁO: ${s}`);
  const ok = (s) => out.push(`OK: ${s}`);
  const cfg = P.projectConfig(root);

  // 1. Cấu hình dự án
  if (cfg.broken) err('.claude/project/project.json không đọc được (JSON hỏng): harness coi như dự án không có đơn vị nào.');
  else if (!cfg.exists) warn('chưa có .claude/project/project.json: harness dùng bố cục cũ (chế độ tương thích). Dự án mới: mở skill onboard.');
  else ok(`cấu hình dự án "${cfg.name}": thư mục cha ${cfg.units.parents.length ? cfg.units.parents.map((p) => `${p}/`).join(', ') : '(không có)'}; luật riêng: ${Object.entries(cfg.policies).filter(([, v]) => v === true || (Array.isArray(v) && v.length)).map(([k]) => k).join(', ') || 'không'}`);
  // Gốc mã: nơi đường dẫn của đơn vị tính từ đó. Khai sai thì harness ở lại thư mục mở phiên và KHÔNG thấy đơn vị nào ở chỗ định trỏ tới.
  const wsp = P.workspace(root);
  if (wsp.problem) err(`gốc mã: ${wsp.problem}. Các luật theo đơn vị đang không áp cho mã ở đó; sửa workspace.root trong cấu hình dự án.`);
  else if (wsp.declared) ok(`gốc mã nằm ngoài thư mục mở phiên: ${wsp.dir}`);
  for (const p of P.unitParents(root)) if (!fs.existsSync(path.join(wsp.dir, ...p.split('/')))) warn(`thư mục cha ${p}/ khai trong cấu hình nhưng chưa có trên đĩa.`);
  if (cfg.units.parents.includes('.') && !wsp.declared) warn('thư mục cha "." bị bỏ qua: chỉ dùng được khi dự án khai gốc mã riêng (workspace.root).');
  for (const s of cfg.policies.unitSheets) { try { new RegExp(s); } catch { err(`policies.unitSheets có mẫu hỏng: ${s}`); } }

  // 1b. Bố cục, khối, bộ khuôn, settings.json so với tệp tự khai, luật mở rộng của dự án
  if (cfg.presetMissing) err(`bộ khuôn "${cfg.preset}" không có (presets/${cfg.preset}.json): cấu hình dùng như không có bộ khuôn.`);
  const mans = P.moduleManifests(root);
  if (!mans.length) warn('bản harness này chưa có tệp tự khai của khối (bản cũ hơn 1.0.0): không bật tắt được khối, không có lệnh setup. Nâng cấp bằng lệnh install của gói mới.');
  else {
    const em = P.enabledModules(root);
    for (const p of em.problems) err(p);
    ok(`bố cục ${P.isModular(root) ? 'khối (.claude/modules/)' : 'cũ (.claude/modules/)'}; khối đang bật: ${em.enabled.map((m) => `${m.name} ${m.version || ''}`.trim()).join(', ')}${cfg.preset ? `; bộ khuôn ${cfg.preset}` : ''}; ngôn ngữ ${cfg.lang}`);
    try {
      const s = require('./setup').run(root, { check: true });
      if (!s.ok) err(`settings.json, .mcp.json hoặc bảng skill ở .claude/rules lệch với các khối và skill đang cài (hook của khối tắt vẫn chạy, hook của khối bật bị thiếu, hoặc bảng skill cũ). Chạy: node ${P.codeRel(root, 'cli/cli.js')} setup`);
    } catch (e) { warn(`không so được settings.json với tệp tự khai: ${e.message}`); }
  }
  try {
    const W = require('../hooks/wire');
    const ext = W.ruleFiles(root).filter((f) => f.ext);
    const reg = require('../core/rules/registry').create();
    for (const f of ext) { try { reg.add(require(f.file), path.relative(root, f.file), { extension: true }); } catch (e) { err(`luật mở rộng ${path.relative(root, f.file).split(path.sep).join('/')} không nạp được: ${e.message}`); } }
    if (ext.length) ok(`luật mở rộng của dự án: ${reg.ids().join(', ') || '(không luật nào nạp được)'}${reg.ids().length ? ' (kiểu cũ api 0.1, không cần xác nhận; nên chuyển sang khối mở rộng)' : ''}`);
    // Khối mở rộng: khối chưa xác nhận thì không chạy; khối đã sửa hay đã xóa thì bản đã xác nhận vẫn chạy.
    const C = require('../core/extensions/contract');
    const cli = P.codeRel(root, 'cli/cli.js');
    let seen = new Set();
    try { seen = new Set(require('../mcp/mcp-tools').tools().filter((t) => !t.extension).map((t) => t.name)); } catch { /* không nạp được lớp công cụ */ }
    for (const e of W.extensions(root)) {
      for (const p of e.problems) err(`khối mở rộng ${e.key}: ${p}`);
      if (e.state === 'untrusted') warn(`khối mở rộng ${e.key} CHƯA xác nhận nên không chạy. Người dùng xác nhận (trong terminal, ngoài phiên Claude): node ${cli} extension trust ${e.key}`);
      if (e.state === 'changed') warn(`khối mở rộng ${e.key} đã sửa sau lần xác nhận: đang chạy bản đã xác nhận, bản mới chưa có hiệu lực. Xác nhận lại: node ${cli} extension trust ${e.key}`);
      if (e.state === 'removed') warn(`khối mở rộng ${e.key} đã xóa khỏi repo nhưng bản đã xác nhận vẫn chạy. Gỡ hẳn: node ${cli} extension untrust ${e.key}`);
      if (!e.manifest) continue;
      const parts = ['rules', 'tools', 'commands'].map((k) => W.extensionParts(e, k));
      for (const pr of parts) for (const p of pr.problems) err(`khối mở rộng ${e.key}: ${p} (phần này đang KHÔNG chạy)`);
      for (const t of parts[1].items) {
        const n = C.toolName(e.name, t.name);
        if (seen.has(n)) err(`khối mở rộng ${e.key}: công cụ ${n} trùng tên công cụ đã có nên bị bỏ`);
        seen.add(n);
      }
      ok(`khối mở rộng ${e.key}: ${parts[0].items.length} luật, ${parts[1].items.length} công cụ, ${parts[2].items.length} lệnh`);
    }
    const errs = require('../adapters/project/extensions').recentErrors(root, new Date(Date.now() - 24 * 3600 * 1000).toISOString());
    if (errs.length) warn(`khối mở rộng lỗi lúc chạy ${errs.length} lần trong 24 giờ (luật lỗi hay quá giờ thì cho qua): ${[...new Set(errs.map((x) => `${x.key} ${x.rule}`))].join(', ')}. Xem: node ${cli} extension list`);
  } catch (e) { warn(`không kiểm được luật và khối mở rộng: ${e.message}`); }

  // Phần người cài đã sửa trong mã của gói: được phép, nhưng phải thấy được (bản mới của gói gộp với phần này, không đè).
  try {
    const c = require('./upgrade').localChanges(root);
    if (c.known && (c.modified.length || c.blocks.length || c.missing.length)) {
      if (c.modified.length) warn(`mã của gói đã bị sửa ở ${c.modified.length} tệp (${c.modified.slice(0, 5).join(', ')}${c.modified.length > 5 ? ', ...' : ''}). Xem đủ: node .claude/modules/core/cli/cli.js upgrade status. Khi lên bản mới dùng "upgrade preview" để gộp, đừng cài đè.`);
      if (c.blocks.length) ok(`khối tự thêm: ${c.blocks.join(', ')}`);
      if (c.missing.length) err(`thiếu ${c.missing.length} tệp của gói (${c.missing.slice(0, 5).join(', ')}): cài lại bản đang dùng.`);
    }
  } catch (e) { warn(`không so được mã đang cài với dấu của gói: ${e.message}`); }

  // 2. Đơn vị
  const units = P.serviceEntries(root);
  if (!units.length && !cfg.broken) warn('chưa có đơn vị nào: các luật theo đơn vị (đọc tài liệu trước khi sửa, phạm vi theo kế hoạch) chưa có gì để áp. Mở skill onboard.');
  const map = (() => { try { return require('../core/rules/lib/knowledge').loadMap(require('../adapters/project/workspace').create(root)); } catch { return null; } })();
  for (const u of units) {
    const miss = [];
    if (!P.serviceHasRepo(root, u.name)) miss.push('chưa có kho git (harness chỉ coi thư mục có kho git là đơn vị)');
    const docs = map ? (map.unitDocs[u.name] || map.serviceDocs) : ['CLAUDE.md', 'docs/agent/STATUS.md']; // tên logic
    for (const d of docs) if (!fs.existsSync(P.unitPath(root, u.name, d))) miss.push(`thiếu ${P.unitPathRel(root, u.name, d)}`);
    const lay = P.unitLayout(root, u.name);
    // Đơn vị có ghi chép ở CẢ hai chỗ: harness chỉ dùng một chỗ, chỗ kia nằm im và dễ bị tưởng là đang dùng.
    if (lay.layout === 'harness' && [['agent', 'STATUS.md'], ['_generated', 'traceability.md'], ['_generated', 'overview.md']].some((x) => fs.existsSync(path.join(u.dir, 'docs', ...x)))) warn(`đơn vị ${u.name}: ghi chép đang dùng ở ${lay.docsRel}/ nhưng docs/ ở gốc đơn vị cũng có tệp theo khuôn của harness; harness KHÔNG đọc chỗ đó.`); // tên logic
    if (lay.local && fs.existsSync(path.join(u.dir, '.git'))) {
      let ex = '';
      try { ex = fs.readFileSync(path.join(u.dir, '.git', 'info', 'exclude'), 'utf8'); } catch { /* chưa có */ }
      if (!ex.split(/\r?\n/).includes(`/${lay.localRel}/`)) warn(`đơn vị ${u.name}: khai ghi chép tại chỗ nhưng ${lay.localRel}/ chưa nằm trong .git/info/exclude, nên git của đơn vị vẫn thấy nó. Chạy: node .claude/modules/core/cli/new-service.js ${u.name}`);
    }
    if (miss.length) warn(`đơn vị ${u.name} (${P.serviceRel(root, u.name)}): ${miss.join('; ')}. Bổ sung khung: node .claude/modules/core/cli/new-service.js ${u.name}`);
    else ok(`đơn vị ${u.name} (${P.serviceRel(root, u.name)})`);
  }

  // 2b. Tệp sinh cho công cụ từ định nghĩa gốc của đơn vị (<đơn vị>/.harness/ -> <đơn vị>/.claude/)
  try {
    const h = require('../adapters/hosts/sync').syncAll(root, { check: true });
    for (const p of h.problems) warn(`tệp sinh cho công cụ: ${p} Sinh lại: node ${P.codeRel(root, "cli/cli.js")} host-sync`);
    for (const n of h.notes) warn(`tệp sinh cho công cụ: ${n}`);
    if (!h.problems.length) ok('tệp sinh cho công cụ khớp định nghĩa gốc của các đơn vị');
    const hostInv = require('../adapters/hosts/inventory');
    for (const l of hostInv.lostAtRoot(hostInv.inventory(root))) warn(`.claude/ của team: ${l}. Xem: node ${P.codeRel(root, 'cli/cli.js')} host-inventory`);
  } catch (e) { warn(`không kiểm được tệp sinh cho công cụ: ${e.message}`); }

  // 3. Bảng việc -> skill, sổ phiên, hook của sổ phiên
  if (!map) (fs.existsSync(P.skillsMapPath(root)) && cfg.skillsRaw === null ? err : warn)('chưa có bảng việc -> skill (phần skills của cấu hình): hook chặn theo skill KHÔNG chặn gì.');
  else {
    let probs = [];
    try { probs = require('../hooks/ledger-lib').health(root); } catch (e) { probs = [`không kiểm được sổ phiên: ${e.message}`]; }
    for (const p of probs) err(p);
    if (!probs.length) ok(`bảng việc -> skill (${map.mode}): ${map.tools.length} công cụ, ${map.files.length} mẫu tệp; skill tổng quát "${map.overview || '(không có)'}"; trước khi sửa một đơn vị phải đọc ${map.serviceDocs.join(', ') || '(không gì)'}`);
  }

  // 4. Cổng duyệt: tệp đủ, khớp dấu vân tay, settings.json trỏ tới tệp thật
  try {
    const h = require('../gate/gate-health').health(root);
    for (const p of h.problems || []) err(`cổng duyệt: ${p}`);
    if (!(h.problems || []).length) ok('cổng duyệt: tệp đủ, khớp MANIFEST, hook trỏ tới tệp thật');
  } catch (e) { err(`không kiểm được cổng duyệt: ${e.message}`); }

  // 5. Máy chủ MCP của harness khai ở gốc: mỗi khối đang bật một máy chủ
  try {
    const mcp = JSON.parse(fs.readFileSync(path.join(root, '.mcp.json'), 'utf8'));
    const have = (mcp && mcp.mcpServers) || {};
    const want = P.mcpServers(root);
    const miss = want.filter((s) => !have[s.name]);
    if (!miss.length) ok(`.mcp.json khai ${want.length} máy chủ của harness: ${want.map((s) => s.name).join(', ')}`);
    else err(`.mcp.json thiếu máy chủ của harness: ${miss.map((s) => s.name).join(', ')}; công cụ của khối đó không có trong phiên (chạy: node ${P.codeRel(root, 'cli/cli.js')} setup, rồi gõ /mcp).`);
    if (have[P.MCP_LEGACY] && want.length) warn(`.mcp.json còn máy chủ cũ ${P.MCP_LEGACY} (cả bộ công cụ một cục) bên cạnh các máy chủ theo khối: công cụ bị khai hai lần. Chạy: node ${P.codeRel(root, 'cli/cli.js')} setup (gỡ mục cũ nếu nó là của harness).`);
  } catch { err('chưa có .mcp.json ở gốc dự án, hoặc tệp hỏng: phiên không có công cụ của harness (mở một phiên mới ở gốc để harness tự tạo, rồi gõ /mcp).'); }

  // 5b. Cổng MCP: máy chủ đã khai, đã xác nhận chưa, đang chạy hay hỏng.
  try {
    const b = require('../hooks/wire').mcpBrief(root);
    const st = require('../adapters/project/mcp-servers').status(root);
    if (st.list.length || st.problems.length) {
      for (const l of b.lines) warn(`máy chủ MCP: ${l}. Xem: node ${b.cli} mcp list`);
      const good = st.list.filter((s) => s.state === 'trusted' && !b.lines.some((l) => l.startsWith(`${s.name} `)));
      if (good.length) ok(`máy chủ MCP sau cổng của harness: ${good.map((s) => `${s.name} (${s.decl.type})`).join(', ')}`);
    }
  } catch { /* cổng MCP không đọc được: không làm hỏng phép kiểm khác */ }

  // 6. Git hook (cổng dựng lại sau commit, quét từ cấm)
  try {
    const G = require('./install-git-hooks');
    const repos = [root, ...units.filter((u) => fs.existsSync(path.join(u.dir, '.git'))).map((u) => u.dir)];
    for (const r of repos) {
      if (!fs.existsSync(path.join(r, '.git'))) continue;
      const a = G.install(r, { check: true, bsn: root });
      const b = G.installBan(r, { check: true, bsn: root });
      const name = path.relative(root, r).split(path.sep).join('/') || '(gốc)';
      const said = { missing: 'chưa cài', foreign: 'đã có hook khác (không ghi đè)' };
      const bad = [
        ...(said[a.status] ? [`post-commit (cổng dựng lại sau commit) ${said[a.status]}`] : []),
        ...Object.entries(b.hooks || {}).filter(([, s]) => said[s]).map(([h, s]) => `${h} ${said[s]}`),
      ];
      if (bad.length) warn(`git hook của ${name}: ${bad.join('; ')}. Cài: node .claude/modules/core/cli/install-git-hooks.js ${name === '(gốc)' ? '.' : name} (harness cũng tự cài khi mở phiên).`);
    }
  } catch { /* không có git: bỏ qua */ }

  const bad = out.filter((l) => l.startsWith('LỖI')).length;
  out.push(bad ? `${bad} LỖI: harness chưa chạy đúng trên dự án này.` : 'Không có LỖI.');
  return { text: out.join('\n'), errors: bad };
}

module.exports = { run };
