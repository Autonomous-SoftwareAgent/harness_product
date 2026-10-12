---
name: services
description: Chỉ đường chung khi làm việc trong một đơn vị (dịch vụ) của dự án - đơn vị nằm ở đâu, bắt đầu một việc thế nào, đọc tài liệu nào theo thứ tự nào, trình kế hoạch theo khuôn, việc nào dùng skill nào, thế nào là làm đúng. Mở TRƯỚC lần sửa đầu tiên trong một đơn vị và trước lời gọi ghi đầu tiên của công cụ bsn-docs.
---

# Làm việc trong một đơn vị của dự án

Skill này là bản chỉ đường, không phải nội dung của đơn vị nào. Điều riêng của từng đơn vị nằm trong tài liệu của chính đơn vị đó; ở đây chỉ nói đi đâu để đọc và làm theo thứ tự nào. Khuôn chung của dự án: `.claude/modules/core/FORMAT.md`.

## Khi nào dùng
- Trước lần sửa đầu tiên trong một đơn vị, và trước lời gọi ghi đầu tiên của công cụ `bsn-docs`. Hook `guard-skill.js` chặn cho tới khi skill này được mở.
- Khi vừa nhận một việc mà chưa rõ nó thuộc đơn vị nào, phải đọc gì, hay phải dùng skill nào.
- Mở lại sau mỗi lần ngữ cảnh bị nén: hook tính lại từ đầu.

## Trước khi làm
- Phiên phải mở ở gốc dự án (thư mục chứa `.claude/`). Mở trong thư mục đơn vị thì không có hook, không có công cụ `bsn-docs`, không có skill.
- Tóm tắt đầu phiên có "CHƯA CÀI ĐẶT DỰ ÁN" thì mở skill `onboard` trước.
- Một phiên làm MỘT đơn vị, do người dùng giao. Việc đụng đơn vị khác thì ghi yêu cầu vào `docs/handoff/`, không tự sửa.
- Mọi lần sửa đều qua cổng duyệt: tổng hợp yêu cầu, trình kế hoạch, DỪNG chờ người dùng đồng ý ở lượt sau.

## Các bước
1. **Xác định đơn vị.** Đơn vị nào có trong dự án và nằm ở đâu: tóm tắt đầu phiên, hoặc `.claude/project/project.json` (`units`). Chưa rõ việc thuộc đơn vị nào thì hỏi người dùng.
2. **Xem có ai đang làm cùng đơn vị không:** `node .claude/modules/core/cli/session.js for <đơn-vị>`. Có phiên khác vừa sửa thì báo người dùng trước khi sửa.
3. **Đọc cửa vào của đơn vị** bằng công cụ Read, theo mục "Đọc gì khi nào". Các tệp khai trong `skills.serviceDocs` (mặc định `CLAUDE.md` và `docs/agent/STATUS.md`) là bắt buộc; hook chặn lần sửa đầu tiên nếu chưa đọc.
4. **Tìm hiểu việc cần làm** bằng `context_explore` trước khi Grep (skill `context`).
5. **Trình kế hoạch theo khuôn** (mục "Khuôn kế hoạch") và chờ duyệt. Được duyệt thì gọi `scope_register`.
6. **Làm**, mở thêm skill của loại việc đó (mục "Việc nào dùng skill nào").
7. **Kết thúc** theo mục "Cách kiểm".

## Khuôn kế hoạch
```
## Kế hoạch
- Dịch vụ: <đơn vị>[, <đơn vị khác>]      (hoặc: không)
- Lý do: vì sao cần làm việc này
- Làm gì: ...
- Sửa tệp: ...
- Không làm: ...
- Rủi ro: ...
```
- Viết MỖI MỤC TRÊN MỘT DÒNG; lời giải thích dài để ở trên hoặc dưới khối.
- Mục "Dịch vụ": tên đơn vị, cách nhau bằng dấu phẩy. Chỉ đụng phần chung (`docs/handoff/`, `docs/system/`) thì ghi `không`.
- Sai khuôn thì lời đồng ý của người dùng không mở cổng; hook nói rõ thiếu gì.
- Được duyệt thì gọi `scope_register` với các đơn vị trong mục "Dịch vụ". Sửa đơn vị chưa đăng ký hoặc ngoài kế hoạch bị CHẶN. Xem phạm vi: `scope_status`.

