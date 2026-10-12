'use strict';
// spec: HOOK-S-011
// LỆNH CỦA KHỐI MỞ RỘNG (S-065): node <harness>/cli/cli.js extension <việc> ...
//   list                         mọi khối, tình trạng xác nhận, luật, công cụ, lệnh, lỗi lúc chạy 24 giờ qua
//   new <tên> | new --unit <đơn vị>  tạo khung khối từ khối mẫu của harness (cả dự án, hoặc một đơn vị)
//   test <khóa|tên>              chạy các ca thử ở cases.json của BẢN ĐANG SỬA (chưa cần xác nhận)
//   trust <khóa|tên>             xác nhận: chép bản đang sửa thành bản chạy, rồi chạy setup. CHỈ người dùng, ngoài phiên Claude
//   untrust <khóa>               gỡ bản đã xác nhận (luật của khối thôi chặn), rồi chạy setup. CHỈ người dùng, ngoài phiên Claude
//   run <khóa|tên> <lệnh> [...]  chạy một lệnh của khối (bản đã xác nhận)
const fs = require('node:fs');
const path = require('node:path');
const P = require('../gate/gate-paths');

const A = () => require('../adapters/project/extensions');
const C = () => require('../core/extensions/contract');
const W = () => require('../hooks/wire');

// Lệnh chạy trong phiên Claude Code: Claude Code đặt các biến này cho mọi lệnh nó chạy (đo 2026-10-12: CLAUDECODE=1, CLAUDE_CODE_SESSION_ID).
// Đây là chặn mềm: ai cố ý xóa biến thì qua được; tệp xác nhận còn được hook cổng duyệt bảo vệ khỏi lần ghi trực tiếp.
const inClaude = (env = process.env) => Boolean(env.CLAUDECODE || env.CLAUDE_CODE_SESSION_ID);

function find(root, q) {
  const all = W().extensions(root);
  if (!q) throw new Error('thiếu tên hoặc khóa của khối (xem: extension list)');
  const exact = all.find((e) => e.key === q);
  if (exact) return exact;
  const byName = all.filter((e) => e.name === q);
  if (byName.length === 1) return byName[0];
  if (byName.length > 1) throw new Error(`có ${byName.length} khối tên "${q}": dùng khóa (${byName.map((e) => e.key).join(', ')})`);
  throw new Error(`không có khối "${q}" (xem: extension list)`);
}

const STATE = { trusted: 'đã xác nhận, đang chạy', changed: 'ĐÃ SỬA sau lần xác nhận: đang chạy bản đã xác nhận', removed: 'ĐÃ XÓA khỏi repo: bản đã xác nhận vẫn chạy', untrusted: 'CHƯA xác nhận: không chạy' };

function list(root, now = Date.now()) {
  const exts = W().extensions(root);
  if (!exts.length) return { ok: true, text: `Chưa có khối mở rộng nào. Tạo: node ${P.codeRel(root, 'cli/cli.js')} extension new <tên> (cả dự án) hoặc extension new --unit <đơn vị>` };
  const errs = A().recentErrors(root, new Date(now - 24 * 3600 * 1000).toISOString());
  const lines = [];
  for (const e of exts) {
    lines.push(`${e.key}  (${e.scope === 'unit' ? `đơn vị ${e.unit}` : 'cả dự án'}): ${STATE[e.state]}`);
    lines.push(`  thư mục: ${e.dir ? path.relative(root, e.dir).split(path.sep).join('/') : '(đã xóa)'}`);
    if (e.manifest) {
      const W_ = W();
      const r = W_.extensionParts(e, 'rules');
      const t = W_.extensionParts(e, 'tools');
      const c = W_.extensionParts(e, 'commands');
      lines.push(`  luật: ${r.items.map((x) => `${x.id} (${x.on.join(', ')})`).join('; ') || 'không có'}`);
      lines.push(`  công cụ: ${t.items.map((x) => C().toolName(e.name, x.name) + (x.write ? ' (ghi)' : '')).join(', ') || 'không có'}`);
      lines.push(`  lệnh: ${c.items.map((x) => x.name).join(', ') || 'không có'}`);
      for (const p of [...r.problems, ...t.problems, ...c.problems]) lines.push(`  LỖI: ${p}`);
    }
    for (const p of e.problems) lines.push(`  LỖI: ${p}`);
    const n = errs.filter((x) => x.key === e.key).length;
    if (n) lines.push(`  lỗi lúc chạy trong 24 giờ: ${n} (luật lỗi thì cho qua); lần gần nhất: ${errs.filter((x) => x.key === e.key).pop().error}`);
  }
  if (exts.some((e) => e.state === 'untrusted' || e.state === 'changed')) lines.push(`\nXác nhận (người dùng tự chạy trong terminal, ngoài phiên Claude): node ${P.codeRel(root, 'cli/cli.js')} extension trust <khóa>`);
  return { ok: !exts.some((e) => e.problems.length), text: lines.join('\n') };
}

