'use strict';
// LUẬT đẩy lên GitHub theo kế hoạch (trước khi phiên chạy một lệnh): `git push` trong phiên Claude chỉ qua khi repo đích nằm trong phạm vi
// kế hoạch đang duyệt (repo của đơn vị ở mục Dịch vụ, hoặc đối tượng ở dòng "- GitHub:") và việc có ở dòng "- Được làm:" (đẩy nhánh: đẩy;
// đẩy nhãn: gắn nhãn; --force: ghi đè; --delete: xóa). Remote không phải github.com thì không xét. Không suy ra được repo đích thì cho qua
// (các hook chặn đẩy khác vẫn xét; trình cấp mật khẩu không cấp token cho repo ngoài phạm vi).
// params: { scopeFor(sid) -> phạm vi, remoteUrl(dir, tên remote) -> địa chỉ } (cửa vào cấp, vì luật không đọc đĩa).
const path = require('node:path');
const { deny } = require('../../../core/ports/events');
const { parse } = require('../../../core/core/rules/lib/shell-words');
const policy = require('../secrets/policy');

const GH_URL = /github\.com[/:]([^/\s]+\/[^/\s]+?)(?:\.git)?\/?$/i;

async function run(event, ports, params) {
  const a = event.action;
  if (!a || a.type !== 'run-command' || !event.session || !params) return null;
  for (const seg of parse(a.command)) {
    const w = seg.map((x) => x.v);
    const g = w.indexOf('git');
    if (g < 0) continue;
    let dir = event.cwd || '.';
    let i = g + 1;
    while (i < w.length && w[i].startsWith('-')) { if (w[i] === '-C') { dir = path.resolve(dir, w[i + 1] || '.'); i += 2; } else if (w[i] === '-c') i += 2; else i += 1; }
    if (w[i] !== 'push') continue;
    const rest = w.slice(i + 1);
    const pos = rest.filter((x, k) => !x.startsWith('-') && !(k > 0 && /^(?:-o|--push-option|--repo|--receive-pack|--exec)$/.test(rest[k - 1])));
    const remote = pos[0] || 'origin';
    const url = /^[a-z]+:\/\/|^git@/i.test(remote) ? remote : await params.remoteUrl(dir, remote);
    const m = GH_URL.exec(String(url || '').trim());
    if (!m) continue;
    const cls = { targets: [{ kind: 'repo', id: m[1].toLowerCase() }], action: policy.classifyPush(rest) };
    const d = policy.decide(await params.scopeFor(event.session), cls);
    if (!d.ok) return deny(`Chặn git push lên ${m[1]}: ${d.why}. Không tìm đường khác; cần thì trình người dùng kế hoạch có nêu việc đó.`);
  }
  return null;
}

module.exports = { id: 'github', on: 'before-action', run };