## Đọc gì khi nào
| Thứ tự | Tệp (trong đơn vị) | Trả lời câu hỏi | Bắt buộc |
|---|---|---|---|
| 1 | `CLAUDE.md` | Đơn vị làm gì, quy tắc riêng, lệnh thường dùng, đọc tiếp gì | Có |
| 2 | `docs/agent/STATUS.md` | Đang làm dở gì, lần gần nhất đổi gì, điều chưa kiểm | Có |
| 3 | `docs/handoff/*` còn `open` (ở gốc) | Ai đang chờ đơn vị này làm gì | Liệt kê và báo người dùng |
| 4 | `context_explore` | Việc này ở tệp nào, test nào, vì sao | Trước khi Grep |
| 5 | `docs/agent/CONVENTIONS.md` | Các lớp nằm ở thư mục nào, quy ước mã | Trước khi viết mã |
| 6 | `docs/agent/DECISIONS.md` | Vì sao chọn cách này | Khi định đổi một cách làm đã có |
| 7 | `docs/modules/<phần>/`, `docs/_generated/overview.md` | Thiết kế, đặc tả từng phần; tổng quan | Khi cần hiểu sâu |

Dự án khai danh sách bắt buộc khác (`skills.serviceDocs`, `skills.unitDocs`) thì theo danh sách đó.

### Đã có thì sao, chưa có thì làm gì
| Tệp | Đã có | Chưa có |
|---|---|---|
| `CLAUDE.md` của đơn vị | Đọc trước tiên, làm theo | `node .claude/modules/core/cli/new-service.js <tên>` tạo khung (không ghi đè); điền từ mã thật trong cùng kế hoạch |
| `docs/agent/STATUS.md` | Đọc; cuối việc thêm dòng nhật ký | Như trên |
| `docs/agent/CONVENTIONS.md` | Theo đúng quy ước | Viết mã theo cách đang thấy trong đơn vị; ghi lại quy ước đọc thấy khi người dùng đồng ý |
| Tài liệu có cấu trúc (ba tầng, `service.yaml`, sơ đồ) | Cập nhật bằng skill `service-docs`, `diagrams` khi mã đổi | Không tự bật; hỏi người dùng nếu việc cần |

## Việc nào dùng skill nào
| Việc | Skill |
|---|---|
| Cài harness, khai hay đổi đơn vị | `onboard` |
| Khai việc nào cần skill nào; viết skill riêng của dự án | `skill-map` |
| Ghi tài liệu ba tầng, `docs/service.yaml`, sổ vấn đề | `service-docs` |
| Thêm, sửa, giải thích, soát sơ đồ | `diagrams` |
| Tìm hiểu một việc trước khi sửa; từ vựng; quan hệ máy không đọc ra | `context` |
| Trang của đơn vị trên cổng HTML | `service-page` |
| Thêm một đơn vị mới | `new-service` |

Dự án có thể khai thêm skill riêng; bảng đầy đủ việc nào cần skill nào là phần `skills` của `.claude/project/project.json`.

## Thế nào là làm đúng
- **Chỉ ghi điều đã đọc thấy trong mã hoặc người dùng đã chốt.** Điều chưa kiểm với hệ thống thật thì ghi rõ là chưa kiểm.
- **Tài liệu có cấu trúc ghi qua công cụ** `bsn-docs` với `service="<tên>"`. Không tự viết Mermaid.
- **Điều riêng của đơn vị ở trong đơn vị**, không ghi vào `CLAUDE.md` gốc, không tạo skill chung cho nó.
- **Không có bí mật trong mã, tài liệu, nhật ký.** Chỉ ghi tên biến môi trường.
- **Làm trọn mục tiêu đã duyệt.** Chỗ còn thiếu khiến mục tiêu chưa đạt trọn thì xử lý luôn trong lượt và báo ở cuối. Chỉ dừng hỏi khi đụng đơn vị ngoài kế hoạch, khó hoàn tác, đưa ra ngoài máy (đẩy, publish, deploy), hoặc đổi điều người dùng đã chốt.
- **Báo kết quả trung thực:** test hỏng thì nói hỏng kèm đầu ra; bước nào bỏ qua thì nói bỏ qua.

## Lỗi hay gặp
- Sửa mã ngay mà chưa đọc `CLAUDE.md` và `STATUS.md` của đơn vị.
- Grep ngay thay vì hỏi `context_explore`.
- Trình kế hoạch thiếu khối theo khuôn, hoặc quên `scope_register` sau khi được duyệt.
- Ghi qua lệnh shell để tránh hook: hook không thấy, nhưng `docs check` phát hiện lệch bằng băm; và đó là lách quy tắc.

## Cách kiểm
- Test của đơn vị qua (lệnh ở `CLAUDE.md` của đơn vị).
- `node .claude/modules/core/cli/cli.js --service <tên> check` không có lỗi.
- `docs/agent/STATUS.md` có dòng nhật ký cho việc vừa làm: đổi gì, kiểm bằng gì, điều chưa kiểm.
- Việc cần đơn vị khác đã có tờ trong `docs/handoff/` và đã báo người dùng.
