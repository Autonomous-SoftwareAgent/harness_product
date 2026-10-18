# Nâng cấp harness: bạn đang ở bản nào, cần làm gì

Tệp này do lệnh đóng gói sinh ra từ sổ phát hành và các tờ thay đổi, không ai viết tay. Nó trả lời một câu: **tôi đang ở bản X, lên bản mới nhất thì phải làm gì**, không cần đọc git diff.

## Cách dùng
1. Xem bản bạn đang cài: tệp `.claude/modules/VERSION` trong dự án.
2. Trong bảng dưới, đọc các dòng nằm TRÊN bản của bạn, tới bản mới nhất (2.9.0). Cột "Việc phải làm" nói mỗi bản đòi gì.
3. Phần "Bị bỏ hoặc đổi tên" liệt kê những thứ bạn có thể đang dùng mà không còn nữa, kèm cái thay thế.
4. Cài bản mới: tải gói này về rồi chạy lại lệnh `install` (xem README.md). Dự án đã cài có thể xem từng mục thay đổi gắn với tình trạng dự án bằng `node .claude/modules/core/cli/cli.js upgrade preview`.

## Bảng các bản
| Bản | Ngày | Việc phải làm | Tóm tắt |
|---|---|---|---|
| 2.9.0 | 2026-10-16 | không có: nâng cấp như mọi lần | Điều phối nhiều phiên: người dùng ủy quyền cho MỘT phiên duyệt kế hoạch của các phiên làm việc (có hạn, ký, dùng một lần; phạm vi và việc rủi ro theo đúng kế hoạch người dùng đã duyệt, dòng "Được làm"); sub-agent dựng sẵn cho từng repo; bảng việc của phiên điều phối. |
| 2.8.1 | 2026-10-16 | không có: nâng cấp như mọi lần | Sửa ba lỗi của 2.8.0: note làm mất hiệu lực khối mở rộng đã xác nhận; mô tả skill có dấu hai chấm làm Claude Code bỏ qua skill; lời chặn theo skill không chỉ đúng tệp skill của đơn vị (kèm ghi chú đơn vị trong thư mục bị .gitignore). |
| 2.8.0 | 2026-10-16 | không có: nâng cấp như mọi lần | Vòng đời trọn vẹn của skill riêng của đơn vị: một lời gọi host_define là đủ (skill kèm điều kiện ép, hoặc note nạp theo đường dẫn), có đổi tên, gỡ, nhận skill của team, bảng vòng đời và kiểm bằng doctor. |
| 2.7.0 | 2026-10-15 | không có: nâng cấp như mọi lần | Khuôn kế hoạch thoáng: chỉ cần đủ năm mục, viết kiểu nào cũng được; dòng Dịch vụ không còn làm lời duyệt trượt vì chữ giải thích. |
| 2.6.0 | 2026-10-15 | không có: nâng cấp như mọi lần | Repo đã có .claude/ do team tự viết: harness kiểm kê và báo thứ nào dùng được, thứ nào không nạp khi mở ở gốc; bản của team thắng khi trùng tên; skill riêng của đơn vị đổi bằng công cụ và tệp sinh không còn sửa tay được. |
| 2.5.0 | 2026-10-15 | không có: nâng cấp như mọi lần | Bộ sinh tệp cho Claude Code từ định nghĩa gốc của đơn vị: skill riêng của repo viết một lần ở .harness/, harness sinh ra .claude/ để Claude Code tự nạp; nền cho các bộ chuyển công cụ khác. |
| 2.4.0 | 2026-10-14 | không có: nâng cấp như mọi lần | Thêm công cụ db_query: agent tự tra sổ phiên của harness (kế hoạch đã duyệt, dịch vụ đã sửa, skill đã mở, lần bị chặn) bằng một câu SELECT chỉ đọc. |
| 2.3.0 | 2026-10-14 | có công cụ, khóa hay tính năng bị bỏ; chuyển cấu hình (lệnh nâng cấp tự làm) | Kế hoạch trình duyệt ít tốn token hơn: bỏ công cụ plan_draft, khuôn còn năm mục và cổng bỏ qua lỗi nhẹ, thiếu mục thì chỉ viết thêm đúng mục đó; mỗi lời gọi công cụ MCP nhanh hơn khoảng 0,7 giây; gói có UPGRADING.md cho người đang ở bản cũ. |
| 2.2.2 | 2026-10-14 | không có: nâng cấp như mọi lần | Mỗi lời gọi công cụ MCP của harness nhanh hơn khoảng 0,6 đến 0,7 giây: danh sách đơn vị chỉ quét một lần mỗi lần dựng bộ công cụ. |
| 2.2.1 | 2026-10-14 | không có: nâng cấp như mọi lần | Bảng skill ở .claude/rules tự theo .claude/skills/ khi mở phiên (không ghi đè tệp sửa tay); sửa câu về plan_draft còn sót ở 2.2.0. |
| 2.2.0 | 2026-10-14 | không có: nâng cấp như mọi lần | Khuôn kế hoạch dễ tính hơn: cổng chỉ đòi tiêu đề và mục "Dịch vụ", các mục còn lại thiếu thì chỉ cảnh báo; lưới ép dùng plan_draft tắt mặc định; lời của cổng ngắn hơn. Giảm số lần agent phải viết lại kế hoạch. |
| 2.1.1 | 2026-10-14 | không có: nâng cấp như mọi lần | Lệnh đóng gói có thể đòi dấu "đã kiểm đủ" trước khi đóng gói (khóa requireVerified), để bản phát hành luôn qua bộ kiểm đủ ở cả hai nền; mặc định tắt. |
| 2.1.0 | 2026-10-14 | không có: nâng cấp như mọi lần | Agent lập kế hoạch bằng công cụ plan_draft thay vì tự gõ khối, nên kế hoạch không thể sai khuôn; thêm skill plan, lưới cuối lượt bắt kế hoạch gõ tay, và bảng skill sinh tự động ở .claude/rules. |
| 2.0.1 | 2026-10-14 | không có: nâng cấp như mọi lần | Thêm bộ hướng dẫn cho người vận hành và người mở rộng harness (vận hành hằng ngày, skill dùng chung, phần riêng của từng repo, khối mở rộng); đính chính một chỗ tài liệu nói sai về matcher của hook. |
| 2.0.0 | 2026-10-13 | chuyển cấu hình (lệnh nâng cấp tự làm) | Máy chủ MCP của harness tách theo khối: thay vì một máy chủ giữ cả bộ công cụ, mỗi khối đang bật có máy chủ riêng; một cái hỏng không kéo theo cái khác. |
| 1.7.0 | 2026-10-13 | không có: nâng cấp như mọi lần | Nâng cấp không còn bước chạy tay: harness dựng sẵn, agent báo từng mục thay đổi và xin ý kiến, người dùng duyệt, agent cài và kiểm, hỏng thì tự quay lại. |
| 1.6.0 | 2026-10-13 | không có: nâng cấp như mọi lần | Mã ở đâu cũng được; phần tại chỗ của mỗi đơn vị gom về .harness/; cổng duyệt khai được; nâng cấp giữ phần người cài đã sửa. |
| 1.5.0 | 2026-10-13 | xem mục của bản này trong RELEASES.md | (xem mục của bản trong RELEASES.md) |
| 1.4.0 | 2026-10-13 | xem mục của bản này trong RELEASES.md | (xem mục của bản trong RELEASES.md) |
| 1.3.0 | 2026-10-13 | xem mục của bản này trong RELEASES.md | (xem mục của bản trong RELEASES.md) |
| 1.2.0 | 2026-10-13 | xem mục của bản này trong RELEASES.md | (xem mục của bản trong RELEASES.md) |
| 1.1.0 | 2026-10-12 | xem mục của bản này trong RELEASES.md | (xem mục của bản trong RELEASES.md) |
| 1.0.0 | 2026-10-12 | xem mục của bản này trong RELEASES.md | (xem mục của bản trong RELEASES.md) |

