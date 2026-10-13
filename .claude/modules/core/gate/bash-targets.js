'use strict';
// spec: GATE-S-002
// Phân tích một lệnh Bash để biết nó GHI vào đâu, thay cho khớp chuỗi con (đã từng chặn nhầm một lệnh chỉ nhắc đường dẫn trong chuỗi).
// Chỉ là hàng rào, không phải sandbox: biến shell, script ghi ở nơi khác rồi chạy, lệnh lạ vẫn lách được.
//
// analyzeBash(cmd) trả về:
//   targets    đường dẫn (nguyên văn trong lệnh) mà lệnh có thể ghi/xóa/dời: đích chuyển hướng và tham số của lệnh đổi tệp
//   inline     mã nội tuyến (node -e, python -c, bash -c, heredoc vào trình thông dịch): [{ code, writes }]
//   skeleton   lệnh đã bỏ nội dung trong ngoặc và thân heredoc (để so khớp từ khóa mà không dính chuỗi)
//   unparsable true nếu ngoặc không cân (không phân tích chắc chắn được)

const BENIGN_TARGETS = new Set(['/dev/null', 'nul', '/dev/stdout', '/dev/stderr', '/dev/tty']);

// ---------- tách lệnh thành đoạn và từ ----------
function scan(cmd) {
  const text = String(cmd || '');
  const segments = [];
  let tokens = [];
  let buf = '';
  let hasBuf = false;
  let quote = null;
  let quotedAny = false;
  let heredocs = []; // dấu kết thúc heredoc đang chờ ở các dòng sau
  const bodies = [];
  let ok = true;

  const pushTok = () => {
    if (hasBuf) tokens.push({ text: buf, quoted: quotedAny });
    buf = ''; hasBuf = false; quotedAny = false;
  };
  const pushSeg = () => {
    pushTok();
    if (tokens.length) segments.push(tokens);
    tokens = [];
  };

  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (quote) {
      if (c === quote) { quote = null; i++; continue; }
      if (quote === '"' && c === '\\' && text[i + 1] === '"') { buf += '"'; i += 2; continue; }
      buf += c; i++; continue;
    }
    if (c === "'" || c === '"') { quote = c; hasBuf = true; quotedAny = true; i++; continue; }
    if (c === '#' && !hasBuf) { while (i < text.length && text[i] !== '\n') i++; continue; } // chú thích
    if (c === '\n') {
      pushSeg();
      i++;
      if (heredocs.length) { // đọc thân heredoc đến dòng chỉ gồm dấu kết thúc
        const delim = heredocs.shift();
        let body = '';
        while (i < text.length) {
          const eol = text.indexOf('\n', i);
          const line = eol < 0 ? text.slice(i) : text.slice(i, eol);
          i = eol < 0 ? text.length : eol + 1;
          if (line.trim() === delim) break;
          body += `${line}\n`;
        }
        bodies.push(body);
        if (segments.length) segments[segments.length - 1].heredoc = body;
      }
      continue;
    }
    if (c === ';' || c === '|' || (c === '&' && text[i + 1] !== '>' && text[i - 1] !== '>' && text[i - 1] !== '&' ) ) {
      pushSeg();
      i += (c === '|' && text[i + 1] === '|') || (c === '&' && text[i + 1] === '&') ? 2 : 1;
      continue;
    }
    if (c === '&' && text[i + 1] === '&') { pushSeg(); i += 2; continue; }
    if (c === '>' || c === '<') {
      // toán tử chuyển hướng; chữ số đứng ngay trước (2>) thuộc về toán tử
      let op = c;
      if (hasBuf && (/^\d+$/.test(buf) || buf === '&') && !quotedAny) { op = buf + c; buf = ''; hasBuf = false; } else pushTok();
      i++;
      while (text[i] === c || (c === '>' && (text[i] === '|' || text[i] === '&')) || (c === '<' && text[i] === '-')) { op += text[i]; i++; }
      tokens.push({ text: op, quoted: false, op: true });
      if (op.endsWith('<<') || op.endsWith('<<-')) {
        // dấu kết thúc heredoc là từ kế tiếp (bỏ ngoặc)
        let j = i; while (text[j] === ' ' || text[j] === '\t') j++;
        let d = '';
        const q = text[j] === "'" || text[j] === '"' ? text[j] : null;
        if (q) j++;
        while (j < text.length && !/\s/.test(text[j]) && text[j] !== q && !';|&'.includes(text[j])) { d += text[j]; j++; }
        if (d) heredocs.push(d);
      }
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\r') { pushTok(); i++; continue; }
    buf += c; hasBuf = true; i++;
  }
  if (quote) ok = false;
  pushSeg();
  return { segments, ok, bodies };
}

