'use strict';
// spec: HOOK-S-001
// Tạo khung một dịch vụ mới, hoặc bổ sung phần còn thiếu cho dịch vụ đã có (không bao giờ ghi đè tệp có sẵn):
// thư mục + git, CLAUDE.md khung, docs/agent. KHÔNG tạo .claude, .mcp.json hay hook trong dịch vụ: harness chỉ có MỘT chỗ ở
// .claude (hook, skill, gate), công cụ docs dùng chung ở .claude/modules/context/mcp (tham số `service`). Dịch vụ chỉ giữ mã và tài liệu của nó.
// Dùng: node .claude/modules/core/cli/new-service.js <tên> [--root <thư-mục-gốc>]
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const args = process.argv.slice(2);
const ri = args.indexOf('--root');
const root = path.resolve(ri >= 0 ? args.splice(ri, 2)[1] : require('../gate/gate-paths').rootFrom(__dirname));
// --unit: đơn vị KHÔNG phải dịch vụ nghiệp vụ (nền deploy, công cụ, harness): khung không có mục "Ba lớp" (P-005). Không truyền thì tự
// nhận: đơn vị khai riêng trong bảng đơn vị của dự án (units.json) là loại này; --service ép về khung dịch vụ nghiệp vụ.
const flag = (f) => { const i = args.indexOf(f); if (i < 0) return false; args.splice(i, 1); return true; };
const asUnit = flag('--unit');
const asService = flag('--service');
const name = args[0];
if (!name || !/^[a-z][a-z0-9-]*$/.test(name)) {
  console.error('Dùng: node .claude/modules/core/cli/new-service.js <tên>  (chữ thường, số, gạch ngang; bắt đầu bằng chữ cái)');
  process.exit(2);
}
const P = require('../gate/gate-paths');
const dir = P.serviceDir(root, name); // dịch vụ nằm trong thư mục chứa đơn vị; đơn vị khai riêng trong cấu hình dự án nằm ở thư mục riêng của nó
const relDir = P.serviceRel(root, name); // đường dẫn tính từ gốc dự án
const up = path.relative(dir, root).split(path.sep).join('/'); // từ thư mục dịch vụ lên gốc dự án
const base = path.basename(path.resolve(root)); // tên thư mục gốc của dự án , dùng trong chữ của khung
const plain = !asService && (asUnit || Object.prototype.hasOwnProperty.call(P.extraUnits(root), name)); // đơn vị không phải dịch vụ nghiệp vụ
const existed = fs.existsSync(dir);
// Phần tại chỗ của đơn vị đặt ở đâu (gom trong .harness/, hay docs/ và tệp cửa vào ở gốc đơn vị) do gate-paths quyết; hỏi TRƯỚC khi tạo gì,
// để đơn vị đang theo bố cục cũ được bổ sung đúng bố cục của nó. Tệp trong khung gọi bằng tên logic.
const layout = P.unitLayout(root, name);
// Mục về cấu trúc mã: dịch vụ nghiệp vụ theo ba lớp của dự án; đơn vị khác tự tả cấu trúc của nó (không ép ba lớp vào thứ không có ba lớp).
const structure = plain
  ? `## Cấu trúc (phiên đầu tiên điền theo mã thật)
- Mã chia thành những phần nào, mỗi phần ở thư mục nào:
- Phần nào được phụ thuộc phần nào (chiều phụ thuộc):
- Test giữ ranh giới đó (nếu có):
- Chỗ chưa theo đúng cấu trúc:

## Việc của đơn vị (phiên đầu tiên điền)
- Đơn vị này sở hữu gì, không sở hữu gì:
- Thứ nó công bố cho đơn vị khác dùng (lệnh, tệp, khuôn):
- Đơn vị khác và hệ thống ngoài mà nó phụ thuộc:`
  : `## Ba lớp (nguyên tắc ở ${up}/CLAUDE.md; phiên đầu tiên điền theo mã thật)
- Lớp vào/ra nằm ở:
- Lớp chuẩn hóa nằm ở (mỗi bên ngoài một module):
- Hợp đồng chuẩn (nơi ba lớp gặp nhau):
- Lớp logic nội bộ nằm ở:
- Test giữ ranh giới (quét import):
- Chỗ chưa tách đúng ba lớp:

## Việc của dịch vụ (phiên đầu tiên điền)
- Dịch vụ này sở hữu gì, không sở hữu gì:
- Giao diện công bố cho dịch vụ khác (tên tệp hợp đồng):
- Dịch vụ khác mà nó phụ thuộc:`;
const created = [];
const skipped = [];