// Tạo khung từ khối mẫu của harness (product/examples/extension). Không ghi đè khối đang có.
function create(root, name, unit) {
  const tpl = P.codePath(root, 'product/examples/extension');
  if (!fs.existsSync(path.join(tpl, 'module.json'))) throw new Error(`không thấy khối mẫu của harness (${path.relative(root, tpl)})`);
  let dest;
  let manifestName;
  if (unit) {
    if (!P.serviceEntries(root).some((s) => s.name === unit)) throw new Error(`không có đơn vị "${unit}" (xem: cli.js services)`);
    dest = path.join(P.serviceDir(root, unit), P.UNIT_EXT_DIR);
    manifestName = unit;
  } else {
    if (!/^[a-z][a-z0-9-]{0,40}$/.test(name || '')) throw new Error('tên khối: chữ thường, số, gạch ngang, bắt đầu bằng chữ');
    dest = path.join(P.extensionsDir(root), name);
    manifestName = name;
  }
  if (fs.existsSync(dest)) throw new Error(`đã có ${path.relative(root, dest)}: không ghi đè`);
  fs.cpSync(tpl, dest, { recursive: true });
  const mf = path.join(dest, 'module.json');
  const m = JSON.parse(fs.readFileSync(mf, 'utf8'));
  m.name = manifestName;
  m.scope = unit ? 'unit' : 'project';
  fs.writeFileSync(mf, `${JSON.stringify(m, null, 2)}\n`);
  const rel = path.relative(root, dest).split(path.sep).join('/');
  return { ok: true, text: `Đã tạo khung khối ở ${rel} (chép từ khối mẫu: hai luật, một công cụ, một lệnh, ca thử ở cases.json).\nSửa cho đúng việc của bạn, chạy thử: node ${P.codeRel(root, 'cli/cli.js')} extension test ${unit ? `unit:${unit}` : `project:${name}`}\nKhối CHƯA chạy cho tới khi người dùng xác nhận (trong terminal, ngoài phiên Claude): node ${P.codeRel(root, 'cli/cli.js')} extension trust ${unit ? `unit:${unit}` : `project:${name}`}` };
}

// Chạy ca thử của bản ĐANG SỬA. Mỗi ca: { name, event: { kind, action: { type, file, command, args } , prompt? }, expect: 'deny'|'ask'|'note'|'block'|'pass' }.
// `file` tính từ thư mục của khối. Trả { ok, text }.
async function test(root, q) {
  const e = find(root, q);
  if (!e.dir) throw new Error(`${e.key} đã xóa khỏi repo: không có bản đang sửa để thử`);
  const m = C().checkManifest(e.raw, { scope: e.scope, name: e.name });
  if (!m.manifest) return { ok: false, text: `${e.key}: module.json hỏng:\n- ${m.problems.join('\n- ')}` };
  const live = { ...e, run: e.dir, manifest: m.manifest };
  const parts = W().extensionParts(live, 'rules');
  const lines = [];
  for (const p of parts.problems) lines.push(`LỖI nạp luật: ${p}`);
  let cases = [];
  const cf = path.join(e.dir, 'cases.json');
  try { cases = JSON.parse(fs.readFileSync(cf, 'utf8')); } catch { lines.push(`không có ca thử (${path.relative(root, cf).split(path.sep).join('/')}): chỉ kiểm khai báo và nạp được luật`); }
  let bad = parts.problems.length;
  for (const c of Array.isArray(cases) ? cases : []) {
    const ev = c.event || {};
    const kind = ev.kind || 'before-action';
    const a = ev.action || {};
    const abs = a.file ? path.resolve(e.base, a.file) : '';
    const event = { kind, root, session: '', agent: '', cwd: e.base, prompt: ev.prompt || '', reply: ev.reply || '', scratch: '', source: '', again: false,
      action: { type: a.type || 'write-file', tool: a.tool || '', file: abs, text: a.text || '', command: a.command || '', shell: null, server: '', name: a.name || '', args: a.args || {} } };
    const writesAbs = W().writesOf(event, root);
    const ds = [];
    let err = '';
    for (const r of parts.items.filter((x) => x.on.includes(kind))) {
      try { const d = await Promise.resolve(r.run(W().extensionCtx(root, live, event, writesAbs))); const l = C().label(kind, live, r.id, d); if (l) ds.push(l); } catch (x) { err = `${r.id}: ${x.message}`; }
    }
    const got = C().merge(ds);
    const verdict = got ? got.verdict : 'pass';
    const pass = !err && verdict === (c.expect || 'pass');
    if (!pass) bad++;
    lines.push(`${pass ? 'ĐẠT ' : 'TRƯỢT'} ${c.name || '(không tên)'}: mong ${c.expect || 'pass'}, được ${verdict}${err ? ` (LỖI ${err})` : ''}${got && !pass ? `\n      ${got.reason.split('\n')[0]}` : ''}`);
  }
  lines.push(bad ? `${bad} ca trượt hoặc lỗi.` : `Mọi ca đạt (${cases.length || 0}).`);
  return { ok: !bad, text: lines.join('\n') };
}

