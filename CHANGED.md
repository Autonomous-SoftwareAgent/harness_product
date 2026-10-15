# Thay đổi từ bản 2.3.0 lên bản 2.6.0

Tệp này do lệnh đóng gói sinh ra, không ai viết tay. Dùng khi bạn đã sửa mã của gói hoặc viết khối mở rộng dựa vào tên hàm của gói:
tệp nào ở danh sách "sửa" mà bạn cũng đã sửa thì phải gộp; tên nào ở danh sách "bỏ" mà mã của bạn gọi thì phải đổi. Vì sao đổi: RELEASES.md.

## Tên xuất của bề mặt công khai
Không tên nào thêm hay bỏ.

## Tệp mã bỏ (0)
Không có.

## Tệp mã sửa (14)
- `.claude/modules/core/RELEASES.md`
- `.claude/modules/core/adapters/project/workspace.js`
- `.claude/modules/core/cli/cli.js`
- `.claude/modules/core/cli/doctor.js`
- `.claude/modules/core/core/rules/lib/knowledge.js`
- `.claude/modules/core/guides/03-skill-theo-repo.md`
- `.claude/modules/core/hooks/session-brief.js`
- `.claude/modules/core/mcp/mcp-tools.js`
- `.claude/modules/core/module.json`
- `.claude/modules/core/ports/workspace.js`
- `.claude/modules/core/presets/light.json`
- `.claude/modules/core/skills/onboard.md`
- `.claude/modules/core/skills/plan.md`
- `.claude/modules/core/skills/services.md`

## Tệp mã thêm (12)
- `.claude/modules/core/adapters/hosts/claude.js`
- `.claude/modules/core/adapters/hosts/definitions.js`
- `.claude/modules/core/adapters/hosts/inventory.js`
- `.claude/modules/core/adapters/hosts/sync.js`
- `.claude/modules/core/adapters/storage/sql-readonly.js`
- `.claude/modules/core/cli/host.js`
- `.claude/modules/core/core/rules/host-generated.js`
- `.claude/modules/core/hooks/guard-host.js`
- `.claude/modules/core/ports/host-adapter.js`
- `.claude/modules/core/releases/2.4.0.json`
- `.claude/modules/core/releases/2.5.0.json`
- `.claude/modules/core/releases/2.6.0.json`
