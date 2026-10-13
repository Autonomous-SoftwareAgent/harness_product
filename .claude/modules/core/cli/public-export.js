'use strict';
// spec: HOOK-S-009
// spec: HOOK-S-010
// spec: HOOK-S-014
// spec: HOOK-S-015
// spec: HOOK-S-016
// ĐÓNG GÓI harness thành sản phẩm cài được cho dự án khác, từ bản ĐÃ COMMIT của repo này (không lẫn tệp đang sửa dở).
//   node <harness>/cli/cli.js public-export <thư mục đích>
// Bản nguồn đã ở BỐ CỤC KHỐI: gói là chính cây .claude/modules/<khối>/ của các khối đi vào gói, chép nguyên từng byte, bỏ phần
// chỉ dùng để phát triển harness. Gói có:
//   .claude/modules/<khối>/<đường dẫn logic>   mã của sản phẩm (đường dẫn logic: đường dẫn của tệp bên trong khối)
//   .claude/modules/<khối>/module.json         tệp tự khai của khối; .claude/modules/<khối>/skills/<tên>.md bản gốc của skill
//   .claude/modules/index.json, FILES.json, MANIFEST.json, VERSION   chỉ mục logic -> khối, dấu từng tệp, dấu vân tay cổng duyệt, phiên bản
//   .claude/project/                            khuôn phần của dự án (project.json trống, công tắc)
//   .claude/skills/<tên>/SKILL.md, .claude/settings.json, .mcp.json   chỗ Claude Code đọc; settings và .mcp.json sinh bằng bộ cài (cli/setup.js)
//   README.md, RELEASES.md                      cách cài; SỔ PHÁT HÀNH: bản gốc ở core/RELEASES.md, số bản đang đóng gói phải có
//                                               mục ở đầu sổ và đủ phần, nếu không lệnh báo LỖI (không bản nào ra ngoài mà thiếu báo cáo)
// KHÔNG mang: test và tài liệu phát triển harness (.claude/modules/test/, docs/, CLAUDE.md), cấu hình và skill riêng của dự án nguồn,
// khối riêng của dự án nguồn, sổ phiên, từ cấm. Sau khi dựng: dò MỌI tệp chữ của gói, kể cả mã (từ cấm, nội dung docs/ của dự án nguồn,
// bí mật, đường dẫn máy, dấu vết của dự án nguồn, mã quyết định nội bộ). Dò không sạch thì `ok: false` và nêu từng chỗ; không tự che.
// Điều RIÊNG của dự án nguồn (chữ phải thay trong skill, mẫu nhận ra tên nội bộ) không nằm ở tệp này mà ở
// .claude/project/export.json của dự án nguồn: { rewrite: [[mẫu, chữ thay]], internal: [{ re, flags }], dropPermissions: mẫu }.
// Lệnh không commit, không đẩy.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

// Tệp của một khối KHÔNG vào gói (đường dẫn tính từ .claude/modules/, kiểu posix).
const EXCLUDE = [
  /^core\/gate\/README\.md$/, // tài liệu phát triển cổng duyệt của dự án nguồn; người dùng gói đọc FORMAT.md và README của gói
  /^portal\/mcp\/generators(\/|$)/, /(^|\/)test(\/|$)/,
];
// Khối đi vào gói; khối không có tên ở đây là phần riêng của dự án nguồn.
const SHIP = ['core', 'servicedocs', 'diagrams', 'context', 'portal', 'guard-push'];
// Tệp đánh dấu dòng này thì KHÔNG viết lại đường dẫn `.claude/plugin/...` trong chữ (bộ cài cần nói về bố cục cũ).
const KEEP_PATHS = 'harness-export: giữ đường dẫn bố cục cũ';
// Dò gói: mọi tệp chữ của gói. Bí mật và đường dẫn máy là mẫu chung; dấu vết của dự án nguồn lấy từ export.json của dự án nguồn.
const SECRET = /ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|dckr_pat_[A-Za-z0-9_-]{10,}|\bsk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY/;
const MACHINE = /[A-Za-z]:[\\/]+Users[\\/]|\/home\/[a-z]+\/|[A-Za-z0-9._%+-]+@(gmail|yahoo|outlook|hotmail)\.com/i;
// Mã quyết định nội bộ của dự án nguồn (S-nnn): người cài không tra được. Mã spec kiểu HOOK-S-014 không tính.
const DECISION = /(?<![A-Z]-)\bS-\d{3}\b/;
// Dòng mang dấu này được phép nhắc tên của bố cục cũ (chế độ tương thích: cây chưa có project.json).
const KEEP_NAMES = 'harness-export: bố cục cũ';
// NỢ ĐÃ BIẾT: tệp của gói còn mang dấu vết mà lượt này không sửa được bằng cách đổi chữ. Lệnh in ra số chỗ ở từng tệp mỗi lần đóng gói.
const KNOWN = [
  { file: /^\.claude\/modules\/core\/mcp\/mcp-server\.js$/, why: 'tệp mồi của máy chủ MCP bị khóa nội dung (sửa là mọi phiên đang mở phải nối lại)' },
  { file: /^\.claude\/modules\/context\/mcp\/context\/(context\.js|recognizers\/sources\/(code|infra-services|markdown)\.js)$/, why: 'kho ngữ nghĩa còn đọc tờ khai báo triển khai ở một đường dẫn cố định; dự án không có thì bỏ qua' },
];

