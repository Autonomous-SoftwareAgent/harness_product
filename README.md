# harness_product

Bộ harness cho Claude Code: phiên Claude chỉ sửa tệp sau khi bạn duyệt một kế hoạch, giữ đúng phạm vi đã duyệt, phải đọc hướng dẫn và tài liệu của phần đang sửa trước khi ghi, ghi tài liệu và sơ đồ qua công cụ có kiểm tra, và để lại sổ ghi lại phiên đã làm gì.

## Cài vào một dự án
Cần Node 22.5 trở lên (dùng SQLite có sẵn của Node) và git.

1. Tải repo này về một chỗ bất kỳ: `git clone https://github.com/Autonomous-SoftwareAgent/harness_product`
2. Chép thư mục `.claude/` và tệp `.mcp.json` vào GỐC dự án của bạn.
   - Dự án đã có `.claude/`: chép `.claude/plugin/` và `.claude/skills/*` vào, rồi trộn phần `hooks` của `.claude/settings.json` vào settings đang có.
   - Dự án đã có `.mcp.json`: không cần chép; lần mở phiên đầu harness tự thêm mục `bsn-docs`.
3. Mở Claude Code ở gốc dự án. Claude Code hỏi có tin thư mục này không: chọn có, để hook chạy.
4. Tóm tắt đầu phiên báo "CHƯA CÀI ĐẶT DỰ ÁN". Bảo Claude: "onboard dự án này". Agent đọc dự án, trình kế hoạch tổ chức (đơn vị nằm ở đâu, trước khi sửa phải đọc gì, việc nào cần skill nào), bạn duyệt, agent ghi `.claude/plugin/project.json` và dựng phần tài liệu còn thiếu.
5. Kiểm: `node .claude/plugin/cli/cli.js doctor` không có dòng LỖI. Gõ `/mcp` nếu tóm tắt đầu phiên nhắc.

## Phiên đầu tiên sẽ xảy ra gì
- Cổng duyệt kế hoạch chạy ngay: Claude không sửa tệp nào khi bạn chưa duyệt kế hoạch.
- Harness tạo `.mcp.json` (nếu thiếu) và thư mục trạng thái của nó bên trong `.claude/` (sổ phiên SQLite; tệp `.claude/.gitignore` của gói đã bỏ qua thư mục này).
- Các luật theo đơn vị (đọc tài liệu trước khi sửa, giữ phạm vi theo kế hoạch) bắt đầu áp sau khi `project.json` khai đơn vị.

## Gồm những gì
| Thứ | Ở đâu |
|---|---|
| Khuôn làm việc chung, cấu hình dự án | `.claude/plugin/FORMAT.md` |
| Hook (cổng duyệt, phạm vi, skill, tệp do công cụ sở hữu, từ cấm, đẩy) | `.claude/settings.json` khai, mã ở `.claude/plugin/` |
| Máy chủ MCP `bsn-docs` (tài liệu, sơ đồ, kho ngữ nghĩa, phạm vi) | `.claude/plugin/mcp/` |
| Skill | `.claude/skills/` (`onboard`, `skill-map`, `services`, `service-docs`, `diagrams`, `context`, `service-page`, `new-service`) |
| Lệnh | `node .claude/plugin/cli/cli.js` (`doctor`, `check`, `portal`...) |

## Gỡ ra
Xóa khối `hooks` trong `.claude/settings.json`, mục `bsn-docs` trong `.mcp.json`, rồi xóa `.claude/plugin/`, các skill trên và thư mục trạng thái của harness trong `.claude/`.

## Giới hạn
- Chữ trong skill, lời báo và tài liệu là tiếng Việt.
- Hook của Claude Code cho qua khi hook hỏng hay quá giờ; `doctor` và tóm tắt đầu phiên báo khi có vấn đề.
- Hook là hàng rào cho phiên Claude, không phải sandbox: người ngồi trước máy vẫn sửa được mọi thứ.
- Thư viện vẽ sơ đồ (Mermaid, giấy phép MIT) đi kèm ở `.claude/plugin/mcp/vendor/`.
