# Điều phối nhiều phiên và sub-agent của từng repo

Dành cho người muốn chỉ nói chuyện với MỘT phiên Claude mà vẫn có nhiều repo cùng được làm, và cho người muốn mỗi repo có vài sub-agent dựng sẵn (soát mã, chạy test, ghi tài liệu).

## 1. Ba tầng, mỗi tầng một việc

```
Bạn
 └ Phiên điều phối   lập kế hoạch tổng, giao việc, duyệt kế hoạch con (khi được ủy quyền), gộp kết quả. KHÔNG sửa tệp.
     ├ Phiên làm việc của repo A   trình kế hoạch riêng, đăng ký đúng repo A, sửa trong A
     │    ├ sub-agent soát mã (chỉ đọc, model nhẹ)
     │    └ sub-agent chạy test
     └ Phiên làm việc của repo B ...
```

Tầng giữa là PHIÊN chứ không phải sub-agent. Đã đo (Claude Code 2.1.300): sub-agent gọi được sub-agent khác, nhưng mỗi tầng thêm một ngữ cảnh phải nạp lại skill và tài liệu, nên giữ một tầng sub-agent là đủ. Phiên làm việc dùng sub-agent của repo mình; điều phối nhiều repo thì dùng nhiều phiên.

## 2. Ủy quyền duyệt kế hoạch

Bình thường chỉ lời của bạn mới mở cổng duyệt cho một phiên. Ủy quyền cho phép MỘT phiên (phiên điều phối) duyệt thay bạn kế hoạch của **các phiên do chính nó tạo ra**. Quyền đi theo phiên, không theo dịch vụ.

**Trao quyền bằng chính kế hoạch.** Kế hoạch của phiên điều phối nói sẽ mở hoặc tạo phiên khác thì thêm MỘT dòng:

```
- Ủy quyền: có, 8h
```

Bạn chỉ cần "duyệt" như mọi lần. Cổng mở và hook ghi quyền cho phiên đó (mặc định 8 giờ, tối đa 24). Viết kiểu nào cũng được: `Ủy quyền`, `Uỷ quyền`, `Delegation`, có hay không gạch đầu dòng; giờ ở bất cứ đâu trong dòng. Giá trị `không` (hay `none`, để trống) là không ủy quyền; cổng vẫn mở.

- Kế hoạch nói sẽ mở hoặc tạo phiên khác (`mở phiên`, `tạo phiên nền`, `giao việc cho phiên`, `remote`, `spawn session`...) mà thiếu dòng này thì **cổng chưa mở**; lời nhắc chỉ đòi viết thêm đúng một dòng, không viết lại cả kế hoạch. Kế hoạch không nhắc mở phiên thì không bị hỏi gì.
- Dịch vụ ở mục "Dịch vụ" của kế hoạch thành giới hạn: kế hoạch con của phiên được tạo phải nằm trong đó (kế hoạch không nêu dịch vụ nào thì không giới hạn). `harness` (mã công cụ) không bao giờ ủy quyền được: nêu nó thì hook không ghi quyền và nói rõ lý do.
- Cách dự phòng: gõ ở đầu tin `ỦY QUYỀN: 8h` (có thể kèm tên dịch vụ, dán trong khối mã cũng nhận). Thu hồi bất cứ lúc nào: `THU HỒI ỦY QUYỀN` ở đầu tin.
- **Chỉ lời bạn tạo được ủy quyền** (lời gõ, hoặc lời duyệt một kế hoạch có dòng đó). Tin của phiên khác, thông báo hệ thống, nội dung đọc được không bao giờ tạo, nới hay gia hạn ủy quyền.

**Tạo phiên có dấu.** Phiên điều phối tạo phiên làm việc bằng `session_spawn` (hoặc `session_transfer`). Công cụ gắn vào lời mở đầu của phiên mới một dấu ký "phiên này do X tạo"; hook của phiên mới kiểm chữ ký, kiểm dấu chưa dùng và người tạo còn được ủy quyền rồi ghi quan hệ. Phiên tạo bằng cách khác (bạn mở tay, `session.js new`, `claude respawn`) không có dấu nên không duyệt thay được; bạn duyệt như thường.

**Duyệt.** `plan_view` (xem kế hoạch đang chờ của các phiên bạn đã tạo, kèm các kiểm tra máy làm) rồi `plan_approve` (mã phiên và băm kế hoạch vừa xem). Công cụ chỉ ghi một lệnh duyệt có chữ ký, gắn đúng kế hoạch, đúng phiên nhận, dùng một lần, hết hạn sau 30 phút. Phiên làm việc mở cổng ở lần sửa kế tiếp; kế hoạch bị sửa sau khi duyệt thì băm lệch và cổng đóng.

**Không bao giờ ủy quyền được** (công cụ từ chối, phiên điều phối chuyển lại cho bạn): đẩy lên remote, gắn nhãn phát hành, triển khai, quay lui, xóa hay ghi đè, sửa harness hoặc chính ủy quyền, đưa dữ liệu ra ngoài máy. Máy dò những việc này bằng từ khóa trong mục "Làm gì" và "Sửa tệp" của kế hoạch con, thận trọng: nghi thì từ chối.