## Bị bỏ hoặc đổi tên
- **Bản 2.3.0, bị bỏ:** Công cụ plan_draft và lưới ép dùng nó bị bỏ. Trước: Công cụ plan_draft dựng khối kế hoạch đúng khuôn; agent điền tham số rồi dán lại khối, nên tốn output gấp đôi. Khóa plan.draft (mặc định off từ 2.2.0) bật lưới cuối lượt giữ lượt một lần khi tin kế hoạch không dán khối do công cụ dựng. Khóa plan.strict (2.2.0) đòi đủ sáu mục. Sau: Không còn công cụ plan_draft (bộ công cụ lõi còn scope_register, scope_status, session_transfer), không còn lưới cuối lượt, không còn khóa plan.draft và plan.strict. Agent viết thẳng khối kế hoạch (skill plan). Skill hay tài liệu của dự án còn bảo agent gọi plan_draft thì cập nhật: gọi sẽ báo không có công cụ. Hai khóa cấu hình cũ được lệnh nâng cấp tự gỡ (để lại cũng không hại). Bảng skill ở .claude/rules tự sinh lại ở phiên kế tiếp.
- **Bản 2.0.0, đổi:** Mỗi khối một máy chủ MCP thay cho một máy chủ giữ cả bộ công cụ. Cấu hình của bạn được lệnh nâng cấp chuyển tự động. Mọi phiên Claude Code đang mở phải gõ /mcp (hoặc mở lại) một lần để thấy tên mới; phiên chưa nối lại vẫn gọi được công cụ qua máy chủ cũ. Mỗi phiên chạy thêm vài tiến trình Node (mỗi máy chủ một tiến trình, tốn thêm bộ nhớ). Kịch bản, tài liệu hay quyền đã ghi tên mcp__bsn-docs__... phải đổi sang tên mới. Khai quyền theo từng công cụ (mcp__bsn-docs__<công cụ>) không tự đổi: bước chuyển chỉ đổi quyền theo cả máy chủ.

## Chi tiết từng bản (mới ở trên)

### 2.9.0 (2026-10-16)
- **Mức việc phải làm:** không có: nâng cấp như mọi lần.
- **Tóm tắt:** Điều phối nhiều phiên: người dùng ủy quyền cho MỘT phiên duyệt kế hoạch của các phiên làm việc (có hạn, ký, dùng một lần; phạm vi và việc rủi ro theo đúng kế hoạch người dùng đã duyệt, dòng "Được làm"); sub-agent dựng sẵn cho từng repo; bảng việc của phiên điều phối.

**Việc bạn phải làm**

- Nâng cấp như mọi lần (`upgrade`); không có bước chuyển cấu hình. `settings.json` được sinh lại có thêm hai hook; công cụ MCP mới hiện sau khi gõ `/mcp`.
- Không dùng ủy quyền thì không phải làm gì thêm. Muốn dùng: đọc `.claude/modules/core/guides/05-dieu-phoi-va-sub-agent.md`.

**Bạn sẽ thấy khác**

- Ba công cụ MCP chỉ đọc mới (`delegate_status`, `plan_view`, `task_status`), bốn công cụ ghi mới (`session_spawn`, `plan_approve`, `task_dispatch`, `task_report`); hai hook mới (`guard-delegate`, và `gate-hook read` chặn công cụ đọc, tìm kiếm đọc khóa ký).
- Lệnh Bash nhắc tới khóa ký hay tệp ủy quyền bị chặn dù cổng đóng hay mở.
- Luật phạm vi: agent sinh ra cho repo A (tên `A-<tên>`) không sửa tệp repo khác. Agent chung (Explore, general-purpose...) và phiên chính không bị luật này.
- Sổ phiên nâng lên phiên bản 5 ở lần mở đầu (chụp bản sao trước khi nâng; chỉ thêm bảng).
- Dấu vân tay cổng duyệt đổi (có thêm `gate/gate-delegate.js`).

**Chưa kiểm và giới hạn**

- Không chặn được một agent cố tình phá: cùng tài khoản hệ điều hành và có Bash, nó có thể đọc khóa nếu lọt hook, hoặc chạy một phiên `claude` mới để tự tạo ủy quyền. Lớp này chặn lỗi vô tình, tấn công qua nội dung và sửa tay thô sơ, và để lại dấu vết.
- Máy không đọc chữ trong kế hoạch để từ chối (đọc chữ từng chặn nhầm kế hoạch onboard vô hại, vì nó buộc phải nói `.harness/` và `.claude/` của đơn vị). Việc cấm bị chặn ở lúc làm bằng lệnh và đường dẫn thật; chỗ hở: lệnh chạy qua Bash mà hook không phân tích được, hoặc một chương trình tự ghi ra ngoài. Phiên điều phối vẫn phải đọc kế hoạch.
- Lần chạy thật với bốn phiên làm thay (onboard bốn repo) qua bản trước của cơ chế này; bản quyền-theo-kế-hoạch chưa chạy với phiên Claude thật.
- Mới thử một bản Claude Code, một máy, phiên chạy bằng `claude -p`; chưa thử nhiều phiên nền chạy song song lâu ngày; chưa đo token tiết kiệm được.
- Công cụ không tự nhắn phiên nhận việc; chỉ trả lời nhắn mẫu.

### 2.8.1 (2026-10-16)
- **Mức việc phải làm:** không có: nâng cấp như mọi lần.
- **Tóm tắt:** Sửa ba lỗi của 2.8.0: note làm mất hiệu lực khối mở rộng đã xác nhận; mô tả skill có dấu hai chấm làm Claude Code bỏ qua skill; lời chặn theo skill không chỉ đúng tệp skill của đơn vị (kèm ghi chú đơn vị trong thư mục bị .gitignore).

**Việc bạn phải làm**

- Nâng cấp như mọi lần; không có bước chuyển cấu hình. Đơn vị đã gặp cảnh báo trên sẽ hết cảnh báo ngay, không phải xác nhận lại, nếu chỉ khác nhau ở `notes/`.

**Bạn sẽ thấy khác**

- `host_define` tự bọc nháy kép dòng `description:` khi giá trị có `: `, ` #` hay mở đầu bằng ký tự đặc biệt (trước đây ghi nguyên văn nên `description: Dùng khi: sửa mã` làm hỏng YAML và skill biến mất). Mô tả an toàn vẫn viết trần. Gọi lại `host_define` với cùng tên là sửa được skill cũ.
- Lời chặn theo skill nêu đường dẫn thật của skill đơn vị và bảo đọc trọn tệp bằng công cụ Read (công cụ Skill báo "Unknown skill" khi thư mục đơn vị bị `.gitignore`). Skill chung ở gốc dự án giữ lời cũ.
- Dấu vân tay của khối mở rộng của đơn vị (luật ở `.harness/rules/`, công cụ, lệnh) không còn tính thư mục `notes/`. Trước đây: đơn vị đã xác nhận luật riêng, rồi có người (hay agent) thêm một note bằng `host_define` thì `doctor` báo "khối mở rộng đã sửa sau lần xác nhận" và bản mới không có hiệu lực cho tới khi xác nhận lại bằng tay. Skill và tài liệu (`skills/`, `docs/`) đã được bỏ qua từ trước; note là ghi chép giống chúng.