// Phần riêng của dự án nguồn cho việc đóng gói, đọc từ bản đã commit. Không có tệp thì không thay chữ nào và không có mẫu tên nội bộ.
function exportConfig(root, tracked) {
  const rel = '.claude/project/export.json';
  if (!tracked.includes(rel)) return { rewrite: [], internal: [], dropPermissions: null, missing: true };
  const raw = JSON.parse(committed(root, rel).toString('utf8'));
  return {
    rewrite: (raw.rewrite || []).map(([re, to]) => [new RegExp(re, 'g'), to]),
    internal: (raw.internal || []).map((x) => new RegExp(x.re, x.flags || '')),
    dropPermissions: raw.dropPermissions ? new RegExp(raw.dropPermissions) : null,
  };
}

// Bỏ mã quyết định nội bộ khỏi chữ của skill lấy từ dự án nguồn (mã trong mã nguồn của các khối đã được bỏ ở bản nguồn).
function stripDecisions(text) {
  const C = '(?<![A-Z]-)\\bS-\\d{3}\\b';
  const SEP = '\\s*(?:,|;|và|hoặc|đến)\\s*';
  return text
    .replace(new RegExp(`[ \\t]*\\(${C}(?:${SEP}${C})*\\)`, 'g'), '')
    .replace(new RegExp(`\\(${C}(?:${SEP}${C})*\\s*[:;,]\\s*`, 'g'), '(')
    .replace(new RegExp(`(?:\\s*[,;]\\s*${C})+(?=\\s*[),;])`, 'g'), '');
}

const git = (root, args, opts = {}) => spawnSync('git', ['-C', root, '-c', 'core.quotepath=false', ...args], { maxBuffer: 1 << 30, ...opts });
const posix = (p) => p.split(path.sep).join('/');
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

function committed(root, rel) {
  const r = git(root, ['show', `HEAD:${rel}`]);
  if (r.status !== 0) throw new Error(`không đọc được ${rel} ở HEAD: ${String(r.stderr).trim()}`);
  return r.stdout; // Buffer
}

// Chỗ của một tệp theo bản đồ layout.json (quy tắc đầu tiên khớp thắng). null nếu không quy tắc nào khớp.
function placer(layout) {
  return (rel) => {
    const r = layout.rules.find((x) => (x.match.endsWith('/') ? rel.startsWith(x.match) : rel === x.match));
    if (!r) return null;
    const to = r.to ? (r.match.endsWith('/') ? r.to + rel.slice(r.match.length) : r.to) : `.claude/modules/${r.module}/${rel.slice('.claude/plugin/'.length)}`;
    return { module: r.module, owner: r.owner || 'product', to, moved: Boolean(r.to) };
  };
}

// Bảng việc -> skill mặc định của sản phẩm: công cụ ghi và công cụ chỉ đọc của bsn-docs lấy từ bảng của dự án nguồn; bỏ mẫu tệp riêng của nó
// và mọi dòng trỏ tới skill không đi kèm gói (`shipped`: tên các skill của gói).
function productProject(sourceSkills, shipped) {
  return {
    _: 'Cấu hình dự án của harness. Chưa khai đơn vị nào: mở phiên Claude Code ở gốc dự án, harness nhắc chạy skill onboard để khai. Nghĩa từng trường: .claude/modules/core/FORMAT.md.',
    name: '',
    defaultUnit: '',
    lang: 'vi',
    units: { parents: [], dirs: {}, layout: 'harness' },
    skills: {
      mode: 'enforce',
      overview: 'services',
      serviceDocs: ['CLAUDE.md', 'docs/agent/STATUS.md'],
      tools: Object.fromEntries(Object.entries(sourceSkills.tools || {}).filter(([, sk]) => [].concat(sk).every((x) => shipped.has(x)))),
      readonly: sourceSkills.readonly || [],
      files: [],
    },
    policies: { rootNeverPush: false, docsNeverPush: false, unitSheets: [], readOnlyDirs: [] },
  };
}