const REFUSE = 'Lệnh này chỉ người dùng chạy, trong terminal, ngoài phiên Claude Code: xác nhận là cho phép mã của khối chạy trong mọi hook, và gỡ xác nhận là tắt luật chặn của khối. Phiên Claude đưa lệnh cho người dùng, không tự chạy.';

function trust(root, q) {
  if (inClaude()) return { ok: false, text: REFUSE };
  const e = find(root, q);
  if (!e.dir) throw new Error(`${e.key} đã xóa khỏi repo: không có gì để xác nhận (gỡ: extension untrust ${e.key})`);
  const m = C().checkManifest(e.raw, { scope: e.scope, name: e.name });
  if (!m.manifest) return { ok: false, text: `${e.key}: module.json hỏng, không xác nhận:\n- ${m.problems.join('\n- ')}` };
  const live = { ...e, run: e.dir, manifest: m.manifest };
  const probs = ['rules', 'tools', 'commands'].flatMap((k) => W().extensionParts(live, k).problems);
  if (probs.length) return { ok: false, text: `${e.key}: không nạp được, không xác nhận:\n- ${probs.join('\n- ')}` };
  const files = A().files(e.dir);
  const t = A().trust(root, e);
  const s = require('./setup').run(root);
  return { ok: s.ok, text: `Đã xác nhận ${e.key}: ${files.length} tệp (${files.map((f) => f.rel).join(', ')}), dấu vân tay ${t.fingerprint.slice(0, 12)}.\nMã chạy từ bản đã chép; sửa tệp trong repo thì phải xác nhận lại mới có hiệu lực.\n${s.text}` };
}

function untrust(root, key) {
  if (inClaude()) return { ok: false, text: REFUSE };
  if (!key) throw new Error('thiếu khóa (xem: extension list)');
  const had = A().untrust(root, key);
  const s = require('./setup').run(root);
  return { ok: had && s.ok, text: `${had ? `Đã gỡ xác nhận ${key}: luật của khối thôi chạy.` : `${key} chưa được xác nhận: không có gì để gỡ.`}\n${s.text}` };
}

async function runCommand(root, q, name, rest) {
  const e = find(root, q);
  if (!e.manifest) throw new Error(`${e.key}: ${STATE[e.state]}`);
  const c = W().extensionParts(e, 'commands').items.find((x) => x.name === name);
  if (!c) throw new Error(`${e.key} không có lệnh "${name}"`);
  const out = await Promise.resolve(c.run(rest, W().extensionCtx(root, e, { kind: 'command', action: {} }, [], { write: true })));
  return { ok: true, text: String(out === undefined ? '' : out) };
}

async function run(root, argv) {
  const [sub, a1, a2, ...rest] = argv;
  const ui = argv.indexOf('--unit');
  switch (sub) {
    case 'list': return list(root);
    case 'new': return create(root, ui >= 0 ? '' : a1, ui >= 0 ? argv[ui + 1] : '');
    case 'test': return test(root, a1);
    case 'trust': return trust(root, a1);
    case 'untrust': return untrust(root, a1);
    case 'run': return runCommand(root, a1, a2, rest);
    default: return { ok: false, text: `Dùng: node ${P.codeRel(root, 'cli/cli.js')} extension <list | new <tên> | new --unit <đơn vị> | test <khóa> | trust <khóa> | untrust <khóa> | run <khóa> <lệnh> [...]>` };
  }
}

module.exports = { run, list, create, test, trust, untrust, runCommand, inClaude, REFUSE };