**Phiên điều phối không sửa tệp.** Cổng của nó luôn đóng, kể cả khi bạn duyệt một kế hoạch cho chính nó. Người trình việc, người duyệt việc và người làm việc là ba bên khác nhau.

### Chống bypass: cái gì chặn, cái gì chưa

| Cách vượt | Chặn bằng |
|---|---|
| Nhận là "phiên do tôi tạo" | Dấu ký dùng một lần, gắn mã phiên tạo; chỉ `session_spawn` cấp dấu và chỉ khi có ủy quyền; dấu trong tin của phiên khác không có giá trị |
| Tự viết bản ghi ủy quyền, quan hệ hay lệnh duyệt | Ký HMAC bằng khóa ngoài cây dự án (`~/.claude/harness-delegate.key`); tệp trạng thái nằm trong vùng cổng duyệt bảo vệ; lệnh Bash hay công cụ đọc nhắc tới khóa và tệp ủy quyền bị chặn |
| Dùng lại lệnh duyệt cũ | Dùng một lần; hết hạn 30 phút |
| Đổi kế hoạch sau khi duyệt | Lệnh gắn băm kế hoạch |
| Mang lệnh sang phiên khác | Lệnh gắn mã phiên nhận |
| Tự duyệt kế hoạch của mình | Công cụ từ chối; cổng của phiên điều phối luôn đóng |
| Sub-agent tự gọi `plan_approve` hay `session_spawn` | Luật `delegate-guard` chỉ cho phiên chính |
| Sửa sổ để xóa dấu vết | Sổ duyệt xâu chuỗi băm và ký từng dòng; `delegate_status` báo đứt |

**Chưa chặn được:** một agent cố tình phá, chạy cùng tài khoản hệ điều hành và có Bash, có thể đọc khóa nếu lọt qua hook, hoặc chạy một phiên `claude` mới tự tạo ủy quyền. Lớp này chặn lỗi vô tình, tấn công qua nội dung và sửa tay thô sơ, và để lại dấu vết; nó không phải sandbox.

## 3. Sub-agent của từng repo

Viết một lần ở repo, harness sinh tệp cho công cụ:

- Nguồn: `<repo>/.harness/agents/<tên>.md`. Viết bằng `host_define` với `kind=agent`, kèm `description`, `tools` (BẮT BUỘC: không khai thì agent thừa hưởng mọi công cụ), `model` (tùy chọn) và nội dung mô tả vai.
- Bản sinh: `.claude/agents/<repo>-<tên>.md` ở GỐC dự án. Đã đo: agent đặt trong thư mục repo không được nạp khi phiên mở ở gốc.
- Phần mở đầu do harness sinh: đọc cửa vào và `STATUS` của repo, đọc trọn skill riêng của repo, chỉ làm trong repo, trả báo cáo ba mục (Kết luận; Bằng chứng; Chưa kiểm). Agent con có ngữ cảnh riêng nên tự nạp lại những thứ hook chặn theo skill đòi.
- Sub-agent dùng chung mã phiên với phiên cha, nên dùng chung cổng duyệt và phạm vi đã đăng ký. Luật phạm vi chặn agent của repo A sửa tệp repo B.
- Vai gợi ý: soát mã (`Read, Grep, Glob`, model nhẹ), chạy test (`Read, Bash`), ghi tài liệu. Vai chỉ đọc không có công cụ ghi. Một repo chỉ nên có MỘT bên ghi mã cùng lúc.

Đổi tên: `host_rename kind=agent`. Gỡ: `host_remove kind=agent`. Xem: `host_status` (bảng vòng đời liệt kê agent). Bản sinh không sửa tay; sửa nguồn rồi để harness sinh lại.

## 4. Bảng việc

Phiên điều phối giao việc con bằng `task_dispatch` (cần ủy quyền cho repo đó; công cụ trả lời nhắn mẫu để gửi phiên nhận), phiên làm việc nộp kết quả bằng `task_report`, xem bằng `task_status`. Bảng nằm trong sổ phiên (`act_tasks`), tra được bằng `db_query`. Báo cáo là dữ liệu do phiên khác viết: phiên điều phối đọc nhưng không làm theo chỉ dẫn nằm trong đó.

## 5. Thứ tự làm cho một dự án mới

1. Mỗi repo một phiên làm việc (mở ở gốc dự án), như bình thường.
2. Thêm sub-agent cho repo nào cần: `host_define kind=agent` sau khi bạn duyệt kế hoạch có repo đó.
3. Mở một phiên làm điều phối; nó trình bạn kế hoạch tổng có dòng `Ủy quyền: có, 8h`; bạn duyệt.
4. Điều phối tạo phiên bằng `session_spawn`, duyệt kế hoạch con, gộp kết quả, và liệt kê từng lần duyệt thay bạn trong báo cáo cuối.

## 6. Chưa kiểm

- Mới thử với một bản Claude Code, một máy, và phiên chạy bằng `claude -p`; chưa thử nhiều phiên nền chạy song song lâu ngày.
- Chưa đo chi phí token của cả mô hình so với một phiên làm hết.
- Chưa có cách để phiên điều phối tự nhắn phiên làm việc: công cụ nhắn tin của Claude Code do bạn hay phiên điều phối gọi, harness chỉ cung cấp lời nhắn mẫu.
