'use strict';
// spec: HOOK-S-009
// spec: HOOK-S-010
// ĐÓNG GÓI harness thành sản phẩm cài được cho dự án khác (S-063), từ bản ĐÃ COMMIT của repo này (không lẫn tệp đang sửa dở).
//   node <harness>/cli/cli.js public-export <thư mục đích>
// Gói theo BỐ CỤC KHỐI (S-064): bản nguồn ở đây là cây theo vai (.claude/plugin/, có test); gói là thứ người dùng cài:
//   .claude/modules/<khối>/<đường dẫn logic>   mã của sản phẩm, chia theo khối (layout.json quyết tệp nào thuộc khối nào)
//   .claude/modules/<khối>/module.json         tệp tự khai của khối; .claude/modules/<khối>/skills/<tên>.md bản gốc của skill
//   .claude/modules/index.json, FILES.json, MANIFEST.json, VERSION   chỉ mục logic -> khối, dấu từng tệp, dấu vân tay cổng duyệt, phiên bản
//   .claude/project/                            khuôn phần của dự án (project.json trống, công tắc)
//   .claude/skills/<tên>/SKILL.md, .claude/settings.json, .mcp.json   chỗ Claude Code đọc; settings và .mcp.json sinh bằng bộ cài (cli/setup.js)
// KHÔNG mang: tài liệu và cách phát triển harness, test và lưới test, cấu hình và skill riêng của dự án nguồn, khối `bsn`, sổ phiên, từ cấm.
// Mã chuyển chỗ nên lệnh nhập tương đối giữa hai khối được viết lại theo chỗ mới; đường dẫn `.claude/plugin/<x>` trong chữ (lời nhắc, lệnh,
// tài liệu) được viết lại thành chỗ thật trong gói. Sau khi dựng: dò gói (từ cấm, nội dung docs/ của dự án nguồn, bí mật, đường dẫn máy,
// tên nội bộ trong tài liệu và skill). Dò không sạch thì `ok: false` và nêu từng chỗ; không tự che. Lệnh không commit, không đẩy.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

// Tệp của .claude/plugin KHÔNG vào gói dù bản đồ gán chủ "sản phẩm" (đường dẫn logic, kiểu posix).
const EXCLUDE = [
  /^docs(\/|$)/, /^CLAUDE\.md$/, /(^|\/)test(\/|$)/, /^acceptance(\/|$)/, /^features\.json$/, /^layout\.json$/,
  /^project\.json$/, /^skills-map\.json$/, /^units\.json$/,
  /^mcp\/portal\/generators(\/|$)/, /^mcp\/generators(\/|$)/,
  /^gate\/MANIFEST\.json$/, /^gate\/MIGRATED_AT$/, /^gate\/gate\.config\.json$/, /^gate\/VERSION$/,
  /^gate\/README\.md$/, // tài liệu phát triển cổng duyệt của dự án nguồn; người dùng gói đọc FORMAT.md và README của gói
];
// Khối đi vào gói. `bsn` là phần riêng của dự án nguồn.
const SHIP = ['core', 'servicedocs', 'diagrams', 'context', 'portal', 'guard-push'];
// Tệp đánh dấu dòng này thì KHÔNG viết lại đường dẫn `.claude/plugin/...` trong chữ (bộ cài cần nói về bố cục cũ).
const KEEP_PATHS = 'harness-export: giữ đường dẫn bố cục cũ';
// Skill dùng chung lấy từ .claude/skills của dự án nguồn, thay chữ riêng của nó bằng chữ chung.
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