**Chưa kiểm và giới hạn**

- Chưa thử trên dự án khác đã cài 2.8.0 và đã xác nhận khối mở rộng.
- Đơn vị nằm trong thư mục bị .gitignore ở gốc dự án thì Claude Code không liệt kê skill của nó (đã đo, chưa biết có cách khai báo nào để mở); lúc đó skill chỉ mở được bằng cách đọc trọn SKILL.md (hook sổ phiên tính cách này), note và việc ép theo skill vẫn chạy.

### 2.8.0 (2026-10-16)
- **Mức việc phải làm:** không có: nâng cấp như mọi lần.
- **Tóm tắt:** Vòng đời trọn vẹn của skill riêng của đơn vị: một lời gọi host_define là đủ (skill kèm điều kiện ép, hoặc note nạp theo đường dẫn), có đổi tên, gỡ, nhận skill của team, bảng vòng đời và kiểm bằng doctor.

**Việc bạn phải làm**

- Nâng cấp như mọi lần (`upgrade`); không có bước chuyển cấu hình. `settings.json` được sinh lại có thêm hook `host-resync`; công cụ MCP mới hiện sau khi gõ `/mcp`.
- Skill riêng có sẵn ở `.harness/skills/` vẫn chạy; muốn ép thì thêm hai dòng `harness-*` vào đầu tệp hoặc gọi lại `host_define` với `enforce`.

**Bạn sẽ thấy khác**

- Lỗi cũ được sửa: một tệp mã chỉ NHẮC tới dòng dấu sinh (ví dụ bộ chuyển công cụ) từng bị coi là tệp do harness sinh và bị chặn sửa. Nay chỉ dòng dấu đúng khuôn ở đầu dòng mới tính.
- Công cụ `host_define` nhận thêm tham số, các lời gọi cũ (service, name, description, body) vẫn chạy y nguyên. Thông báo lỗi tên sai không đổi.
- Không đổi: skill của team giữ nguyên và thắng khi trùng tên; tệp sinh vẫn không sửa tay được; bố cục đơn vị không tự đổi.

**Chưa kiểm và giới hạn**

- Việc ép theo `harness-files` mới kiểm bằng test và kịch bản ảnh chụp chạy hook thật, chưa qua một phiên Claude CLI thật ở dự án khác.
- `host_adopt` mới kiểm trên cây thử, chưa trên một repo của team có skill thật đang được git theo dõi.
- Mọi phép đo Claude Code chỉ trên một bản, một máy; chưa có Codex hay công cụ khác.
- Phiên mở thẳng trong thư mục đơn vị không có hook nào, nên không có sinh lại và không có ép.

### 2.7.0 (2026-10-15)
- **Mức việc phải làm:** không có: nâng cấp như mọi lần.
- **Tóm tắt:** Khuôn kế hoạch thoáng: chỉ cần đủ năm mục, viết kiểu nào cũng được; dòng Dịch vụ không còn làm lời duyệt trượt vì chữ giải thích.

**Việc bạn phải làm**

- Nâng cấp như mọi lần; không có bước chuyển cấu hình. `plan.heading`, `plan.labels`, `plan.extra` đã khai vẫn dùng được; tên gọi khác khai thêm được cộng vào các tên có sẵn.
- Skill hay tài liệu riêng của dự án có kiểm chữ "KHÔNG theo khuôn chuẩn" trong lời nhắc của cổng thì đổi sang "CHƯA đọc ra đủ năm mục".

**Bạn sẽ thấy khác**

- Những kế hoạch trước đây bị coi là sai chỉ vì cách viết (đã đo: 25 trên 29 cách viết tự nhiên) nay đọc được; lời "duyệt" mở cổng ngay, không phải duyệt lần hai.
- Cổng chỉ còn chưa mở khi thật sự thiếu: thiếu hoặc trống một mục (vẫn chỉ viết bù đúng mục đó), hoặc đầu dòng "Dịch vụ" không đọc ra tên đơn vị nào.
- Lời nhắc cho agent đổi chữ: "cổng CHƯA đọc ra đủ năm mục" thay cho "KHÔNG theo khuôn chuẩn".
- Không đổi: năm mục vẫn bắt buộc có nội dung; mục thêm của dự án (`plan.extra`) và của đơn vị vẫn bắt buộc; lời người dùng dài hơn `maxPromptChars` (600 ký tự) vẫn luôn là việc mới.

**Chưa kiểm và giới hạn**

- Chưa thử bằng phiên Claude CLI thật ở dự án khác.
- Cụm chữ thường cách nhau bằng khoảng trắng ở dòng "Dịch vụ" (ví dụ "api trang login") được đọc thành nhiều tên; tên không có thật bị `scope_register` từ chối nhưng vẫn nằm trong danh sách đơn vị của kế hoạch.
- Lời người dùng dài hơn 600 ký tự vẫn luôn bị coi là việc mới: một lời duyệt kèm đoạn dán dài sẽ không mở cổng.

### 2.6.0 (2026-10-15)
- **Mức việc phải làm:** không có: nâng cấp như mọi lần.
- **Tóm tắt:** Repo đã có .claude/ do team tự viết: harness kiểm kê và báo thứ nào dùng được, thứ nào không nạp khi mở ở gốc; bản của team thắng khi trùng tên; skill riêng của đơn vị đổi bằng công cụ và tệp sinh không còn sửa tay được.

**Việc bạn phải làm**

- Nâng cấp như mọi lần (`install` hoặc `setup` sinh lại `settings.json`); không có bước chuyển cấu hình.
- Dự án có bảng nối skill riêng (`skills-map.json`): thêm `host_status` vào `readonly`; muốn đòi skill `services` trước khi tạo skill thì thêm `"host_define": "services"` vào `tools`. Bộ khuôn nhẹ đã có `host_status`.
- Phiên Claude Code đang mở: gõ `/mcp` để thấy hai công cụ mới; hook mới hiệu lực khi `settings.json` được đọc lại.

**Bạn sẽ thấy khác**

- Skill team viết ở `<đơn vị>/.claude/skills/` là nguồn native: trùng tên với skill ở `.harness/skills/` thì bản của team thắng, harness không sinh bản của nó. Chỗ trùng tên được báo ở `host-sync`, `doctor`, `host_status`; không báo lại ở mỗi phiên mở như 2.5.0.
- Bảng công cụ của lõi thêm hai công cụ (`host_status`, `host_define`), nên mỗi phiên tốn thêm một ít token. `settings.json` có thêm hook `guard-host` (bộ cài tự sinh).

**Chưa kiểm và giới hạn**

