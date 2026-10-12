'use strict';
// spec: HOOK-S-004
// spec: HOOK-S-008
// spec: HOOK-S-009
// LUẬT đưa mã ra ngoài (trước khi phiên chạy một lệnh): chặn các lệnh git vượt hai luật (S-034, S-035):
//   1. Repo gốc của dự án không bao giờ đẩy lên remote: từ chối `git push`, `git remote add|set-url` nhắm vào repo gốc,
//      và mọi lệnh đụng tới chốt chặn đẩy trong cấu hình git của repo gốc.
//   2. Git hook quét từ cấm không được bỏ qua, ở MỌI repo: từ chối `git commit --no-verify` (và -n), `git push --no-verify`,
//      và việc đổi `core.hooksPath`.
//   3. Nội dung thư mục `docs/` của dự án không bao giờ lên remote (S-062): `git push` ở repo khác bị từ chối khi các commit sắp đẩy
//      chứa bản chép của tệp trong docs/ (cổng kho mã dò); lệnh đưa tệp lên mạng bằng đường khác (gh, curl, scp, rsync...) mà đối số
//      trỏ vào docs/ cũng bị từ chối.
// Đây là lớp cho phiên. Lớp của git (hook pre-push luôn từ chối ở repo gốc và dò docs/ ở mọi repo khác, chốt đổi địa chỉ trong cấu hình)
// vẫn chặn khi lệnh không đi qua đây.
// Phân tích theo chuỗi lệnh; chỉ hỏi cổng kho mã để biết lệnh nhắm vào repo nào và repo đó sắp đẩy gì. Không chắc thì cho qua.
const { deny } = require('../../../core/ports/events');
const { parse, commitFlags } = require('../../../core/core/rules/lib/shell-words');

const LOCK = 'khong-day://';
// Lệnh có thể đưa tệp ở máy lên mạng. Đối số nào của chúng trỏ vào docs/ thì từ chối (S-062).
const UPLOADERS = new Set(['gh', 'curl', 'wget', 'scp', 'sftp', 'rsync', 'rclone', 'aws', 'gsutil', 'az', 'gcloud']);

