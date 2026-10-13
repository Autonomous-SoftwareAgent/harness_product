---
name: context
description: Tra cứu và bồi đắp kho ngữ nghĩa của cả hệ bằng context_explore, context_term, context_relate. Dùng khi cần tìm hiểu một việc trước khi sửa (là gì, ở đâu, chạy thế nào, test, vì sao), cần biết sửa một tệp thì chạm tới gì, hoặc cần ghi một từ nghiệp vụ hay một quan hệ máy không đọc ra.
---

# Kho ngữ nghĩa: hỏi trước khi tìm

Một bảng mục lục chung cho mọi dịch vụ, do harness tự lập lại sau mỗi commit. Nó gồm các vật có tên (tệp mã, khai báo, cửa vào của mã như đường dẫn API, công cụ MCP, lệnh dòng lệnh, hook, rồi topic, bảng, test, quyết định, mục thiết kế, đặc tả, vấn đề, sơ đồ, mục giải thích, từ vựng, điều chưa kiểm, handoff) và quan hệ giữa chúng (tệp nào nhập tệp nào, đặc tả nào cài đặt ở tệp nào, sơ đồ nào vẽ theo tệp nào, tài liệu nào nhắc tới gì).

Kho là thủ thư, không phải cuốn sách: nó trả tên, một dòng tóm tắt và địa chỉ `tệp:dòng`. Cần đọc nguyên văn thì mở tệp ở địa chỉ đó.

## Khi nào dùng
Trước khi dùng Grep hay Glob để tìm hiểu một việc trong hệ. Một lần hỏi thay cho nhiều lần tìm chữ rồi mở từng tệp.

## Trước khi làm
- Kho dựng từ bản ĐÃ COMMIT của từng repo: việc đang sửa dở chưa có trong kho.
- Hỏi kho không cần gì thêm. Ghi từ vựng hay quan hệ (`context_term`, `context_relate`) thì: Hook chặn lời gọi ghi cho tới khi phiên đã mở skill `services`, skill này, và đã đọc `CLAUDE.md` cùng `docs/agent/STATUS.md` của dịch vụ đang làm.

## Các bước
1. Hỏi `context_explore` bằng một trong ba cách ở bảng dưới.
2. Đọc dòng đầu để biết khớp ở bậc nào, và nhãn tin cậy của từng dòng (mục "Đọc câu trả lời thế nào").
3. Mở tệp ở địa chỉ `tệp:dòng` kho trả về khi cần nguyên văn.
4. Việc rơi vào mục "Kho KHÔNG biết gì" thì Grep, và nói rõ kho không phủ phần đó.
5. Gặp lời người dùng hay nói, hoặc một quan hệ có thật mà kho không thấy: ghi lại theo mục "Bồi đắp kho".

## Ba cách hỏi `context_explore`
| Cần biết | Gọi | Nhận về |
|---|---|---|
| Mọi thứ về một việc | `q`: một từ, một mã (`P-003`, `BOOK-D-020`), một tên tệp, tên bảng, `POST /refunds`, hoặc một câu | Các mục LÀ GÌ, Ở ĐÂU, CHẠY THẾ NÀO, TEST, VÌ SAO, SƠ ĐỒ, LƯU Ý |
| Hai vật nối với nhau qua đâu | `q` và `to` | Đường nối ngắn nhất, từng bước kèm nguồn |
| Sửa tệp này thì chạm tới gì | `impact`: danh sách đường dẫn tệp | Tệp nhập nó (trực tiếp, gián tiếp), test, đường dẫn API và cửa vào khác khai ở đó, sơ đồ, đặc tả, tài liệu nhắc tới |

- Thêm `service` để chỉ hỏi trong một dịch vụ. Bỏ trống là hỏi cả hệ.
- Một mục bị cắt ("còn N mục") thì gọi lại với `section` là mã mục đó.
- Tiếng Việt gõ không dấu cũng khớp.
- Phiên chưa nối lại MCP: `node .claude/modules/core/cli/cli.js context "<câu hỏi>" [--to "<vật>"] [--section <mục>]`, hoặc `context --impact <tệp> [<tệp>...]` (chạy từ gốc dự án; thêm `--service <tên>` trước `context` để giới hạn).

## Đọc câu trả lời thế nào
- Dòng đầu nói khớp ở bậc nào. Bậc 1: đúng mã hoặc đúng tên. Bậc 2: khớp bảng từ vựng. Bậc 3: mọi từ đều có trong tên hoặc tóm tắt. Bậc 4: chỉ là GỢI Ý để hỏi lại, không dùng để kết luận.
- Mỗi dòng có thể kèm mức tin cậy: "máy đọc từ mã", "agent khai kèm bằng chứng", "chưa kiểm (máy đoán theo chữ)". Không ghi gì nghĩa là công cụ khai.
- "CÓ THỂ ĐÃ CŨ": nguồn đã đổi sau khi mục đó được viết.
- "VÙNG TỐI": chỗ kho không thấy, ví dụ một tệp nhập module theo tên tính lúc chạy.

