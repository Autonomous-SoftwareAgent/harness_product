# Thay đổi từ bản 2.8.1 lên bản 2.9.0

Tệp này do lệnh đóng gói sinh ra, không ai viết tay. Dùng khi bạn đã sửa mã của gói hoặc viết khối mở rộng dựa vào tên hàm của gói:
tệp nào ở danh sách "sửa" mà bạn cũng đã sửa thì phải gộp; tên nào ở danh sách "bỏ" mà mã của bạn gọi thì phải đổi. Vì sao đổi: RELEASES.md.

## Tên xuất của bề mặt công khai
- `core/gate/gate-paths.js`
  - thêm: `isSecretPath`

## Tệp mã bỏ (0)
Không có.

## Tệp mã sửa (23)
- `.claude/modules/core/RELEASES.md`
- `.claude/modules/core/adapters/claude-code/hook.js`
- `.claude/modules/core/adapters/hosts/claude.js`
- `.claude/modules/core/adapters/hosts/definitions.js`
- `.claude/modules/core/adapters/hosts/sync.js`
- `.claude/modules/core/adapters/project/extensions.js`
- `.claude/modules/core/adapters/storage/ledger-db.js`
- `.claude/modules/core/cli/banned-scan.js`
- `.claude/modules/core/cli/host.js`
- `.claude/modules/core/cli/public-export.js`
- `.claude/modules/core/cli/transfer.js`
- `.claude/modules/core/core/rules/scope.js`
- `.claude/modules/core/gate/gate-core.js`
- `.claude/modules/core/gate/gate-hook.js`
- `.claude/modules/core/gate/gate-paths.js`
- `.claude/modules/core/gate/gate-rule.js`
- `.claude/modules/core/gate/gate-state.js`
- `.claude/modules/core/gate/plan-format.js`
- `.claude/modules/core/guides/README.md`
- `.claude/modules/core/mcp/mcp-tools.js`
- `.claude/modules/core/module.json`
- `.claude/modules/core/ports/events.js`
- `.claude/modules/core/skills/plan.md`

## Tệp mã thêm (25)
- `.claude/modules/core/cli/delegate.js`
- `.claude/modules/core/core/rules/delegate-guard.js`
- `.claude/modules/core/core/rules/lib/agent-unit.js`
- `.claude/modules/core/gate/gate-delegate.js`
- `.claude/modules/core/guides/05-dieu-phoi-va-sub-agent.md`
- `.claude/modules/core/hooks/guard-delegate.js`
- `.claude/modules/core/releases/2.9.0.json`
- `.claude/modules/core/skills/orchestrate.md`
- `.claude/modules/secrets/adapters/secrets/file-0600.js`
- `.claude/modules/secrets/adapters/secrets/github.js`
- `.claude/modules/secrets/adapters/secrets/index.js`
- `.claude/modules/secrets/adapters/secrets/linux-secret-tool.js`
- `.claude/modules/secrets/adapters/secrets/macos-keychain.js`
- `.claude/modules/secrets/adapters/secrets/windows-dpapi.js`
- `.claude/modules/secrets/cli/commands/secret.js`
- `.claude/modules/secrets/cli/git-credential.js`
- `.claude/modules/secrets/cli/github.js`
- `.claude/modules/secrets/core/rules/github.js`
- `.claude/modules/secrets/core/rules/secrets-brief.js`
- `.claude/modules/secrets/core/secrets/policy.js`
- `.claude/modules/secrets/hooks/guard-github.js`
- `.claude/modules/secrets/hooks/secrets-brief.js`
- `.claude/modules/secrets/mcp/secrets/tools.js`
- `.claude/modules/secrets/module.json`
- `.claude/modules/secrets/ports/secret-store.js`