- Biến môi trường trong `settings.json` của đơn vị khi mở ở gốc chưa đo; chưa thử trên repo thật có `.claude/` của nhóm.
- Chiều đọc mới có cho skill ở bộ chuyển Claude; chưa dùng để sinh sang công cụ khác (Codex, Opencode). Rule của team chỉ được kiểm kê, chưa vào bộ định nghĩa chung.
- Lệnh shell ghi mà đích không phân tích được (biến, ghép chuỗi) lách được hook `guard-host`; lần đồng bộ sau vẫn báo tệp bị sửa tay.
- Chưa thử agent thật có chịu dùng `host_define` thay vì Write hay không.

### 2.5.0 (2026-10-15)
- **Mức việc phải làm:** không có: nâng cấp như mọi lần.
- **Tóm tắt:** Bộ sinh tệp cho Claude Code từ định nghĩa gốc của đơn vị: skill riêng của repo viết một lần ở .harness/, harness sinh ra .claude/ để Claude Code tự nạp; nền cho các bộ chuyển công cụ khác.

**Việc bạn phải làm**

- Nâng cấp như mọi lần; không có bước chuyển cấu hình. Dự án chưa có skill ở `<đơn vị>/.harness/skills/` thì không có tệp nào được sinh.
- Dự án đã có skill ở đó: lần mở phiên kế tiếp harness sinh bản ở `<đơn vị>/.claude/skills/`. Đặt tên khác tên skill chung của dự án.
- Repo đơn vị đã có `.claude/rules/harness.md` của nhóm: harness không đụng vào và báo.

**Bạn sẽ thấy khác**

- Skill sinh ở đơn vị được tính là skill hợp lệ: mở bằng công cụ Skill hay đọc trọn `SKILL.md` thì sổ phiên ghi nhận, và bảng nối skill (`skills-map.json`) có thể đòi nó. Trước đây skill chỉ nằm ở `.harness/skills/` thì không được tính.
- Tệp sinh có dòng dấu `harness-host:claude` sau frontmatter. Tệp bị sửa tay hoặc tệp cùng tên của nhóm (không có dấu) không bao giờ bị ghi đè; bỏ định nghĩa gốc thì bản sinh còn nguyên bị xóa. Tệp sinh được thêm vào `.git/info/exclude` của repo đơn vị.

**Chưa kiểm và giới hạn**

- Chỉ đo một lần, một model, trên Windows; chưa thử trên repo thật đã có `.claude/` của nhóm.
- Chưa có bộ chuyển cho công cụ khác (Codex, Opencode), nên hợp đồng chưa được thử với công cụ thứ hai.
- Hook và máy chủ MCP ở thư mục con không nạp, nên không sinh `settings.json` hay `.mcp.json` ở đơn vị; luật và công cụ riêng của đơn vị vẫn đi qua khối mở rộng.

### 2.4.0 (2026-10-14)
- **Mức việc phải làm:** không có: nâng cấp như mọi lần.
- **Tóm tắt:** Thêm công cụ db_query: agent tự tra sổ phiên của harness (kế hoạch đã duyệt, dịch vụ đã sửa, skill đã mở, lần bị chặn) bằng một câu SELECT chỉ đọc.

**Việc bạn phải làm**

- Nâng cấp như mọi lần; không có bước chuyển cấu hình.
- Dự án có bảng nối skill riêng (`skills-map.json`) và muốn `db_query` không bị chặn vì chưa mở skill: thêm `db_query` vào danh sách `readonly` của bảng đó (bộ khuôn mặc định đã có).
- Phiên Claude Code đang mở: gõ `/mcp` để thấy công cụ mới.

**Bạn sẽ thấy khác**

- Bộ công cụ của lõi thêm một công cụ (`db_query`), nên bảng công cụ của mỗi phiên dài thêm một dòng.
- Công cụ chỉ đọc: sổ mở ở chế độ chỉ đọc của SQLite, mọi câu có lệnh ghi, `PRAGMA`, `ATTACH` hay nhiều câu một lúc bị từ chối. Sổ chỉ có tên công cụ, tên dịch vụ và lý do một dòng; không có tham số lời gọi hay nội dung tệp.

**Chưa kiểm và giới hạn**

- Chưa thử bằng phiên Claude CLI thật xem agent có tự viết đúng câu SQL ngay lần đầu hay không.
- Bộ cấp phép của SQLite cần bản Node có `setAuthorizer`; bản Node không có thì hai lớp còn lại (chế độ chỉ đọc, kiểm câu lệnh) vẫn giữ.
- Chỉ tra được sổ phiên; sổ đo (`eval.db`) không mở.

### 2.3.0 (2026-10-14)
- **Mức việc phải làm:** có công cụ, khóa hay tính năng bị bỏ; chuyển cấu hình (lệnh nâng cấp tự làm).
- **Tóm tắt:** Kế hoạch trình duyệt ít tốn token hơn: bỏ công cụ plan_draft, khuôn còn năm mục và cổng bỏ qua lỗi nhẹ, thiếu mục thì chỉ viết thêm đúng mục đó; mỗi lời gọi công cụ MCP nhanh hơn khoảng 0,7 giây; gói có UPGRADING.md cho người đang ở bản cũ.

**Việc bạn phải làm**

- Từ 2.2.x hoặc 2.1.x: nâng cấp như mọi lần. Lệnh nâng cấp tự gỡ hai khóa `plan.draft` và `plan.strict` khỏi `.claude/project/gate.config.json` (để lại cũng không hại).
- **Việc bạn cần làm tay nếu có:** skill hay tài liệu riêng của dự án còn bảo agent gọi `plan_draft` thì sửa lại: công cụ không còn, gọi sẽ báo lỗi. Bảng skill ở `.claude/rules/harness-skills.md` tự sinh lại ở phiên kế tiếp.
- Phiên Claude Code đang mở: gõ `/mcp` để bộ công cụ cập nhật (bớt `plan_draft`).

**Bạn sẽ thấy khác**

- **Công cụ `plan_draft` bị bỏ**, cùng lưới cuối lượt giữ lượt khi agent không dùng nó. Công cụ này làm agent tốn output gấp đôi (điền tham số rồi dán lại khối). Agent viết thẳng khối kế hoạch (skill `plan`).
- **Khuôn kế hoạch còn năm mục bắt buộc**: Dịch vụ, Làm gì, Sửa tệp, Không làm, Rủi ro. Mục "Lý do" bỏ khỏi khuôn (đã có đoạn tổng hợp yêu cầu ngay trước kế hoạch); lời nhắc và sổ phiên dùng dòng đầu của "Làm gì" thay cho lý do.
- **Hai mức lỗi.** Lỗi nhẹ cho qua im lặng: thiếu dấu, hoa thường, gạch đầu dòng hay số thứ tự hay không có, in đậm, thứ tự mục, cấp tiêu đề, dấu gạch ngang thay dấu hai chấm, khoảng trắng. Lỗi nghiêm trọng thì lời đồng ý chưa mở cổng: thiếu tiêu đề, thiếu hoặc để trống một mục, tên đơn vị ở mục Dịch vụ không đọc được.
- So với 2.2.0 (chỉ "Dịch vụ" bắt buộc, mục khác thiếu thì cảnh báo), kế hoạch thiếu "Rủi ro" hay "Không làm" nay phải bù trước khi cổng mở; bù chỉ tốn vài dòng.
- Lời nhắc và lời chặn hiển thị cho agent nói "công cụ MCP của harness" thay vì "bsn-docs" (tên máy chủ cũ trước khi MCP tách theo khối). Luật vẫn nhận tên cũ cho phiên đang mở.

