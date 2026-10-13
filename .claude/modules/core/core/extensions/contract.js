'use strict';
// spec: HOOK-S-011
// HỢP ĐỒNG CỦA KHỐI MỞ RỘNG, bản 1.0. Thuần: kiểm khai báo, dựng quyết định, gộp quyết định. Việc tìm khối trên đĩa, bản đã
// xác nhận và cửa sổ nhìn là của bộ chuyển (adapters/project/extensions.js); chạy luật kèm giới hạn thời gian là của cửa vào (hooks/wire.js).
//
// module.json: { "name", "api": "1.0", "scope": "project" | "unit", "rules": [tệp], "tools": [tệp], "commands": [tệp], "timeout": giây }
// Luật:   { id, on: [loại sự kiện], matcher?, run(ctx) -> quyết định hoặc null }
//         khối của MỘT đơn vị chỉ nghe before-action, after-action, và chỉ khi việc đó đụng tới đơn vị của nó.
// Công cụ: { name, description, inputSchema?, write?, run(args, ctx) -> chữ }   tên trên máy chủ: <tên khối>_<name>
// Lệnh:   { name, description, run(argv, ctx) -> chữ }
// ctx của luật: { api, kind, scope, unit, session, agent, prompt, reply, source, action: { type, tool, file, writes, text, command, server, name, args },
//                 fs: { read, exists, list }, git: { isCommitted }, block(lý do), ask(lý do), note(lời), warn(lời) }
//   Đường dẫn trong ctx tính từ thư mục của khối (đơn vị, hoặc gốc dự án), kiểu posix. Không có "cho qua": khối chỉ chặn thêm được.
const { KINDS, checkDecision } = require('../../ports/events');

const EXT_API = '1.0';
const UNIT_KINDS = ['before-action', 'after-action'];
// Công cụ một luật before-action nhận khi nó không khai matcher: các công cụ ghi. Bộ cài luôn khai nhóm hook cho đúng các công cụ này.
const DEFAULT_MATCHER = 'Write|Edit|NotebookEdit|Bash';
const NAME_RE = /^[a-z][a-z0-9-]{0,40}$/;
const TOOL_RE = /^[a-z][a-z0-9_]{0,40}$/;
const DEFAULT_TIMEOUT = 2;
const MAX_TIMEOUT = 5;

function apiCompatible(want, have = EXT_API) {
  const m = /^(\d+)\.(\d+)$/.exec(String(want || ''));
  const [hm, hn] = have.split('.').map(Number);
  return Boolean(m) && Number(m[1]) === hm && Number(m[2]) <= hn;
}

// Đường dẫn tệp trong khối: tương đối, kiểu posix, không thoát ra ngoài, là tệp .js.
const cleanFile = (f) => (typeof f === 'string' && /\.js$/.test(f) && !/^[\\/]|^[A-Za-z]:/.test(f) && !f.replace(/\\/g, '/').split('/').some((x) => x === '..' || x === '') ? f.replace(/\\/g, '/') : '');

// Kiểm module.json. `expect`: { scope, name } theo chỗ đặt khối. Trả { manifest, problems }; manifest null khi không dùng được.
function checkManifest(raw, expect) {
  const problems = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { manifest: null, problems: ['module.json không đọc được hoặc không phải một vật JSON'] };
  if (!apiCompatible(raw.api)) problems.push(`khai giao diện ${raw.api ? `"${raw.api}"` : '(không khai)'}; harness đang ở bản ${EXT_API}: khai "api": "${EXT_API}"`);
  if (raw.scope !== undefined && raw.scope !== expect.scope) problems.push(`khai scope "${raw.scope}" nhưng nằm ở chỗ của khối ${expect.scope === 'unit' ? 'một đơn vị (<đơn vị>/.harness/)' : 'cả dự án (extensions/<tên>/)'}`);
  if (raw.name !== undefined && raw.name !== expect.name) problems.push(`khai name "${raw.name}" nhưng tên theo chỗ đặt là "${expect.name}"`);
  if (!NAME_RE.test(expect.name)) problems.push(`tên khối "${expect.name}" không hợp lệ (chữ thường, số, gạch ngang)`);
  const lists = {};
  for (const k of ['rules', 'tools', 'commands']) {
    const v = raw[k] === undefined ? [] : raw[k];
    if (!Array.isArray(v)) { problems.push(`${k} phải là danh sách tệp`); lists[k] = []; continue; }
    lists[k] = [];
    for (const f of v) { const c = cleanFile(f); if (c) lists[k].push(c); else problems.push(`${k}: "${f}" không phải đường dẫn tệp .js nằm trong khối`); }
  }
  if (!lists.rules.length && !lists.tools.length && !lists.commands.length) problems.push('khối không khai luật, công cụ hay lệnh nào');
  let timeout = DEFAULT_TIMEOUT;
  if (raw.timeout !== undefined) {
    if (typeof raw.timeout === 'number' && raw.timeout > 0 && raw.timeout <= MAX_TIMEOUT) timeout = raw.timeout;
    else problems.push(`timeout phải là số giây từ trên 0 tới ${MAX_TIMEOUT}`);
  }
  if (problems.length) return { manifest: null, problems };
  return { manifest: { name: expect.name, api: raw.api, scope: expect.scope, ...lists, timeoutMs: Math.round(timeout * 1000), description: typeof raw.description === 'string' ? raw.description : '' }, problems };
}

