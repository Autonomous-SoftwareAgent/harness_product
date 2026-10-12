'use strict';
// spec: HOOK-S-010
// BỘ CÀI (S-064): sinh phần của harness trong .claude/settings.json và .mcp.json từ tệp tự khai của các khối đang bật.
//   - Hook: mỗi mục `hooks` của một khối thành một nhóm { matcher?, hooks: [{ type, command, timeout, statusMessage? }] }, xếp theo `order`
//     trong từng sự kiện; lệnh neo vào gốc dự án bằng "$CLAUDE_PROJECT_DIR/..." (S-027) và trỏ tới đường dẫn THẬT theo bố cục đang dùng.
//   - Luật mở rộng của dự án (<thư mục dự án>/rules/) và luật của khối mở rộng đã xác nhận (S-065): một nhóm hooks/project-rules.js <loại>
//     cho mỗi loại sự kiện có luật nghe.
//   - Máy chủ MCP của lõi: mục trong .mcp.json, tên trong enabledMcpjsonServers, quyền "mcp__<tên>" trong permissions.allow.
// Phần người dùng tự thêm được giữ nguyên: nhóm hook có lệnh không trỏ vào mã harness, máy chủ MCP khác, quyền khác, mọi khóa khác.
// Không ghi gì khi kết quả không đổi. Lệnh: node <harness>/cli/cli.js setup [--check | --dry-run].
const fs = require('node:fs');
const path = require('node:path');
const P = require('../gate/gate-paths');

const DEFAULT_MATCHER = 'Write|Edit|NotebookEdit|Bash';
const EVENTS = ['PreToolUse', 'PostToolUse', 'Stop', 'UserPromptSubmit', 'SessionStart'];
const KIND_EVENT = { 'before-action': 'PreToolUse', 'after-action': 'PostToolUse', 'turn-end': 'Stop', 'user-prompt': 'UserPromptSubmit', 'session-start': 'SessionStart' };
// Lệnh hook là của harness khi nó chạy một tệp trong thư mục mã của harness (bố cục cũ hoặc bố cục khối).
const isHarnessCommand = (line) => typeof line === 'string' && /\/\.claude\/(plugin|modules)\//.test(line.replace(/\\/g, '/'));
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return undefined; } };

function command(root, file, args) {
  return `node "$CLAUDE_PROJECT_DIR/${P.codeRel(root, file)}"${args ? ` ${args}` : ''}`;
}

// Các nhóm hook của harness theo sự kiện: { PreToolUse: [nhóm...], ... }.
function harnessHooks(root) {
  const byEvent = {};
  const add = (event, order, group) => { (byEvent[event] = byEvent[event] || []).push({ order, group }); };
  for (const m of P.enabledModules(root).enabled) {
    for (const h of m.hooks || []) {
      if (!EVENTS.includes(h.event) || typeof h.file !== 'string') continue;
      const hook = { type: 'command', command: command(root, h.file, h.args), timeout: h.timeout || 10 };
      if (h.statusMessage) hook.statusMessage = h.statusMessage;
      add(h.event, Number.isFinite(h.order) ? h.order : 500, h.matcher ? { matcher: h.matcher, hooks: [hook] } : { hooks: [hook] });
    }
  }
  // Luật mở rộng của dự án: một nhóm cho mỗi loại sự kiện có ít nhất một luật nghe (đọc khai `on` của luật; luật hỏng thì bỏ qua và báo ở doctor).
  const kinds = new Set();
  let matchers = [];
  try {
    const wire = require('../hooks/wire');
    for (const f of wire.ruleFiles(root).filter((x) => x.ext)) {
      try {
        const r = require(f.file);
        for (const k of [].concat(r.on || [])) kinds.add(k);
        if (typeof r.matcher === 'string') matchers.push(r.matcher);
      } catch { /* luật hỏng: doctor báo */ }
    }
    // Khối mở rộng (S-065): chỉ đọc bản ĐÃ XÁC NHẬN (mã chưa xác nhận không được nạp, kể cả để đọc khai báo).
    for (const ext of wire.extensions(root).filter((x) => x.manifest)) {
      for (const r of wire.extensionParts(ext, 'rules').items) {
        for (const k of r.on) kinds.add(k);
        matchers.push(r.matcher || DEFAULT_MATCHER); // luật không khai matcher vẫn phải nhận các lần ghi tệp
      }
    }
  } catch { /* chưa có phần lắp ráp hook */ }
  matchers = [...new Set(matchers.flatMap((m) => m.split('|')))];
  for (const k of [...kinds].sort()) {
    const event = KIND_EVENT[k];
    if (!event) continue;
    const hook = { type: 'command', command: command(root, 'hooks/project-rules.js', k), timeout: 10 };
    add(event, 900, event === 'PreToolUse' ? { matcher: matchers.length ? matchers.join('|') : DEFAULT_MATCHER, hooks: [hook] } : { hooks: [hook] });
  }
  const out = {};
  for (const [e, list] of Object.entries(byEvent)) out[e] = list.map((x, i) => ({ ...x, i })).sort((a, b) => a.order - b.order || a.i - b.i).map((x) => x.group);
  return out;
}

const coreServer = (root) => { const c = P.enabledModules(root).enabled.find((m) => m.name === 'core'); return c && c.mcpServer; };

