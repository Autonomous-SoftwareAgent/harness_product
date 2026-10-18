'use strict';
// CỬA VÀO dùng chung của khối bí mật: ghép luật (core/secrets/policy.js) với bộ chuyển (adapters/github): phạm vi của một phiên theo kế
// hoạch đang duyệt, tình trạng token, chạy lệnh gh có kiểm. Công cụ MCP, lệnh `secret`, trình cấp mật khẩu và hook đều đi qua đây.
const policy = require('../core/secrets/policy');
const gh = require('../adapters/secrets/github');
const P = require('../../core/gate/gate-paths');

const ROOT = P.rootFrom(__dirname);
const conf = (root) => ({ ...policy.DEFAULT_POLICY, ...gh.projectConfig(root) });
const scopeFor = (root, sid) => policy.scopeOf(gh.approvedPlan(root, sid), gh.unitRepos(root));

// Tình trạng token: { level, lines, store }. fresh: hỏi lại GitHub, bỏ bản tạm.
async function health(root = ROOT, { fresh = false } = {}) {
  let info = fresh ? null : gh.cachedInfo(root);
  if (!info) { info = await gh.tokenInfo(); gh.saveInfo(root, info); }
  const h = policy.tokenHealth(info, conf(root), Date.now());
  const s = gh.store();
  if (!s.secure && info.present) { if (h.level === 'ok') h.level = 'warn'; h.lines.push('kho trên máy này là tệp KHÔNG mã hóa (không có kho của hệ điều hành)'); }
  const last = gh.auditRows(root, 200).reverse().find((r) => r.ok);
  if (last) h.lines.push(`dùng lần cuối ${new Date(last.at).toISOString().replace('T', ' ').slice(0, 16)} (${last.what})`);
  return { ...h, store: s.kind };
}
const healthText = (h) => `Token GitHub (${h.store}): ${h.level === 'ok' ? 'ổn' : h.level === 'warn' ? 'CẦN XEM' : 'KHÔNG DÙNG ĐƯỢC'}; ${h.lines.join('; ')}.`;

// Chạy gh cho phiên `sid` (rỗng = người dùng chạy tay: không giới hạn theo kế hoạch). Trả { ok, text }.
function runGh(argv, { root = ROOT, sid = process.env.CLAUDE_CODE_SESSION_ID || '', exec } = {}) {
  const args = (argv || []).map(String);
  const cls = policy.classifyGh(args);
  // gh api: tên việc là phương thức HTTP (DELETE, PATCH...), không phải cờ "-X"
  const m = args.findIndex((a) => a === '-X' || a === '--method');
  const what = args[0] === 'api' ? `gh api ${m > 0 && args[m + 1] ? args[m + 1].toUpperCase() : 'GET'}` : `gh ${args.slice(0, 2).join(' ')}`;
  const on = (cls.targets || []).map(policy.show).join(', ');
  const d = cls.error ? { ok: false, why: cls.error } : sid ? policy.decide(scopeFor(root, sid), cls) : { ok: true };
  if (!d.ok) { gh.audit(root, { sid, what, on, action: cls.action || '', ok: false, why: d.why }); return { ok: false, text: `Chặn ${what}: ${d.why}. Không tìm đường khác; cần thì trình người dùng kế hoạch có nêu việc đó.` }; }
  const r = gh.execGh(args, { exec });
  if (r.error === 'no-token') return { ok: false, text: 'Chưa có token GitHub trong kho bí mật: người dùng chạy `node .claude/modules/core/cli/cli.js secret set` trong terminal của mình.' };
  if (r.error) return { ok: false, text: `Không chạy được gh: ${r.error}` };
  gh.audit(root, { sid, what, on, action: cls.action, ok: r.status === 0 });
  return { ok: r.status === 0, text: r.text };
}

module.exports = { ROOT, conf, scopeFor, health, healthText, runGh };
