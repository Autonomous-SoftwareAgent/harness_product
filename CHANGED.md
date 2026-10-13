# Thay đổi từ bản 1.7.0 lên bản 2.0.0

Tệp này do lệnh đóng gói sinh ra, không ai viết tay. Dùng khi bạn đã sửa mã của gói hoặc viết khối mở rộng dựa vào tên hàm của gói:
tệp nào ở danh sách "sửa" mà bạn cũng đã sửa thì phải gộp; tên nào ở danh sách "bỏ" mà mã của bạn gọi thì phải đổi. Vì sao đổi: RELEASES.md.

## Tên xuất của bề mặt công khai
- `core/gate/gate-paths.js`
  - thêm: `MCP_LEGACY`, `mcpMatcher`, `mcpPrefix`, `mcpServers`

## Tệp mã bỏ (0)
Không có.

## Tệp mã sửa (28)
- `.claude/modules/context/module.json`
- `.claude/modules/core/FORMAT.md`
- `.claude/modules/core/RELEASES.md`
- `.claude/modules/core/adapters/jobs/brief-facts.js`
- `.claude/modules/core/adapters/project/workspace.js`
- `.claude/modules/core/cli/doctor.js`
- `.claude/modules/core/cli/new-service.js`
- `.claude/modules/core/cli/public-export.js`
- `.claude/modules/core/cli/setup.js`
- `.claude/modules/core/core/rules/ledger.js`
- `.claude/modules/core/core/rules/lib/knowledge.js`
- `.claude/modules/core/core/rules/skill.js`
- `.claude/modules/core/core/sessions/brief.js`
- `.claude/modules/core/gate/gate-paths.js`
- `.claude/modules/core/mcp/gateway/hub.js`
- `.claude/modules/core/mcp/mcp-surface.js`
- `.claude/modules/core/mcp/mcp-tools.js`
- `.claude/modules/core/mcp/mcp-worker.js`
- `.claude/modules/core/module.json`
- `.claude/modules/core/ports/workspace.js`
- `.claude/modules/core/skills/onboard.md`
- `.claude/modules/core/skills/services.md`
- `.claude/modules/core/skills/skill-map.md`
- `.claude/modules/diagrams/module.json`
- `.claude/modules/guard-push/core/rules/banned.js`
- `.claude/modules/guard-push/module.json`
- `.claude/modules/portal/module.json`
- `.claude/modules/servicedocs/module.json`

## Tệp mã thêm (2)
- `.claude/modules/core/core/rules/lib/mcp-names.js`
- `.claude/modules/core/releases/2.0.0.json`
