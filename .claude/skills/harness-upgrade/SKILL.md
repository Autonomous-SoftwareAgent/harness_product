---
name: harness-upgrade
description: Nâng cấp harness của dự án lên bản mới của gói, do agent làm trọn và người dùng chỉ đọc báo cáo rồi duyệt. Dùng khi tóm tắt đầu phiên báo "HARNESS CÓ BẢN MỚI", khi người dùng bảo cập nhật hay nâng cấp harness, hỏi bản mới có gì, hoặc hỏi dự án đã sửa gì trong mã của gói.
---

# Nâng cấp harness: báo cáo từng mục, người dùng duyệt, agent cài

Người dùng không gõ lệnh nào. Harness dựng sẵn bản mới ở nền; bạn đọc báo cáo, trình người dùng TỪNG MỤC thay đổi (đổi gì, ở đâu, hành vi mới là gì, chạm gì tới dự án này), xin ý kiến ở những điểm cần họ quyết, rồi cài sau khi được duyệt. Phần dự án đã sửa trong mã của gói không bị đè: lệnh so ba bản của từng tệp (bản gốc của bản đang cài, bản trên đĩa, bản mới) và gộp.

## Khi nào dùng
- Tóm tắt đầu phiên có dòng "HARNESS CÓ BẢN MỚI".
- Người dùng bảo cập nhật, nâng cấp harness, hoặc hỏi "bản mới có gì", "nâng cấp có mất phần mình sửa không".
- Người dùng hỏi dự án đã sửa những tệp nào của gói: chỉ cần `upgrade status`.
- KHÔNG dùng để cài lần đầu: việc đó là lệnh `install` của gói (README của gói).

## Trước khi làm
- **Cài bản mới là thay cả mã của cổng duyệt.** Vì vậy bước cài chỉ chạy khi kế hoạch người dùng vừa duyệt, của chính phiên này, ghi nguyên MÃ DUYỆT của bản dựng sẵn (dạng `upgrade:<bản>@<8 ký tự>`). Mã tính từ toàn bộ nội dung sắp cài: sửa thêm một byte sau lúc duyệt là mã đổi và phải xin duyệt lại.
- Không chạy thẳng `apply.js`, không dùng lệnh `install` để nâng cấp, không chép tệp của gói bằng tay. Lệnh từ chối thì đọc lý do, sửa đúng chỗ đó, đừng tìm đường khác.
- Kho gói là một bản clone git có ĐỦ lịch sử (không `--depth`): lịch sử là nguồn bản gốc để gộp. Lệnh cài ghi nhận nơi đó; đổi sang kho khác trong phiên cần người dùng duyệt kế hoạch có ghi mã `upgrade-source@...` mà lệnh in ra.
- Dự án đang cài một bản chưa có các lệnh này: chạy lệnh từ chính bản clone, thêm `--project <thư mục dự án>`.
- Chỗ đụng nhau sửa trong `overlay/` của thư mục dựng sẵn, không sửa trong `.claude/modules/`. Cổng duyệt cho sửa trong `overlay/` trước khi có lời duyệt, và chỉ ở đó, để người dùng duyệt đúng thứ sẽ được cài.
- Báo cáo `BAO-CAO.md` là nguồn để trình người dùng. Không tự suy thay đổi từ tên tệp; mục nào báo cáo không nói thì nói là không biết.

## Các bước
Lệnh chạy từ gốc dự án: `node .claude/modules/core/cli/cli.js upgrade <việc>`.

1. Có bản dựng sẵn chưa: tóm tắt đầu phiên ghi "ĐÃ DỰNG SẴN" thì chạy `upgrade review`. Chưa thì `upgrade check --fetch`, có bản mới thì `upgrade prepare`. Cả ba không thay mã đang chạy.
2. Đọc trọn `BAO-CAO.md` trong thư mục dựng sẵn (lệnh in đường dẫn). Mỗi mục có: loại (thêm, đổi, bỏ, sửa lỗi), khối, hành vi trước và sau, dự án đã cài thấy gì, khóa cấu hình, lệnh, công cụ, skill đổi, tệp dự án đã sửa mà mục đó chạm tới cùng kết quả gộp, bước chuyển cấu hình sẽ sửa gì, điểm cần người dùng quyết, đã kiểm và chưa kiểm.
3. Xử lý các tệp cần xử lý (bảng dưới) trong `overlay/`. Mỗi chỗ đụng nhau: đọc cả hai phía, giữ ý của dự án VÀ thay đổi của gói. Không chắc phía nào đúng thì để lại và đưa thành câu hỏi cho người dùng ở bước 5, đừng chọn bừa.
4. `upgrade review`: phải hết việc chặn về tệp. Còn "điểm chờ người dùng quyết" là bình thường ở bước này.
5. Trình người dùng, theo khuôn ở mục "Khuôn trình người dùng". `upgrade review` đã in mã duyệt (không còn điểm nào chờ quyết, bạn không có câu hỏi nào): kèm luôn kế hoạch theo khuôn của dự án, mục "Làm gì" ghi nguyên mã đó, để MỘT lần duyệt là đủ. Rồi DỪNG chờ trả lời.
6. Còn điểm cần quyết: người dùng trả lời xong thì ghi từng điểm bằng `upgrade decide <id> <giá trị>`; lệnh in mã duyệt. Người dùng bảo đổi cách xử lý một chỗ đụng nhau: sửa trong `overlay/`, `upgrade review` lại.
7. Mã duyệt vừa đổi ở bước 6: trình lại kế hoạch ghi mã mới, chờ duyệt.
8. `upgrade apply`. Lệnh tự làm: đối chiếu lời duyệt, cất bản cũ, cài, chép phần của dự án, chạy bước chuyển cấu hình, sinh lại cấu hình, kiểm toàn vẹn cổng duyệt, kiểm sức khỏe, chạy các lệnh kiểm dự án tự khai (`upgrade.verify` trong `project.json`), dựng lại phiên nền đang rảnh. Kiểm hỏng thì nó TỰ QUAY LẠI bản cũ.
9. Báo kết quả theo mục "Cách kiểm".