**Chưa kiểm và giới hạn**

- Chưa thử bằng phiên Claude CLI thật ở dự án khác: agent có thật sự chỉ viết các dòng thiếu hay không chưa kiểm.
- Chưa đo mức giảm token thật trên phiên của agent.
- Nới dấu phân cách có thể nhận nhầm một dòng văn xuôi bắt đầu bằng "Rủi ro - ..." là mục (chỉ trong khối kế hoạch).
- `UPGRADING.md` chỉ phân loại mức việc phải làm cho các bản có tờ thay đổi máy đọc; các bản trước đó trỏ về `RELEASES.md`.

### 2.2.2 (2026-10-14)
- **Mức việc phải làm:** không có: nâng cấp như mọi lần.
- **Tóm tắt:** Mỗi lời gọi công cụ MCP của harness nhanh hơn khoảng 0,6 đến 0,7 giây: danh sách đơn vị chỉ quét một lần mỗi lần dựng bộ công cụ.

**Việc bạn phải làm**

- Từ 2.2.x: nâng cấp như mọi lần. Không có bước chuyển cấu hình, không có việc làm tay.

**Bạn sẽ thấy khác**

- Không có. Mô tả của các công cụ giữ y nguyên từng ký tự; mỗi lời gọi vẫn chạy trong một tiến trình mới nên mã mới vẫn có hiệu lực ngay.

**Chưa kiểm và giới hạn**

- Mức tiết kiệm thật phụ thuộc số đơn vị và tốc độ đĩa; số trên là đo ở một máy Windows.
- Phần cố định còn lại của mỗi lời gọi (khởi động tiến trình, đọc cấu hình) chưa đụng tới.

### 2.2.1 (2026-10-14)
- **Mức việc phải làm:** không có: nâng cấp như mọi lần.
- **Tóm tắt:** Bảng skill ở .claude/rules tự theo .claude/skills/ khi mở phiên (không ghi đè tệp sửa tay); sửa câu về plan_draft còn sót ở 2.2.0.

**Việc bạn phải làm**

- Từ 2.2.0 hoặc 2.1.x: nâng cấp như mọi lần. Không có bước chuyển cấu hình, không có việc làm tay.

**Bạn sẽ thấy khác**

- Câu về kế hoạch trong bảng đổi từ "luôn lập bằng `plan_draft`" thành "theo skill `plan`, `plan_draft` là tùy chọn". Bản 2.2.0 còn câu cũ này dù lưới ép dùng đã tắt mặc định.
- Tệp bảng của bản 2.1.x còn dòng chú thích cũ (không có mã băm) được ghi đè một lần ở phiên đầu sau khi nâng cấp.

**Chưa kiểm và giới hạn**

- Chưa thử hook đầu phiên bằng một phiên Claude CLI thật ở dự án khác.
- Bảng chỉ được xét lại khi mở phiên, không xét giữa phiên.

### 2.2.0 (2026-10-14)
- **Mức việc phải làm:** không có: nâng cấp như mọi lần.
- **Tóm tắt:** Khuôn kế hoạch dễ tính hơn: cổng chỉ đòi tiêu đề và mục "Dịch vụ", các mục còn lại thiếu thì chỉ cảnh báo; lưới ép dùng plan_draft tắt mặc định; lời của cổng ngắn hơn. Giảm số lần agent phải viết lại kế hoạch.

**Việc bạn phải làm**

- Từ 2.1.x: nâng cấp như mọi lần. Không có bước chuyển cấu hình, không có việc làm tay. Muốn giữ hành vi cũ: đặt `"plan": { "strict": true, "draft": "block" }` trong `gate.config.json`.

**Bạn sẽ thấy khác**

- Kế hoạch thiếu một trong năm mục không bắt buộc, trước đây làm lời duyệt không mở cổng, nay mở cổng.
- Khóa `plan.draft` mặc định đổi từ `block` sang `off`: tin kế hoạch viết thẳng không còn bị giữ lượt để làm lại bằng công cụ `plan_draft`. Dự án đã đặt giá trị này thì giữ nguyên.

**Chưa kiểm và giới hạn**

- Chưa đo mức giảm token thật trên phiên của agent.
- Kế hoạch thiếu Rủi ro hay Không làm có thể qua mà người dùng không để ý; chỉ có cảnh báo trong nhật ký cổng.
- Lời nhắc mới của cổng chưa thử bằng phiên Claude CLI thật.

### 2.1.1 (2026-10-14)
- **Mức việc phải làm:** không có: nâng cấp như mọi lần.
- **Tóm tắt:** Lệnh đóng gói có thể đòi dấu "đã kiểm đủ" trước khi đóng gói (khóa requireVerified), để bản phát hành luôn qua bộ kiểm đủ ở cả hai nền; mặc định tắt.

**Việc bạn phải làm**

- Từ 2.1.0: nâng cấp như mọi lần. Không có bước chuyển cấu hình, không có việc làm tay.

**Bạn sẽ thấy khác**

- Không có khi không bật khóa (mặc định tắt). Khi bật: thiếu dấu, dấu của bản khác hay thiếu một nền thì lệnh từ chối. Khẩn cấp: `BSN_RELEASE_UNVERIFIED=1` bỏ qua và in cảnh báo.

**Chưa kiểm và giới hạn**

- Dấu chỉ chặn việc quên chạy bộ kiểm, không chặn người cố ý ghi dấu giả.
- Chưa dùng ở một repo nguồn khác ngoài repo hiện tại.

### 2.1.0 (2026-10-14)
- **Mức việc phải làm:** không có: nâng cấp như mọi lần.
- **Tóm tắt:** Agent lập kế hoạch bằng công cụ plan_draft thay vì tự gõ khối, nên kế hoạch không thể sai khuôn; thêm skill plan, lưới cuối lượt bắt kế hoạch gõ tay, và bảng skill sinh tự động ở .claude/rules.

**Việc bạn phải làm**

- Từ 2.0.x: nâng cấp như mọi lần (`upgrade`, agent báo cáo, bạn duyệt). Bước cài chạy `setup` nên có ngay tệp rules. Phiên đang mở gõ `/mcp` một lần để thấy `plan_draft`. Bảng skill ghi tay trong `CLAUDE.md` của dự án có thể thay bằng một dòng trỏ tới tệp rules. Không có bước chuyển cấu hình.

**Bạn sẽ thấy khác**

- Hook cuối lượt trước đây không bao giờ nói gì với phiên; nay có thể giữ lượt một lần khi agent tự gõ kế hoạch (mặc định bật). Đặt `"plan": { "draft": "off" }` trong `gate.config.json` để giữ cách cũ.
- `setup` viết thêm một tệp ở `.claude/rules/`; `setup --check` và `doctor` báo lệch khi tệp thiếu hay cũ.
- Bộ MCP có 25 công cụ (trước là 24).

**Chưa kiểm và giới hạn**

