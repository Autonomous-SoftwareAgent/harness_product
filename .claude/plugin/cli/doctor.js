'use strict';
// spec: HOOK-S-009
// KIỂM SỨC KHỎE của harness trên MỘT dự án bất kỳ (S-063): cấu hình dự án, đơn vị, bảng việc -> skill, cổng duyệt, máy chủ MCP, git hook.
// Chỉ ĐỌC; không sửa gì. Mỗi dòng bắt đầu bằng LỖI (harness đang không chặn hay không chạy được), CẢNH BÁO (thiếu phần nên có) hoặc OK.
//   node .claude/plugin/cli/cli.js doctor      thoát mã 1 khi có LỖI
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
  if (cfg.broken) err('.claude/plugin/project.json không đọc được (JSON hỏng): harness coi như dự án không có đơn vị nào.');
  else if (!cfg.exists) warn('chưa có .claude/plugin/project.json: harness dùng bố cục cũ (đơn vị trong system_service/). Dự án mới: mở skill onboard.');
  else ok(`cấu hình dự án "${cfg.name}": thư mục cha ${cfg.units.parents.length ? cfg.units.parents.map((p) => `${p}/`).join(', ') : '(không có)'}; luật riêng: ${Object.entries(cfg.policies).filter(([, v]) => v === true || (Array.isArray(v) && v.length)).map(([k]) => k).join(', ') || 'không'}`);
  for (const p of cfg.units.parents) if (!fs.existsSync(path.join(root, ...p.split('/')))) warn(`thư mục cha ${p}/ khai trong cấu hình nhưng chưa có trên đĩa.`);
  for (const s of cfg.policies.unitSheets) { try { new RegExp(s); } catch { err(`policies.unitSheets có mẫu hỏng: ${s}`); } }

  // 2. Đơn vị
  const units = P.serviceEntries(root);
  if (!units.length && !cfg.broken) warn('chưa có đơn vị nào: các luật theo đơn vị (đọc tài liệu trước khi sửa, phạm vi theo kế hoạch) chưa có gì để áp. Mở skill onboard.');
  const map = (() => { try { return require('../core/rules/lib/knowledge').loadMap(require('../adapters/project/workspace').create(root)); } catch { return null; } })();
  for (const u of units) {
    const miss = [];
    if (!P.serviceHasRepo(root, u.name)) miss.push('chưa có kho git (harness chỉ coi thư mục có kho git là đơn vị)');
    const docs = map ? (map.unitDocs[u.name] || map.serviceDocs) : ['CLAUDE.md', 'docs/agent/STATUS.md'];
    for (const d of docs) if (!fs.existsSync(path.join(u.dir, ...d.split('/')))) miss.push(`thiếu ${d}`);
    if (miss.length) warn(`đơn vị ${u.name} (${P.serviceRel(root, u.name)}): ${miss.join('; ')}. Bổ sung khung: node .claude/plugin/cli/new-service.js ${u.name}`);
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
      if (bad.length) warn(`git hook của ${name}: ${bad.join('; ')}. Cài: node .claude/plugin/cli/install-git-hooks.js ${name === '(gốc)' ? '.' : name} (harness cũng tự cài khi mở phiên).`);
    }
  } catch { /* không có git: bỏ qua */ }

  const bad = out.filter((l) => l.startsWith('LỖI')).length;
  out.push(bad ? `${bad} LỖI: harness chưa chạy đúng trên dự án này.` : 'Không có LỖI.');
  return { text: out.join('\n'), errors: bad };
}

module.exports = { run };