// ---------- nhận dạng lệnh ----------
const WRAPPERS = new Set(['sudo', 'env', 'command', 'time', 'nohup', 'exec', 'builtin', 'nice']);
const SIMPLE_CHANGERS = new Set([
  'tee', 'cp', 'mv', 'rm', 'rmdir', 'mkdir', 'touch', 'chmod', 'chown', 'ln', 'truncate', 'install', 'unlink', 'shred',
  'del', 'erase', 'ren', 'rename', 'move', 'copy', 'xcopy', 'robocopy', 'rd', 'md',
  'set-content', 'add-content', 'out-file', 'new-item', 'remove-item', 'move-item', 'copy-item', 'clear-content', 'rename-item', 'ri', 'mi', 'ci',
]);
// Lệnh mà nguồn chỉ được đọc, đích là đối số cuối: đừng coi nguồn là nơi bị ghi (đã gây chặn nhầm lệnh sao lưu thư mục harness).
const DEST_LAST = new Set(['cp', 'install', 'ln', 'copy', 'xcopy', 'robocopy', 'copy-item', 'ci']);
const GIT_CHANGERS = new Set(['checkout', 'restore', 'rm', 'mv', 'apply', 'stash', 'clean', 'reset', 'switch', 'cherry-pick', 'merge', 'rebase', 'pull']);
const INTERPRETERS = {
  node: ['-e', '--eval', '-p', '--print'], nodejs: ['-e', '--eval', '-p', '--print'],
  python: ['-c'], python3: ['-c'], py: ['-c'],
  perl: ['-e', '-E'], ruby: ['-e'],
  bash: ['-c'], sh: ['-c'], zsh: ['-c'], dash: ['-c'],
  pwsh: ['-command', '-c'], powershell: ['-command', '-c'],
  cmd: ['/c', '/k'],
};
// Trong mã nội tuyến: gọi API ghi/xóa/dời/chuyển hướng.
const WRITE_API = /writeFile|appendFile|createWriteStream|\.write\(|copyFile|cpSync|renameSync|\brename\(|unlink|\brm\b|rmSync|rmdir|mkdir|truncate|chmod|open\([^)]*['"][wa+]|fs\.\w*write|Set-Content|Add-Content|Out-File|Remove-Item|Move-Item|Copy-Item|New-Item|\btee\b|sed\s+-i|\bmv\b|\bcp\b|(^|[^=<>!-])>{1,2}\s*[^&\s=]/i;

// Mã nội tuyến ghi ĐI ĐÂU (P-007). Trước đây chỉ biết "có gọi API ghi hay không", nên mã chỉ ĐỌC một tệp được bảo vệ rồi in ra màn hình
// (process.stdout.write) hoặc ghi kết quả ra một tệp khác cũng bị coi là ghi vào tệp được bảo vệ. Nay tách ba loại:
//   - in ra màn hình: không phải ghi tệp;
//   - lời gọi ghi MỘT tệp mà đích là chuỗi viết thẳng trong mã (writeFileSync('a.txt', ...)): đích đó vào `literalTargets`, bên gọi tự xét;
//   - mọi lời gọi ghi còn lại (đích là biến, ghép chuỗi, sao chép, đổi tên...): `openWrites` = true, tức KHÔNG biết ghi đi đâu.
// Không chắc thì vẫn là openWrites: mã có chdir/cd thì đích tương đối không còn nghĩa, nên không tách.
const STDOUT_WRITE = /\b(?:process\.(?:stdout|stderr)|sys\.(?:stdout|stderr)|console)\s*\.\s*\w+\s*\(/g;
const LITERAL_WRITE = /\b(writeFileSync|writeFile|appendFileSync|appendFile|createWriteStream|unlinkSync|rmSync|rmdirSync|mkdirSync|truncateSync)\s*\(\s*(['"])([^'"`$\\\n]+)\2\s*(?=[,)])/g;
function inlineWrites(code) {
  const text = String(code || '');
  if (!WRITE_API.test(text)) return { openWrites: false, literalTargets: [] };
  if (/\bchdir\s*\(|(^|[;&|\s])cd\s/.test(text)) return { openWrites: true, literalTargets: [] };
  const literalTargets = [];
  const rest = text.replace(STDOUT_WRITE, ' IN( ').replace(LITERAL_WRITE, (all, fn, q, target) => { literalTargets.push(target); return ' DICH_RO( '; });
  return { openWrites: WRITE_API.test(rest), literalTargets };
}

const baseName = (t) => t.replace(/\\/g, '/').split('/').pop().toLowerCase().replace(/\.(exe|cmd|bat|ps1)$/, '');
const isFlag = (t) => t.startsWith('-') && t.length > 1;

function analyzeSegment(seg, out) {
  // tách toán tử chuyển hướng ra khỏi các từ
  const words = [];
  for (let k = 0; k < seg.length; k++) {
    const t = seg[k];
    if (t.op) {
      const op = t.text;
      const next = seg[k + 1];
      if (/^(\d*>>?|\d*>\||&>>?)$/.test(op) && next) {
        const target = next.text;
        if (!BENIGN_TARGETS.has(target.toLowerCase()) && !target.startsWith('&')) out.targets.push(target);
        k++;
      } else if (/^\d*>&$/.test(op) && next) {
        k++; // 2>&1: nối luồng, không ghi tệp
      } else if (/<</.test(op)) {
        k++; // dấu kết thúc heredoc
      } else if (op === '<' || op === '<<<') {
        k++; // đọc vào
      }
      continue;
    }
    words.push(t);
  }
  // bỏ gán biến đầu lệnh và các lệnh bọc
  let idx = 0;
  while (idx < words.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[idx].text) || WRAPPERS.has(baseName(words[idx].text)))) idx++;
  if (idx >= words.length) return;
  const name = baseName(words[idx].text);
  const args = words.slice(idx + 1);
  const texts = args.map((a) => a.text);

  if (DEST_LAST.has(name)) {
    // cp/install/ln/copy...: nguồn chỉ được ĐỌC; chỉ đối số cuối (hoặc thư mục sau -t) là nơi bị ghi.
    out.changing = true;
    const operands = [];
    let explicitDir = false; // có -t <thư mục>: mọi toán hạng còn lại đều là nguồn
    for (let k = 0; k < texts.length; k++) {
      const a = texts[k];
      if ((a === '-t' || a === '--target-directory') && texts[k + 1] !== undefined) { out.targets.push(texts[k + 1]); explicitDir = true; k++; continue; }
      if (a.startsWith('--target-directory=')) { out.targets.push(a.slice('--target-directory='.length)); explicitDir = true; continue; }
      if (!isFlag(a)) operands.push(a);
    }
    if (!explicitDir && operands.length) out.targets.push(operands[operands.length - 1]);
    return;
  }
  if (SIMPLE_CHANGERS.has(name)) {
    out.changing = true;
    for (const a of texts) if (!isFlag(a)) out.targets.push(a);
    // tham số có tên của PowerShell/tee: giá trị đứng sau cờ
    return;
  }
  if (name === 'sed' && texts.some((a) => /^-[a-zA-Z]*i/.test(a) || a === '--in-place' || a.startsWith('--in-place='))) {
    out.changing = true;
    for (const a of texts) if (!isFlag(a)) out.targets.push(a);
    return;
  }
  if (name === 'dd') {
    out.changing = true;
    for (const a of texts) if (a.startsWith('of=')) out.targets.push(a.slice(3));
    return;
  }
  if (name === 'curl') {
    for (let k = 0; k < texts.length; k++) if (/^(-o|--output|-O|--remote-name)$/.test(texts[k])) { out.changing = true; if (texts[k + 1]) out.targets.push(texts[k + 1]); }
    return;
  }
  if (name === 'wget') {
    out.changing = true;
    for (let k = 0; k < texts.length; k++) if (/^(-O|--output-document)$/.test(texts[k]) && texts[k + 1]) out.targets.push(texts[k + 1]);
    return;
  }
  if (name === 'tar' && texts.some((a) => /^-?[a-zA-Z]*x/.test(a) && !a.startsWith('--') )) {
    out.changing = true;
    for (const a of texts) if (!isFlag(a)) out.targets.push(a);
    return;
  }
  if (name === 'git') {
    const sub = texts.find((a) => !isFlag(a));
    if (sub && (GIT_CHANGERS.has(sub) || sub === 'commit' || sub === 'add' || sub === 'push' || sub === 'tag')) {
      out.changing = true;
      if (GIT_CHANGERS.has(sub)) for (const a of texts.slice(texts.indexOf(sub) + 1)) if (!isFlag(a)) out.targets.push(a);
    }
    return;
  }
  if (INTERPRETERS[name]) {
    const flags = INTERPRETERS[name];
    let code = null;
    for (let k = 0; k < texts.length; k++) {
      if (flags.includes(texts[k].toLowerCase()) && texts[k + 1] !== undefined) { code = texts[k + 1]; break; }
    }
    if (code === null && seg.heredoc !== undefined) code = seg.heredoc; // node - <<EOF ... EOF
    if (code !== null) out.inline.push({ code, writes: WRITE_API.test(code), interpreter: name, ...inlineWrites(code) });
    return;
  }
  if (['npm', 'npx', 'pnpm', 'yarn', 'pip', 'pip3', 'docker', 'make'].includes(name)) {
    const sub = texts.find((a) => !isFlag(a)) || '';
    if (name === 'npx' || (name === 'docker' && /^(compose|build|run|rm|rmi|up|down|stop|kill|prune)$/.test(sub)) ||
        (['npm', 'pnpm', 'yarn', 'pip', 'pip3'].includes(name) && /^(i|install|uninstall|ci|update|publish|link|add|remove)$/.test(sub))) out.changing = true;
  }
}

function analyzeBash(cmd) {
  const { segments, ok } = scan(cmd);
  const out = { targets: [], inline: [], changing: false, unparsable: !ok, skeleton: '' };
  for (const seg of segments) analyzeSegment(seg, out);
  // "xương" của lệnh: từ không có ngoặc, bỏ thân heredoc; dùng để so từ khóa mà không dính nội dung chuỗi
  out.skeleton = segments.map((seg) => {
    const parts = [];
    for (let k = 0; k < seg.length; k++) {
      if (seg[k].op) { k++; continue; } // toán tử chuyển hướng và toán hạng của nó không thuộc "xương" lệnh
      parts.push(seg[k].quoted ? 'Q' : seg[k].text);
    }
    return parts.join(' ');
  }).join(' ; ');
  return out;
}

module.exports = { analyzeBash, scan, WRITE_API, inlineWrites };
