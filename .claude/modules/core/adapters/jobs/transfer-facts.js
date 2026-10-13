'use strict';
// spec: HOOK-S-013
// BỘ CHUYỂN: phần ngữ cảnh MÁY ĐỌC ĐƯỢC cho tờ bàn giao khi chuyển phiên. Phiên giao không phải kể lại những điều này, và không
// kể sai được: kế hoạch và phạm vi lấy từ sổ phiên, skill đã mở lấy từ sổ phiên, tình trạng git hỏi git, yêu cầu còn mở đọc docs/handoff.
// Chỉ đọc. Mục nào không lấy được thì trả một dòng nói rõ vì sao (tờ bàn giao không bao giờ im lặng bỏ một mục).
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const P = require('../../gate/gate-paths');

const git = (dir, args) => {
  const r = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', timeout: 15000, windowsHide: true });
  return r.status === 0 && !r.error ? r.stdout : null;
};
const MAX_FILES = 20;

// Tình trạng một repo: tệp chưa commit, commit chưa đẩy, commit gần nhất. `only`: chỉ tính trong thư mục con này (đơn vị nằm trong repo gốc).
function repoLines(label, dir, only) {
  const top = (git(dir, ['rev-parse', '--show-toplevel']) || '').trim();
  if (!top) return [`${label}: không phải repo git, hoặc không hỏi được git.`];
  const scope = only ? ['--', only] : [];
  const status = (git(dir, ['status', '--porcelain', ...scope]) || '').split('\n').filter(Boolean);
  const head = (git(dir, ['log', '-1', '--format=%h %s', ...scope]) || '').trim();
  const out = [`${label}: commit gần nhất ${head || '(chưa có commit)'}; ${status.length ? `${status.length} tệp CHƯA commit` : 'không có tệp chưa commit'}.`];
  for (const l of status.slice(0, MAX_FILES)) out.push(`  ${l.trim()}`);
  if (status.length > MAX_FILES) out.push(`  ... và ${status.length - MAX_FILES} tệp nữa (git status)`);
  const upstream = (git(dir, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']) || '').trim();
  if (!upstream) out.push(`${label}: nhánh không theo dõi remote nào (không có gì để đẩy từ đây).`);
  else {
    const ahead = (git(dir, ['log', '--oneline', `${upstream}..HEAD`]) || '').split('\n').filter(Boolean);
    out.push(`${label}: ${ahead.length ? `${ahead.length} commit CHƯA đẩy lên ${upstream} (chỉ đẩy khi người dùng bảo)` : `không có commit chưa đẩy so với ${upstream}`}.`);
    for (const l of ahead.slice(0, 10)) out.push(`  ${l}`);
  }
  return out;
}

// parts: { scope, ledger } là sổ phạm vi và sổ phiên, do cửa vào (cli/transfer.js) đưa vào: bộ chuyển này không nhập bộ chuyển khác.
function gather(root, unit, sid, parts = {}) {
  const facts = {};
  if (unit && P.serviceEntries(root).some((u) => u.name === unit)) { facts.entryRel = P.unitPathRel(root, unit, 'CLAUDE.md'); facts.statusRel = P.unitPathRel(root, unit, 'docs/agent/STATUS.md'); }
  try { facts.scope = String(parts.scope.statusText(root, sid) || '').split('\n').filter(Boolean); } catch (e) { facts.scope = [`không đọc được sổ phạm vi: ${e.message}`]; }
  if (!facts.scope.length) facts.scope = ['phiên giao không có kế hoạch nào đang được duyệt.'];
  try { const s = parts.ledger.skillsOf(root, sid); facts.skills = s.length ? [s.join(', ')] : ['chưa mở skill nào trong đợt hiện tại (hoặc không đọc được sổ phiên).']; } catch (e) { facts.skills = [`không đọc được sổ phiên: ${e.message}`]; }
  const dir = P.serviceDir(root, unit);
  const own = fs.existsSync(path.join(dir, '.git'));
  facts.git = own
    ? [...repoLines(`Repo của ${unit} (${P.serviceRel(root, unit)})`, dir), ...repoLines('Repo gốc (harness, tài liệu chung)', root)]
    : repoLines(`${unit} nằm trong repo gốc (${P.serviceRel(root, unit)})`, root);
  const hand = path.join(root, 'docs', 'handoff');
  let open = [];
  try {
    open = fs.readdirSync(hand).filter((f) => f.endsWith('.md') && f.toLowerCase() !== 'readme.md' && (f.includes(`-to-${unit}-`) || f.includes(`-${unit}-to-`))).sort()
      .filter((f) => { try { return /^Trạng thái:\s*open\b/im.test(fs.readFileSync(path.join(hand, f), 'utf8')); } catch { return false; } });
  } catch { /* dự án không có thư mục handoff */ }
  facts.handoffs = open.length ? open.map((f) => `docs/handoff/${f}${f.includes(`-to-${unit}-`) ? ' (gửi TỚI đơn vị)' : ' (đơn vị gửi đi, đang chờ bên kia)'}`) : ['không có tờ nào còn mở.'];
  const ext = path.join(dir, P.UNIT_EXT_DIR, 'module.json');
  facts.rules = fs.existsSync(ext) ? [`${P.serviceRel(root, unit)}/${P.UNIT_EXT_DIR}/module.json (luật chặn bằng máy của đơn vị; đọc trước khi sửa).`] : ['đơn vị không có khối luật riêng.'];
  return facts;
}

module.exports = { gather, repoLines };
