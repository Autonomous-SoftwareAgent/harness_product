# Sổ phát hành của harness_product

Mỗi bản một mục, bản mới nhất ở trên. Mục nào cũng có đủ năm phần: có gì mới, hành vi đổi, nâng cấp phải làm gì, đã kiểm bằng gì, điều chưa kiểm và giới hạn. Lệnh đóng gói từ chối khi số bản đang đóng gói chưa có mục ở đầu sổ này hoặc mục thiếu phần, nên không có bản nào ra ngoài mà không kèm báo cáo.

Cách đọc số bản `A.B.C`: `A` đổi khi nâng cấp cần làm tay một việc ngoài lệnh `install`; `B` đổi khi có tính năng mới; `C` đổi khi chỉ sửa lỗi. Số bản nằm ở `.claude/modules/VERSION` của gói và trong dòng đầu của `doctor`.

Số test ở phần "Đã kiểm" là của bộ test phát triển, chạy ở dự án nguồn; bộ test đó không đi kèm gói. Trong dự án đã cài, phép kiểm là `node .claude/modules/core/cli/cli.js doctor`.

## 1.5.0 (2026-10-13)

### Có gì mới
- **Chuyển việc đang dở sang phiên mới.** Lệnh `node .claude/modules/core/cli/session.js transfer` và công cụ `session_transfer` tạo một phiên nền mới kèm tờ bàn giao sáu mục (đang làm, còn lại, đã chốt, không được làm, bẫy đã gặp, điều chưa kiểm). Phiên mới bị nhắc cho tới khi đọc tờ; phiên cũ nhận xác nhận khi tờ được đọc. Tờ được dò bí mật trước khi ghi. Cách dùng: skill `transfer-session`.
- **Sổ phát hành này.** `RELEASES.md` ở gốc gói; lệnh đóng gói kiểm nó.
- **Skill `mcp-servers` đi kèm gói** (cổng MCP có từ 1.4.0 nhưng khi đó chưa kèm hướng dẫn).
- **Sơ đồ: dấu chỉ tính hình.** Dấu của một sơ đồ không còn tính đường dẫn tệp nguồn, nên dời hay đổi tên thư mục mã không làm phần giải thích bị báo "có thể đã cũ". Lệnh `diagrams-restamp` ghi lại dấu cho sơ đồ mà lịch sử git cho thấy hình không đổi; lệnh `diagrams-drift` nêu sơ đồ do người khai mà tệp nguồn đã đổi nhiều từ lần khai.
- **Sơ đồ tự sinh có giải thích do máy viết** khi chưa ai viết; không còn hàng "chờ agent".
- **Trang của đơn vị chọn được tab mở đầu** (`first_tab` trong phần `meta` của `docs/service.yaml`); bản đồ cả hệ vẽ thêm quan hệ "cung cấp cho".
- **`new-service.js --unit <tên>`** dựng khung cho đơn vị nằm ngay trong repo gốc (không tạo repo git riêng).

### Hành vi đổi
- Luật chặn ghi tệp do công cụ sở hữu không còn chặn một lệnh shell chỉ vì lệnh đó NHẮC tới tên tệp: lệnh ghi có đích rõ thì xét theo đích; chỉ khi không đọc ra đích mới xét theo tên được nhắc.
- `paths-rename` giữ dấu của sơ đồ khi đổi đường dẫn trong `sources`.
- Bảng việc -> skill mặc định có thêm dòng `session_transfer` -> `transfer-session`.
- **Lời in ra không còn nhắc dự án nơi harness được phát triển.** Lời của hook, git hook, lệnh và mô tả công cụ nói "gốc dự án" hoặc dùng tên trong `project.json` của bạn; tên cổng HTML là "Cổng <tên dự án>". Các lời chặn không còn tiền tố tên và không còn mã quyết định nội bộ. Script nào của bạn so khớp nguyên văn các lời cũ thì phải sửa.
- Dự án chưa có `project.json` (chế độ tương thích bố cục cũ): tên dự án là tên thư mục gốc, và không còn đơn vị mặc định, nên lời gọi công cụ tài liệu phải truyền `service`.

### Nâng cấp
- Chạy lại `install <dự án>` rồi `install <dự án> --apply` bằng gói mới. Không có bước làm tay.
- Phiên đang mở lúc nâng cấp: từ 1.4.0 lên thì không phải làm gì. Từ 1.3.0 trở về trước thì mỗi phiên đang mở gõ `/mcp` một lần (xem mục 1.4.0).
- Sau khi nâng cấp, chạy `node .claude/modules/core/cli/cli.js diagrams-restamp` một lần nếu trang báo nhiều sơ đồ "có thể đã cũ" mà hình không đổi.