// Bảng việc -> skill mặc định của sản phẩm: công cụ ghi và công cụ chỉ đọc của bsn-docs lấy từ bảng của dự án nguồn; bỏ mẫu tệp riêng của nó.
function productProject(sourceSkills) {
  return {
    _: 'Cấu hình dự án của harness. Chưa khai đơn vị nào: mở phiên Claude Code ở gốc dự án, harness nhắc chạy skill onboard để khai. Nghĩa từng trường: .claude/modules/core/FORMAT.md.',
    name: '',
    defaultUnit: '',
    lang: 'vi',
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

// settings.json nền của gói: bỏ luật quyền nhắc đường dẫn riêng của dự án nguồn và mọi hook (bộ cài sinh lại hook từ tệp tự khai).
function productSettings(raw) {
  const s = JSON.parse(raw);
  if (s.permissions && Array.isArray(s.permissions.deny)) s.permissions.deny = s.permissions.deny.filter((d) => !/system_service|infra\//.test(d));
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

## Nâng cấp, và chuyển từ bản cũ
- Tải bản mới rồi chạy lại bước 2 và 3 với bản mới. Mã trong \`.claude/modules/\` được thay; \`.claude/project/\`, skill bạn đã sửa, sổ phiên và phần settings của bạn giữ nguyên. Tệp mã bạn từng sửa tay được nêu tên (bản cũ nằm trong chỗ cất).
- Dự án đang dùng bản cũ (mọi thứ trong \`.claude/plugin/\`): cùng lệnh \`install\`. Lệnh chuyển cấu hình (\`project.json\`, bảng đơn vị, bảng skill, công tắc, bộ sinh riêng, luật mở rộng) sang \`.claude/project/\`, giữ sổ phiên, cất \`.claude/plugin/\` cũ để quay lại, và nêu các tệp cổng duyệt bạn từng sửa.

## Bố cục
| Chỗ | Của ai | Giữ gì |
|---|---|---|
| \`.claude/modules/<khối>/\` | sản phẩm | mã harness; bản mới thay toàn bộ |
| \`.claude/project/\` | dự án | \`project.json\` (khối bật, bộ khuôn, ngôn ngữ, đơn vị, bảng skill, luật), luật mở rộng \`rules/\`, bộ sinh riêng |
| \`.claude/skills/\`, \`.claude/settings.json\`, \`.mcp.json\` | chung | chỗ Claude Code đọc; bộ cài viết phần của harness, giữ phần của bạn |
| \`.claude/local/\` và thư mục trạng thái trong \`.claude/\` | máy | từ cấm, sổ phiên, trạng thái cổng duyệt; không commit |

Khối: \`core\` (bắt buộc: cổng duyệt kế hoạch, phạm vi theo kế hoạch, chặn theo skill, sổ phiên, máy chủ MCP, bộ cài), \`servicedocs\` (tài liệu ba tầng), \`diagrams\` (sơ đồ), \`context\` (kho ngữ nghĩa), \`portal\` (trang HTML cho người đọc), \`guard-push\` (từ cấm, chặn đẩy). Chỉ bật một số khối: khóa \`modules\` trong \`project.json\` (hoặc \`"preset": "light"\`), rồi \`node .claude/modules/core/cli/cli.js setup\`.

## Thêm luật của riêng dự án
Đặt \`.claude/project/rules/<id>.js\` xuất \`{ id, on, api: "0.1", run(event, ports) }\` (sự kiện và quyết định: \`.claude/modules/core/ports/events.js\`), rồi chạy \`setup\` để khai hook. Mã trong \`.claude/modules/\` không phải sửa.

## Gỡ ra
\`install <dự án> --undo\` quay lại trạng thái trước lần cài gần nhất. Gỡ hẳn: xóa nhóm hook trỏ vào \`.claude/modules/\` trong \`.claude/settings.json\`, mục \`bsn-docs\` trong \`.mcp.json\`, rồi xóa \`.claude/modules/\`, \`.claude/project/\` và thư mục trạng thái của harness trong \`.claude/\`.

## Giới hạn
- Lời chặn và lời nhắc của lõi có tiếng Việt và tiếng Anh (\`"lang": "en"\` trong \`project.json\`); skill và tài liệu của gói là tiếng Việt.
- Hook của Claude Code cho qua khi hook hỏng hay quá giờ; \`doctor\` và tóm tắt đầu phiên báo khi có vấn đề.
- Hook là hàng rào cho phiên Claude, không phải sandbox: người ngồi trước máy vẫn sửa được mọi thứ.
- Thư viện vẽ sơ đồ (Mermaid, giấy phép MIT) đi kèm ở \`.claude/modules/diagrams/mcp/vendor/\`.
`;

function run(root, dest) {
  const out = [];
  if (fs.existsSync(dest) && fs.readdirSync(dest).length) return { ok: false, text: `Thư mục đích ${dest} không trống: chọn thư mục mới (lệnh không ghi đè).` };
  const ls = git(root, ['ls-tree', '-r', '--name-only', '-z', 'HEAD', '--', '.claude'], { encoding: 'utf8' });
  if (ls.status !== 0) return { ok: false, text: `không đọc được HEAD: ${ls.stderr}` };
  const tracked = ls.stdout.split('\0').filter(Boolean);
  let layout;
  try { layout = JSON.parse(committed(root, '.claude/plugin/layout.json').toString('utf8')); } catch (e) { return { ok: false, text: `chưa có bản đồ layout.json đã commit: ${e.message}` }; }
  const place = placer(layout);
  const files = [];
  const put = (rel, data) => { const p = path.join(dest, ...rel.split('/')); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data); files.push(rel); };

  // 1. Chọn tệp mã của sản phẩm và chỗ mới của chúng.
  const product = []; // { logical, to }
  for (const rel of tracked.filter((r) => r.startsWith('.claude/plugin/'))) {
    const logical = rel.slice('.claude/plugin/'.length);
    if (EXCLUDE.some((re) => re.test(logical))) continue;
    const pl = place(rel);
    if (!pl || pl.owner !== 'product' || !SHIP.includes(pl.module)) continue;
    product.push({ logical, to: pl.to, module: pl.module, moved: pl.moved });
  }
  const logicalSet = new Set(product.map((p) => p.logical));
  const byLogical = new Map(product.map((p) => [p.logical, p]));
  // Phần của dự án có chỗ cố định trong gói (lời nhắc nói về chúng).
  const projectTo = {};
  for (const rel of tracked.filter((r) => r.startsWith('.claude/plugin/'))) { const pl = place(rel); if (pl && pl.owner === 'project' && pl.moved) projectTo[rel.slice('.claude/plugin/'.length)] = pl.to; }
  const where = (logical) => (byLogical.has(logical) ? byLogical.get(logical).to : projectTo[logical] || null);
  // Thư mục logic -> khối: khối giữ nhiều tệp nhất trong thư mục đó (lõi khi bằng nhau).
  const dirModule = (dir) => {
    const count = {};
    for (const p of product) if (p.logical.startsWith(`${dir}/`) && !p.moved) count[p.module] = (count[p.module] || 0) + 1;
    const best = Object.entries(count).sort((a, b) => b[1] - a[1] || (a[0] === 'core' ? -1 : 1))[0];
    return best ? best[0] : null;
  };
  const index = {};
  for (const p of product) if (!p.moved) index[p.logical] = p.module;

  // 2. Chép, viết lại lệnh nhập và đường dẫn trong chữ.
  const broken = [];
  const unknownPaths = new Set();
  const textual = (n) => /\.(js|md|json|txt)$/.test(n) && !n.startsWith('mcp/vendor/mermaid');
  for (const p of product) {
    let data = committed(root, `.claude/plugin/${p.logical}`);
    if (textual(p.logical)) {
      let text = data.toString('utf8');
      if (p.logical.endsWith('.js')) { const r = rewriteRequires(text, p.logical, p.to, (l) => (byLogical.has(l) ? byLogical.get(l).to : null), logicalSet); text = r.text; broken.push(...r.broken); }
      if (!text.includes(KEEP_PATHS)) { const r = rewritePaths(text, where, dirModule); text = r.text; r.unknown.forEach((u) => unknownPaths.add(`${p.logical}: .claude/plugin/${u}`)); }
      data = Buffer.from(text, 'utf8');
    }
    put(p.to, data);
  }
  put('.claude/modules/index.json', `${JSON.stringify(index, null, 2)}\n`);
  const coreManifest = JSON.parse(committed(root, '.claude/plugin/modules/core.json').toString('utf8'));
  put('.claude/modules/VERSION', `${coreManifest.version}\n`);

  // 3. Skill: bản gốc của từng khối ở modules/<khối>/skills/<tên>.md, bản cài ở .claude/skills/<tên>/SKILL.md.
  const P = require('../gate/gate-paths');
  for (const m of SHIP) {
    const man = JSON.parse(committed(root, `.claude/plugin/modules/${m}.json`).toString('utf8'));
    for (const name of man.skills || []) {
      const own = `.claude/modules/${m}/skills/${name}.md`;
      let text;
      if (files.includes(own)) text = fs.readFileSync(path.join(dest, ...own.split('/')), 'utf8');
      else {
        text = committed(root, `.claude/skills/${name}/SKILL.md`).toString('utf8');
        for (const [re, to] of REWRITE) text = text.replace(re, to);
        const r = rewritePaths(text, where, dirModule); text = r.text; r.unknown.forEach((u) => unknownPaths.add(`skill ${name}: .claude/plugin/${u}`));
        put(own, text);
      }
      put(`.claude/skills/${name}/SKILL.md`, text);
    }
  }

  // 4. Khuôn phần của dự án.
  let srcSkills = {};
  try { srcSkills = P.projectConfig(root).skillsRaw || {}; } catch { /* không có: bảng rỗng */ }
  put('.claude/project/project.json', `${JSON.stringify(productProject(srcSkills), null, 2)}\n`);
  for (const [logical, to] of Object.entries(projectTo)) {
    if (/^(project|skills-map|units)\.json$/.test(logical) || /generators\//.test(logical) || /gate\.config\.json$|MIGRATED_AT$/.test(logical)) continue;
    if (tracked.includes(`.claude/plugin/${logical}`)) put(to, committed(root, `.claude/plugin/${logical}`));
  }

  // 5. settings.json và .mcp.json sinh bằng bộ cài từ tệp tự khai trong gói; .gitignore, README.
  const setup = require('./setup');
  put('.claude/settings.json', `${JSON.stringify(setup.buildSettings(dest, productSettings(committed(root, '.claude/settings.json').toString('utf8'))), null, 2)}\n`);
  put('.mcp.json', `${JSON.stringify(setup.buildMcp(dest, {}), null, 2)}\n`);
  const inClaude = (abs) => posix(path.relative(path.join(root, '.claude'), abs));
  put('.claude/.gitignore', `${inClaude(P.stateDir(root))}/\nsettings.local.json\n${inClaude(P.localDir(root))}/\nworktrees/\n`);
  put('README.md', README);
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
  const words = (() => { try { return require('../adapters/project/workspace').loadWords(root); } catch { return null; } })();
  const banned = words ? require('../core/rules/lib/banned-words').matcher(words) : null;
  for (const rel of files) {
    const abs = path.join(dest, ...rel.split('/'));
    const buf = fs.readFileSync(abs);
    if (banned && banned.test(rel)) hits.push(`${rel}: từ cấm trong tên tệp`);
    if (buf.includes(0)) continue;
    const text = buf.toString('utf8');
    const vendor = /\/mcp\/vendor\//.test(rel);
    const docText = /\.(md|json)$/.test(rel) && !vendor;
    text.split('\n').forEach((line, i) => {
      const at = `${rel}:${i + 1}`;
      if (banned && banned.test(line)) hits.push(`${at}: từ cấm`);
      if (SECRET.test(line)) hits.push(`${at}: giống bí mật`);
      if (MACHINE.test(line) && !vendor) hits.push(`${at}: đường dẫn máy hay địa chỉ thư thật`);
      if (docText && INTERNAL.test(line)) hits.push(`${at}: tên nội bộ của dự án nguồn`);
    });
  }
  try {
    for (const l of require('../adapters/git/docs-leaks').scanDir(root, dest)) hits.push(`${l.file}: ${l.why}`);
  } catch (e) { hits.push(`không dò được nội dung docs/: ${e.message}`); }
  out.unshift(`Gói: ${dest} (${files.length} tệp, bố cục khối, từ commit ${String(git(root, ['rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8' }).stdout).trim()}).`);
  if (unknownPaths.size) out.push(`Ghi chú: ${unknownPaths.size} chỗ nhắc .claude/plugin/<x> mà <x> không có trong gói (để nguyên): ${[...unknownPaths].slice(0, 12).join('; ')}${unknownPaths.size > 12 ? '; ...' : ''}`);
  if (hits.length) out.push(`DÒ KHÔNG SẠCH (${hits.length} chỗ):`, ...hits.slice(0, 80).map((h) => `  ${h}`), ...(hits.length > 80 ? [`  ... còn ${hits.length - 80}`] : []));
  else out.push(`Dò sạch: từ cấm${banned ? '' : ' (máy không có danh sách: KHÔNG dò)'}, nội dung docs/, bí mật, đường dẫn máy, tên nội bộ trong tài liệu và skill.`);
  out.push('Danh sách tệp cho phép (đối chiếu sau khi đẩy):', ...files.sort().map((f) => `  ${f}`));
  return { ok: !hits.length && !out.some((l) => l.startsWith('LỖI')), text: out.join('\n'), files: files.sort(), hits, broken, unknown: [...unknownPaths] };
}

module.exports = { run, EXCLUDE, REWRITE, SHIP, productProject, productSettings, rewriteRequires, rewritePaths, placer };
