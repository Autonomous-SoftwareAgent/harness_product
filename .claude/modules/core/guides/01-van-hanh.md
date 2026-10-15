# Vận hành harness hằng ngày

## Một phiên làm việc, từ đầu đến cuối
1. **Mở Claude Code ở gốc dự án** (thư mục chứa `.claude/`). Hook và máy chủ MCP chỉ nạp ở đây; mở trong thư mục một repo con thì không có hook nào và Claude Code cho qua im lặng. Lần đầu, Claude Code hỏi có tin thư mục này không: chọn có.
2. **Đọc tóm tắt đầu phiên** mà harness đưa vào ngữ cảnh: đơn vị nào đang có vấn đề, yêu cầu còn mở trong `docs/handoff/`, phiên khác đang sửa gì, bản mới của harness (nếu có). Thấy dòng "CẢNH BÁO HARNESS" hay "GATE health" thì báo người dùng và chỉ đọc cho tới khi sửa xong.
3. **Bạn nêu yêu cầu.** Agent tổng hợp lại và trình một kế hoạch, rồi dừng. Kế hoạch phải có khối này, đủ năm mục:
   ```
   ## Kế hoạch
   - Dịch vụ: web, api          (tên đơn vị; hoặc: không)
   - Làm gì: ...
   - Sửa tệp: ...
   - Không làm: ...
   - Rủi ro: ...
   ```
   Cổng chỉ cần bắt đủ năm thông tin này; cách viết tùy ý (tiêu đề có thể kèm chữ như "Kế hoạch (v2)" hay "Plan", tên mục có thể kèm chú thích hoặc dùng tên gần nghĩa, gạch đầu dòng, in đậm, bảng đều được). Dòng "Dịch vụ" thì tên đơn vị ở đầu dòng, lời giải thích để sau dấu ngoặc hay dấu chấm phẩy. Cổng chỉ chưa mở khi thật sự thiếu: thiếu hoặc để trống một mục (agent chỉ viết thêm đúng mục đó, hệ thống ghép vào kế hoạch cũ, bạn đồng ý lần nữa trên bản đầy đủ), hoặc dòng "Dịch vụ" không đọc ra được tên đơn vị nào.
4. **Bạn duyệt bằng lời thường** ("ok", "duyệt", "làm đi"). Câu dài hơn thì một model phán xem đó có phải lời duyệt không. "Ok nhưng đổi X" hay một việc mới thì cổng đóng lại, agent sửa kế hoạch và trình lại. Tin do phiên Claude khác gửi không bao giờ tính là lời duyệt.
5. **Agent đăng ký phạm vi** bằng công cụ `scope_register` với đúng các đơn vị trong kế hoạch. Đơn vị không có trong kế hoạch bị từ chối.
6. **Agent làm.** Trước lần sửa đầu tiên trong một đơn vị, nó phải mở skill tổng quát và đọc `CLAUDE.md` cùng `STATUS.md` của đơn vị đó (và các tài liệu khác dự án bắt buộc, xem [03-skill-theo-repo.md](03-skill-theo-repo.md)). Ghi tài liệu có cấu trúc (ba tầng, `service.yaml`, sơ đồ, từ vựng) chỉ qua công cụ MCP của harness.
7. **Kết thúc lượt:** hook nhắc cập nhật `STATUS.md` và tài liệu nếu agent sửa mã mà chưa ghi. Commit chỉ khi bạn bảo.

## Khi hook chặn, vì sao và làm gì
| Lời chặn nói | Nghĩa là | Làm gì |
|---|---|---|
| Chưa duyệt kế hoạch / kế hoạch sai khuôn | Cổng đóng | Trình lại kế hoạch đúng khuôn, chờ duyệt |
| Dịch vụ ngoài kế hoạch, hoặc chưa đăng ký | Phạm vi | Đăng ký đơn vị đã có trong kế hoạch, hoặc trình kế hoạch mới cho đơn vị thêm |
| Chưa nạp đủ kiến thức (skill, tài liệu) | Chặn theo skill | Mở skill bằng công cụ Skill (hoặc đọc trọn `SKILL.md`), đọc tài liệu bằng công cụ Read, rồi gọi lại. Sau mỗi lần nén ngữ cảnh phải nạp lại |
| Tệp do công cụ sở hữu | Ghi tay vào tài liệu ba tầng, `service.yaml`, sơ đồ, cổng HTML | Ghi bằng công cụ MCP tương ứng |
| Có từ trong danh sách cấm | Từ cấm của máy | Viết lại không dùng từ đó; không chép từ cấm đi đâu |
| Đẩy repo gốc, thêm remote, `--no-verify` | Luật đưa mã ra ngoài (nếu dự án bật) | Không lách; chỉ đẩy khi người dùng bảo, đúng repo |
| Công cụ ghi ra ngoài (máy chủ MCP ngoài) | Cần kế hoạch đã duyệt | Trình kế hoạch nêu rõ sẽ ghi gì ra đâu |

Quy tắc chung: hook từ chối thì quay lại trình kế hoạch, không thử đường khác (kể cả qua Bash).

## Việc hằng ngày và lệnh
Chạy từ gốc dự án.

