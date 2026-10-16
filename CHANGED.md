# Thay đổi từ bản 2.7.0 lên bản 2.8.0

Tệp này do lệnh đóng gói sinh ra, không ai viết tay. Dùng khi bạn đã sửa mã của gói hoặc viết khối mở rộng dựa vào tên hàm của gói:
tệp nào ở danh sách "sửa" mà bạn cũng đã sửa thì phải gộp; tên nào ở danh sách "bỏ" mà mã của bạn gọi thì phải đổi. Vì sao đổi: RELEASES.md.

## Tên xuất của bề mặt công khai
Không tên nào thêm hay bỏ.

## Tệp mã bỏ (0)
Không có.

## Tệp mã sửa (13)
- `.claude/modules/core/FORMAT.md`
- `.claude/modules/core/RELEASES.md`
- `.claude/modules/core/adapters/hosts/claude.js`
- `.claude/modules/core/adapters/hosts/definitions.js`
- `.claude/modules/core/adapters/hosts/sync.js`
- `.claude/modules/core/adapters/project/workspace.js`
- `.claude/modules/core/cli/doctor.js`
- `.claude/modules/core/cli/host.js`
- `.claude/modules/core/guides/03-skill-theo-repo.md`
- `.claude/modules/core/mcp/mcp-tools.js`
- `.claude/modules/core/module.json`
- `.claude/modules/core/skills/onboard.md`
- `.claude/modules/core/skills/services.md`

## Tệp mã thêm (4)
- `.claude/modules/core/adapters/project/enforce.js`
- `.claude/modules/core/hooks/host-resync.js`
- `.claude/modules/core/ports/skill-enforce.js`
- `.claude/modules/core/releases/2.8.0.json`