| Báo cáo ghi | Nghĩa | Việc phải làm |
|---|---|---|
| `N đoạn đụng nhau` | Hai bên sửa cùng một chỗ | Mở tệp trong `overlay/`, sửa từng khối `<<<<<<<` ... `>>>>>>>`, xóa hết dấu |
| `gộp sạch nhưng hỏng` | Gộp không đụng nhau nhưng mã không nạp được, thường do hai bên cùng thêm một tên | Đổi tên phía dự án trong tệp ở `overlay/` và ở mọi chỗ khối riêng gọi tên đó |
| `không gộp tự động được` | Tệp không phải văn bản hoặc quá lớn | Tệp trong `overlay/` đang là bản của dự án; hỏi người dùng giữ bản nào. Lấy bản của gói: xóa tệp trong `overlay/` |
| `gói bỏ tệp bạn đã sửa` | Bản mới không còn tệp đó | Hỏi người dùng. Giữ thì để nguyên; bỏ theo gói thì xóa tệp trong `overlay/`. Phần đã sửa có thể cần chuyển sang tệp khác: đọc mục thay đổi tương ứng |
| `Tệp gói đổi mà không có mục giải thích` | Bản đó phát hành trước khi có tờ thay đổi | Nói rõ với người dùng là chỉ biết tên tệp; cần thì so tệp trong `package/` với bản đang cài |

### Khuôn trình người dùng
Viết bằng lời thường, ngắn, theo thứ tự này:
1. Một câu: bản đang cài, bản mới, và đi qua những bản nào.
2. **Thay đổi chạm tới dự án này**, mỗi mục một đoạn: trước đây thế nào, sau khi lên thì thế nào, dự án phải biết gì. Kèm tệp dự án đã sửa mà mục đó chạm tới và bạn đã gộp ra sao; cấu hình sẽ được tự chuyển thế nào.
3. **Thay đổi khác**: mỗi mục một dòng. Mục thuộc khối dự án không cài thì gom một dòng.
4. **Điều cần bạn quyết**: từng điểm cần quyết của bản mới với các lựa chọn và đề xuất của bạn; từng chỗ đụng nhau bạn chưa chắc.
5. **Điều chưa kiểm**: lấy từ phần "Chưa kiểm" của các mục, và các bản không có tờ thay đổi.
6. Điều sẽ xảy ra khi duyệt: cài, kiểm, hỏng thì tự quay lại; phiên nào phải mở lại.

Không dán nguyên báo cáo. Không viết "có N tệp đổi" thay cho nội dung thay đổi.

## Lỗi hay gặp
- Báo chung chung ("bản mới sửa nhiều tệp, có vài cải tiến"): người dùng không quyết được gì. Mỗi mục phải nói được hành vi trước và sau.
- Xin duyệt khi còn chỗ đụng nhau chưa xử lý: chưa có mã duyệt, lời duyệt không dùng được.
- Sửa `overlay/` hay ghi thêm câu trả lời sau khi người dùng đã duyệt: mã đổi, `apply` từ chối. Trình lại kế hoạch với mã mới.
- Sửa chỗ đụng nhau ngay trong `.claude/modules/`: tệp đổi sau lúc dựng sẵn, phải `upgrade prepare` lại.
- Chọn hẳn một phía ở chỗ đụng nhau cho nhanh: mất thay đổi của phía kia mà không ai biết.
- Coi "gộp sạch" là "chạy đúng": gộp theo dòng không hiểu nghĩa. Dự án nên khai lệnh test của phần đã sửa vào `upgrade.verify` để bước cài tự chạy.
- Lệnh báo "ĐÃ QUAY LẠI" mà chạy lại ngay: sửa nguyên nhân trước. Lệnh báo "KHÔNG quay lại sạch được": dừng mọi việc, báo người dùng ngay kèm lệnh quay lại nó in.
- Clone kho gói bằng `--depth 1`: không có bản gốc, lệnh dừng và nói rõ.

## Cách kiểm
- Lệnh `apply` in "XONG: đang chạy bản <mới>". Báo người dùng: đã lên bản nào, bước chuyển cấu hình đã sửa gì, kết quả từng phép kiểm, phiên nào được dựng lại và phiên nào người dùng cần mở lại.
- `upgrade status` vẫn liệt kê đủ tệp dự án đã sửa và khối tự thêm; `upgrade check` báo không có gì mới.
- Kết quả công cụ kèm dòng cảnh báo máy chủ cũ thì báo người dùng gõ `/mcp` một lần.
- Lệnh quay lại: báo nguyên văn lý do và lời lỗi lệnh in; nói rõ dự án đang ở bản cũ, chưa có gì thay đổi.
- Điều chưa kiểm phải nói: gộp sạch chưa chứng minh hành vi đúng; khối riêng chưa có test, hoặc dự án chưa khai `upgrade.verify`, thì chưa ai kiểm phần đã sửa với bản mới.