// Kiểm một luật của khối. Sai thì ném lỗi nói rõ sai gì.
function checkRule(rule, scope, from = '') {
  const where = from ? ` (${from})` : '';
  if (!rule || typeof rule !== 'object') throw new Error(`luật không phải một vật${where}`);
  if (rule.api !== undefined && !apiCompatible(rule.api)) throw new Error(`luật "${rule.id || '?'}" khai giao diện "${rule.api}", harness đang ở bản ${EXT_API}${where}`);
  if (typeof rule.id !== 'string' || !NAME_RE.test(rule.id)) throw new Error(`luật thiếu id hợp lệ${where}`);
  if (typeof rule.run !== 'function') throw new Error(`luật "${rule.id}" thiếu hàm run${where}`);
  const on = [].concat(rule.on || []);
  const allowed = scope === 'unit' ? UNIT_KINDS : KINDS;
  const bad = on.filter((k) => !allowed.includes(k));
  if (!on.length || bad.length) throw new Error(`luật "${rule.id}" nghe loại sự kiện không dùng được cho khối ${scope === 'unit' ? 'của một đơn vị' : 'cả dự án'}: ${bad.join(', ') || '(trống)'}; dùng được: ${allowed.join(', ')}${where}`);
  if (rule.matcher !== undefined && typeof rule.matcher !== 'string') throw new Error(`luật "${rule.id}": matcher phải là chuỗi${where}`);
  return { id: rule.id, on, matcher: rule.matcher || '', run: rule.run };
}

function checkTool(tool, from = '') {
  const where = from ? ` (${from})` : '';
  if (!tool || typeof tool !== 'object') throw new Error(`công cụ không phải một vật${where}`);
  if (typeof tool.name !== 'string' || !TOOL_RE.test(tool.name)) throw new Error(`công cụ thiếu name hợp lệ (chữ thường, số, gạch dưới)${where}`);
  if (typeof tool.description !== 'string' || !tool.description.trim()) throw new Error(`công cụ "${tool.name}" thiếu description${where}`);
  if (typeof tool.run !== 'function') throw new Error(`công cụ "${tool.name}" thiếu hàm run${where}`);
  const schema = tool.inputSchema && typeof tool.inputSchema === 'object' ? tool.inputSchema : { type: 'object', properties: {} };
  return { name: tool.name, description: tool.description, inputSchema: schema, write: tool.write === true, run: tool.run };
}

function checkCommand(cmd, from = '') {
  const where = from ? ` (${from})` : '';
  if (!cmd || typeof cmd !== 'object') throw new Error(`lệnh không phải một vật${where}`);
  if (typeof cmd.name !== 'string' || !NAME_RE.test(cmd.name)) throw new Error(`lệnh thiếu name hợp lệ${where}`);
  if (typeof cmd.run !== 'function') throw new Error(`lệnh "${cmd.name}" thiếu hàm run${where}`);
  return { name: cmd.name, description: typeof cmd.description === 'string' ? cmd.description : '', run: cmd.run };
}

// Tên công cụ trên máy chủ: <tên khối>_<tên công cụ>, gạch ngang thành gạch dưới.
const toolName = (moduleName, name) => `${moduleName.replace(/-/g, '_')}_${name}`;

// Cách trả lời của luật theo loại sự kiện. Không có "cho qua". `block` ở loại sự kiện không chặn được thì thành lời nhắn.
function answers(kind) {
  const note = (reason) => ({ verdict: 'note', reason: String(reason) });
  return {
    block: (reason) => (kind === 'before-action' ? { verdict: 'deny', reason: String(reason) } : kind === 'turn-end' ? { verdict: 'block', reason: String(reason) } : note(reason)),
    ask: (reason) => (kind === 'before-action' ? { verdict: 'ask', reason: String(reason) } : note(reason)),
    note,
    warn: note,
  };
}

// Kiểm quyết định một luật trả và gắn nhãn khối. Sai hợp đồng thì ném lỗi.
function label(kind, ext, ruleId, d) {
  const c = checkDecision(kind, d);
  if (!c) return null;
  const who = ext.scope === 'unit' ? `khối của đơn vị ${ext.name}` : `khối mở rộng ${ext.name}`;
  return { verdict: c.verdict, reason: `[${who}, luật ${ruleId}] ${c.reason}`, detail: `${ext.name}/${ruleId}: ${String(c.reason).split('\n')[0]}`.slice(0, 200), service: ext.unit || undefined };
}

// Gộp quyết định của nhiều luật: chặn mạnh nhất thắng (deny > ask > block > note); cùng mức thì nối lý do. Không bao giờ nới.
const RANK = { deny: 4, ask: 3, block: 3, note: 1 };
function merge(list) {
  const ds = list.filter(Boolean);
  if (!ds.length) return null;
  const top = Math.max(...ds.map((d) => RANK[d.verdict] || 0));
  const win = ds.filter((d) => (RANK[d.verdict] || 0) === top);
  return { verdict: win[0].verdict, reason: win.map((d) => d.reason).join('\n\n'), detail: win[0].detail, service: win[0].service };
}

// Dựng `ctx.action` từ việc trong sự kiện: `rel(abs)` đổi đường dẫn tuyệt đối thành đường dẫn trong thư mục của khối ('' nếu nằm ngoài);
// `writesAbs` là các tệp việc đó ghi (đường dẫn tuyệt đối, cửa vào tính sẵn).
function shapeAction(action, rel, writesAbs) {
  const a = action || {};
  return {
    type: a.type || 'other', tool: a.tool || '', file: rel(a.file || ''),
    writes: [...new Set(writesAbs.map(rel).filter(Boolean))],
    text: a.text || '', command: a.command || '', server: a.server || '', name: a.name || '', args: a.args || {},
  };
}

module.exports = { EXT_API, UNIT_KINDS, DEFAULT_MATCHER, DEFAULT_TIMEOUT, MAX_TIMEOUT, apiCompatible, checkManifest, checkRule, checkTool, checkCommand, toolName, answers, label, merge, shapeAction };
