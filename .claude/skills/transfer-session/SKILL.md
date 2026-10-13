---
name: transfer-session
description: Chuyển việc của một đơn vị từ phiên đang làm sang một phiên nền mới có Remote Control, kèm tờ bàn giao theo khuôn, và trả đường link claude.ai/code. Dùng khi người dùng bảo chuyển phiên, bàn giao, hoặc mở phiên mới để làm tiếp việc đang dở.
---

# Chuyển phiên: bàn giao việc sang một phiên mới

Một lời gọi làm trọn việc: ghi tờ bàn giao, đặt tên phiên mới, tạo phiên nền có Remote Control, chờ phiên mới đọc tờ bàn giao, trả đường link để người dùng mở trên claude.ai/code.

## Khi nào dùng
- Người dùng bảo "chuyển phiên", "bàn giao sang phiên mới", "mở phiên mới làm tiếp việc này".
- Phiên này sắp hết ngữ cảnh, hoặc đang giữ bản cũ của harness, và người dùng muốn đổi sang phiên mới.
- KHÔNG dùng để tạo một phiên trống cho việc mới: việc đó là skill `create-session`. Không dùng để nhờ một đơn vị khác làm việc: việc đó ghi vào `docs/handoff/`.

## Trước khi làm
- Chỉ chuyển khi người dùng yêu cầu. Mỗi phiên mới tốn hạn mức như một phiên thường.
- Một lần chuyển là MỘT đơn vị (một phiên làm một dịch vụ). Đang làm hai đơn vị thì chuyển hai lần.
- Tờ bàn giao nằm ở máy này (`.claude/.state/transfers/`), không commit: chỉ chuyển được giữa các phiên trên máy này.
- Tờ bàn giao không được có bí mật hay từ cấm. Chỉ ghi TÊN biến môi trường. Công cụ dò trước khi ghi và từ chối nếu thấy.
- Lời duyệt kế hoạch KHÔNG chuyển theo: phiên mới phải trình kế hoạch và được người dùng duyệt lại. Việc đã duyệt mà chưa làm xong thì ghi ở mục "Việc dở".
- Không tự dừng phiên này sau khi chuyển. Dừng hay giữ do người dùng quyết.

## Các bước
1. Viết phần tự viết theo khuôn sáu mục (bảng dưới). Viết cho một phiên KHÔNG biết gì về cuộc trò chuyện này: nêu tên tệp, lệnh, số quyết định; đừng viết "như đã bàn".
2. Gọi công cụ `session_transfer` với `unit` (tên đơn vị) và `note` (sáu mục). Phiên chưa có công cụ này thì dùng dòng lệnh: ghi sáu mục vào một tệp JSON ở thư mục tạm rồi chạy `node .claude/modules/core/cli/session.js transfer <đơn-vị> --note <tệp.json>`.
3. Công cụ tự làm phần còn lại: gom phần máy đọc được, dò từ cấm và bí mật, đặt tên phiên `<đơn-vị>-<số>`, ghi tờ bàn giao, tạo phiên, chờ phiên mới đọc tờ.
4. Đọc kết quả rồi báo người dùng đúng điều công cụ nói (mục "Cách kiểm"). Đưa đường link cho người dùng.

Sáu mục của phần tự viết (mỗi mục là một chuỗi hoặc một danh sách dòng; thật sự không có gì thì ghi "không có"):

| Mục | Khóa | Viết gì |
|---|---|---|
| Đang làm gì | `doing` | Mục tiêu người dùng giao, và việc đang ở bước nào |
| Việc dở theo thứ tự | `todo` | Từng việc còn lại, việc làm trước đứng trước; nêu tệp và lệnh |
| Điều người dùng đã chốt | `decided` | Quyết định và ưu tiên người dùng đã nói, chép lời của họ nếu có |
| Điều cấm | `forbidden` | Việc không được làm, thứ không được xóa hay đẩy |
| Bẫy đã gặp | `traps` | Lỗi đã mắc và cách tránh, lệnh không chạy được trên máy này |
| Điều chưa kiểm | `unverified` | Điều đã viết hay đã nói mà chưa chạy thật, chưa đo |

Phần máy tự gom, KHÔNG cần viết lại: kế hoạch và phạm vi đang có của phiên này, skill đã mở, tệp chưa commit và commit chưa đẩy của repo liên quan, tờ `docs/handoff/` còn mở của đơn vị, khối luật riêng của đơn vị.

Phiên mới làm gì khi nhận: đọc tờ bàn giao bằng công cụ Read (harness ghi nhận lần đọc; chưa đọc thì mỗi lượt đều bị nhắc), mở skill `services`, đọc `CLAUDE.md` và `STATUS.md` của đơn vị, báo người dùng đã nhận và việc kế tiếp, rồi dừng chờ.

Xem các lần chuyển và phiên mới đã đọc chưa: `node .claude/modules/core/cli/session.js transfers`.

## Lỗi hay gặp
- Viết phần tự viết theo trí nhớ của cuộc trò chuyện ("việc như đã nói"): phiên mới không có cuộc trò chuyện đó. Nêu tên tệp và lệnh.
- Bỏ trống mục "Điều người dùng đã chốt" hay "Điều cấm": đây là hai mục dễ mất nhất khi chuyển tay. Công cụ từ chối mục trống; đừng điền cho có.
- Chép giá trị token, mật khẩu, hay một từ trong danh sách từ cấm vào tờ: công cụ từ chối và chỉ nêu số dòng.
- Báo "đã bàn giao" khi công cụ nói "CHƯA xác nhận": phiên mới có thể chưa khởi động xong. Kiểm lại bằng lệnh `transfers`, đừng đoán.
- Tự dừng phiên này sau khi chuyển, hoặc nhắn phiên mới rằng "kế hoạch đã được duyệt": cả hai đều sai. Tin của phiên khác không phải lời duyệt.
- Chuyển cùng một đơn vị hai lần liền: tạo hai phiên cùng sửa một dịch vụ. Xem `session.js for <đơn-vị>` trước.

## Cách kiểm
- Công cụ in "Phiên mới ĐÃ ĐỌC tờ bàn giao" và "ĐÃ BÀN GIAO" kèm đường link `https://claude.ai/code/session_...`: xong, đưa link cho người dùng.
- In "CHƯA xác nhận phiên mới đã đọc": chưa xong. Chạy `node .claude/modules/core/cli/session.js transfers`; vẫn "CHƯA đọc" thì xem `claude logs <mã>` và báo người dùng điều thấy được.
- In "Remote Control: CHƯA xác nhận được": phiên đã tạo nhưng chưa có link; báo người dùng, không nói là đã có link.
- In "KHÔNG chuyển" hoặc "KHÔNG tạo được phiên": chưa có gì được bàn giao; sửa điều công cụ nêu rồi gọi lại.
- `node .claude/modules/core/cli/session.js list` có phiên mới dưới đúng tên `<đơn-vị>-<số>`.