| Việc | Lệnh |
|---|---|
| Kiểm sức khỏe mọi thứ | `node .claude/modules/core/cli/cli.js doctor` |
| Settings và `.mcp.json` còn khớp các khối đang bật | `node .claude/modules/core/cli/cli.js setup --check` (bỏ `--check` để viết lại) |
| Tình trạng cổng HTML, sơ đồ, kho ngữ nghĩa | `node .claude/modules/core/cli/cli.js portal-status` |
| Phiên Claude đang mở trên máy, phiên nào đã làm đơn vị nào | `node .claude/modules/core/cli/session.js list` và `node .claude/modules/core/cli/session.js for <đơn vị>` |
| Số liệu skill nào đã mở, hook nào chặn ở đâu | `node .claude/modules/core/cli/session.js skills` |
| Bản đang cài, tệp của gói bạn đã sửa | `node .claude/modules/core/cli/cli.js upgrade status` |
| Thêm đơn vị mới, hoặc bổ sung khung còn thiếu | `node .claude/modules/core/cli/new-service.js <tên>` |
| Gỡ bớt nhật ký STATUS.md dài | `node .claude/modules/core/cli/cli.js --service <tên> status-archive` |

## Việc chỉ người dùng làm, ở terminal, ngoài phiên Claude
Lệnh cấp quyền chạy mã từ chối khi chạy trong phiên Claude Code; agent chỉ đưa lệnh cho bạn.
- `node .claude/modules/core/cli/cli.js extension trust <khóa>` (và `untrust`): cho phép mã của một khối mở rộng chạy trong hook. Xem [04-mo-rong.md](04-mo-rong.md).
- `node .claude/modules/core/cli/cli.js mcp trust <tên>` (và `untrust`): cho phép một máy chủ MCP ngoài chạy.
- Danh sách từ cấm của máy: `.claude/local/cam-tu.json` (không commit). Chỉ bạn ghi.
- `.claude/project/gate.config.json` (câu duyệt riêng, mô hình phán hay không, mục thêm của kế hoạch): chỉ bạn sửa, hook chặn phiên ghi vào.

## Nâng cấp
Bạn không gõ lệnh nâng cấp. Khi kho gói có bản mới, harness dựng sẵn ở nền (khóa `upgrade.auto` trong `project.json`: `prepare` mặc định, `check`, `off`). Đầu phiên có một dòng báo. Mở skill `harness-upgrade`, agent đọc báo cáo, trình bạn từng mục thay đổi (chỗ nào chạm tệp bạn đã sửa, khóa cấu hình nào đổi, điểm cần bạn quyết), bạn duyệt, agent cài và kiểm; kiểm hỏng thì tự quay lại. Khai lệnh test của phần bạn đã sửa vào `upgrade.verify` để bước cài kiểm cả phần đó.

Đừng cài đè bằng lệnh `install` khi dự án có phần bạn đã sửa trong `.claude/modules/`: đi qua lệnh `upgrade` để gộp ba bên. Đọc phần "Nâng cấp" của bản mới trong `RELEASES.md` trước.

Phiên Claude đang mở khi mã harness đổi: hook và công cụ có hiệu lực ngay. Chỉ khi kết quả công cụ có dòng "CẢNH BÁO" kèm tên một máy chủ của harness thì gõ `/mcp` để nối lại.

## Quay lại và gỡ
- `node <gói>/.claude/modules/core/cli/cli.js install <dự án> --undo`: về trạng thái trước lần cài gần nhất (bản cũ cất ở `.claude/.state/install-backup/`).
- Gỡ hẳn: xóa nhóm hook trỏ vào `.claude/modules/` trong `.claude/settings.json`, các mục `harness*` trong `.mcp.json`, rồi xóa `.claude/modules/`, `.claude/project/` và thư mục trạng thái của harness trong `.claude/`.

## Khi có sự cố
| Triệu chứng | Kiểm | Thường là |
|---|---|---|
| Hook không chặn gì | `doctor`, `session.js skills` (dòng VẤN ĐỀ nghĩa là đang KHÔNG chặn) | Hook bị xóa hay hỏng (Claude Code cho qua khi hook hỏng), bảng nối skill hỏng, không mở được sổ phiên |
| Công cụ của harness biến mất | Kết quả có "mã công cụ của harness đang hỏng"? | Lỗi của harness: báo người dùng, đừng thử đường khác. Có dòng "CẢNH BÁO" kèm tên máy chủ thì gõ `/mcp` |
| Không có hook nào, không có công cụ | Phiên mở nhầm trong thư mục một repo con | Mở lại ở gốc dự án |
| `doctor` báo khai mà không chặn | Công cụ khai trong bảng skill mà hook không gọi cho nó | Xem giới hạn ở [02-skill-toan-cuc.md](02-skill-toan-cuc.md) |
| Hai phiên cùng sửa một đơn vị | Hook cảnh báo ở lần sửa đầu | Báo người dùng trước khi sửa tiếp; yêu cầu chéo đơn vị ghi ở `docs/handoff/` |

Hook của Claude Code cho qua khi hook hỏng, quá giờ hoặc bị xóa; harness không tự phát hiện việc bị xóa trong lúc chạy, nhưng `doctor` và tóm tắt đầu phiên báo khi mở phiên.