- Chưa đo trong phiên thật xem agent có luôn gọi `plan_draft` và dán nguyên khối hay không; lưới cuối lượt chỉ bắt được lỗi sau khi tin kế hoạch đã sinh xong (tin kế hoạch là chữ thường nên không hook nào chặn được trước khi sinh).
- Lưới không đối chiếu kế hoạch viết lại sau lần giữ; lần giữ thứ hai không có.
- Tệp rules thêm khoảng 2 KB chữ vào mọi phiên; chưa đo ảnh hưởng tới việc chọn skill.
- Skill hay `CLAUDE.md` đã sửa tay ở dự án đã cài được giữ nguyên; muốn dùng bản mới thì chép từ `.claude/modules/core/skills/`.

### 2.0.1 (2026-10-14)
- **Mức việc phải làm:** không có: nâng cấp như mọi lần.
- **Tóm tắt:** Thêm bộ hướng dẫn cho người vận hành và người mở rộng harness (vận hành hằng ngày, skill dùng chung, phần riêng của từng repo, khối mở rộng); đính chính một chỗ tài liệu nói sai về matcher của hook.

**Việc bạn phải làm**

- Từ 2.0.0: nâng cấp như mọi lần (`upgrade`, agent báo cáo, bạn duyệt). Không có bước chuyển cấu hình, không có việc làm tay.

**Bạn sẽ thấy khác**

- Không có. Chỉ thêm tệp tài liệu và đính chính hai chỗ lời hướng dẫn (`FORMAT.md` và skill `skill-map`) về matcher của hook chặn theo skill: matcher thêm tay cho công cụ ngoài harness bị `setup` và nâng cấp viết lại.

**Chưa kiểm và giới hạn**

- Hướng dẫn chỉ có tiếng Việt. Chưa có người ngoài đọc và làm theo từ đầu.
- `extension trust` và `mcp trust` chưa được chạy thử từ đầu đến cuối vì chỉ chạy được ngoài phiên Claude; phần mô tả hai lệnh này lấy từ lời của chính lệnh và từ test.
- Khai bền công cụ ngoài harness cho hook chặn theo skill: chưa có khóa cấu hình (giới hạn còn mở, hướng dẫn nói rõ).
- Skill riêng của repo (`<repo>/.harness/skills/`) chỉ được nhắc, chưa được ép: muốn ép thì gắn skill dùng chung theo đường dẫn.

### 2.0.0 (2026-10-13)
- **Mức việc phải làm:** chuyển cấu hình (lệnh nâng cấp tự làm).
- **Tóm tắt:** Máy chủ MCP của harness tách theo khối: thay vì một máy chủ giữ cả bộ công cụ, mỗi khối đang bật có máy chủ riêng; một cái hỏng không kéo theo cái khác.

**Việc bạn phải làm**

- Từ 1.7.0: để agent làm theo lệnh `upgrade` như mọi lần (báo cáo từng mục, bạn duyệt, agent cài); hai bước chuyển cấu hình chạy trong lúc cài.
- Sau khi cài: mọi phiên Claude Code đang mở gõ `/mcp` (hoặc mở lại) một lần để thấy tên mới. Phiên chưa nối lại vẫn gọi được công cụ qua máy chủ cũ, và vẫn bị các hook chặn như trước.
- Việc cần làm tay: kịch bản, tài liệu hay quyền khai theo từng công cụ (`mcp__bsn-docs__<công cụ>`) đổi sang tên mới. Bước chuyển chỉ đổi quyền khai theo cả máy chủ (`mcp__bsn-docs`). Nếu bạn đặt `mcp.prefix` khác `harness`, bước chuyển vẫn đặt tên `harness` rồi bộ cài thêm các máy chủ theo tiền tố của bạn: xóa tay mục `harness` thừa.
- Mỗi phiên chạy thêm vài tiến trình Node (mỗi máy chủ một tiến trình).

**Bạn sẽ thấy khác**

- Tên đầy đủ của công cụ là `mcp__<máy chủ>__<công cụ>`, ví dụ `mcp__harness-docs__design_record`. Công cụ của máy chủ phía sau cổng là `mcp__harness-mcp__<máy chủ>_<công cụ>`.
- Ba hook (đủ kiến thức, từ cấm, công cụ ghi ra ngoài) và sổ phiên nhận công cụ của mọi máy chủ của harness; mẫu của hook phủ cả máy chủ (`mcp__<máy chủ>__.*`), và vẫn phủ tên cũ `bsn-docs` để phiên chưa nối lại không mất chốt.
- Bộ cài (`setup`) sinh một mục cho mỗi khối đang bật. Mục `bsn-docs` mà chạy tệp mồi của harness được đổi tên thành máy chủ lõi `harness` (giữ trường bạn đã thêm như `env`); mục trùng tên của bạn mà không chạy tệp mồi thì giữ. `doctor` báo máy chủ nào còn thiếu và báo khi mục cũ còn nằm cạnh các máy chủ mới.
- Lời nhắc đầu phiên nêu số máy chủ và tổng số công cụ; dòng cảnh báo "phiên đang chạy máy chủ cũ" mang tên máy chủ cụ thể.

**Chưa kiểm và giới hạn**

- Chưa chạy trên dự án thật của người dùng khác. Chưa đo mức bộ nhớ tăng thêm của các tiến trình thêm trên máy yếu.
- Lệnh `upgrade` trọn vòng (báo cáo, duyệt, cài) từ 1.7.0 lên 2.0.0 bằng hai gói thật chưa được chạy; đã kiểm hai bước chuyển bằng dữ liệu thật của bản 1.x và lệnh cài trần bằng hai gói thật.
- Thêm một khối bật sau khi đã mở phiên cần mở lại phiên; cách Claude Code nối máy chủ mới giữa phiên chưa được kiểm.
- Quyền khai theo từng công cụ không tự đổi tên; chỉ quyền theo cả máy chủ được đổi.
- Luật mở rộng của dự án tự so tên máy chủ với `bsn-docs` sẽ không còn khớp: so theo tiền tố.

### 1.7.0 (2026-10-13)
- **Mức việc phải làm:** không có: nâng cấp như mọi lần.
- **Tóm tắt:** Nâng cấp không còn bước chạy tay: harness dựng sẵn, agent báo từng mục thay đổi và xin ý kiến, người dùng duyệt, agent cài và kiểm, hỏng thì tự quay lại.

**Việc bạn phải làm**

- Từ 1.6.0: chạy từ bản clone của kho gói, `node <bản clone>/.claude/modules/core/cli/cli.js upgrade prepare --project <dự án>`, rồi `upgrade apply --project <dự án>` ở terminal. Bản 1.6.0 chưa có lệnh `apply`, nên lần này người dùng tự chạy; từ 1.7.0 trở đi agent làm trọn.
- Từ 1.5.0 trở về trước: như trên; báo cáo sẽ có mục của cả 1.6.0 và 1.7.0.
- Không có việc bắt buộc với cấu hình. Nên khai lệnh test của phần bạn đã sửa vào `upgrade.verify`.
- Phiên đang mở: gõ `/mcp` một lần nếu kết quả công cụ có dòng cảnh báo máy chủ cũ.

**Bạn sẽ thấy khác**

