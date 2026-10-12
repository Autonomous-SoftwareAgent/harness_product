'use strict';
// spec: HOOK-S-001
// Tạo khung một dịch vụ BSN mới, hoặc bổ sung phần còn thiếu cho dịch vụ đã có (không bao giờ ghi đè tệp có sẵn):
// thư mục + git, CLAUDE.md khung, docs/agent. KHÔNG tạo .claude, .mcp.json hay hook trong dịch vụ: harness chỉ có MỘT chỗ ở
// BSN_/.claude (hook, skill, gate), công cụ docs dùng chung ở BSN_/.claude/modules/context/mcp (tham số `service`). Dịch vụ chỉ giữ mã và tài liệu của nó.
// Dùng: node .claude/modules/core/cli/new-service.js <tên> [--root <thư-mục-BSN_>]
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const args = process.argv.slice(2);
const ri = args.indexOf('--root');
const root = path.resolve(ri >= 0 ? args.splice(ri, 2)[1] : require('../gate/gate-paths').rootFrom(__dirname));
const name = args[0];
if (!name || !/^[a-z][a-z0-9-]*$/.test(name)) {
  console.error('Dùng: node .claude/modules/core/cli/new-service.js <tên>  (chữ thường, số, gạch ngang; bắt đầu bằng chữ cái)');
  process.exit(2);
}
const P = require('../gate/gate-paths');
const dir = P.serviceDir(root, name); // dịch vụ nằm trong BSN_/system_service/; đơn vị ngoài (khai ở .claude/project/units.json, ví dụ infra) nằm ở thư mục riêng của nó
const relDir = P.serviceRel(root, name); // đường dẫn tính từ BSN_/
const up = path.relative(dir, root).split(path.sep).join('/'); // từ thư mục dịch vụ lên BSN_/
const base = path.basename(path.resolve(root)); // tên thư mục gốc của dự án (BSN_ ở dự án mẫu), dùng trong chữ của khung
const existed = fs.existsSync(dir);
const created = [];
const skipped = [];