const write = (logical, text) => {
  const rel = P.unitRealRel(layout, logical);
  const p = path.join(dir, ...rel.split('/'));
  if (fs.existsSync(p)) return skipped.push(rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
  created.push(rel);
};

write('CLAUDE.md', `# ${name}

Quy tắc chung cho mọi dịch vụ và cách làm việc (một harness duy nhất ở \`${base}/.claude\`) nằm ở \`${up}/CLAUDE.md\` (tự nạp). **Mở phiên Claude Code ở \`${base}/\`** rồi giao việc cho dịch vụ này; hook, MCP của harness và skill chỉ nạp ở gốc, mở thẳng trong thư mục dịch vụ thì không có hook nào. Tệp này là phần riêng của dịch vụ.

## Phạm vi
- Làm trong \`${relDir}/\` (đường dẫn tương đối trong tệp này tính từ thư mục đó). Ngoài thư mục này chỉ đọc; việc cần dịch vụ khác thì ghi yêu cầu vào \`${up}/docs/handoff/\`.
- Đầu phiên: đọc [docs/agent/STATUS.md](docs/agent/STATUS.md), [docs/agent/DECISIONS.md](docs/agent/DECISIONS.md), [docs/agent/CONVENTIONS.md](docs/agent/CONVENTIONS.md). Liệt kê các tệp \`${up}/docs/handoff/*-to-${name}-*.md\` còn \`open\` và báo người dùng.
- Tài liệu ba tầng (design/spec/impl) chỉ ghi qua công cụ MCP của harness với \`service="${name}"\` (\`design_record\` tạo \`docs/modules\` lần đầu); không sửa tay.
- Trong \`${layout.docsRel}/\` của dịch vụ chỉ có Markdown cho agent, không đặt HTML. Nguồn có cấu trúc của dịch vụ là \`docs/service.yaml\` (nghiệp vụ, kiến trúc, vấn đề và tiến độ), ghi bằng công cụ MCP của harness: \`service_doc_set\`, \`problem_record\`. Người đọc xem cổng cục bộ \`docs/portal/${name}/index.html\`, sinh tự động từ nguồn đó.

## Đọc gì khi nào
Tệp này là cửa vào duy nhất của dịch vụ. Thứ tự đọc chung cho mọi dịch vụ nằm ở skill \`services\`; bảng dưới chỉ tới tài liệu của riêng dịch vụ này (thêm dòng khi có tài liệu mới, ví dụ một bản nghiên cứu trong \`docs/agent/\`).

| Khi cần | Đọc |
|---|---|
| Biết đang làm dở gì, lần gần nhất đổi gì | [docs/agent/STATUS.md](docs/agent/STATUS.md) (bắt buộc trước khi sửa) |
| Biết ${plain ? 'mã chia thành những phần nào' : 'ba lớp nằm ở thư mục nào'}, quy ước mã | [docs/agent/CONVENTIONS.md](docs/agent/CONVENTIONS.md) |
| Biết vì sao chọn cách này | [docs/agent/DECISIONS.md](docs/agent/DECISIONS.md) |
| Tìm một việc nằm ở tệp nào | công cụ \`context_explore\` (skill \`context\`) |
| Hiểu sâu một phần | \`docs/modules/<phần>/\` và \`docs/_generated/overview.md\` |

${structure}

## Quy tắc riêng (phiên đầu tiên điền, chỉ những gì người dùng đã chốt)
-

## Lệnh thường dùng
-
`);
// .gitignore là tệp của repo, không phải của harness: chỉ tạo cho dịch vụ MỚI (thư mục vừa được tạo ở lần chạy này). Đơn vị đã có sẵn
// mã thì harness không đặt gì ngoài phần tại chỗ của nó.
if (!existed || layout.layout === 'legacy') write('.gitignore', 'node_modules/\n.env\n*.log\n');
write('docs/agent/STATUS.md', `# STATUS: ${name}

Cập nhật lần cuối: ${new Date().toISOString().slice(0, 10)}

## Mục tiêu
- [ ] (chưa có)

## Nhật ký
| Ngày | Việc |
|---|---|
| ${new Date().toISOString().slice(0, 10)} | Tạo khung dịch vụ bằng .claude/modules/core/cli/new-service.js |
`);
write('docs/agent/DECISIONS.md', `# DECISIONS: ${name}

Chỉ thêm bản ghi mới; không sửa bản ghi cũ (đánh dấu \`superseded by D-xxx\`). Mẫu: ngày, trạng thái, bối cảnh, quyết định, hệ quả.
`);
write('docs/agent/CONVENTIONS.md', `# CONVENTIONS: ${name}

Mục nào chưa chốt thì để \`TBD\`, không tự đoán.

- Ngôn ngữ / framework: TBD
- Cách chạy test: TBD
`);

let gitNote = ' (đã có git)';
// Đơn vị nằm TRONG repo của dự án (thư mục con của gốc, không có .git riêng nhưng gốc là một repo git): nó dùng kho và git hook của repo
// gốc. Không git init ở đây, và hook được kiểm ở repo gốc (P-005: trước đây in "CHƯA cài (not-a-repo)" dù repo gốc đã có hook).
const insideRootRepo = !fs.existsSync(path.join(dir, '.git')) && P.serviceHasRepo(root, name);
const hookDir = insideRootRepo ? root : dir;
if (insideRootRepo) gitNote = ' (nằm trong repo gốc, dùng git hook của repo gốc)';
else if (!P.serviceHasRepo(root, name)) { // đơn vị nằm trong repo gốc (không có .git riêng) thì KHÔNG git init: nó dùng kho của repo gốc
  const git = spawnSync('git', ['init', '-q'], { cwd: dir, encoding: 'utf8' });
  gitNote = git.status === 0 ? ' (đã git init)' : ' (git init lỗi: ' + (git.stderr || '').trim() + ')';
}
// Git hook post-commit: mỗi lần dịch vụ commit thì cổng docs/portal tự dựng lại (cổng chỉ hiện bản đã commit). Không ghi đè hook sẵn có.
try {
  const h = require('./install-git-hooks').install(hookDir, { bsn: root });
  gitNote += h.status === 'installed' || h.status === 'updated' || h.status === 'ok' ? ', hook post-commit đã cài' : `, hook post-commit CHƯA cài (${h.status}); chạy: node .claude/modules/core/cli/install-git-hooks.js ${insideRootRepo ? '.' : name}`;
  // Ba hook quét từ cấm (và dò docs/ khi đẩy) đi cùng: trước đây chỉ tóm tắt đầu phiên kế tiếp mới cài, nên đơn vị vừa tạo
  // bị doctor báo thiếu hook (gặp khi thử onboard trên dự án mẫu).
  const b = require('./install-git-hooks').installBan(hookDir, { bsn: root });
  if (['installed', 'updated', 'ok'].includes(b.status)) gitNote += ', hook quét từ cấm đã cài';
  else if (b.status !== 'linked-worktree' && b.status !== 'not-a-repo') gitNote += `, hook quét từ cấm CHƯA cài (${b.status})`;
} catch (e) {
  gitNote += `, hook post-commit CHƯA cài (${e.message})`;
}
// Ghi chép tại chỗ: phần của harness trong đơn vị không vào git của đơn vị. Ghi vào .git/info/exclude (không sửa .gitignore của repo).
if (layout.local) {
  try {
    const ex = path.join(dir, '.git', 'info', 'exclude');
    const line = `/${layout.localRel}/`;
    const cur = fs.existsSync(ex) ? fs.readFileSync(ex, 'utf8') : '';
    if (fs.existsSync(path.join(dir, '.git')) && !cur.split(/\r?\n/).includes(line)) {
      fs.mkdirSync(path.dirname(ex), { recursive: true });
      fs.writeFileSync(ex, `${cur}${cur && !cur.endsWith('\n') ? '\n' : ''}${line}\n`);
      gitNote += `, ${layout.localRel}/ đã vào .git/info/exclude (ghi chép tại chỗ, không commit)`;
    }
  } catch (e) { gitNote += `, CHƯA ghi được .git/info/exclude (${e.message})`; }
}
console.log(`${existed ? 'Bổ sung cho' : 'Đã tạo'} ${dir}${gitNote}`);
console.log(`Tạo mới: ${created.join(', ') || 'không có'}`);
if (skipped.length) console.log(`Giữ nguyên (đã có): ${skipped.join(', ')}`);
console.log('Việc còn lại:');
// Bảng đơn vị chung của dự án: dự án mẫu ghi ở docs/system/services.md; dự án khác thường ghi trong CLAUDE.md gốc. Nhắc đúng tệp đang có.
const table = fs.existsSync(path.join(root, 'docs', 'system', 'services.md')) ? 'docs/system/services.md' : 'bảng đơn vị trong CLAUDE.md ở gốc (nếu dự án có bảng đó)';
console.log(`1. Thêm một dòng cho "${name}" vào ${table}.`);
console.log(`2. Mở phiên Claude Code ở ${root} (KHÔNG mở trong ${relDir}/) và giao việc cho dịch vụ này; phiên đầu điền CLAUDE.md (mục "Việc của dịch vụ" và "Quy tắc riêng").`);
console.log(`3. Dịch vụ không có .claude hay .mcp.json riêng: dùng công cụ MCP của harness với service="${name}" khi cần ghi tài liệu ba tầng và docs/service.yaml (nguồn của trang ba tab trên cổng docs/portal).`);
