# harness_product

Bộ harness cho Claude Code: phiên Claude chỉ sửa tệp sau khi bạn duyệt một kế hoạch, giữ đúng phạm vi đã duyệt, phải đọc hướng dẫn và tài liệu của phần đang sửa trước khi ghi, ghi tài liệu và sơ đồ qua công cụ có kiểm tra, và để lại sổ ghi lại phiên đã làm gì.

## Cài vào một dự án
Cần Node 22.5 trở lên (dùng SQLite có sẵn của Node) và git.

1. Tải repo này về một chỗ bất kỳ (không phải trong dự án): `git clone https://github.com/Autonomous-SoftwareAgent/harness_product`
2. Xem trước việc sẽ làm: `node harness_product/.claude/modules/core/cli/cli.js install <thư mục dự án>`
3. Làm thật: thêm `--apply`. Lệnh chép mã vào `<dự án>/.claude/modules/`, tạo `.claude/project/` (phần của dự án), chép skill còn thiếu vào `.claude/skills/`, rồi viết phần của harness trong `.claude/settings.json` và `.mcp.json` (phần bạn tự thêm được giữ). Bản cũ được cất để quay lại: `install <dự án> --undo`.
4. Mở Claude Code ở gốc dự án. Claude Code hỏi có tin thư mục này không: chọn có, để hook chạy.
5. Tóm tắt đầu phiên báo "CHƯA CÀI ĐẶT DỰ ÁN". Bảo Claude: "onboard dự án này". Agent đọc dự án, trình kế hoạch tổ chức (đơn vị nằm ở đâu, trước khi sửa phải đọc gì, việc nào cần skill nào), bạn duyệt, agent ghi `.claude/project/project.json` và dựng phần tài liệu còn thiếu.
6. Kiểm: `node .claude/modules/core/cli/cli.js doctor` không có dòng LỖI. Gõ `/mcp` nếu tóm tắt đầu phiên nhắc.

Bản này có gì, nâng cấp phải làm gì, đã kiểm bằng gì và điều gì chưa kiểm: [RELEASES.md](RELEASES.md), mỗi bản một mục.

## Nâng cấp, và chuyển từ bản cũ
- Đọc phần "Nâng cấp" của bản mới trong [RELEASES.md](RELEASES.md), tải bản mới rồi chạy lại bước 2 và 3 với bản mới. Mã trong `.claude/modules/` được thay; `.claude/project/`, skill bạn đã sửa, sổ phiên và phần settings của bạn giữ nguyên. Tệp mã bạn từng sửa tay được nêu tên (bản cũ nằm trong chỗ cất).
- Dự án đang dùng bản cũ (mọi thứ trong `.claude/plugin/`): cùng lệnh `install`. Lệnh chuyển cấu hình (`project.json`, bảng đơn vị, bảng skill, công tắc, bộ sinh riêng, luật mở rộng) sang `.claude/project/`, giữ sổ phiên, cất `.claude/plugin/` cũ để quay lại, và nêu các tệp cổng duyệt bạn từng sửa.

## Bố cục
| Chỗ | Của ai | Giữ gì |
|---|---|---|
| `.claude/modules/<khối>/` | sản phẩm | mã harness; bản mới thay toàn bộ |
| `.claude/project/` | dự án | `project.json` (khối bật, bộ khuôn, ngôn ngữ, đơn vị, bảng skill, luật), luật mở rộng `rules/`, bộ sinh riêng |
| `.claude/skills/`, `.claude/settings.json`, `.mcp.json` | chung | chỗ Claude Code đọc; bộ cài viết phần của harness, giữ phần của bạn |
| `.claude/local/` và thư mục trạng thái trong `.claude/` | máy | từ cấm, sổ phiên, trạng thái cổng duyệt; không commit |

Khối: `core` (bắt buộc: cổng duyệt kế hoạch, phạm vi theo kế hoạch, chặn theo skill, sổ phiên, máy chủ MCP, bộ cài), `servicedocs` (tài liệu ba tầng), `diagrams` (sơ đồ), `context` (kho ngữ nghĩa), `portal` (trang HTML cho người đọc), `guard-push` (từ cấm, chặn đẩy). Chỉ bật một số khối: khóa `modules` trong `project.json` (hoặc `"preset": "light"`), rồi `node .claude/modules/core/cli/cli.js setup`.

## Máy chủ MCP khác, và chuyển việc sang phiên mới
- Harness có một máy chủ MCP cho mỗi khối đang bật (`harness`, `harness-docs`, ...); `harness-mcp` là cổng: máy chủ MCP khác khai trong `.claude/project/mcp.json` và chạy phía sau nó, có hiệu lực ở phiên đang mở mà không phải nối lại. Máy chủ mới chỉ chạy sau khi bạn duyệt một kế hoạch và phiên chạy `mcp trust`. Cách làm: skill `mcp-servers`.
- Việc đang dở chuyển sang một phiên mới bằng `node .claude/modules/core/cli/session.js transfer`, kèm tờ bàn giao mà phiên mới phải đọc. Cách làm: skill `transfer-session`.

## Thêm luật của riêng dự án
Đặt `.claude/project/rules/<id>.js` xuất `{ id, on, api: "0.1", run(event, ports) }` (sự kiện và quyết định: `.claude/modules/core/ports/events.js`), rồi chạy `setup` để khai hook. Mã trong `.claude/modules/` không phải sửa.

## Gỡ ra
`install <dự án> --undo` quay lại trạng thái trước lần cài gần nhất. Gỡ hẳn: xóa nhóm hook trỏ vào `.claude/modules/` trong `.claude/settings.json`, các mục `harness*` trong `.mcp.json`, rồi xóa `.claude/modules/`, `.claude/project/` và thư mục trạng thái của harness trong `.claude/`.

## Giới hạn
- Lời chặn và lời nhắc của lõi có tiếng Việt và tiếng Anh (`"lang": "en"` trong `project.json`); skill và tài liệu của gói là tiếng Việt.
- Hook của Claude Code cho qua khi hook hỏng hay quá giờ; `doctor` và tóm tắt đầu phiên báo khi có vấn đề.
- Hook là hàng rào cho phiên Claude, không phải sandbox: người ngồi trước máy vẫn sửa được mọi thứ.
- Thư viện vẽ sơ đồ (Mermaid, giấy phép MIT) đi kèm ở `.claude/modules/diagrams/mcp/vendor/`.