### Đã kiểm
- Bộ test phát triển: Windows 464 test, 464 qua. Linux (Docker, Node 24): 464 test, 459 qua, 5 bỏ qua (cần kho git của dự án nguồn, không gắn vào máy Linux), 0 đỏ.
- Ảnh chụp hành vi (lời của mọi hook, công cụ và lệnh qua một kịch bản dài) khớp trên cả hai nền.
- Gói đóng từ bản đã commit, dò sạch trên mọi tệp chữ kể cả mã (bí mật, đường dẫn máy, dấu vết của dự án nguồn, mã quyết định nội bộ); cài vào một dự án trống rồi `doctor` không có dòng LỖI.

### Chưa kiểm và giới hạn
- Chuyển phiên mới kiểm bằng test với Claude Code giả; chưa có lần chuyển nào bằng phiên Claude Code thật.
- Số liệu của `diagrams-drift` chưa được đối chiếu tay với một dự án thật.
- Lời giải thích máy viết cho bản đồ cả hệ còn chung chung.
- Chưa chạy trên macOS.
- Tên định danh còn mang chữ `bsn`: máy chủ MCP `bsn-docs` (nên tên công cụ là `mcp__bsn-docs__*`), các biến môi trường như `BSN_PG_CONTAINER`, `BSN_BROWSER` (cùng một tiền tố), dấu của git hook. Chúng là tên kỹ thuật, đổi sẽ làm gãy bản đã cài, nên để cho một bản lớn sau.
- Kho ngữ nghĩa còn một bộ nhận dạng đọc tờ khai báo triển khai ở một đường dẫn cố định; dự án không có tờ đó thì bộ này không làm gì.
- Git hook đã cài bởi bản cũ còn in lời cũ cho tới khi cài lại (`node .claude/modules/core/cli/install-git-hooks.js`).

## 1.4.0 (2026-10-13)

Bản này không được đẩy riêng; lần đẩy công khai đầu tiên có nó là 1.5.0.

### Có gì mới
- **Cổng MCP.** Máy chủ `bsn-docs` thành một cửa: máy chủ MCP khác (stdio hoặc HTTP) khai trong `.claude/project/mcp.json` và chạy phía sau nó. Thêm, sửa, gỡ một máy chủ có hiệu lực ở phiên đang mở trong vài giây, không phải nối lại. Lệnh `cli.js mcp list | add | remove | trust | untrust | test`.
- **Xác nhận theo lời duyệt.** Máy chủ mới chỉ chạy sau `mcp trust`, và lệnh đó đòi một kế hoạch đã được duyệt trong phiên. Công cụ ghi ra ngoài bị chặn khi phiên chưa có kế hoạch được duyệt.
- **Tệp mồi đóng băng.** `core/mcp/mcp-server.js` chỉ còn chuyển tin và nạp lại phần xử lý (`mcp-surface.js`, `gateway/`) khi mã đổi; phần xử lý mới không nạp được thì giữ bản tốt gần nhất và nói rõ lỗi là của harness.

### Hành vi đổi
- Danh sách công cụ của `bsn-docs` tự cập nhật ở phiên đang mở khi mã công cụ hay khai báo máy chủ đổi.
- Lời cảnh báo "lớp bề mặt đã đổi" chỉ còn xuất hiện khi chính tệp mồi đổi.

### Nâng cấp
- Chạy `install` như thường lệ.
- **Mỗi phiên Claude Code đang mở lúc nâng cấp phải gõ `/mcp` một lần** (hoặc mở lại phiên): tệp mồi là chương trình phiên đã nạp lúc mở và không tự thay được. Đây là lần cuối: từ bản này tệp mồi không đổi nữa.

### Đã kiểm
- Bộ test phát triển: Windows 445 test, 444 qua, 1 đỏ không thuộc gói (tài liệu của dự án nguồn còn đường dẫn cũ). Linux: 445 test, 440 qua, 5 bỏ qua, 0 đỏ.
- Với máy chủ MCP thật, bằng tiến trình tệp mồi chạy tay: một máy chủ HTTP công khai hiện công cụ sau 4 giây và gọi được; một máy chủ stdio chạy qua `npx` hiện công cụ sau 19 giây; gỡ thì công cụ biến mất sau nửa giây; không lần nào phải nối lại.

### Chưa kiểm và giới hạn
- Máy chủ đòi đăng nhập qua trình duyệt không đi qua cổng này (mã truy cập đặt trong tiêu đề hay biến môi trường thì được; chỉ ghi TÊN biến trong khai báo).
- Chưa đo với nhiều hơn hai máy chủ phía sau cùng lúc.

## 1.3.0 (2026-10-13)

Bản này không được đẩy riêng; lần đẩy công khai đầu tiên có nó là 1.5.0.

### Có gì mới
- **Đổi harness thì phiên đang mở theo kịp.** Luật `reload` nhắc phiên khi `CLAUDE.md` gốc hoặc harness đổi giữa phiên, kèm đúng các dòng đã đổi. Lệnh `session.js refresh`.
- `doctor` in số bản và chạy đúng cả khi thư mục dự án được gõ khác kiểu chữ hoa thường (Windows).