- Trong phiên Claude, `upgrade prepare` từ một kho gói chưa được ghi nhận bị từ chối cho tới khi người dùng duyệt kế hoạch có ghi mã `upgrade-source@...` của kho đó. `check` và `preview` vẫn chạy nhưng không ghi nhớ kho. Lệnh `install` chạy từ một bản clone tự ghi nhận nơi đó.
- Chạy thẳng `apply.js` của thư mục dựng sẵn trong một phiên Claude bị từ chối: đi qua `upgrade apply`.
- Cổng duyệt cho sửa tệp trong `overlay/` của một bản dựng sẵn khi chưa có lời duyệt (để agent xử lý chỗ đụng nhau trước khi trình). Phần còn lại của thư mục dựng sẵn và mã đang chạy vẫn sau cổng duyệt.
- Lệnh `install` dựng bản mới đủ ở thư mục cạnh bên rồi đổi chỗ: phiên đang mở chỉ gặp thư mục mã trống trong khoảng giữa hai lần đổi tên, không phải suốt lúc chép.
- Đầu phiên: dự án mà lệnh cài đã ghi nhận kho gói thì lần kiểm bản mới đầu tiên tự chạy, không cần ai chạy `upgrade check` trước.
- Lời của `upgrade preview` và `upgrade prepare` bắt đầu bằng báo cáo theo mục; phần theo từng tệp như cũ nằm sau, dưới tiêu đề "Theo từng tệp".

**Chưa kiểm và giới hạn**

- Lời duyệt do một mô hình phán: nó có thể hiểu nhầm một câu trả lời là lời duyệt. Ở đây hiểu nhầm nghĩa là mã cổng duyệt bị thay. Mã duyệt gắn với nội dung, phép đối chiếu với kho gói và giới hạn kho gói thu hẹp rủi ro này, không xóa được.
- Mã duyệt là chốt chặn agent làm nhầm, không phải hàng rào: một tiến trình cố ý chép tệp bằng lệnh khác không đi qua nó.
- Lệnh đóng gói kiểm được tờ thay đổi đủ và trỏ đúng tệp; nó không kiểm được lời mô tả hành vi có đúng không.
- Gộp theo dòng không hiểu nghĩa: "gộp sạch" chưa chứng minh chạy đúng. Dự án không khai `upgrade.verify` thì phần đã sửa chưa được ai kiểm với bản mới.
- Trong khoảng giữa hai lần đổi tên thư mục mã, hook của phiên khác không tìm thấy tệp và được cho qua.
- Tự quay lại phủ mã, skill, cấu hình mà bước cài đã đổi; không phủ thứ một phiên khác sửa trong lúc đó.
- Chưa có lệnh dời ghi chép của đơn vị cũ sang `.harness/`. Chưa chạy trên macOS.

### 1.6.0 (2026-10-13)
- **Mức việc phải làm:** không có: nâng cấp như mọi lần.
- **Tóm tắt:** Mã ở đâu cũng được; phần tại chỗ của mỗi đơn vị gom về .harness/; cổng duyệt khai được; nâng cấp giữ phần người cài đã sửa.

**Việc bạn phải làm**

- Từ 1.5.0, chưa sửa mã của gói: `node <gói>/.claude/modules/core/cli/cli.js install <dự án>` rồi `--apply` như trước.
- Đã sửa mã của gói, hoặc có tệp tự thêm: chạy từ bản clone của kho gói (bản đang cài chưa có lệnh này): `node <bản clone>/.claude/modules/core/cli/cli.js upgrade preview --project <dự án>`, rồi `upgrade prepare --project <dự án>`, sửa chỗ đụng nhau trong thư mục dựng sẵn, và tự chạy script lệnh in ra. Từ bản này trở đi lệnh chạy ngay trong dự án.
- Dự án đã tự thêm khóa `workspace.root` bằng cách sửa mã: cùng tên khóa, cùng nghĩa; bỏ phần sửa tương ứng. Hàm của gói là `workspaceRoot(root)` với `root` vẫn là thư mục mở phiên (không đổi nghĩa của `root`).
- Không có việc bắt buộc với cấu hình: mọi khóa mới đều có mặc định là hành vi cũ, trừ điều thứ nhất ở "Hành vi đổi".
- Phiên đang mở: gõ `/mcp` một lần nếu kết quả công cụ có dòng cảnh báo máy chủ cũ.

**Bạn sẽ thấy khác**

- **Đơn vị CHƯA có gì của harness (không có `docs/`, không có tệp cửa vào ở gốc) từ nay được dựng khung trong `.harness/`.** Đơn vị đã có `docs/` hay tệp cửa vào ở gốc giữ nguyên bố cục cũ, không bị đổi chỗ. Muốn mọi đơn vị mới vẫn theo bố cục cũ: khai `"units": { "layout": "legacy" }`. Khuôn `project.json` của bản cài mới khai sẵn `"layout": "harness"`.
- `new-service.js` chạy trên một thư mục đã có sẵn mã và theo bố cục `.harness/` thì không tạo `.gitignore` ở gốc đơn vị nữa (tệp đó là của repo).
- Lệnh `install` giữ lại khối bạn tự thêm vào `.claude/modules/` (thư mục có `module.json` mà gói không có). Tệp lẻ bạn thêm vào khối của gói và tệp của gói bạn đã sửa vẫn bị thay khi dùng `install` trần (bản cũ nằm ở chỗ cất): dùng `upgrade` để giữ.
- Máy chủ công cụ trả lời hết các lời gọi đang xử lý rồi mới thoát khi đầu vào đóng (trước đây một phép thử gửi dồn rồi đóng ống chỉ nhận được lời đáp đầu).
- Tệp nằm ở gốc mã khai riêng được các luật coi là trong dự án (chặn sửa tay tệp do công cụ sở hữu, tài liệu phải đọc trước khi sửa, quét từ cấm). Mẫu `skills.files` và `policies.unitSheets` cho tệp ở đó tính trên đường dẫn từ gốc mã.
- Bộ phán `strict`: mọi tin không phải lời duyệt được coi là việc mới, nên cổng đang mở thì đóng lại; kế hoạch đang chờ vẫn chờ thêm vài lượt.
- Lời của công cụ và hook nêu đường dẫn thật của ghi chép (`.harness/docs/...` ở bố cục mới). Ở bố cục cũ lời in ra không đổi một ký tự.

**Chưa kiểm và giới hạn**

- Chưa chạy lệnh `upgrade` trên một dự án thật của người dùng khác; chưa chạy bằng phiên Claude Code thật; chưa chạy trên macOS.
- Gộp theo dòng không hiểu nghĩa: "gộp sạch" và "qua kiểm cú pháp" chưa chứng minh hành vi đúng. Sau khi nâng cấp phải chạy test của phần bạn đã sửa.
- Bước cài cuối cùng do người dùng tự chạy ở terminal: một phiên Claude Code không tự thay được harness của chính nó.
- Ghi chép tại chỗ: cổng HTML chỉ dựng lại sau một commit hoặc khi chạy `cli.js portal`, nên ghi chép vừa đổi chưa lên trang ngay. Công cụ `diagram_generate` không chạy lệnh tạo bảng ở chế độ này (dùng dòng lệnh). Lịch sử sơ đồ dựa vào git nên không có.
- Chưa có lệnh dời ghi chép của một đơn vị từ bố cục cũ sang `.harness/`; đơn vị cũ và đơn vị mới của cùng một dự án có thể ở hai bố cục.
- Bộ sinh trang riêng của đơn vị vẫn nằm ở `.claude/project/generators/`, chưa dời về `.harness/`. Skill riêng của đơn vị đặt ở `.harness/skills/` chưa được harness nạp hay nhắc.
- Chưa làm: sổ phiên sống qua lần nén ngữ cảnh; bộ nhận dạng ngôn ngữ khác cho kho ngữ nghĩa; bảng phiên lọc theo thư mục mở phiên.
- Định danh `bsn-docs` và các biến môi trường như `BSN_SERVICE` giữ nguyên như 1.5.0.

