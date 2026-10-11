---
name: new-service
description: Thêm một đơn vị (dịch vụ) mới vào dự án - tạo thư mục và khung tài liệu ở đúng chỗ dự án khai, điền cửa vào từ mã hay từ điều người dùng chốt, kiểm. Dùng khi người dùng muốn bắt đầu một đơn vị mới, hoặc một đơn vị đang có thiếu khung tài liệu.
---

# Thêm một đơn vị

## Khi nào dùng
- Người dùng muốn bắt đầu một đơn vị mới.
- Một đơn vị đang có thiếu `CLAUDE.md` hay `docs/agent/` (lệnh dưới chỉ bổ sung phần thiếu, không ghi đè).

## Trước khi làm
- Phiên mở ở gốc dự án. Trình kế hoạch và chờ người dùng duyệt trước khi chạy bước 1.
- Đơn vị mới nằm ở thư mục cha ĐẦU TIÊN trong `units.parents` của `.claude/plugin/project.json`. Muốn đặt chỗ khác thì khai trong `units.dirs` trước (skill `onboard`).
- Tên đơn vị: chữ thường, số, gạch ngang, 2 đến 41 ký tự.

## Các bước
1. Tạo khung, chạy từ gốc dự án: `node .claude/plugin/cli/new-service.js <tên>`
   - Kết quả: thư mục của đơn vị có `git init`, `CLAUDE.md` khung, `docs/agent/{STATUS,DECISIONS,CONVENTIONS}.md`, git hook `post-commit`.
   - Đã có phần nào thì lệnh giữ nguyên phần đó.
   - Lệnh KHÔNG tạo `.claude` hay `.mcp.json` trong đơn vị: harness chỉ có một chỗ ở gốc dự án.
2. Thêm đơn vị vào bảng đơn vị trong `CLAUDE.md` gốc (nếu dự án có bảng đó).
3. Điền `CLAUDE.md` của đơn vị: việc của đơn vị, quy tắc riêng, các lớp mã nằm ở thư mục nào, lệnh chạy và test. Chỉ ghi điều người dùng đã chốt hoặc đọc thấy trong mã; chỗ chưa rõ ghi "chưa rõ".
4. Ghi dòng nhật ký đầu tiên vào `docs/agent/STATUS.md`.

## Đã có thì sao, chưa có thì làm gì
| Thứ | Đã có | Chưa có |
|---|---|---|
| Thư mục đơn vị | Lệnh chỉ bổ sung phần thiếu | Lệnh tạo |
| Repo git của đơn vị | Giữ nguyên | Lệnh chạy `git init` |
| Thư mục cha trong `project.json` | Dùng thư mục đầu tiên | Khai bằng skill `onboard` trước |

## Lỗi hay gặp
- Tạo thư mục bằng tay ở chỗ dự án không khai: harness không nhận ra đó là đơn vị.
- Làm hai đơn vị trong một phiên. Tạo khung xong thì người dùng mở phiên mới ở gốc và giao việc cho đơn vị mới.

## Cách kiểm
- `node .claude/plugin/cli/cli.js doctor` liệt kê đơn vị mới.
- `node .claude/plugin/cli/cli.js --service <tên> check` không có lỗi.
