---
name: plan
description: Trình kế hoạch trước khi sửa tệp - khối "## Kế hoạch" có đủ năm mục Dịch vụ, Làm gì, Sửa tệp, Không làm, Rủi ro; lỗi nhẹ về cách viết thì cổng bỏ qua, thiếu mục thì chỉ viết thêm đúng mục đó. Dùng trước MỌI việc cần sửa tệp, ở bất cứ đơn vị nào.
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
1. Viết khối này, mỗi mục một dòng, nội dung ngắn:
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
- **Lỗi nhẹ thì bỏ qua, không báo:** thiếu dấu tiếng Việt, hoa hay thường, có hay không gạch đầu dòng hay số thứ tự, in đậm hay không, thứ tự các mục, cấp của tiêu đề, dấu `-`, `–`, `—` thay cho dấu hai chấm, khoảng trắng thừa.
- **Lỗi nghiêm trọng thì cổng chưa mở:** thiếu tiêu đề kế hoạch, thiếu hẳn hoặc để trống một mục, mục "Dịch vụ" có tên không đọc được (ví dụ tên có khoảng trắng).
- Thiếu hoặc trống mục: cổng nói đúng mục nào. **Chỉ viết thêm các dòng đó** (ví dụ `- Rủi ro: ...`), đừng viết lại kế hoạch; hệ thống ghép vào kế hoạch cũ và chờ người dùng đồng ý lần nữa trên bản đầy đủ.
- Thiếu tiêu đề thì phải trình lại cả kế hoạch.

## Lỗi hay gặp
- Viết "Dịch vụ: Ten Don Vi" (có khoảng trắng): cổng không đọc được tên đơn vị. Viết tên thư mục, ví dụ `ten-don-vi`.
- Viết lại cả kế hoạch khi chỉ thiếu một mục: tốn token vô ích.
- Viết dài trong từng mục: ý dài để ở ngoài khối.
- Sửa tệp ngay sau khi trình kế hoạch: lời trình chưa phải lời duyệt.

## Cách kiểm
- Tin kế hoạch có tiêu đề và đủ năm mục.
- Sau lời duyệt, `scope_status` cho thấy kế hoạch đã được nhận và còn thiếu đăng ký nào.
