'use strict';
// spec: HOOK-S-010
// KIỂM KÊ <đơn vị>/.claude/ của từng đơn vị (chỉ ĐỌC): team đã có gì, và khi phiên mở ở gốc dự án thì thứ nào dùng được, thứ nào không.
// Phân loại theo phép đo bằng phiên claude thật (bản 2.1.299, Windows, haiku, một lần, phiên mở ở gốc, đọc một tệp trong đơn vị):
//   skill, rule, CLAUDE.md ......... nạp muộn (sau khi phiên chạm tệp trong đơn vị): DÙNG ĐƯỢC
//   hook trong settings.json ....... KHÔNG chạy
//   permissions trong settings.json  KHÔNG áp dụng (Read bị deny vẫn đọc được)
//   commands, agents ............... KHÔNG nạp (không hiện trong danh sách lệnh, kiểu agent)
//   .mcp.json của đơn vị ........... KHÔNG nạp (không có công cụ của máy chủ đó)
//   env trong settings.json ........ CHƯA ĐO
// Phiên mở NGAY trong đơn vị thì mọi thứ trên nạp bình thường (nhưng khi đó không có hook của harness).
const fs = require('node:fs');
const path = require('node:path');
const P = require('../../gate/gate-paths');
const claude = require('./claude');

const readText = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } };
const readJson = (f) => { const t = readText(f); if (t === null) return null; try { return JSON.parse(t); } catch { return { broken: true }; } };
const listDir = (d) => { try { return fs.readdirSync(d, { withFileTypes: true }); } catch { return []; } };

function settingsInfo(file) {
  const j = readJson(file);
  if (j === null) return null;
  if (j.broken) return { broken: true, hooks: {}, permissions: { allow: 0, deny: 0, ask: 0 }, env: [] };
  const hooks = {};
  for (const [e, groups] of Object.entries(j.hooks || {})) hooks[e] = (Array.isArray(groups) ? groups : []).reduce((n, g) => n + ((g && g.hooks) || []).length, 0);
  const p = j.permissions || {};
  const len = (a) => (Array.isArray(a) ? a.length : 0);
  return { broken: false, hooks, permissions: { allow: len(p.allow), deny: len(p.deny), ask: len(p.ask) }, env: Object.keys(j.env || {}) };
}

// Kiểm kê một đơn vị. Tệp có dấu của bộ chuyển Claude là đầu ra của harness: đếm riêng, không tính là của team.
function unitInventory(root, { name, dir }) {
  const cl = path.join(dir, '.claude');
  const exists = fs.existsSync(cl);
  const split = (files) => {
    const native = []; const generated = [];
    for (const f of files) (claude.read(readText(f.abs) || '') ? generated : native).push(f.name);
    return { native: native.sort(), generated: generated.sort() };
  };
  const skills = split(listDir(path.join(cl, 'skills')).filter((d) => d.isDirectory() && fs.existsSync(path.join(cl, 'skills', d.name, 'SKILL.md'))).map((d) => ({ name: d.name, abs: path.join(cl, 'skills', d.name, 'SKILL.md') })));
  const rules = split(listDir(path.join(cl, 'rules')).filter((f) => f.isFile() && f.name.endsWith('.md')).map((f) => ({ name: f.name, abs: path.join(cl, 'rules', f.name) })));
  const names = (sub) => listDir(path.join(cl, sub)).filter((f) => f.isFile() && f.name.endsWith('.md')).map((f) => f.name.replace(/\.md$/, '')).sort();
  const mcp = readJson(path.join(dir, '.mcp.json'));
  const own = new Set(P.unitSkills(root, name));
  const rootSkills = new Set((() => { try { return fs.readdirSync(P.skillsDir(root)); } catch { return []; } })());
  return {
    name, dir, exists, skills, rules,
    commands: names('commands'), agents: names('agents'),
    settings: settingsInfo(path.join(cl, 'settings.json')),
    settingsLocal: settingsInfo(path.join(cl, 'settings.local.json')),
    mcp: mcp && !mcp.broken ? Object.keys(mcp.mcpServers || {}).sort() : (mcp ? ['(tệp hỏng)'] : []),
    sameAsHarness: skills.native.filter((n) => own.has(n)),
    sameAsProject: skills.native.filter((n) => rootSkills.has(n)),
  };
}

function inventory(root) {
  return P.serviceEntries(root).map((e) => unitInventory(root, e));
}

const list = (a) => (a.length ? a.join(', ') : 'không');
const hookCount = (s) => (s ? Object.values(s.hooks).reduce((n, x) => n + x, 0) : 0);

