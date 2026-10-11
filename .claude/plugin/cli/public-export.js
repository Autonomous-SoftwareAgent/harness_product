'use strict';
// spec: HOOK-S-009
// ĐÓNG GÓI harness thành sản phẩm cài được cho dự án khác (S-063), từ bản ĐÃ COMMIT của repo này (không lẫn tệp đang sửa dở).
//   node .claude/plugin/cli/cli.js public-export <thư mục đích>
// Gói = thư mục `.claude/` để chép nguyên vào dự án, cộng `.mcp.json`, `README.md`, `.gitattributes` ở gốc gói. KHÔNG mang:
// tài liệu và cách phát triển harness (plugin/docs, plugin/CLAUDE.md), test và lưới test (*/test/, acceptance/, features.json), cấu hình
// và skill riêng của dự án nguồn (project.json, skills-map.json, units.json, bộ sinh trang riêng), sổ phiên, danh sách từ cấm.
// Skill của gói lấy từ plugin/product/skills/ (viết cho sản phẩm) cộng vài skill dùng chung được thay chữ riêng của dự án nguồn.
// Sau khi chép: ghi dấu vân tay cổng duyệt cho gói, rồi DÒ gói (từ cấm, nội dung docs/ của dự án nguồn, bí mật, đường dẫn máy, tên nội bộ).
// Dò không sạch thì `ok: false` và nêu từng chỗ; không tự che. Lệnh không commit, không đẩy.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// Tệp của .claude/plugin KHÔNG vào gói (đường dẫn tính từ .claude/plugin, kiểu posix).
const EXCLUDE = [
  /^docs(\/|$)/, /^CLAUDE\.md$/, /(^|\/)test(\/|$)/, /^acceptance(\/|$)/, /^features\.json$/,
  /^project\.json$/, /^skills-map\.json$/, /^units\.json$/, /^product(\/|$)/,
  /^mcp\/portal\/generators(\/|$)/, /^mcp\/generators(\/|$)/,
  /^gate\/MANIFEST\.json$/, /^gate\/MIGRATED_AT$/, /^gate\/gate\.config\.json$/,
  /^gate\/README\.md$/, // tài liệu phát triển cổng duyệt của dự án nguồn; người dùng gói đọc FORMAT.md và README của gói
];
// Skill dùng chung lấy từ .claude/skills của dự án nguồn, thay chữ riêng của nó bằng chữ chung.
const SHARED_SKILLS = ['diagrams', 'context', 'service-docs'];
const REWRITE = [
  [/ Cần hạ tầng local đang chạy \(`node infra\/bsn\.js up --apply` từ `BSN_\/`\)\./g, ' Cần một PostgreSQL đang chạy trên máy.'],
  [/`BSN_\/docs\/portal\/`/g, '`docs/portal/`'],
  [/Phiên mở ở `BSN_\/`/g, 'Phiên mở ở gốc dự án'],
  [/\(chạy từ `BSN_\/`\)/g, '(chạy từ gốc dự án)'],
  [/chạy từ `BSN_\/`/g, 'chạy từ gốc dự án'],
  [/\(từ `BSN_\/`\)/g, '(từ gốc dự án)'],
  [/`BSN_\/`/g, 'gốc dự án'],
  [/Dịch vụ nằm ở `system_service\/<tên>\/`\./g, 'Đơn vị nằm ở thư mục khai trong `.claude/plugin/project.json`.'],
  [/`system_service\/<tên>\//g, '`<thư mục đơn vị>/'],
  [/ hay `infra\/services\/<dịch-vụ>\.json`/g, ''],
  [/ \(ví dụ đơn, lần thử của Payment Hub nằm trong cột `doc` của bảng `docs`\)/g, ''],
];
// Dò gói. strict: mọi tệp chữ của gói; internal: tên nội bộ chỉ cấm trong tài liệu và skill (mã còn nhắc bố cục cũ như một chế độ tương thích).
const SECRET = /ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|dckr_pat_[A-Za-z0-9_-]{10,}|\bsk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY/;
const MACHINE = /[A-Za-z]:[\\/]+(Users|Training)[\\/]|\/home\/[a-z]+\/|[A-Za-z0-9._%+-]+@(gmail|yahoo|outlook|hotmail)\.com/i;
const INTERNAL = /payment-hub|provider-service|\bingest\b|system_service|BSN_|\bBSN\b(?!-docs)|infra\/services|nguyen1410|ai-sdlc|Payment Hub|VNPay|MoMo|OnePay/i;

const git = (root, args, opts = {}) => spawnSync('git', ['-C', root, '-c', 'core.quotepath=false', ...args], { maxBuffer: 1 << 30, ...opts });
const posix = (p) => p.split(path.sep).join('/');

function committed(root, rel) {
  const r = git(root, ['show', `HEAD:${rel}`]);
  if (r.status !== 0) throw new Error(`không đọc được ${rel} ở HEAD: ${String(r.stderr).trim()}`);
  return r.stdout; // Buffer
}

// Bảng việc -> skill mặc định của sản phẩm: công cụ ghi và công cụ chỉ đọc của bsn-docs lấy từ bảng của dự án nguồn; bỏ mẫu tệp riêng của nó.
function productProject(sourceSkills) {
  return {
    _: 'Cấu hình dự án của harness. Chưa khai đơn vị nào: mở phiên Claude Code ở gốc dự án, harness nhắc chạy skill onboard để khai. Nghĩa từng trường: .claude/plugin/FORMAT.md.',
    name: '',
    defaultUnit: '',
    units: { parents: [], dirs: {} },
    skills: {
      mode: 'enforce',
      overview: 'services',
      serviceDocs: ['CLAUDE.md', 'docs/agent/STATUS.md'],
      tools: Object.fromEntries(Object.entries(sourceSkills.tools || {}).filter(([, s]) => s !== 'cicd')),
      readonly: sourceSkills.readonly || [],
      files: [],
    },
    policies: { rootNeverPush: false, docsNeverPush: false, unitSheets: [], readOnlyDirs: [] },
  };
}

// settings.json của gói: bỏ luật quyền nhắc đường dẫn riêng của dự án nguồn; hook giữ nguyên.
function productSettings(raw) {
  const s = JSON.parse(raw);
  if (s.permissions && Array.isArray(s.permissions.deny)) s.permissions.deny = s.permissions.deny.filter((d) => !/system_service|infra\//.test(d));
  return `${JSON.stringify(s, null, 2)}\n`;
}

const README = `# harness_product

Bộ harness cho Claude Code: phiên Claude chỉ sửa tệp sau khi bạn duyệt một kế hoạch, giữ đúng phạm vi đã duyệt, phải đọc hướng dẫn và tài liệu của phần đang sửa trước khi ghi, ghi tài liệu và sơ đồ qua công cụ có kiểm tra, và để lại sổ ghi lại phiên đã làm gì.

## Cài vào một dự án
Cần Node 22.5 trở lên (dùng SQLite có sẵn của Node) và git.

1. Tải repo này về một chỗ bất kỳ: \`git clone https://github.com/Autonomous-SoftwareAgent/harness_product\`
2. Chép thư mục \`.claude/\` và tệp \`.mcp.json\` vào GỐC dự án của bạn.
   - Dự án đã có \`.claude/\`: chép \`.claude/plugin/\` và \`.claude/skills/*\` vào, rồi trộn phần \`hooks\` của \`.claude/settings.json\` vào settings đang có.
   - Dự án đã có \`.mcp.json\`: không cần chép; lần mở phiên đầu harness tự thêm mục \`bsn-docs\`.
3. Mở Claude Code ở gốc dự án. Claude Code hỏi có tin thư mục này không: chọn có, để hook chạy.
4. Tóm tắt đầu phiên báo "CHƯA CÀI ĐẶT DỰ ÁN". Bảo Claude: "onboard dự án này". Agent đọc dự án, trình kế hoạch tổ chức (đơn vị nằm ở đâu, trước khi sửa phải đọc gì, việc nào cần skill nào), bạn duyệt, agent ghi \`.claude/plugin/project.json\` và dựng phần tài liệu còn thiếu.
5. Kiểm: \`node .claude/plugin/cli/cli.js doctor\` không có dòng LỖI. Gõ \`/mcp\` nếu tóm tắt đầu phiên nhắc.

## Phiên đầu tiên sẽ xảy ra gì
- Cổng duyệt kế hoạch chạy ngay: Claude không sửa tệp nào khi bạn chưa duyệt kế hoạch.
- Harness tạo \`.mcp.json\` (nếu thiếu) và thư mục trạng thái của nó bên trong \`.claude/\` (sổ phiên SQLite; tệp \`.claude/.gitignore\` của gói đã bỏ qua thư mục này).
- Các luật theo đơn vị (đọc tài liệu trước khi sửa, giữ phạm vi theo kế hoạch) bắt đầu áp sau khi \`project.json\` khai đơn vị.

## Gồm những gì
| Thứ | Ở đâu |
|---|---|
| Khuôn làm việc chung, cấu hình dự án | \`.claude/plugin/FORMAT.md\` |
| Hook (cổng duyệt, phạm vi, skill, tệp do công cụ sở hữu, từ cấm, đẩy) | \`.claude/settings.json\` khai, mã ở \`.claude/plugin/\` |
| Máy chủ MCP \`bsn-docs\` (tài liệu, sơ đồ, kho ngữ nghĩa, phạm vi) | \`.claude/plugin/mcp/\` |
| Skill | \`.claude/skills/\` (\`onboard\`, \`skill-map\`, \`services\`, \`service-docs\`, \`diagrams\`, \`context\`, \`service-page\`, \`new-service\`) |
| Lệnh | \`node .claude/plugin/cli/cli.js\` (\`doctor\`, \`check\`, \`portal\`...) |

## Gỡ ra
Xóa khối \`hooks\` trong \`.claude/settings.json\`, mục \`bsn-docs\` trong \`.mcp.json\`, rồi xóa \`.claude/plugin/\`, các skill trên và thư mục trạng thái của harness trong \`.claude/\`.

## Giới hạn
- Chữ trong skill, lời báo và tài liệu là tiếng Việt.
- Hook của Claude Code cho qua khi hook hỏng hay quá giờ; \`doctor\` và tóm tắt đầu phiên báo khi có vấn đề.
- Hook là hàng rào cho phiên Claude, không phải sandbox: người ngồi trước máy vẫn sửa được mọi thứ.
- Thư viện vẽ sơ đồ (Mermaid, giấy phép MIT) đi kèm ở \`.claude/plugin/mcp/vendor/\`.
`;

function run(root, dest) {
  const out = [];
  if (fs.existsSync(dest) && fs.readdirSync(dest).length) return { ok: false, text: `Thư mục đích ${dest} không trống: chọn thư mục mới (lệnh không ghi đè).` };
  const ls = git(root, ['ls-tree', '-r', '--name-only', '-z', 'HEAD', '--', '.claude/plugin'], { encoding: 'utf8' });
  if (ls.status !== 0) return { ok: false, text: `không đọc được HEAD: ${ls.stderr}` };
  const files = [];
  const put = (rel, data) => { const p = path.join(dest, ...rel.split('/')); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data); files.push(rel); };
  for (const rel of ls.stdout.split('\0').filter(Boolean)) {
    const inPlugin = rel.slice('.claude/plugin/'.length);
    if (EXCLUDE.some((re) => re.test(inPlugin))) continue;
    put(rel, committed(root, rel));
  }
  // cấu hình dự án trống, bảng skill mặc định
  let srcSkills = {};
  try { srcSkills = require('../gate/gate-paths').projectConfig(root).skillsRaw || {}; } catch { /* không có: bảng rỗng */ }
  put('.claude/plugin/project.json', `${JSON.stringify(productProject(srcSkills), null, 2)}\n`);
  // skill: viết cho sản phẩm, cộng skill dùng chung đã thay chữ
  const prodLs = git(root, ['ls-tree', '--name-only', '-z', 'HEAD', '--', '.claude/plugin/product/skills/'], { encoding: 'utf8' });
  for (const rel of prodLs.stdout.split('\0').filter((f) => f.endsWith('.md'))) put(`.claude/skills/${path.basename(rel, '.md')}/SKILL.md`, committed(root, rel));
  for (const name of SHARED_SKILLS) {
    if (files.includes(`.claude/skills/${name}/SKILL.md`)) continue; // sản phẩm đã có bản riêng
    let text = committed(root, `.claude/skills/${name}/SKILL.md`).toString('utf8');
    for (const [re, to] of REWRITE) text = text.replace(re, to);
    put(`.claude/skills/${name}/SKILL.md`, text);
  }
  put('.claude/settings.json', productSettings(committed(root, '.claude/settings.json').toString('utf8')));
  const P = require('../gate/gate-paths');
  const inClaude = (abs) => posix(path.relative(path.join(root, '.claude'), abs));
  put('.claude/.gitignore', `${inClaude(P.stateDir(root))}/\nsettings.local.json\n${inClaude(P.localDir(root))}/\nworktrees/\n`);
  put('.mcp.json', `${JSON.stringify({ mcpServers: { 'bsn-docs': { command: 'node', args: ['.claude/plugin/mcp/mcp-server.js'] } } }, null, 2)}\n`);
  put('README.md', README);
  put('.gitattributes', '* -text\n'); // giữ nguyên từng byte: dấu vân tay của cổng duyệt tính trên nội dung tệp
  // dấu vân tay cổng duyệt cho gói
  const st = spawnSync(process.execPath, [path.join(dest, '.claude', 'plugin', 'gate', 'install.js'), '--stamp', dest], { encoding: 'utf8' });
  if (st.status !== 0) out.push(`LỖI: không ghi được dấu vân tay cổng duyệt: ${st.stderr || st.stdout}`);
  else files.push('.claude/plugin/gate/MANIFEST.json');

  // DÒ gói
  const hits = [];
  const words = (() => { try { return require('../adapters/project/workspace').loadWords(root); } catch { return null; } })();
  const banned = words ? require('../core/rules/lib/banned-words').matcher(words) : null;
  for (const rel of files) {
    const abs = path.join(dest, ...rel.split('/'));
    const buf = fs.readFileSync(abs);
    if (banned && banned.test(rel)) hits.push(`${rel}: từ cấm trong tên tệp`);
    if (buf.includes(0)) continue;
    const text = buf.toString('utf8');
    const docText = /\.(md|json)$/.test(rel) && !rel.startsWith('.claude/plugin/mcp/vendor/');
    text.split('\n').forEach((line, i) => {
      const at = `${rel}:${i + 1}`;
      if (banned && banned.test(line)) hits.push(`${at}: từ cấm`);
      if (SECRET.test(line)) hits.push(`${at}: giống bí mật`);
      if (MACHINE.test(line) && !rel.startsWith('.claude/plugin/mcp/vendor/')) hits.push(`${at}: đường dẫn máy hay địa chỉ thư thật`);
      if (docText && INTERNAL.test(line)) hits.push(`${at}: tên nội bộ của dự án nguồn`);
    });
  }
  try {
    for (const l of require('../adapters/git/docs-leaks').scanDir(root, dest)) hits.push(`${l.file}: ${l.why}`);
  } catch (e) { hits.push(`không dò được nội dung docs/: ${e.message}`); }
  out.unshift(`Gói: ${dest} (${files.length} tệp, từ commit ${String(git(root, ['rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8' }).stdout).trim()}).`);
  if (hits.length) out.push(`DÒ KHÔNG SẠCH (${hits.length} chỗ):`, ...hits.slice(0, 80).map((h) => `  ${h}`), ...(hits.length > 80 ? [`  ... còn ${hits.length - 80}`] : []));
  else out.push(`Dò sạch: từ cấm${banned ? '' : ' (máy không có danh sách: KHÔNG dò)'}, nội dung docs/, bí mật, đường dẫn máy, tên nội bộ trong tài liệu và skill.`);
  out.push('Danh sách tệp cho phép (đối chiếu sau khi đẩy):', ...files.sort().map((f) => `  ${f}`));
  return { ok: !hits.length && !out.some((l) => l.startsWith('LỖI')), text: out.join('\n'), files: files.sort(), hits };
}

module.exports = { run, EXCLUDE, REWRITE, productProject, productSettings };