const write = (rel, text) => {
  const p = path.join(dir, rel);
  if (fs.existsSync(p)) return skipped.push(rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
  created.push(rel);
};

write('CLAUDE.md', `# ${name}

Quy tắc chung cho mọi dịch vụ và cách làm việc (một harness duy nhất ở \`${base}/.claude\`) nằm ở \`${up}/CLAUDE.md\` (tự nạp). **Mở phiên Claude Code ở \`${base}/\`** rồi giao việc cho dịch vụ này; hook, MCP \`bsn-docs\` và skill chỉ nạp ở gốc, mở thẳng trong thư mục dịch vụ thì không có hook nào. Tệp này là phần riêng của dịch vụ.

## Phạm vi
- Làm trong \`${relDir}/\` (đường dẫn tương đối trong tệp này tính từ thư mục đó). Ngoài thư mục này chỉ đọc; việc cần dịch vụ khác thì ghi yêu cầu vào \`${up}/docs/handoff/\`.
- Đầu phiên: đọc [docs/agent/STATUS.md](docs/agent/STATUS.md), [docs/agent/DECISIONS.md](docs/agent/DECISIONS.md), [docs/agent/CONVENTIONS.md](docs/agent/CONVENTIONS.md). Liệt kê các tệp \`${up}/docs/handoff/*-to-${name}-*.md\` còn \`open\` và báo người dùng.
- Tài liệu ba tầng (design/spec/impl) chỉ ghi qua công cụ MCP \`bsn-docs\` với \`service="${name}"\` (\`design_record\` tạo \`docs/modules\` lần đầu); không sửa tay.
- Trong \`docs/\` của dịch vụ chỉ có Markdown cho agent, không đặt HTML. Nguồn có cấu trúc của dịch vụ là \`docs/service.yaml\` (nghiệp vụ, kiến trúc, vấn đề và tiến độ), ghi bằng \`bsn-docs\`: \`service_doc_set\`, \`problem_record\`. Người đọc xem cổng cục bộ \`BSN_/docs/portal/${name}/index.html\`, sinh tự động từ nguồn đó.

## Đọc gì khi nào
Tệp này là cửa vào duy nhất của dịch vụ. Thứ tự đọc chung cho mọi dịch vụ nằm ở skill \`services\`; bảng dưới chỉ tới tài liệu của riêng dịch vụ này (thêm dòng khi có tài liệu mới, ví dụ một bản nghiên cứu trong \`docs/agent/\`).

| Khi cần | Đọc |
|---|---|
| Biết đang làm dở gì, lần gần nhất đổi gì | [docs/agent/STATUS.md](docs/agent/STATUS.md) (bắt buộc trước khi sửa) |
| Biết ba lớp nằm ở thư mục nào, quy ước mã | [docs/agent/CONVENTIONS.md](docs/agent/CONVENTIONS.md) |
| Biết vì sao chọn cách này | [docs/agent/DECISIONS.md](docs/agent/DECISIONS.md) |
| Tìm một việc nằm ở tệp nào | công cụ \`context_explore\` (skill \`context\`) |
| Hiểu sâu một phần | \`docs/modules/<phần>/\` và \`docs/_generated/overview.md\` |

## Ba lớp (nguyên tắc ở ${up}/CLAUDE.md; phiên đầu tiên điền theo mã thật)
- Lớp vào/ra nằm ở:
- Lớp chuẩn hóa nằm ở (mỗi bên ngoài một module):
- Hợp đồng chuẩn (nơi ba lớp gặp nhau):
- Lớp logic nội bộ nằm ở:
- Test giữ ranh giới (quét import):
- Chỗ chưa tách đúng ba lớp:

## Việc của dịch vụ (phiên đầu tiên điền)
- Dịch vụ này sở hữu gì, không sở hữu gì:
- Giao diện công bố cho dịch vụ khác (tên tệp hợp đồng):
- Dịch vụ khác mà nó phụ thuộc:

## Quy tắc riêng (phiên đầu tiên điền, chỉ những gì người dùng đã chốt)
-

## Lệnh thường dùng
-
`);
write('.gitignore', 'node_modules/\n.env\n*.log\n');
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
if (!P.serviceHasRepo(root, name)) { // đơn vị nằm trong repo gốc (không có .git riêng) thì KHÔNG git init: nó dùng kho của repo gốc
  const git = spawnSync('git', ['init', '-q'], { cwd: dir, encoding: 'utf8' });
  gitNote = git.status === 0 ? ' (đã git init)' : ' (git init lỗi: ' + (git.stderr || '').trim() + ')';
}
// Git hook post-commit: mỗi lần dịch vụ commit thì cổng docs/portal tự dựng lại (cổng chỉ hiện bản đã commit). Không ghi đè hook sẵn có.
try {
  const h = require('./install-git-hooks').install(dir, { bsn: root });
  gitNote += h.status === 'installed' || h.status === 'updated' || h.status === 'ok' ? ', hook post-commit đã cài' : `, hook post-commit CHƯA cài (${h.status}); chạy: node .claude/modules/core/cli/install-git-hooks.js ${name}`;
  // Ba hook quét từ cấm (và dò docs/ khi đẩy, S-062) đi cùng: trước đây chỉ tóm tắt đầu phiên kế tiếp mới cài, nên đơn vị vừa tạo
  // bị doctor báo thiếu hook (gặp khi thử onboard trên dự án mẫu, S-063).
  const b = require('./install-git-hooks').installBan(dir, { bsn: root });
  if (['installed', 'updated', 'ok'].includes(b.status)) gitNote += ', hook quét từ cấm đã cài';
  else if (b.status !== 'linked-worktree' && b.status !== 'not-a-repo') gitNote += `, hook quét từ cấm CHƯA cài (${b.status})`;
} catch (e) {
  gitNote += `, hook post-commit CHƯA cài (${e.message})`;
}
console.log(`${existed ? 'Bổ sung cho' : 'Đã tạo'} ${dir}${gitNote}`);
console.log(`Tạo mới: ${created.join(', ') || 'không có'}`);
if (skipped.length) console.log(`Giữ nguyên (đã có): ${skipped.join(', ')}`);
console.log('Việc còn lại:');
// Bảng đơn vị chung của dự án: dự án mẫu ghi ở docs/system/services.md; dự án khác thường ghi trong CLAUDE.md gốc. Nhắc đúng tệp đang có.
const table = fs.existsSync(path.join(root, 'docs', 'system', 'services.md')) ? 'docs/system/services.md' : 'bảng đơn vị trong CLAUDE.md ở gốc (nếu dự án có bảng đó)';
console.log(`1. Thêm một dòng cho "${name}" vào ${table}.`);
console.log(`2. Mở phiên Claude Code ở ${root} (KHÔNG mở trong ${relDir}/) và giao việc cho dịch vụ này; phiên đầu điền CLAUDE.md (mục "Việc của dịch vụ" và "Quy tắc riêng").`);
console.log(`3. Dịch vụ không có .claude hay .mcp.json riêng: dùng MCP bsn-docs với service="${name}" khi cần ghi tài liệu ba tầng và docs/service.yaml (nguồn của trang ba tab trên cổng docs/portal).`);