// settings.json nền của gói: bỏ luật quyền nhắc đường dẫn riêng của dự án nguồn và mọi hook (bộ cài sinh lại hook từ tệp tự khai).
function productSettings(raw, drop) {
  const s = JSON.parse(raw);
  if (s.permissions && Array.isArray(s.permissions.deny)) s.permissions.deny = s.permissions.deny.filter((d) => !(drop && drop.test(d)));
  delete s.hooks;
  return s;
}

// Viết lại lệnh nhập tương đối của một tệp mã đã dời chỗ. `from` là đường dẫn logic của tệp, `phys` là chỗ mới (tính từ gốc gói),
// `where(logical)` trả chỗ mới của một tệp logic (hoặc null). Trả { text, broken: [lệnh nhập trỏ ra ngoài gói] }.
function rewriteRequires(text, from, phys, where, logicalSet) {
  const broken = [];
  const out = text.replace(/require\(\s*(['"])(\.{1,2}\/[^'"]*)\1\s*\)/g, (all, q, spec) => {
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
    const cand = [base, `${base}.js`, `${base}.json`, `${base}/index.js`].find((c) => logicalSet.has(c));
    if (!cand) { broken.push(`${from} -> ${spec}`); return all; }
    const to = where(cand);
    if (!to) { broken.push(`${from} -> ${spec} (tệp không vào gói)`); return all; }
    let rel = path.posix.relative(path.posix.dirname(phys), to);
    if (!rel.startsWith('.')) rel = `./${rel}`;
    if (cand !== spec && !spec.endsWith('.js') && !spec.endsWith('.json')) rel = rel.replace(cand.endsWith('/index.js') ? /\/index\.js$/ : /\.js$/, '');
    return `require(${q}${rel}${q})`;
  });
  return { text: out, broken };
}

// Viết lại `.claude/plugin/<x>` trong chữ thành chỗ thật trong gói. Đường dẫn không biết thì để nguyên (trả về để báo).
function rewritePaths(text, where, dirModule) {
  const unknown = [];
  const out = text.replace(/\.claude\/plugin\/([A-Za-z0-9_.\-/<>]*[A-Za-z0-9_\->])?/g, (all, p) => {
    if (!p) return '.claude/modules/';
    const clean = p.replace(/\/+$/, '');
    const to = where(clean);
    if (to) return to;
    const m = dirModule(clean);
    if (m) return `.claude/modules/${m}/${clean}`;
    unknown.push(clean);
    return all;
  });
  return { text: out, unknown };
}

const README = `# harness_product

Bộ harness cho Claude Code: phiên Claude chỉ sửa tệp sau khi bạn duyệt một kế hoạch, giữ đúng phạm vi đã duyệt, phải đọc hướng dẫn và tài liệu của phần đang sửa trước khi ghi, ghi tài liệu và sơ đồ qua công cụ có kiểm tra, và để lại sổ ghi lại phiên đã làm gì.

## Cài vào một dự án
Cần Node 22.5 trở lên (dùng SQLite có sẵn của Node) và git.

1. Tải repo này về một chỗ bất kỳ (không phải trong dự án): \`git clone https://github.com/Autonomous-SoftwareAgent/harness_product\`
2. Xem trước việc sẽ làm: \`node harness_product/.claude/modules/core/cli/cli.js install <thư mục dự án>\`
3. Làm thật: thêm \`--apply\`. Lệnh chép mã vào \`<dự án>/.claude/modules/\`, tạo \`.claude/project/\` (phần của dự án), chép skill còn thiếu vào \`.claude/skills/\`, rồi viết phần của harness trong \`.claude/settings.json\` và \`.mcp.json\` (phần bạn tự thêm được giữ). Bản cũ được cất để quay lại: \`install <dự án> --undo\`.
4. Mở Claude Code ở gốc dự án. Claude Code hỏi có tin thư mục này không: chọn có, để hook chạy.
5. Tóm tắt đầu phiên báo "CHƯA CÀI ĐẶT DỰ ÁN". Bảo Claude: "onboard dự án này". Agent đọc dự án, trình kế hoạch tổ chức (đơn vị nằm ở đâu, trước khi sửa phải đọc gì, việc nào cần skill nào), bạn duyệt, agent ghi \`.claude/project/project.json\` và dựng phần tài liệu còn thiếu.
6. Kiểm: \`node .claude/modules/core/cli/cli.js doctor\` không có dòng LỖI. Gõ \`/mcp\` nếu tóm tắt đầu phiên nhắc.

Bản này có gì, nâng cấp phải làm gì, đã kiểm bằng gì và điều gì chưa kiểm: [RELEASES.md](RELEASES.md), mỗi bản một mục.

## Nâng cấp, và chuyển từ bản cũ
- Đọc phần "Nâng cấp" của bản mới trong [RELEASES.md](RELEASES.md), tải bản mới rồi chạy lại bước 2 và 3 với bản mới. Mã trong \`.claude/modules/\` được thay; \`.claude/project/\`, skill bạn đã sửa, sổ phiên và phần settings của bạn giữ nguyên. Tệp mã bạn từng sửa tay được nêu tên (bản cũ nằm trong chỗ cất).
- Dự án đang dùng bản cũ (mọi thứ trong \`.claude/plugin/\`): cùng lệnh \`install\`. Lệnh chuyển cấu hình (\`project.json\`, bảng đơn vị, bảng skill, công tắc, bộ sinh riêng, luật mở rộng) sang \`.claude/project/\`, giữ sổ phiên, cất \`.claude/plugin/\` cũ để quay lại, và nêu các tệp cổng duyệt bạn từng sửa.

## Bố cục
| Chỗ | Của ai | Giữ gì |
|---|---|---|
| \`.claude/modules/<khối>/\` | sản phẩm | mã harness; bản mới thay toàn bộ |
| \`.claude/project/\` | dự án | \`project.json\` (khối bật, bộ khuôn, ngôn ngữ, đơn vị, bảng skill, luật), luật mở rộng \`rules/\`, bộ sinh riêng |
| \`.claude/skills/\`, \`.claude/settings.json\`, \`.mcp.json\` | chung | chỗ Claude Code đọc; bộ cài viết phần của harness, giữ phần của bạn |
| \`.claude/local/\` và thư mục trạng thái trong \`.claude/\` | máy | từ cấm, sổ phiên, trạng thái cổng duyệt; không commit |

Khối: \`core\` (bắt buộc: cổng duyệt kế hoạch, phạm vi theo kế hoạch, chặn theo skill, sổ phiên, máy chủ MCP, bộ cài), \`servicedocs\` (tài liệu ba tầng), \`diagrams\` (sơ đồ), \`context\` (kho ngữ nghĩa), \`portal\` (trang HTML cho người đọc), \`guard-push\` (từ cấm, chặn đẩy). Chỉ bật một số khối: khóa \`modules\` trong \`project.json\` (hoặc \`"preset": "light"\`), rồi \`node .claude/modules/core/cli/cli.js setup\`.

## Máy chủ MCP khác, và chuyển việc sang phiên mới
- Harness có một máy chủ MCP cho mỗi khối đang bật (\`harness\`, \`harness-docs\`, ...); \`harness-mcp\` là cổng: máy chủ MCP khác khai trong \`.claude/project/mcp.json\` và chạy phía sau nó, có hiệu lực ở phiên đang mở mà không phải nối lại. Máy chủ mới chỉ chạy sau khi bạn duyệt một kế hoạch và phiên chạy \`mcp trust\`. Cách làm: skill \`mcp-servers\`.
- Việc đang dở chuyển sang một phiên mới bằng \`node .claude/modules/core/cli/session.js transfer\`, kèm tờ bàn giao mà phiên mới phải đọc. Cách làm: skill \`transfer-session\`.

## Thêm luật của riêng dự án
Đặt \`.claude/project/rules/<id>.js\` xuất \`{ id, on, api: "0.1", run(event, ports) }\` (sự kiện và quyết định: \`.claude/modules/core/ports/events.js\`), rồi chạy \`setup\` để khai hook. Mã trong \`.claude/modules/\` không phải sửa.

## Gỡ ra
\`install <dự án> --undo\` quay lại trạng thái trước lần cài gần nhất. Gỡ hẳn: xóa nhóm hook trỏ vào \`.claude/modules/\` trong \`.claude/settings.json\`, các mục \`harness*\` trong \`.mcp.json\`, rồi xóa \`.claude/modules/\`, \`.claude/project/\` và thư mục trạng thái của harness trong \`.claude/\`.

## Giới hạn
- Lời chặn và lời nhắc của lõi có tiếng Việt và tiếng Anh (\`"lang": "en"\` trong \`project.json\`); skill và tài liệu của gói là tiếng Việt.
- Hook của Claude Code cho qua khi hook hỏng hay quá giờ; \`doctor\` và tóm tắt đầu phiên báo khi có vấn đề.
- Hook là hàng rào cho phiên Claude, không phải sandbox: người ngồi trước máy vẫn sửa được mọi thứ.
- Thư viện vẽ sơ đồ (Mermaid, giấy phép MIT) đi kèm ở \`.claude/modules/diagrams/mcp/vendor/\`.
`;

// Tệp của GÓI đã đổi giữa hai mốc của repo nguồn (để đối chiếu với tờ thay đổi): [{ status: 'A'|'M'|'D', path }], đường dẫn tính từ thư mục
// mã. Chỉ tính tệp đi vào gói; không tính chính các tờ thay đổi. Skill mà khối không giữ bản gốc (bản trong gói sinh từ .claude/skills của
// dự án nguồn) được tính ở chỗ nó nằm trong gói: <khối>/skills/<tên>.md.
function changedSince(root, prevRef, ref = 'HEAD') {
  const HOME = '.claude/modules/';
  const inner = (rel) => rel.slice(HOME.length);
  const shippedPath = (rel) => { if (!rel.startsWith(HOME)) return false; const i = inner(rel); return SHIP.includes(i.split('/')[0]) && i.includes('/') && !EXCLUDE.some((re) => re.test(i)); };
  const pairs = (args) => { const raw = String(git(root, ['diff', '--name-status', '--no-renames', '-z', prevRef, ref, '--', ...args], { encoding: 'utf8' }).stdout).split('\0').filter(Boolean); const o = []; for (let i = 0; i + 1 < raw.length; i += 2) o.push({ status: raw[i][0], path: raw[i + 1] }); return o; };
  const out = pairs(['.claude/modules']).filter((x) => shippedPath(x.path)).map((x) => ({ status: x.status, path: inner(x.path) })).filter((x) => !/^core\/releases\/\d+\.\d+\.\d+\.json$/.test(x.path));
  const now = new Set(String(git(root, ['ls-tree', '-r', '--name-only', '-z', ref, '--', '.claude/modules'], { encoding: 'utf8' }).stdout).split('\0').filter(Boolean));
  const blockOf = {};
  for (const m of SHIP) { try { for (const n of JSON.parse(String(git(root, ['show', `${ref}:${HOME}${m}/module.json`], { encoding: 'utf8' }).stdout)).skills || []) blockOf[n] = m; } catch { /* khối không có ở mốc này */ } }
  for (const x of pairs(['.claude/skills'])) {
    const m = /^\.claude\/skills\/([^/]+)\/SKILL\.md$/.exec(x.path);
    if (!m || !blockOf[m[1]]) continue;
    const own = `${blockOf[m[1]]}/skills/${m[1]}.md`;
    if (now.has(`${HOME}${own}`) || out.some((c) => c.path === own)) continue; // khối giữ bản gốc: đã tính ở trên
    out.push({ status: x.status, path: own });
  }
  return out.sort((p, q) => (p.path < q.path ? -1 : 1));
}

function run(root, dest) {
  const out = [];
  if (fs.existsSync(dest) && fs.readdirSync(dest).length) return { ok: false, text: `Thư mục đích ${dest} không trống: chọn thư mục mới (lệnh không ghi đè).` };
  const ls = git(root, ['ls-tree', '-r', '--name-only', '-z', 'HEAD', '--', '.claude'], { encoding: 'utf8' });
  if (ls.status !== 0) return { ok: false, text: `không đọc được HEAD: ${ls.stderr}` };
  const tracked = ls.stdout.split('\0').filter(Boolean);
  const HOME = '.claude/modules/';
  if (!tracked.includes(`${HOME}core/module.json`)) return { ok: false, text: 'bản đã commit chưa ở bố cục khối (thiếu .claude/modules/core/module.json): lệnh đóng gói chạy từ bản nguồn bố cục khối.' };
  const xc = exportConfig(root, tracked);
  const shippedSkills = new Set();
  const files = [];
  const put = (rel, data) => { const p = path.join(dest, ...rel.split('/')); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data); files.push(rel); };

  // 1. Tệp của các khối đi vào gói: chép nguyên từng byte, cùng chỗ. Chỉ mục: tệp mã theo đường dẫn logic (tệp tự khai và bản gốc
  // skill không phải đường dẫn logic).
  const product = tracked.filter((rel) => {
    if (!rel.startsWith(HOME)) return false;
    const inner = rel.slice(HOME.length);
    return SHIP.includes(inner.split('/')[0]) && inner.includes('/') && !EXCLUDE.some((re) => re.test(inner));
  });
  const broken = []; // tệp của gói còn nhắc bố cục cũ trong chữ (bản nguồn đã ở bố cục khối thì không được còn)
  const unknownPaths = new Set();
  const index = {};
  for (const rel of product) {
    const data = committed(root, rel);
    const [mod, ...rest] = rel.slice(HOME.length).split('/');
    if (rest.join('/') !== 'module.json' && rest[0] !== 'skills') index[rest.join('/')] = mod;
    if (/\.(js|md|json|txt)$/.test(rel) && !/\/mcp\/vendor\//.test(rel)) {
      const text = data.toString('utf8');
      if (!text.includes(KEEP_PATHS) && text.includes(['.claude', 'plugin', ''].join('/'))) broken.push(`${rel}: còn nhắc bố cục cũ`);
    }
    put(rel, data);
  }
  put(`${HOME}index.json`, `${JSON.stringify(Object.fromEntries(Object.keys(index).sort().map((k) => [k, index[k]])), null, 2)}\n`);
  const coreManifest = JSON.parse(committed(root, `${HOME}core/module.json`).toString('utf8'));
  put(`${HOME}VERSION`, `${coreManifest.version}\n`);

  // 2. Skill: bản gốc của từng khối ở modules/<khối>/skills/<tên>.md, bản cài ở .claude/skills/<tên>/SKILL.md. Skill mà khối không giữ
  // bản gốc thì lấy từ .claude/skills của dự án nguồn, thay chữ riêng của nó bằng chữ chung.
  const P = require('../gate/gate-paths');
  for (const m of SHIP) {
    const man = JSON.parse(committed(root, `${HOME}${m}/module.json`).toString('utf8'));
    for (const name of man.skills || []) {
      shippedSkills.add(name);
      const own = `${HOME}${m}/skills/${name}.md`;
      let text;
      if (files.includes(own)) text = fs.readFileSync(path.join(dest, ...own.split('/')), 'utf8');
      else {
        text = committed(root, `.claude/skills/${name}/SKILL.md`).toString('utf8');
        for (const [re, to] of xc.rewrite) text = text.replace(re, to);
        text = stripDecisions(text);
        put(own, text);
      }
      put(`.claude/skills/${name}/SKILL.md`, text);
    }
  }

  // 3. Khuôn phần của dự án: project.json trống và các công tắc mặc định (không mang cấu hình riêng của dự án nguồn).
  let srcSkills = {};
  try { srcSkills = P.projectConfig(root).skillsRaw || {}; } catch { /* không có: bảng rỗng */ }
  put('.claude/project/project.json', `${JSON.stringify(productProject(srcSkills, shippedSkills), null, 2)}\n`);
  for (const f of ['context.config.json', 'scope.config.json']) if (tracked.includes(`.claude/project/${f}`)) put(`.claude/project/${f}`, committed(root, `.claude/project/${f}`));

  // 5. settings.json và .mcp.json sinh bằng bộ cài từ tệp tự khai trong gói; .gitignore, README.
  const setup = require('./setup');
  put('.claude/settings.json', `${JSON.stringify(setup.buildSettings(dest, productSettings(committed(root, '.claude/settings.json').toString('utf8'), xc.dropPermissions)), null, 2)}\n`);
  put('.mcp.json', `${JSON.stringify(setup.buildMcp(dest, {}), null, 2)}\n`);
  const inClaude = (abs) => posix(path.relative(path.join(root, '.claude'), abs));
  put('.claude/.gitignore', `${inClaude(P.stateDir(root))}/\nsettings.local.json\n${inClaude(P.localDir(root))}/\nworktrees/\n`);
  put('README.md', README);
  const notesRel = `${HOME}core/RELEASES.md`;
  const notes = tracked.includes(notesRel) ? committed(root, notesRel).toString('utf8') : '';
  if (notes) put('RELEASES.md', notes);
  const noteErrs = notes ? require('../core/release/notes').check(notes, coreManifest.version) : ['bản đã commit không có tệp sổ phát hành'];
  if (noteErrs.length) out.push(`LỖI: sổ phát hành (${notesRel}) chưa đạt (${noteErrs.length}):`, ...noteErrs.map((e) => `  ${e}`));
  // Phần chênh so với bản liền trước, sinh từ git: mốc là nhãn `product/<số bản trước>` của repo nguồn (đặt lúc phát hành bản đó).
  const prevVersion = notes ? ((require('../core/release/notes').parse(notes)[1] || {}).version || '') : '';
  const prevTag = prevVersion ? `product/${prevVersion}` : '';
  if (prevTag && git(root, ['rev-parse', '-q', '--verify', `refs/tags/${prevTag}`]).status === 0) {
    const shipped = (rel) => { if (!rel.startsWith(HOME)) return false; const inner = rel.slice(HOME.length); return SHIP.includes(inner.split('/')[0]) && inner.includes('/') && !EXCLUDE.some((re) => re.test(inner)); };
    const raw = String(git(root, ['diff', '--name-status', '--no-renames', '-z', prevTag, 'HEAD', '--', '.claude/modules'], { encoding: 'utf8' }).stdout).split('\0').filter(Boolean);
    const changedFiles = [];
    for (let i = 0; i + 1 < raw.length; i += 2) if (shipped(raw[i + 1])) changedFiles.push({ status: raw[i][0], path: raw[i + 1] });
    const ledgerAt = (ref) => { const r = git(root, ['show', `${ref}:${HOME}test/features.json`], { encoding: 'utf8' }); try { const e = JSON.parse(r.stdout).publicExports; if (!e) return null; const { _: note, ...rest } = e; return rest; } catch { return null; } };
    put('CHANGED.md', require('../core/release/changed').render({ prev: prevVersion, cur: coreManifest.version, files: changedFiles, exports: { prev: ledgerAt(prevTag), cur: ledgerAt('HEAD') || {} } }));
  } else if (prevVersion) out.push(`Ghi chú: repo nguồn không có nhãn ${prevTag} nên gói không có CHANGED.md (danh sách tệp và tên xuất đã đổi so với bản trước). Đặt nhãn đó ở commit đã đóng gói bản ${prevVersion}.`);
  // TỜ THAY ĐỔI cho máy đọc (core/releases/<số bản>.json): bản đang đóng gói phải có, đủ trường, và khi có mốc của bản trước thì MỌI tệp
  // đã đổi phải thuộc một mục của tờ (không có thay đổi nào không lời giải thích). Lệnh nâng cấp và agent ở dự án đã cài đọc tờ này.
  {
    const sheets = require('../core/release/change-sheet');
    const inner = (rel) => rel.slice(HOME.length);
    const packageFiles = files.filter((f) => f.startsWith(HOME)).map(inner);
    const sheetRel = (v) => `${HOME}core/releases/${v}.json`;
    const isSheet = (p) => /^core\/releases\/\d+\.\d+\.\d+\.json$/.test(p);
    const changedForSheet = prevTag && git(root, ['rev-parse', '-q', '--verify', `refs/tags/${prevTag}`]).status === 0 ? changedSince(root, prevTag, 'HEAD') : null;
    if (!tracked.includes(sheetRel(coreManifest.version))) out.push(`LỖI: bản ${coreManifest.version} chưa có tờ thay đổi cho máy đọc (${sheetRel(coreManifest.version)}): lệnh nâng cấp ở dự án đã cài không biết bản này đổi gì.`);
    for (const rel of tracked.filter((r) => r.startsWith(HOME) && isSheet(inner(r))).sort()) {
      const v = path.basename(rel, '.json');
      let obj; try { obj = JSON.parse(committed(root, rel).toString('utf8')); } catch (e) { out.push(`LỖI: tờ thay đổi ${rel} không đọc được: ${e.message}`); continue; }
      const cur = v === coreManifest.version;
      const errs = sheets.check(obj, { version: v, changed: cur ? changedForSheet : null, packageFiles: cur ? packageFiles : null });
      if (errs.length) out.push(`LỖI: tờ thay đổi ${rel} chưa đạt (${errs.length}):`, ...errs.map((e) => `  ${e}`));
    }
    if (prevVersion && !changedForSheet) out.push(`Ghi chú: không có nhãn ${prevTag} nên CHƯA đối chiếu được tờ thay đổi của bản ${coreManifest.version} với các tệp thật sự đã đổi.`);
  }
  put('.gitattributes', '* -text\n'); // giữ nguyên từng byte: dấu vân tay tính trên nội dung tệp

  // 6. Dấu vân tay cổng duyệt và dấu từng tệp của sản phẩm (bộ cài dùng để biết tệp nào người dùng đã sửa).
  const st = spawnSync(process.execPath, [path.join(dest, '.claude', 'modules', 'core', 'gate', 'install.js'), '--stamp', dest], { encoding: 'utf8' });
  if (st.status !== 0) out.push(`LỖI: không ghi được dấu vân tay cổng duyệt: ${st.stderr || st.stdout}`);
  else files.push('.claude/modules/MANIFEST.json');
  const stamps = {};
  for (const f of files.filter((x) => x.startsWith('.claude/modules/') || x.startsWith('.claude/skills/'))) stamps[f] = sha(fs.readFileSync(path.join(dest, ...f.split('/'))));
  put('.claude/modules/FILES.json', `${JSON.stringify({ version: coreManifest.version, files: stamps }, null, 2)}\n`);
  if (broken.length) out.push(`LỖI: lệnh nhập trỏ tới tệp không vào gói (${broken.length}):`, ...broken.map((b) => `  ${b}`));

  // 7. DÒ gói.
  const hits = [];
  const debt = {}; // tệp thuộc KNOWN -> số dòng còn dấu vết
  const words = (() => { try { return require('../adapters/project/workspace').loadWords(root); } catch { return null; } })();
  const banned = words ? require('../core/rules/lib/banned-words').matcher(words) : null;
  for (const rel of files) {
    const abs = path.join(dest, ...rel.split('/'));
    const buf = fs.readFileSync(abs);
    if (banned && banned.test(rel)) hits.push(`${rel}: từ cấm trong tên tệp`);
    if (buf.includes(0)) continue;
    const text = buf.toString('utf8');
    const vendor = /\/mcp\/vendor\//.test(rel);
    const known = KNOWN.find((k) => k.file.test(rel));
    text.split('\n').forEach((line, i) => {
      const at = `${rel}:${i + 1}`;
      if (banned && banned.test(line)) hits.push(`${at}: từ cấm`);
      if (SECRET.test(line)) hits.push(`${at}: giống bí mật`);
      if (vendor) return; // thư viện bên ngoài đi kèm: chỉ dò từ cấm và bí mật
      if (MACHINE.test(line)) hits.push(`${at}: đường dẫn máy hay địa chỉ thư thật`);
      const trace = (!line.includes(KEEP_NAMES) && xc.internal.some((re) => re.test(line))) ? 'dấu vết của dự án nguồn' : (DECISION.test(line) ? 'mã quyết định nội bộ' : '');
      if (!trace) return;
      if (known) debt[rel] = (debt[rel] || 0) + 1; else hits.push(`${at}: ${trace}`);
    });
  }
  try {
    for (const l of require('../adapters/git/docs-leaks').scanDir(root, dest)) hits.push(`${l.file}: ${l.why}`);
  } catch (e) { hits.push(`không dò được nội dung docs/: ${e.message}`); }
  out.unshift(`Gói: ${dest} (${files.length} tệp, bố cục khối, từ commit ${String(git(root, ['rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8' }).stdout).trim()}).`);
  if (unknownPaths.size) out.push(`Ghi chú: ${unknownPaths.size} chỗ nhắc .claude/plugin/<x> mà <x> không có trong gói (để nguyên): ${[...unknownPaths].slice(0, 12).join('; ')}${unknownPaths.size > 12 ? '; ...' : ''}`);
  if (xc.missing) out.push('Ghi chú: dự án nguồn không có .claude/project/export.json: không thay chữ nào trong skill và KHÔNG dò dấu vết của dự án nguồn.');
  for (const k of KNOWN) { const n = Object.entries(debt).filter(([f]) => k.file.test(f)); if (n.length) out.push(`Nợ đã biết (${n.reduce((a, [, c]) => a + c, 0)} dòng ở ${n.map(([f]) => f.split('/').pop()).join(', ')}): ${k.why}.`); }
  if (hits.length) out.push(`DÒ KHÔNG SẠCH (${hits.length} chỗ):`, ...hits.slice(0, 80).map((h) => `  ${h}`), ...(hits.length > 80 ? [`  ... còn ${hits.length - 80}`] : []));
  else out.push(`Dò sạch: từ cấm${banned ? '' : ' (máy không có danh sách: KHÔNG dò)'}, nội dung docs/, bí mật, đường dẫn máy, dấu vết của dự án nguồn và mã quyết định nội bộ trong mọi tệp chữ.`);
  out.push('Danh sách tệp cho phép (đối chiếu sau khi đẩy):', ...files.sort().map((f) => `  ${f}`));
  return { ok: !hits.length && !out.some((l) => l.startsWith('LỖI')), text: out.join('\n'), files: files.sort(), hits, broken, unknown: [...unknownPaths], debt };
}

module.exports = { run, changedSince, EXCLUDE, SHIP, KNOWN, stripDecisions, exportConfig, productProject, productSettings, rewriteRequires, rewritePaths, placer };