// Các đường dẫn mà một từ có thể mang: nguyên từ, phần sau "=" (--flag=x, key=@x), bỏ "@" đầu (curl -F f=@x, gh -F f=@x).
function pathCandidates(word) {
  const out = new Set([word]);
  const eq = word.indexOf('=');
  if (eq >= 0) out.add(word.slice(eq + 1));
  for (const x of [...out]) if (x.startsWith('@')) out.add(x.slice(1));
  return [...out].filter((x) => x && !x.startsWith('-') && !/^[a-z]+:\/\//i.test(x));
}

async function run(event, { workspace: ws, repo }) {
  const a = event.action;
  if (a.type !== 'run-command') return null;
  const cmd = a.command;
  const no = (why) => deny(`${why} Không tìm cách khác để làm việc này; cần thì báo người dùng.`);
  const docsDir = ws.norm(`${ws.root}/docs`);
  const inDocs = (abs) => { const n = ws.norm(abs); return n === docsDir || n.startsWith(`${docsDir}/`) || n.startsWith(`${docsDir}\\`); };
  // Hai luật riêng của dự án, bật trong cấu hình (S-063): repo gốc không đẩy (S-035), nội dung docs/ không lên remote (S-062).
  const rootNeverPush = ws.policy('rootNeverPush') === true;
  const docsNeverPush = ws.policy('docsNeverPush') === true;
  // Lệnh đưa tệp lên mạng mà đối số trỏ vào docs/ (S-062).
  if (docsNeverPush) {
    let cwd = event.cwd;
    for (const seg of parse(cmd)) {
      const w = seg.map((x) => x.v);
      if (w[0] === 'cd' && w[1]) { cwd = ws.resolveToken(w[1], cwd); continue; }
      // tên lệnh: từ đầu tiên sau các tiền tố (sudo, time, env, nice, A=b); "curl" làm đối số của lệnh khác (grep curl ...) không tính
      let u = 0;
      while (u < w.length && (/^(sudo|time|env|nice|nohup|command|exec)$/.test(w[u]) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(w[u]))) u++;
      if (u >= w.length || !UPLOADERS.has(w[u].replace(/\.exe$/i, '').split(/[\\/]/).pop())) continue;
      for (const word of w.slice(u + 1)) {
        for (const p of pathCandidates(word)) {
          let abs = '';
          try { abs = ws.resolveToken(p, cwd); } catch { continue; }
          if (abs && inDocs(abs)) return no(`Lệnh này đưa tệp trong thư mục docs/ của dự án lên mạng (${p}): nội dung docs/ không bao giờ lên remote (S-062).`);
        }
      }
    }
  }
  if (!/\bgit\b/.test(cmd)) return null;
  // Repo (thư mục gốc của kho git) mà một lệnh git chạy trong `dir` với các từ `w` nhắm tới.
  const repoOf = async (w, cwd) => {
    let dir = cwd;
    for (let i = 0; i < w.length - 1; i++) if (w[i] === '-C') dir = ws.resolveToken(w[i + 1], dir);
    return repo.topLevel(dir);
  };
  const sameDir = (x, y) => Boolean(x) && ws.norm(x) === ws.norm(y);
  let cwd = event.cwd;
  for (const seg of parse(cmd)) {
    const w = seg.map((x) => x.v);
    if (w[0] === 'cd' && w[1]) { cwd = ws.resolveToken(w[1], cwd); continue; }
    // "git" là một từ đứng riêng (sau `sudo`, `time`, `A=b` vẫn tính); chữ "git" nằm trong một chuỗi có nháy thì không phải lệnh
    const g = w.indexOf('git');
    if (g < 0) continue;
    const rest = w.slice(g + 1);
    // lệnh con của git: từ đầu tiên không phải cờ (bỏ qua -C <dir>, -c <k=v>)
    let sub = '';
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === '-C' || rest[i] === '-c') { i++; continue; }
      if (rest[i].startsWith('-')) continue;
      sub = rest[i]; break;
    }
    const text = rest.join(' ');
    if (/core\.hookspath/i.test(text)) return no('Lệnh này đổi `core.hooksPath`, tức là bỏ qua git hook quét từ cấm (S-034).');
    if (sub === 'push' && rest.includes('--no-verify')) return no('`git push --no-verify` bỏ qua git hook quét từ cấm (S-034) nên bị chặn.');
    if (sub === 'commit' && commitFlags(rest).some((x) => x === '--no-verify' || /^-[a-zA-Z]*n[a-zA-Z]*$/.test(x))) return no('`git commit --no-verify` (hay `-n`) bỏ qua git hook quét từ cấm (S-034) nên bị chặn.');
    const inRoot = async () => rootNeverPush && sameDir(await repoOf(w.slice(g), cwd), ws.root);
    if (sub === 'push' && await inRoot()) return no('Repo gốc BSN_ (harness) KHÔNG BAO GIỜ đẩy lên remote (S-035): chỉ commit ở máy.');
    if (sub === 'remote' && /\b(add|set-url)\b/.test(text) && await inRoot()) return no('Repo gốc BSN_ (harness) không được có remote (S-035).');
    if (sub === 'config' && (text.includes(LOCK) || /\burl\..*insteadof\b/i.test(text)) && await inRoot()) return no('Lệnh này đụng tới chốt chặn đẩy trong cấu hình git của repo gốc (S-035); chỉ người dùng được đổi.');
    if (sub === 'push' && docsNeverPush && repo.docsLeaks) {
      // Repo khác repo gốc: các commit sắp đẩy có bản chép của tệp trong docs/ không (S-062). Lấy remote và nhánh nguồn từ đối số.
      const args = rest.slice(rest.indexOf('push') + 1).filter((x) => !x.startsWith('-'));
      const remote = args[0] || 'origin';
      const ref = (args[1] || 'HEAD').replace(/^\+/, '').split(':')[0] || 'HEAD';
      const dir = await repoOf(w.slice(g), cwd);
      const leaks = dir ? await repo.docsLeaks(dir, remote, ref) : [];
      if (leaks.length) {
        const list = leaks.slice(0, 10).map((l) => `${l.file} (${l.why})`).join('; ');
        return no(`Các commit sắp đẩy chứa ${leaks.length} tệp là nội dung của thư mục docs/ của dự án, thứ không bao giờ lên remote (S-062): ${list}${leaks.length > 10 ? '; ...' : ''}. Bỏ các tệp đó khỏi commit rồi làm lại.`);
      }
    }
  }
  return null;
}

module.exports = { id: 'push', on: 'before-action', run };
