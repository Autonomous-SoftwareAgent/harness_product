'use strict';
// spec: MCP-S-006
// BỘ CHUYỂN dự án cho CỔNG MCP: phần khai báo và tin cậy. Máy chủ MCP phía sau cổng được KHAI ở phần của dự án (.claude/project/mcp.json, commit được)
// và chỉ CHẠY sau khi được xác nhận (.claude/local/mcp/trust.json, chỉ ở máy, cổng duyệt chặn phiên ghi tay).
//
// Khai báo: { "servers": { "<tên>": { ... } } }, tên chỉ gồm chữ thường và số (đi vào tên công cụ: <tên>_<công cụ>).
//   type      'stdio' (tiến trình trên máy) | 'http' (HTTP kiểu mới) | 'sse' (SSE kiểu cũ)
//   command, args, cwd, env      cho stdio; env: { TÊN: "giá trị hoặc ${BIẾN_MÔI_TRƯỜNG}" }
//   url, headers                 cho http và sse; headers: { Authorization: "Bearer ${BIẾN}" }. Khóa KHÔNG ghi thẳng vào tệp.
//   tools     { include: [mẫu], exclude: [mẫu], rename: { cũ: mới } }   mẫu là tên, hoặc tiền-tố*
//   writes    [mẫu] công cụ GHI RA NGOÀI: đi qua cổng duyệt kế hoạch như một lần sửa tệp
//   startTimeoutMs, timeoutMs, disabled
// Cùng tệp, khóa "account": { "writes": [mẫu] }: công cụ GHI RA NGOÀI của các kết nối do tài khoản claude.ai quản (máy chủ cần đăng nhập,
// không đi qua cổng). Mẫu so với TÊN ĐẦY ĐỦ của công cụ (mcp__<kết nối>__<công cụ>), dấu * đứng ở đâu cũng được. Mặc định không có mẫu nào.
// Dấu của khai báo chỉ tính phần quyết định MÃ NÀO CHẠY và NÓI VỚI AI (type, command, args, cwd, env, url, headers). Lọc công cụ, hạn giờ,
// danh sách writes đổi tự do mà không phải xác nhận lại. Máy chủ chạy theo bản khai ĐÃ XÁC NHẬN; khai báo đổi thì bản cũ vẫn chạy, bản
// mới chờ duyệt lại. Gỡ khỏi khai báo thì thôi chạy ngay.
//
// Xác nhận: người dùng chạy lệnh ngoài phiên Claude thì luôn được. Phiên Claude chạy được khi kế hoạch người dùng VỪA DUYỆT của chính
// phiên đó có ghi mã `mcp:<tên>@<8 ký tự đầu của dấu>` (lệnh add và list in mã này để phiên chép vào kế hoạch): lời duyệt gắn với đúng
// máy chủ và đúng bản khai đã trình.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const P = require('../../gate/gate-paths');
// Tệp này được tiến trình máy chủ MCP giữ lâu: phần xử lý (mcp/mcp-surface.js) khai nó trong danh sách `watch` để tệp mồi nạp lại khi nó đổi.

const TYPES = ['stdio', 'http', 'sse'];
const NAME_RE = /^[a-z][a-z0-9]{1,23}$/;
const RUN_KEYS = ['type', 'command', 'args', 'cwd', 'env', 'url', 'headers'];
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return undefined; } };

const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
const runPart = (decl) => canon(Object.fromEntries(RUN_KEYS.filter((k) => decl[k] !== undefined).map((k) => [k, decl[k]])));
const fingerprint = (decl) => crypto.createHash('sha256').update(JSON.stringify(runPart(decl))).digest('hex').slice(0, 16);
const token = (name, fp) => `mcp:${name}@${String(fp).slice(0, 8)}`;