// Chữ cho người đọc và cho agent. Chỉ nêu đơn vị có gì đó của team; đơn vị trống thì gộp thành một dòng.
function render(inv) {
  const lines = [];
  const empty = [];
  for (const u of inv) {
    const hooks = hookCount(u.settings) + hookCount(u.settingsLocal);
    const perm = (u.settings ? u.settings.permissions.allow + u.settings.permissions.deny + u.settings.permissions.ask : 0) + (u.settingsLocal ? u.settingsLocal.permissions.allow + u.settingsLocal.permissions.deny + u.settingsLocal.permissions.ask : 0);
    const env = [...(u.settings ? u.settings.env : []), ...(u.settingsLocal ? u.settingsLocal.env : [])];
    const mine = u.skills.native.length + u.rules.native.length + u.commands.length + u.agents.length + hooks + perm + env.length + u.mcp.length;
    if (!mine && !u.skills.generated.length && !u.rules.generated.length) { empty.push(u.name); continue; }
    lines.push(`Đơn vị ${u.name}:`);
    if (u.skills.native.length) lines.push(`  skill của team ${u.skills.native.length} (${list(u.skills.native)}): DÙNG ĐƯỢC khi phiên mở ở gốc (nạp muộn, sau khi chạm tệp trong đơn vị)`);
    if (u.rules.native.length) lines.push(`  rule của team ${u.rules.native.length} (${list(u.rules.native)}): DÙNG ĐƯỢC khi mở ở gốc (nạp muộn)`);
    if (u.commands.length) lines.push(`  lệnh của team ${u.commands.length} (${list(u.commands)}): KHÔNG nạp khi mở ở gốc (đã đo)`);
    if (u.agents.length) lines.push(`  agent của team ${u.agents.length} (${list(u.agents)}): KHÔNG nạp khi mở ở gốc (đã đo)`);
    if (hooks) lines.push(`  hook của team ${hooks}: KHÔNG CHẠY khi mở ở gốc (đã đo). Chọn: mở phiên trong đơn vị khi cần chúng, hoặc chuyển thành luật ở .harness/ của đơn vị`);
    if (perm) lines.push(`  quyền (allow/deny/ask) của team ${perm}: KHÔNG áp dụng khi mở ở gốc (đã đo: tệp bị deny vẫn đọc được)`);
    if (env.length) lines.push(`  biến môi trường trong settings ${env.length} (${list(env)}): CHƯA ĐO khi mở ở gốc`);
    if (u.mcp.length) lines.push(`  máy chủ MCP riêng của đơn vị ${u.mcp.length} (${list(u.mcp)}): KHÔNG nạp khi mở ở gốc (đã đo)`);
    if (u.skills.generated.length || u.rules.generated.length) lines.push(`  do harness sinh: skill ${list(u.skills.generated)}; rule ${list(u.rules.generated)}`);
    if (u.sameAsHarness.length) lines.push(`  TRÙNG TÊN: skill ${list(u.sameAsHarness)} có cả ở .harness/skills/ và ở .claude/ của team: bản của team được dùng, bản của harness không được sinh`);
    if (u.sameAsProject.length) lines.push(`  TRÙNG TÊN với skill chung của dự án (.claude/skills/ ở gốc): ${list(u.sameAsProject)}`);
  }
  if (empty.length) lines.push(`Đơn vị chưa có gì của team ở .claude/: ${empty.join(', ')}`);
  if (!inv.length) lines.push('Chưa có đơn vị nào theo cấu hình dự án.');
  return lines.join('\n');
}

// Những thứ của team sẽ KHÔNG chạy khi phiên mở ở gốc dự án (theo phép đo ở đầu tệp): để doctor và onboard báo trước, không để mất âm thầm.
function lostAtRoot(inv) {
  const out = [];
  for (const u of inv) {
    const hooks = hookCount(u.settings) + hookCount(u.settingsLocal);
    if (hooks) out.push(`đơn vị ${u.name} có ${hooks} hook của team (settings.json) sẽ KHÔNG chạy khi mở phiên ở gốc dự án`);
    const perm = [u.settings, u.settingsLocal].filter(Boolean).reduce((n, s) => n + s.permissions.allow + s.permissions.deny + s.permissions.ask, 0);
    if (perm) out.push(`đơn vị ${u.name} có ${perm} quyền (allow/deny/ask) của team sẽ KHÔNG áp dụng khi mở phiên ở gốc dự án`);
    if (u.commands.length || u.agents.length) out.push(`đơn vị ${u.name} có ${u.commands.length} lệnh và ${u.agents.length} agent của team không nạp khi mở phiên ở gốc dự án`);
  }
  return out;
}

module.exports = { inventory, unitInventory, render, settingsInfo, lostAtRoot };
