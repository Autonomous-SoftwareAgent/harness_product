'use strict';
// spec: HOOK-S-009
// spec: HOOK-S-010
// KIỂM SỨC KHỎE của harness trên MỘT dự án bất kỳ (S-063): cấu hình dự án, đơn vị, bảng việc -> skill, cổng duyệt, máy chủ MCP, git hook.
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
  else if (!cfg.exists) warn('chưa có .claude/project/project.json: harness dùng bố cục cũ (đơn vị trong system_service/). Dự án mới: mở skill onboard.');
  else ok(`cấu hình dự án "${cfg.name}": thư mục cha ${cfg.units.parents.length ? cfg.units.parents.map((p) => `${p}/`).join(', ') : '(không có)'}; luật riêng: ${Object.entries(cfg.policies).filter(([, v]) => v === true || (Array.isArray(v) && v.length)).map(([k]) => k).join(', ') || 'không'}`);
  for (const p of cfg.units.parents) if (!fs.existsSync(path.join(root, ...p.split('/')))) warn(`thư mục cha ${p}/ khai trong cấu hình nhưng chưa có trên đĩa.`);
  for (const s of cfg.policies.unitSheets) { try { new RegExp(s); } catch { err(`policies.unitSheets có mẫu hỏng: ${s}`); } }

  // 1b. Bố cục, khối, bộ khuôn, settings.json so với tệp tự khai, luật mở rộng của dự án (S-064)
  if (cfg.presetMissing) err(`bộ khuôn "${cfg.preset}" không có (presets/${cfg.preset}.json): cấu hình dùng như không có bộ khuôn.`);
  const mans = P.moduleManifests(root);
  if (!mans.length) warn('bản harness này chưa có tệp tự khai của khối (bản cũ hơn S-064): không bật tắt được khối, không có lệnh setup. Nâng cấp bằng lệnh install của gói mới.');
  else {
    const em = P.enabledModules(root);
    for (const p of em.problems) err(p);
    ok(`bố cục ${P.isModular(root) ? 'khối (.claude/modules/)' : 'cũ (.claude/modules/)'}; khối đang bật: ${em.enabled.map((m) => `${m.name} ${m.version || ''}`.trim()).join(', ')}${cfg.preset ? `; bộ khuôn ${cfg.preset}` : ''}; ngôn ngữ ${cfg.lang}`);
    try {
      const s = require('./setup').run(root, { check: true });
      if (!s.ok) err(`settings.json hoặc .mcp.json lệch với các khối đang bật (hook của khối tắt vẫn chạy, hoặc hook của khối bật bị thiếu). Chạy: node ${P.codeRel(root, 'cli/cli.js')} setup`);
    } catch (e) { warn(`không so được settings.json với tệp tự khai: ${e.message}`); }
  }
  try {
    const W = require('../hooks/wire');
    const ext = W.ruleFiles(root).filter((f) => f.ext);
    const reg = require('../core/rules/registry').create();
    for (const f of ext) { try { reg.add(require(f.file), path.relative(root, f.file), { extension: true }); } catch (e) { err(`luật mở rộng ${path.relative(root, f.file).split(path.sep).join('/')} không nạp được: ${e.message}`); } }
    if (ext.length) ok(`luật mở rộng của dự án: ${reg.ids().join(', ') || '(không luật nào nạp được)'}${reg.ids().length ? ' (kiểu cũ api 0.1, không cần xác nhận; nên chuyển sang khối mở rộng)' : ''}`);
    // Khối mở rộng (S-065): khối chưa xác nhận thì không chạy; khối đã sửa hay đã xóa thì bản đã xác nhận vẫn chạy.
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

  // 2. Đơn vị
  const units = P.serviceEntries(root);
  if (!units.length && !cfg.broken) warn('chưa có đơn vị nào: các luật theo đơn vị (đọc tài liệu trước khi sửa, phạm vi theo kế hoạch) chưa có gì để áp. Mở skill onboard.');
  const map = (() => { try { return require('../core/rules/lib/knowledge').loadMap(require('../adapters/project/workspace').create(root)); } catch { return null; } })();
  for (const u of units) {
    const miss = [];
    if (!P.serviceHasRepo(root, u.name)) miss.push('chưa có kho git (harness chỉ coi thư mục có kho git là đơn vị)');
    const docs = map ? (map.unitDocs[u.name] || map.serviceDocs) : ['CLAUDE.md', 'docs/agent/STATUS.md'];
    for (const d of docs) if (!fs.existsSync(path.join(u.dir, ...d.split('/')))) miss.push(`thiếu ${d}`);
    if (miss.length) warn(`đơn vị ${u.name} (${P.serviceRel(root, u.name)}): ${miss.join('; ')}. Bổ sung khung: node .claude/modules/core/cli/new-service.js ${u.name}`);
    else ok(`đơn vị ${u.name} (${P.serviceRel(root, u.name)})`);
  }

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

  // 5. Máy chủ MCP bsn-docs khai ở gốc
  try {
    const mcp = JSON.parse(fs.readFileSync(path.join(root, '.mcp.json'), 'utf8'));
    if (mcp && mcp.mcpServers && mcp.mcpServers['bsn-docs']) ok('.mcp.json khai máy chủ bsn-docs');
    else err('.mcp.json thiếu mục bsn-docs: phiên không có công cụ của harness (mở một phiên mới ở gốc để harness tự thêm, rồi gõ /mcp).');
  } catch { err('chưa có .mcp.json ở gốc dự án, hoặc tệp hỏng: phiên không có công cụ của harness (mở một phiên mới ở gốc để harness tự tạo, rồi gõ /mcp).'); }

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
