---
name: plan
description: Lập kế hoạch bằng công cụ plan_draft trước khi sửa tệp - công cụ dựng khối "## Kế hoạch" đúng khuôn của cổng duyệt, bạn dán nguyên khối rồi dừng chờ duyệt. Dùng trước MỌI việc cần sửa tệp, ở bất cứ đơn vị nào.
---

# Lập kế hoạch bằng công cụ

Kế hoạch sai khuôn chỉ bị phát hiện SAU khi người dùng đã duyệt (cổng không mở), nên tốn một lượt của người dùng và một tin kế hoạch viết lại. Công cụ `plan_draft` bỏ rủi ro đó: bạn điền nội dung, công cụ dựng khối đúng khuôn.

## Khi nào dùng
- Mỗi khi cần trình kế hoạch trước khi sửa tệp, ở mọi đơn vị (kể cả `harness`, `infra`).
- Người dùng chỉ hỏi hoặc nhờ đọc thì không cần kế hoạch.

## Trước khi làm
- Đã tổng hợp lại yêu cầu của người dùng và đọc đủ tài liệu của đơn vị (skill `services`).
- Biết đơn vị nào sẽ sửa. Tên phải là đơn vị có thật; `plan_draft` từ chối tên lạ và nói đơn vị nào có.

## Các bước
1. Gọi `plan_draft` với các trường: `services` (danh sách tên đơn vị; chỉ đụng phần chung thì `[]`), `reason`, `work`, `files`, `skip`, `risks`. Dự án đòi thêm mục thì truyền trong `extra`. Mỗi trường là một chuỗi, hoặc danh sách chuỗi (nối bằng dấu chấm phẩy).
2. Bị từ chối thì sửa đúng các trường công cụ nêu và gọi lại. Đừng tự viết khối bằng tay để "đi tắt".
3. Được thì DÁN NGUYÊN khối công cụ trả về vào tin trả lời, không đổi chữ nào. Lời giải thích cho người dùng viết tự do ở trên hoặc dưới khối.
4. DỪNG, chờ người dùng đồng ý ở lượt sau. Được duyệt thì gọi `scope_register` với các đơn vị trong mục "Dịch vụ", rồi mới sửa.
5. Người dùng đổi ý ("ok nhưng đổi X"): gọi lại `plan_draft` với nội dung mới, dán khối mới, chờ duyệt lại.

## Lỗi hay gặp
- Tự gõ khối `## Kế hoạch`: cuối lượt hệ thống giữ lượt một lần và bắt làm lại bằng công cụ, tốn một tin.
- Sửa chữ trong khối đã dán (kể cả thêm chú thích vào tên mục): khối không còn khớp bản công cụ dựng.
- Dán khối cũ sau khi đã đổi kế hoạch: gọi `plan_draft` lại cho khối mới.
- Viết lời giải thích dài trong từng trường: mỗi trường tối đa 1500 ký tự; ý dài để ở ngoài khối.
- Sửa tệp ngay sau khi gọi `plan_draft`: công cụ chỉ dựng khối, chưa phải lời duyệt.

## Cách kiểm
- Tin kế hoạch có đúng một khối `## Kế hoạch`, giống hệt khối công cụ trả về.
- Sau lời duyệt, `scope_status` cho thấy kế hoạch đã được nhận và còn thiếu đăng ký nào.
- Lưới cuối lượt chỉ giữ lượt khi tin kế hoạch không dán khối của công cụ; tắt lưới bằng khóa `plan.draft` là `off` trong cấu hình cổng duyệt (xem `FORMAT.md`).