## Kho KHÔNG biết gì
- Mã chưa commit. Kho dựng từ bản đã commit của từng repo.
- Chuỗi nằm trong thân hàm, và hàm nào gọi hàm nào. Kho biết tới mức tệp, khai báo chính và lệnh nhập viết rõ.
- Lời gọi qua mạng (HTTP, Kafka) giữa các dịch vụ, trừ khi được khai trong `service.yaml`.
- Nội dung của Markdown viết tự do (`STATUS.md`, `README.md`): kho chỉ biết tiêu đề mục và dòng.
- Cửa vào dựng lúc chạy. Kho nhận cửa vào bằng mẫu chữ viết rõ trong mã (đường dẫn API, công cụ MCP, lệnh con của tệp dòng lệnh, hook của Claude Code); lệnh hay đường dẫn lấy từ bảng tra hoặc ghép lúc chạy thì không thấy.
- Loại tài liệu, ngôn ngữ hay loại cửa vào mà harness chưa có bộ nhận dạng. Cần thêm thì ghi yêu cầu vào `docs/handoff/` cho phiên harness (phiên harness: mục "Thêm một bộ nhận dạng" trong `.claude/modules/docs/agent/CONVENTIONS.md`).

"Không thấy trong kho" không có nghĩa là "không có". Gặp các trường hợp trên thì Grep, và nói rõ trong câu trả lời là kho không phủ phần đó.

## Bồi đắp kho
Kho tự lập từ mã và từ tài liệu ghi qua công cụ. Có hai thứ chỉ agent mới biết, ghi bằng hai công cụ dưới đây; cả hai bắt buộc có bằng chứng `tệp:dòng` có thật trong dịch vụ.

### Từ vựng nghiệp vụ (`context_term`)
Người dùng nói "tiền về muộn"; mã gọi là `late_success`. Ghi cầu nối đó một lần để phiên sau hỏi bằng lời thường vẫn ra.
- `term`: lời người dùng nói. `means`: nghĩa, một dòng, lời thường. `also`: cách gọi khác.
- `refs`: mã nút của kho mà từ này chỉ tới (lấy mã nút từ kết quả `context_explore`, dạng `file:<dịch-vụ>:<đường-dẫn>`, `sym:<dịch-vụ>:<đường-dẫn>#<tên>`, `table:<dịch-vụ>.<bảng>`).
- `evidence`: ít nhất một `{file, line}` chứng minh nghĩa đó.
- Chỉ ghi từ người dùng thật sự dùng hoặc tài liệu thật sự viết. Không tự đặt từ mới.

### Quan hệ máy không đọc ra (`context_relate`)
Ví dụ: một adapter không nhập hợp đồng chuẩn nhưng bị kiểm theo hợp đồng lúc chạy; một registry nạp module theo tên thư mục.
- `from`, `to`: mã nút của kho. `kind`: tên quan hệ ngắn ("tuân theo", "nạp lúc chạy", "gọi qua HTTP"). `file`, `line`: dòng mã chứng minh.
- Cạnh này mang nhãn "agent khai kèm bằng chứng" ở mọi nơi nó hiện ra.

Hai công cụ ghi vào `docs/context/` của dịch vụ (tệp do công cụ sở hữu, không sửa tay). Vào kho sau khi repo dịch vụ commit.

## Tri thức nên ghi vào đâu để tra cứu được
Kho hiểu tốt thứ có khuôn và hiểu kém văn xuôi. Điều gì quan trọng thì ghi vào chỗ có khuôn:

| Điều cần ghi | Ghi bằng | Skill |
|---|---|---|
| Vì sao chọn cách này | `design_record`, hoặc một mục trong sổ quyết định | `service-docs` |
| Vấn đề đã thấy, đang tinh chỉnh | `problem_record` | `service-docs` |
| Điều chưa kiểm với hệ thống thật | `business.unverified` qua `service_doc_set` | `service-docs` |
| Ý nghĩa của một phần trên sơ đồ, chỗ dễ nhầm | `diagram_explain` | `diagrams` |
| Lời người dùng ứng với vật nào | `context_term` | skill này |
| Quan hệ máy không thấy | `context_relate` | skill này |

Một dòng nhật ký trong `STATUS.md` thì kho chỉ thấy tiêu đề mục chứa nó.

## Lỗi hay gặp
- Kết luận từ khớp bậc 4 hay từ dòng có nhãn "chưa kiểm" mà không mở tệp gốc.
- Coi "không thấy trong kho" là "không có".
- Tự đặt từ mới cho bảng từ vựng thay vì ghi từ người dùng thật sự dùng.
- Ghi từ vựng hay quan hệ không có bằng chứng `tệp:dòng` có thật.
- Chờ thấy từ vừa ghi trong kho ngay: nó chỉ vào kho sau khi repo dịch vụ commit.

## Cách kiểm
- Câu trả lời cho người dùng nêu địa chỉ `tệp:dòng` lấy từ kho hoặc từ tệp đã mở, không nêu theo trí nhớ.
- Điều lấy từ dòng có nhãn "chưa kiểm" hay từ khớp bậc 4 thì đã mở tệp gốc để xác nhận trước khi khẳng định.
- Sau khi ghi từ vựng hoặc quan hệ: `node .claude/modules/core/cli/cli.js --service <tên> check` không có lỗi.