### Hành vi đổi
- `setup` và `extension trust` không còn viết lại `settings.json` khi nội dung không đổi.
- Sửa lỗi: hai tiến trình cùng ghi một tệp tài liệu có thể cùng "thắng" khóa khi máy bận; nay khóa cũ chỉ bị gỡ đúng nội dung đã phán là cũ.
- Sửa lỗi: bộ cài git hook lấy sai kiểu chữ của đường dẫn trên Windows, làm `doctor` báo nhầm "chưa cài".

### Nâng cấp
- Chạy `install` như thường lệ. Không có bước làm tay.

### Đã kiểm
- Bộ test phát triển: Windows 432 test, 431 qua, 1 đỏ không thuộc gói (tài liệu của dự án nguồn). Linux: 432 test, 427 qua, 5 bỏ qua, 0 đỏ.
- Một phiên Claude Code thật mở từ trước lúc đổi đã nhận lời nhắc của luật `reload`.

### Chưa kiểm và giới hạn
- Tiến trình máy chủ MCP của phiên đang mở vẫn là thứ nạp một lần (xử lý ở 1.4.0).

## 1.2.0 (2026-10-13)

Bản này không được đẩy riêng; lần đẩy công khai đầu tiên có nó là 1.5.0.

### Có gì mới
- **Một bố cục cho bản nguồn và bản phát hành.** Dự án nguồn chạy chính cây `.claude/modules/<khối>/` mà gói mang đi; lệnh đóng gói chép nguyên từng byte, không còn dựng lại và viết lại đường dẫn. Lỗi riêng của bố cục khối vì thế lộ ra ngay ở nơi phát triển.
- Lệnh `paths-rename` đổi đường dẫn trong tài liệu của một đơn vị khi mã dời chỗ.

### Hành vi đổi
- Không có thay đổi hành vi nào với dự án đã cài 1.1.0 ngoài lệnh mới.

### Nâng cấp
- Chạy `install` như thường lệ. Không có bước làm tay.

### Đã kiểm
- Bộ test phát triển: Windows 421 test, 421 qua. Linux: 421 test, 418 qua, 3 bỏ qua, 0 đỏ.
- Gói đóng thử khác gói 1.1.0 đúng ở các tệp có chỗ sửa chủ ý và một tệp mới.
- Một phiên Claude Code thật trên bản đã đổi: ghi tệp khi chưa duyệt bị chặn đúng lời; đủ công cụ `bsn-docs`.

### Chưa kiểm và giới hạn
- Phiên mở từ trước lúc đổi bố cục mất công cụ `bsn-docs` mà không được báo (xử lý ở 1.3.0 và 1.4.0).

## 1.1.0 (2026-10-12)

### Có gì mới
- **Khối mở rộng.** Dự án tự thêm luật, công cụ và lệnh ở `.claude/project/extensions/<tên>/`; từng repo con tự thêm ở `<repo>/.harness/`. Một khuôn `module.json`, hợp đồng `ctx` 1.0. Khối mẫu ở `.claude/modules/core/product/examples/extension/`. Lệnh `cli.js extension`.

### Hành vi đổi
- Khối mở rộng chỉ được CHẶN THÊM, không nới được luật của lõi; mã của khối chỉ chạy từ bản người dùng đã xác nhận bằng `extension trust`.

### Nâng cấp
- Chạy `install` như thường lệ. Luật mở rộng kiểu cũ (`.claude/project/rules/<id>.js`, api 0.1) vẫn chạy.

### Đã kiểm
- Bộ test phát triển trên Windows và Linux tại thời điểm phát hành; số liệu từng nền không được ghi lại trong sổ này (sổ được lập từ bản 1.5.0).

### Chưa kiểm và giới hạn
- Công cụ ghi của một khối mở rộng chưa được đối soát với phạm vi của kế hoạch đã duyệt.

## 1.0.0 (2026-10-12)

### Có gì mới
- **Bố cục khối**: `.claude/modules/<khối>/` (mã của sản phẩm) và `.claude/project/` (phần của dự án). Sáu khối: `core`, `servicedocs`, `diagrams`, `context`, `portal`, `guard-push`.
- **Lệnh `install`**: cài mới, chuyển dự án từ bố cục cũ, nâng cấp, quay lại (`--undo`). Lệnh `setup` sinh phần của harness trong `settings.json` và `.mcp.json`; `doctor` kiểm sức khỏe.
- Luật mở rộng của dự án, hai bộ khuôn `full` và `light`, lời của hook bằng tiếng Việt và tiếng Anh.

### Hành vi đổi
- Bản đầu tiên theo bố cục khối; bản trước đó (chưa đánh số) đặt mọi thứ trong một thư mục `plugin` của `.claude`.

### Nâng cấp
- Dự án đang ở bố cục cũ: cùng lệnh `install`; cấu hình được chuyển sang `.claude/project/`, bản cũ được cất để quay lại.

### Đã kiểm
- Bộ test phát triển trên Windows và Linux tại thời điểm phát hành; số liệu từng nền không được ghi lại trong sổ này (sổ được lập từ bản 1.5.0).

### Chưa kiểm và giới hạn
- Skill và tài liệu của gói chỉ có tiếng Việt.