### 1.5.0 (2026-10-13)
- **Mức việc phải làm:** xem mục của bản này trong RELEASES.md.

**Việc bạn phải làm**

- Chạy lại `install <dự án>` rồi `install <dự án> --apply` bằng gói mới. Không có bước làm tay.
- Phiên đang mở lúc nâng cấp: từ 1.4.0 lên thì không phải làm gì. Từ 1.3.0 trở về trước thì mỗi phiên đang mở gõ `/mcp` một lần (xem mục 1.4.0).
- Sau khi nâng cấp, chạy `node .claude/modules/core/cli/cli.js diagrams-restamp` một lần nếu trang báo nhiều sơ đồ "có thể đã cũ" mà hình không đổi.

**Bạn sẽ thấy khác**

- Luật chặn ghi tệp do công cụ sở hữu không còn chặn một lệnh shell chỉ vì lệnh đó NHẮC tới tên tệp: lệnh ghi có đích rõ thì xét theo đích; chỉ khi không đọc ra đích mới xét theo tên được nhắc.
- `paths-rename` giữ dấu của sơ đồ khi đổi đường dẫn trong `sources`.
- Bảng việc -> skill mặc định có thêm dòng `session_transfer` -> `transfer-session`.
- **Lời in ra không còn nhắc dự án nơi harness được phát triển.** Lời của hook, git hook, lệnh và mô tả công cụ nói "gốc dự án" hoặc dùng tên trong `project.json` của bạn; tên cổng HTML là "Cổng <tên dự án>". Các lời chặn không còn tiền tố tên và không còn mã quyết định nội bộ. Script nào của bạn so khớp nguyên văn các lời cũ thì phải sửa.
- Dự án chưa có `project.json` (chế độ tương thích bố cục cũ): tên dự án là tên thư mục gốc, và không còn đơn vị mặc định, nên lời gọi công cụ tài liệu phải truyền `service`.

**Chưa kiểm và giới hạn**

- Chuyển phiên mới kiểm bằng test với Claude Code giả; chưa có lần chuyển nào bằng phiên Claude Code thật.
- Số liệu của `diagrams-drift` chưa được đối chiếu tay với một dự án thật.
- Lời giải thích máy viết cho bản đồ cả hệ còn chung chung.
- Chưa chạy trên macOS.
- Tên định danh còn mang chữ `bsn`: máy chủ MCP `bsn-docs` (nên tên công cụ là `mcp__bsn-docs__*`), các biến môi trường như `BSN_PG_CONTAINER`, `BSN_BROWSER` (cùng một tiền tố), dấu của git hook. Chúng là tên kỹ thuật, đổi sẽ làm gãy bản đã cài, nên để cho một bản lớn sau.
- Kho ngữ nghĩa còn một bộ nhận dạng đọc tờ khai báo triển khai ở một đường dẫn cố định; dự án không có tờ đó thì bộ này không làm gì.
- Git hook đã cài bởi bản cũ còn in lời cũ cho tới khi cài lại (`node .claude/modules/core/cli/install-git-hooks.js`).

### 1.4.0 (2026-10-13)
- **Mức việc phải làm:** xem mục của bản này trong RELEASES.md.

**Việc bạn phải làm**

- Chạy `install` như thường lệ.
- **Mỗi phiên Claude Code đang mở lúc nâng cấp phải gõ `/mcp` một lần** (hoặc mở lại phiên): tệp mồi là chương trình phiên đã nạp lúc mở và không tự thay được. Đây là lần cuối: từ bản này tệp mồi không đổi nữa.

**Bạn sẽ thấy khác**

- Danh sách công cụ của `bsn-docs` tự cập nhật ở phiên đang mở khi mã công cụ hay khai báo máy chủ đổi.
- Lời cảnh báo "lớp bề mặt đã đổi" chỉ còn xuất hiện khi chính tệp mồi đổi.

**Chưa kiểm và giới hạn**

- Máy chủ đòi đăng nhập qua trình duyệt không đi qua cổng này (mã truy cập đặt trong tiêu đề hay biến môi trường thì được; chỉ ghi TÊN biến trong khai báo).
- Chưa đo với nhiều hơn hai máy chủ phía sau cùng lúc.

### 1.3.0 (2026-10-13)
- **Mức việc phải làm:** xem mục của bản này trong RELEASES.md.

**Việc bạn phải làm**

- Chạy `install` như thường lệ. Không có bước làm tay.

**Bạn sẽ thấy khác**

- `setup` và `extension trust` không còn viết lại `settings.json` khi nội dung không đổi.
- Sửa lỗi: hai tiến trình cùng ghi một tệp tài liệu có thể cùng "thắng" khóa khi máy bận; nay khóa cũ chỉ bị gỡ đúng nội dung đã phán là cũ.
- Sửa lỗi: bộ cài git hook lấy sai kiểu chữ của đường dẫn trên Windows, làm `doctor` báo nhầm "chưa cài".

**Chưa kiểm và giới hạn**

- Tiến trình máy chủ MCP của phiên đang mở vẫn là thứ nạp một lần (xử lý ở 1.4.0).

### 1.2.0 (2026-10-13)
- **Mức việc phải làm:** xem mục của bản này trong RELEASES.md.

**Việc bạn phải làm**

- Chạy `install` như thường lệ. Không có bước làm tay.

**Bạn sẽ thấy khác**

- Không có thay đổi hành vi nào với dự án đã cài 1.1.0 ngoài lệnh mới.

**Chưa kiểm và giới hạn**

- Phiên mở từ trước lúc đổi bố cục mất công cụ `bsn-docs` mà không được báo (xử lý ở 1.3.0 và 1.4.0).

### 1.1.0 (2026-10-12)
- **Mức việc phải làm:** xem mục của bản này trong RELEASES.md.

**Việc bạn phải làm**

- Chạy `install` như thường lệ. Luật mở rộng kiểu cũ (`.claude/project/rules/<id>.js`, api 0.1) vẫn chạy.

**Bạn sẽ thấy khác**

- Khối mở rộng chỉ được CHẶN THÊM, không nới được luật của lõi; mã của khối chỉ chạy từ bản người dùng đã xác nhận bằng `extension trust`.

**Chưa kiểm và giới hạn**

- Công cụ ghi của một khối mở rộng chưa được đối soát với phạm vi của kế hoạch đã duyệt.

### 1.0.0 (2026-10-12)
- **Mức việc phải làm:** xem mục của bản này trong RELEASES.md.

**Việc bạn phải làm**

- Dự án đang ở bố cục cũ: cùng lệnh `install`; cấu hình được chuyển sang `.claude/project/`, bản cũ được cất để quay lại.

**Bạn sẽ thấy khác**

- Bản đầu tiên theo bố cục khối; bản trước đó (chưa đánh số) đặt mọi thứ trong một thư mục `plugin` của `.claude`.

**Chưa kiểm và giới hạn**

- Skill và tài liệu của gói chỉ có tiếng Việt.
