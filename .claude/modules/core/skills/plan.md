---
name: plan
description: Trình kế hoạch trước khi sửa tệp - cần đủ năm thông tin Dịch vụ, Làm gì, Sửa tệp, Không làm, Rủi ro, viết kiểu nào cũng được; thiếu mục thì chỉ viết thêm đúng mục đó. Dùng trước MỌI việc cần sửa tệp, ở bất cứ đơn vị nào.
---

# Trình kế hoạch trước khi sửa

Viết thẳng khối kế hoạch vào tin trả lời, ngắn gọn, rồi dừng chờ người dùng duyệt. Không có công cụ dựng kế hoạch: cách đó tốn output gấp đôi.

## Khi nào dùng
- Mỗi khi cần trình kế hoạch trước khi sửa tệp, ở mọi đơn vị (kể cả `harness`, `infra`).
- Người dùng chỉ hỏi hoặc nhờ đọc thì không cần kế hoạch.

## Trước khi làm
- Đã tổng hợp lại yêu cầu của người dùng (viết ngay trước khối kế hoạch, không cần mục "Lý do" riêng) và đọc đủ tài liệu của đơn vị (skill `services`).
- Biết đơn vị nào sẽ sửa.

## Các bước
1. Viết khối này (mẫu gợi ý; cách viết tùy ý miễn đủ năm mục), mỗi mục ngắn:
```
## Kế hoạch
- Dịch vụ: harness          (tên đơn vị cách nhau dấu phẩy; không đụng đơn vị nào thì: không)
- Làm gì: ...
- Sửa tệp: ...
- Không làm: ...
- Rủi ro: ...
```
Mục nào thật sự không có gì thì viết "không có" (vài chữ), đừng bỏ mục.
2. DỪNG, chờ người dùng đồng ý ở lượt sau. Được duyệt thì gọi `scope_register` với các đơn vị trong mục "Dịch vụ", rồi mới sửa.
3. Người dùng đổi ý ("ok nhưng đổi X"): trình lại kế hoạch mới, chờ duyệt lại.

## Cổng đọc kế hoạch thế nào
- **Chỉ cần có đủ năm thông tin, viết kiểu nào cũng được.** Cổng tìm đủ Dịch vụ, Làm gì, Sửa tệp, Không làm, Rủi ro; không đòi một khuôn chữ cố định. Tiêu đề thế nào cũng được ("## Kế hoạch", "## Kế hoạch (v2)", "**Kế hoạch**", "## Plan"; không có tiêu đề mà đủ năm mục vẫn đọc được). Tên mục có thể kèm chú thích ("Rủi ro / giả định", "Sửa tệp nào") hoặc dùng tên gần nghĩa ("Đơn vị", "Việc làm", "Tệp sẽ sửa", "Ngoài phạm vi", hay tiếng Anh Service, What, Files, Out of scope, Risks). Gạch đầu dòng, số thứ tự, in đậm, bảng, nhãn dạng tiêu đề, nội dung ở dòng sau: đều được.
- **Dòng "Dịch vụ":** viết tên đơn vị (thư mục, chữ thường) ở ĐẦU dòng, nhiều đơn vị thì cách nhau bằng dấu phẩy hoặc "và"; lời giải thích để sau dấu ngoặc, dấu chấm phẩy hay dấu chấm. Chữ hoa được hạ thành chữ thường. Không đụng đơn vị nào thì viết "không" (hoặc "không có", "n/a", "chung").
- **Chỉ có hai trường hợp cổng chưa mở:** (1) thiếu hẳn hoặc để trống một mục, hoặc không có tiêu đề mà cũng không đủ năm mục; (2) mục "Dịch vụ" không đọc ra được tên đơn vị nào ở đầu dòng (ví dụ "Ten Don Vi" viết hoa có cách).
- Thiếu hoặc trống mục: cổng nói đúng mục nào. **Chỉ viết thêm các dòng đó** (ví dụ `- Rủi ro: ...`), đừng viết lại kế hoạch; hệ thống ghép vào kế hoạch cũ và chờ người dùng đồng ý lần nữa trên bản đầy đủ.
- Kế hoạch nào cũng có thể do dự án khai thêm mục bắt buộc (`plan.extra`); khi đó thiếu mục đó cũng là thiếu mục.

## Lỗi hay gặp
- Viết "Dịch vụ: Ten Don Vi" (cụm chữ hoa có khoảng trắng): cổng không đọc ra tên đơn vị. Viết tên thư mục, ví dụ `ten-don-vi`.
- Viết lại cả kế hoạch khi chỉ thiếu một mục: tốn token vô ích.
- Viết dài trong từng mục: ý dài để ở ngoài khối.
- Sửa tệp ngay sau khi trình kế hoạch: lời trình chưa phải lời duyệt.

## Cách kiểm
- Tin kế hoạch có tiêu đề và đủ năm mục.
- Sau lời duyệt, `scope_status` cho thấy kế hoạch đã được nhận và còn thiếu đăng ký nào.
- Cần tra sổ phiên (kế hoạch đã duyệt, dịch vụ đã sửa, skill đã mở, lần bị chặn): công cụ `db_query` (một câu SELECT, chỉ đọc); gọi không có `sql` để xem bảng và cột.
- Tệp công cụ của đơn vị (`<đơn vị>/.claude/skills/...` có dấu `harness-host`) do harness SINH, không sửa tay (hook chặn): tạo hay sửa skill riêng của đơn vị bằng công cụ `host_define`, xem team đã có gì và chỗ lệch bằng `host_status`.