// Kiểm một khai báo. Trả danh sách lỗi (rỗng là hợp lệ).
function check(name, d) {
  const out = [];
  if (!NAME_RE.test(String(name))) out.push(`tên "${name}" phải là 2 đến 24 chữ thường hoặc số, bắt đầu bằng chữ`);
  if (!d || typeof d !== 'object' || Array.isArray(d)) return [...out, 'khai báo phải là một vật'];
  if (!TYPES.includes(d.type)) out.push(`type phải là một trong: ${TYPES.join(', ')}`);
  if (d.type === 'stdio') {
    if (typeof d.command !== 'string' || !d.command.trim()) out.push('stdio cần command');
    if (d.args !== undefined && !(Array.isArray(d.args) && d.args.every((x) => typeof x === 'string'))) out.push('args phải là mảng chuỗi');
  } else if (TYPES.includes(d.type)) {
    if (typeof d.url !== 'string' || !/^https?:\/\//.test(d.url)) out.push('http và sse cần url bắt đầu bằng http:// hoặc https://');
  }
  for (const k of ['env', 'headers']) if (d[k] !== undefined && !(d[k] && typeof d[k] === 'object' && Object.values(d[k]).every((x) => typeof x === 'string'))) out.push(`${k} phải là vật có giá trị chuỗi`);
  if (d.writes !== undefined && !(Array.isArray(d.writes) && d.writes.every((x) => typeof x === 'string'))) out.push('writes phải là mảng mẫu tên công cụ');
  return out;
}

// Khai báo của dự án: { servers: { tên: khai báo hợp lệ }, problems: [chữ], file }.
function declared(root) {
  const file = P.mcpConfigPath(root);
  const servers = {};
  const problems = [];
  if (!fs.existsSync(file)) return { servers, problems, file, account: { writes: [] } };
  const raw = readJson(file);
  if (!raw || typeof raw !== 'object' || !raw.servers || typeof raw.servers !== 'object') return { servers, problems: [`${path.basename(file)} không đọc được hoặc thiếu khóa "servers"`], file, account: { writes: [] } };
  for (const [name, d] of Object.entries(raw.servers)) {
    const errs = check(name, d);
    if (errs.length) problems.push(`${name}: ${errs.join('; ')}`); else servers[name] = d;
  }
  const aw = raw.account && Array.isArray(raw.account.writes) ? raw.account.writes.filter((x) => typeof x === 'string' && x) : [];
  return { servers, problems, file, account: { writes: aw } };
}

const trustRead = (root) => { const t = readJson(P.mcpTrustFile(root)); return t && typeof t === 'object' && t.servers && typeof t.servers === 'object' ? t : { servers: {} }; };
function trustWrite(root, t) {
  const file = P.mcpTrustFile(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(t, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

// Tình trạng từng máy chủ đã khai: [{ name, decl, fp, token, state, run }].
//   state  'trusted' (đúng bản đã xác nhận) | 'changed' (đã sửa sau lần xác nhận: bản cũ vẫn chạy) | 'untrusted' (chưa xác nhận: không chạy)
//          | 'disabled' (khai disabled: không chạy)
//   run    khai báo THẬT SỰ chạy: phần chạy lấy từ bản đã xác nhận, phần tùy biến (tools, writes, hạn giờ) lấy từ khai báo hiện tại; null nếu không chạy
function status(root) {
  const { servers, problems, file } = declared(root);
  const trust = trustRead(root).servers;
  const list = Object.keys(servers).sort().map((name) => {
    const decl = servers[name];
    const fp = fingerprint(decl);
    const t = trust[name];
    const state = decl.disabled ? 'disabled' : !t ? 'untrusted' : t.fp === fp ? 'trusted' : 'changed';
    let run = null;
    if (t && !decl.disabled) { run = { ...decl }; for (const k of RUN_KEYS) delete run[k]; Object.assign(run, t.decl || {}); }
    return { name, decl, fp, token: token(name, fp), state, run, runFp: t ? t.fp : '', trustedAt: t ? t.at : 0, trustedBy: t ? t.by : '' };
  });
  return { list, problems, file };
}

// Các máy chủ phải chạy lúc này: [{ name, run, runFp }].
const running = (root) => status(root).list.filter((s) => s.run).map((s) => ({ name: s.name, run: s.run, runFp: s.runFp }));

// Xác nhận máy chủ `name`. `actor`: { by: 'user' } hoặc { by: 'session', sid, planText } (kế hoạch người dùng vừa duyệt của phiên đó).
// Trả { ok, text }.
function trust(root, name, actor = { by: 'user' }, now = Date.now()) {
  const s = status(root).list.find((x) => x.name === name);
  if (!s) return { ok: false, text: `Không có máy chủ "${name}" trong khai báo (${path.relative(root, P.mcpConfigPath(root)).split(path.sep).join('/')}).` };
  if (actor.by === 'session') {
    if (!actor.sid) return { ok: false, text: 'Không biết mã phiên nên không đối chiếu được với kế hoạch đã duyệt. Người dùng chạy lệnh này ngoài phiên Claude thì được.' };
    if (!actor.planText) return { ok: false, text: `Phiên này chưa có kế hoạch nào đang được người dùng duyệt. Trình kế hoạch có ghi mã ${s.token} (kèm lệnh chạy hoặc địa chỉ của máy chủ), chờ người dùng duyệt, rồi chạy lại.` };
    if (!actor.planText.includes(s.token)) return { ok: false, text: `Kế hoạch người dùng đã duyệt KHÔNG nêu mã ${s.token} của bản khai hiện tại của "${name}" (khai báo đổi thì mã đổi). Trình lại kế hoạch có ghi đúng mã đó, chờ duyệt, rồi chạy lại.` };
  }
  const t = trustRead(root);
  t.servers[name] = { fp: s.fp, decl: runPart(s.decl), at: now, by: actor.by, ...(actor.by === 'session' ? { sid: actor.sid, plan: crypto.createHash('sha256').update(actor.planText).digest('hex').slice(0, 16) } : {}) };
  trustWrite(root, t);
  return { ok: true, text: `Đã xác nhận máy chủ MCP "${name}" (dấu ${s.fp}, ${actor.by === 'session' ? 'theo kế hoạch người dùng đã duyệt' : 'người dùng xác nhận'}). Các phiên đang mở có công cụ của nó trong vài giây, tên dạng ${name}_<công cụ>.` };
}

function untrust(root, name) {
  const t = trustRead(root);
  if (!t.servers[name]) return { ok: false, text: `"${name}" chưa từng được xác nhận.` };
  delete t.servers[name];
  trustWrite(root, t);
  return { ok: true, text: `Đã gỡ xác nhận "${name}": máy chủ thôi chạy ở mọi phiên trong vài giây.` };
}

// Thêm hoặc thay một khai báo; bỏ một khai báo. Giữ nguyên các máy chủ khác và mọi khóa khác của tệp.
function save(root, name, decl) {
  const errs = decl === null ? [] : check(name, decl);
  if (errs.length) return { ok: false, text: `Khai báo không hợp lệ: ${errs.join('; ')}` };
  const file = P.mcpConfigPath(root);
  const raw = readJson(file);
  if (fs.existsSync(file) && raw === undefined) return { ok: false, text: `${path.basename(file)} không đọc được (JSON hỏng): sửa tay trước.` };
  const cfg = raw && typeof raw === 'object' ? raw : {};
  cfg.servers = cfg.servers && typeof cfg.servers === 'object' ? cfg.servers : {};
  if (decl === null) { if (!cfg.servers[name]) return { ok: false, text: `Không có máy chủ "${name}" trong khai báo.` }; delete cfg.servers[name]; } else cfg.servers[name] = decl;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(cfg, null, 2)}\n`);
  return { ok: true, text: decl === null ? `Đã gỡ "${name}" khỏi khai báo: máy chủ thôi chạy ở mọi phiên trong vài giây.` : `Đã ghi khai báo "${name}".` };
}

// Mẫu tên: đúng tên, hoặc tiền-tố*, hoặc * (mọi tên).
const like = (pattern, name) => (pattern === '*' ? true : pattern.endsWith('*') ? name.startsWith(pattern.slice(0, -1)) : pattern === name);
const any = (patterns, name) => (patterns || []).some((p) => like(p, name));

// Mẫu có dấu * ở bất kỳ đâu, so trọn tên.
const glob = (pattern, name) => {
  const parts = String(pattern).split('*');
  const s = String(name);
  if (parts.length === 1) return s === parts[0];
  if (!s.startsWith(parts[0]) || !s.endsWith(parts[parts.length - 1]) || s.length < parts[0].length + parts[parts.length - 1].length) return false;
  let at = parts[0].length;
  for (const mid of parts.slice(1, -1)) { const i = s.indexOf(mid, at); if (i < 0) return false; at = i + mid.length; }
  return at <= s.length - parts[parts.length - 1].length;
};

// Công cụ `tool` (tên đầy đủ mà Claude Code gọi) có phải một công cụ GHI RA NGOÀI đã khai không. Trả tên máy chủ hoặc kết nối, '' nếu không.
// Công cụ sau cổng có tên mcp__<máy chủ của harness>__<tên>_<công cụ>; mẫu trong `writes` so với <công cụ> (tên gốc hoặc tên đã đổi).
function writeOwner(root, tool) {
  const parts = String(tool || '').split('__');
  if (parts[0] !== 'mcp' || parts.length < 3) return '';
  let cfg;
  try { cfg = declared(root); } catch { return ''; }
  const rest = parts.slice(2).join('__');
  for (const [name, d] of Object.entries(cfg.servers)) {
    if (!(d.writes || []).length || !rest.startsWith(`${name}_`)) continue;
    const shown = rest.slice(name.length + 1);
    const rename = (d.tools && d.tools.rename) || {};
    const original = Object.keys(rename).find((k) => rename[k] === shown) || shown;
    if (d.writes.some((p) => glob(p, shown) || glob(p, original))) return name;
  }
  if (cfg.account.writes.some((p) => glob(p, tool))) return parts[1];
  return '';
}

// Thay ${BIẾN} bằng giá trị trong môi trường. Thiếu biến thì ném lỗi nêu TÊN biến (không bao giờ in giá trị).
function expand(text, env = process.env) {
  return String(text).replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (m, k) => { if (env[k] === undefined || env[k] === '') throw new Error(`thiếu biến môi trường ${k}`); return env[k]; });
}

// Dấu của mọi thứ quyết định máy chủ nào chạy: tệp khai báo và sổ xác nhận. Cổng so dấu này để biết phải nối lại hay ngắt cái gì.
function watchStamp(root) {
  return [P.mcpConfigPath(root), P.mcpTrustFile(root)].map((f) => { try { const s = fs.statSync(f); return `${s.size}:${s.mtimeMs}`; } catch { return '-'; } }).join('|');
}

module.exports = { glob, writeOwner, TYPES, NAME_RE, check, declared, status, running, trust, untrust, save, fingerprint, token, like, any, expand, watchStamp, runPart, trustRead };
