---
name: plan
description: Trình kế hoạch trước khi sửa tệp - chỉ cần tiêu đề "## Kế hoạch" và dòng "Dịch vụ"; công cụ plan_draft là cách tùy chọn để dựng khối đủ sáu mục mà không sai khuôn. Dùng trước MỌI việc cần sửa tệp, ở bất cứ đơn vị nào.
---

# Trình kế hoạch trước khi sửa

Cổng duyệt chỉ cần hai thứ để làm việc: tiêu đề kế hoạch và mục "Dịch vụ" (để đăng ký phạm vi). Năm mục còn lại (Lý do, Làm gì, Sửa tệp, Không làm, Rủi ro) cho người dùng đọc: nên có, thiếu thì cổng vẫn mở và chỉ ghi cảnh báo. Mục tiêu là không tốn token viết lại.

## Khi nào dùng
- Mỗi khi cần trình kế hoạch trước khi sửa tệp, ở mọi đơn vị (kể cả `harness`, `infra`).
- Người dùng chỉ hỏi hoặc nhờ đọc thì không cần kế hoạch.

## Trước khi làm
- Đã tổng hợp lại yêu cầu của người dùng và đọc đủ tài liệu của đơn vị (skill `services`).
- Biết đơn vị nào sẽ sửa.

## Các bước
1. Viết thẳng khối vào tin trả lời, đủ sáu mục như dưới. Tên mục đọc dễ tính: không phân biệt hoa thường và dấu, có hay không có gạch đầu dòng, in đậm hay không, thứ tự nào cũng được.
```
## Kế hoạch
- Dịch vụ: harness          (tên đơn vị cách nhau dấu phẩy; không đụng đơn vị nào thì: không)
- Lý do: ...
- Làm gì: ...
- Sửa tệp: ...
- Không làm: ...
- Rủi ro: ...
```
2. DỪNG, chờ người dùng đồng ý ở lượt sau. Được duyệt thì gọi `scope_register` với các đơn vị trong mục "Dịch vụ", rồi mới sửa.
3. Người dùng đổi ý ("ok nhưng đổi X"): trình lại kế hoạch mới, chờ duyệt lại.
4. Cổng báo sai khuôn thì sửa đúng chỗ nó nêu (thường là thiếu dòng "Dịch vụ" hoặc tên đơn vị không đọc được) và trình lại.

Công cụ `plan_draft` (tùy chọn): đưa nội dung dạng dữ liệu, công cụ trả khối đúng khuôn để dán. Nó kiểm tên đơn vị có thật, nhưng bạn tốn output hai lần (tham số rồi dán), nên chỉ dùng khi cần chắc khuôn; dự án muốn ép dùng thì đặt `plan.draft: block` trong cấu hình cổng duyệt.

## Lỗi hay gặp
- Thiếu dòng "Dịch vụ", hoặc tên có khoảng trắng ("Ten Don Vi"): cổng không đọc được đơn vị nên chưa mở. Đây là hai lỗi duy nhất làm cổng đóng.
- Viết lời giải thích dài trong từng mục: tốn token; ý dài để ở ngoài khối.
- Sửa tệp ngay sau khi trình kế hoạch: lời trình chưa phải lời duyệt.

## Cách kiểm
- Tin kế hoạch có tiêu đề và dòng "Dịch vụ" đọc được.
- Sau lời duyệt, `scope_status` cho thấy kế hoạch đã được nhận và còn thiếu đăng ký nào.
- Dự án muốn đòi đủ sáu mục: khóa `plan.strict: true` trong cấu hình cổng duyệt (xem `FORMAT.md`).