// settings.json mới từ settings hiện có (giữ phần của người dùng).
function buildSettings(root, current) {
  const s = current && typeof current === 'object' ? JSON.parse(JSON.stringify(current)) : {};
  const mine = harnessHooks(root);
  const hooks = s.hooks && typeof s.hooks === 'object' ? s.hooks : {};
  const user = {};
  for (const [e, groups] of Object.entries(hooks)) {
    const kept = (Array.isArray(groups) ? groups : []).map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !isHarnessCommand(h.command)) })).filter((g) => g.hooks.length);
    if (kept.length) user[e] = kept;
  }
  const order = [...Object.keys(hooks), ...EVENTS, ...Object.keys(user)].filter((e, i, a) => a.indexOf(e) === i);
  const next = {};
  for (const e of order) { const g = [...(mine[e] || []), ...(user[e] || [])]; if (g.length) next[e] = g; }
  const srv = coreServer(root);
  const core = P.enabledModules(root).enabled.find((m) => m.name === 'core');
  if (srv) {
    s.enabledMcpjsonServers = [...new Set([...(Array.isArray(s.enabledMcpjsonServers) ? s.enabledMcpjsonServers : []), srv.name])];
  }
  const allow = (core && core.permissions && core.permissions.allow) || [];
  if (allow.length) {
    s.permissions = s.permissions && typeof s.permissions === 'object' ? s.permissions : {};
    s.permissions.allow = [...new Set([...(Array.isArray(s.permissions.allow) ? s.permissions.allow : []), ...allow])];
  }
  // Khóa `hooks` giữ đúng chỗ của nó trong tệp (để tệp không đổi khi nội dung không đổi).
  if (Object.keys(next).length) s.hooks = next; else delete s.hooks;
  return s;
}

function buildMcp(root, current) {
  const m = current && typeof current === 'object' ? JSON.parse(JSON.stringify(current)) : {};
  const srv = coreServer(root);
  if (!srv) return m;
  m.mcpServers = m.mcpServers && typeof m.mcpServers === 'object' ? m.mcpServers : {};
  m.mcpServers[srv.name] = { ...(m.mcpServers[srv.name] || {}), command: 'node', args: [P.codeRel(root, srv.file)] };
  return m;
}

const text = (v) => `${JSON.stringify(v, null, 2)}\n`;

function run(root, { check = false, dryRun = false } = {}) {
  const settingsFile = path.join(root, '.claude', 'settings.json');
  const mcpFile = path.join(root, '.mcp.json');
  const { problems } = P.enabledModules(root);
  if (!P.moduleManifests(root).length) return { ok: false, text: 'Không có tệp tự khai của khối nào (modules/): bản harness này cũ hơn bộ cài. Cập nhật harness trước.' };
  const curS = readJson(settingsFile);
  const curM = readJson(mcpFile);
  if (fs.existsSync(settingsFile) && curS === undefined) return { ok: false, text: `.claude/settings.json không đọc được (JSON hỏng): sửa tay trước, bộ cài không ghi đè tệp hỏng.` };
  if (fs.existsSync(mcpFile) && curM === undefined) return { ok: false, text: '.mcp.json không đọc được (JSON hỏng): sửa tay trước, bộ cài không ghi đè tệp hỏng.' };
  const outs = [
    { file: settingsFile, rel: '.claude/settings.json', now: fs.existsSync(settingsFile) ? fs.readFileSync(settingsFile, 'utf8') : '', next: text(buildSettings(root, curS)) },
    { file: mcpFile, rel: '.mcp.json', now: fs.existsSync(mcpFile) ? fs.readFileSync(mcpFile, 'utf8') : '', next: text(buildMcp(root, curM)) },
  ];
  const changed = outs.filter((o) => o.now.replace(/\r\n/g, '\n') !== o.next);
  const lines = [];
  for (const p of problems) lines.push(`CẢNH BÁO: ${p}`);
  const on = P.enabledModules(root).enabled.map((m) => m.name);
  lines.push(`Khối đang bật: ${on.join(', ')}.`);
  if (!changed.length) { lines.push('settings.json và .mcp.json đã đúng với các khối đang bật; không đổi gì.'); return { ok: true, changed: [], text: lines.join('\n') }; }
  if (check) { lines.push(`LỆCH: ${changed.map((o) => o.rel).join(', ')} chưa đúng với các khối đang bật. Chạy: node ${P.codeRel(root, 'cli/cli.js')} setup`); return { ok: false, changed: changed.map((o) => o.rel), text: lines.join('\n') }; }
  if (dryRun) { lines.push(`Sẽ ghi: ${changed.map((o) => o.rel).join(', ')}.`); return { ok: true, changed: changed.map((o) => o.rel), text: lines.join('\n') }; }
  for (const o of changed) { fs.mkdirSync(path.dirname(o.file), { recursive: true }); fs.writeFileSync(o.file, o.next); }
  lines.push(`Đã ghi: ${changed.map((o) => o.rel).join(', ')}. Claude Code nạp hook mới ở phiên kế tiếp; máy chủ MCP mới thì gõ /mcp để nối lại.`);
  return { ok: true, changed: changed.map((o) => o.rel), text: lines.join('\n') };
}

module.exports = { run, buildSettings, buildMcp, harnessHooks, isHarnessCommand };
