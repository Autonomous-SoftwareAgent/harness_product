# Sổ phát hành của harness_product

Mỗi bản một mục, bản mới nhất ở trên. Mục nào cũng có đủ năm phần: có gì mới, hành vi đổi, nâng cấp phải làm gì, đã kiểm bằng gì, điều chưa kiểm và giới hạn. Lệnh đóng gói từ chối khi số bản đang đóng gói chưa có mục ở đầu sổ này hoặc mục thiếu phần, nên không có bản nào ra ngoài mà không kèm báo cáo.

Cách đọc số bản `A.B.C`: `A` đổi khi nâng cấp cần làm tay một việc ngoài lệnh `install`; `B` đổi khi có tính năng mới; `C` đổi khi chỉ sửa lỗi. Số bản nằm ở `.claude/modules/VERSION` của gói và trong dòng đầu của `doctor`.

Số test ở phần "Đã kiểm" là của bộ test phát triển, chạy ở dự án nguồn; bộ test đó không đi kèm gói. Trong dự án đã cài, phép kiểm là `node .claude/modules/core/cli/cli.js doctor`.

## 2.9.0 (2026-10-16)

Điều phối nhiều phiên: người dùng chỉ nói chuyện với MỘT phiên và ủy quyền cho nó duyệt kế hoạch của các phiên làm việc; mỗi repo có thể có sub-agent dựng sẵn; phiên điều phối có bảng việc. Bản này không bỏ gì và không có bước chuyển cấu hình; không ủy quyền thì mọi thứ chạy như 2.8.1.

### Có gì mới
- **Ủy quyền duyệt kế hoạch, trao bằng chính kế hoạch.** Kế hoạch nói sẽ mở hoặc tạo phiên khác thì thêm một dòng `- Ủy quyền: có, 8h`; người dùng chỉ cần "duyệt" thì cổng mở và hook ghi quyền cho phiên đó (mặc định 8 giờ, tối đa 24; `không` thì không ghi). Quyền chỉ có nghĩa với CÁC PHIÊN DO CHÍNH PHIÊN ĐÓ TẠO RA bằng `session_spawn` (công cụ gắn vào lời mở đầu của phiên mới một dấu ký "phiên này do X tạo"; hook của phiên mới kiểm rồi ghi quan hệ). Phiên điều phối đọc kế hoạch bằng `plan_view` và duyệt bằng `plan_approve`; lệnh duyệt có chữ ký, gắn băm của đúng kế hoạch, đúng phiên nhận, dùng một lần, hết hạn sau 30 phút. Kế hoạch nói mở phiên khác mà thiếu dòng này thì cổng chưa mở và chỉ đòi viết thêm đúng dòng đó. Cách dự phòng: gõ `ỦY QUYỀN: 8h` ở đầu tin (nhận cả dạng dán trong khối mã). `delegate_status` xem ủy quyền và kiểm sổ duyệt. Thu hồi: gõ `THU HỒI ỦY QUYỀN`.
- **Quyền theo kế hoạch đang được duyệt.** Kế hoạch có dòng `Ủy quyền` (giao việc cho phiên khác) thì phiên đó chỉ điều phối, không tự sửa tệp; người dùng duyệt một kế hoạch không có dòng đó thì phiên tự làm, và ủy quyền cũ thôi duyệt thêm (việc đã duyệt thay thì các phiên làm nốt). Không có đơn vị nào "không bao giờ ủy quyền được": kế hoạch nêu thì được, kể cả harness.
- **Dòng `- Được làm:` (tùy chọn)** khai việc rủi ro kế hoạch cho phép: commit, đẩy, gắn nhãn, deploy, quay lui, xóa, ghi đè, sửa cổng duyệt. Với ủy quyền, đây là giới hạn của các phiên làm thay, kiểm ở LÚC LÀM theo lệnh và đường dẫn thật; không có dòng thì chúng chỉ sửa tệp và commit ở máy. Sửa mã cổng duyệt luôn phải nêu rõ và được ghi sổ.
- **Duyệt nối tiếp**: phiên làm thay đã làm theo một kế hoạch được duyệt thay mà trình kế hoạch mới (ví dụ commit sau khi sửa) thì phiên điều phối duyệt tiếp được, tối đa 5 lần mỗi phiên. Một dịch vụ chỉ một phiên làm thay ghi tại một lúc. Mã cổng duyệt đổi sau khi ủy quyền thì ủy quyền tạm ngưng tới khi người dùng duyệt lại.
- **Khối mới `secrets` (máy chủ MCP `harness-secrets`):** token GitHub nằm trong kho của hệ điều hành (Windows DPAPI, macOS Keychain, Linux secret-tool; tệp 600 dự phòng có cảnh báo). Người dùng quản bằng `cli.js secret set|rotate|revoke|status|audit|migrate|setup-git`. Agent dùng `secret_status`, `github_ci`, `github_run` (mọi lệnh gh và gh api), không công cụ nào nhận hay trả token. Phạm vi theo kế hoạch đang duyệt: repo của đơn vị ở mục Dịch vụ, dòng mới `- GitHub:` (repo, `org:<tên>`, tài khoản), việc theo dòng `Được làm` (thêm `tạo repo`, `quản trị`). `git push` vẫn là lệnh thường: trình cấp mật khẩu chỉ đưa token cho repo trong phạm vi, hook `guard-github` xét việc của lần đẩy. Nhắc đầu phiên khi token sắp hết hạn, hỏng hay thừa quyền. Bộ quét trước commit và trước đẩy bắt dạng token và khóa.
- `task_report` không cần mã việc: phiên do phiên điều phối tạo báo cáo thẳng về phiên đó. Một tin "THU HỒI ỦY QUYỀN, duyệt" vừa thu hồi vừa duyệt.
- **Sub-agent dựng sẵn cho từng repo.** `host_define` (và `host_rename`, `host_remove`) nhận `kind=agent`: nguồn ở `<repo>/.harness/agents/<tên>.md` (`tools` bắt buộc), harness sinh `.claude/agents/<repo>-<tên>.md` ở gốc dự án kèm phần mở đầu bắt agent đọc cửa vào và skill riêng của repo, chỉ làm trong repo, trả báo cáo ba mục.
- **Bảng việc** `task_dispatch`, `task_report`, `task_status` trong sổ phiên (bảng `act_tasks`).
- Skill `orchestrate` và hướng dẫn `05-dieu-phoi-va-sub-agent.md`.

### Hành vi đổi
- Ba công cụ MCP chỉ đọc mới (`delegate_status`, `plan_view`, `task_status`), bốn công cụ ghi mới (`session_spawn`, `plan_approve`, `task_dispatch`, `task_report`); hai hook mới (`guard-delegate`, và `gate-hook read` chặn công cụ đọc, tìm kiếm đọc khóa ký).
- Lệnh Bash nhắc tới khóa ký hay tệp ủy quyền bị chặn dù cổng đóng hay mở.
- Luật phạm vi: agent sinh ra cho repo A (tên `A-<tên>`) không sửa tệp repo khác. Agent chung (Explore, general-purpose...) và phiên chính không bị luật này.
- Sổ phiên nâng lên phiên bản 5 ở lần mở đầu (chụp bản sao trước khi nâng; chỉ thêm bảng).
- Dấu vân tay cổng duyệt đổi (có thêm `gate/gate-delegate.js`).

### Nâng cấp
- Nâng cấp như mọi lần (`upgrade`); không có bước chuyển cấu hình. `settings.json` được sinh lại có thêm hai hook; công cụ MCP mới hiện sau khi gõ `/mcp`.
- Không dùng ủy quyền thì không phải làm gì thêm. Muốn dùng: đọc `.claude/modules/core/guides/05-dieu-phoi-va-sub-agent.md`.

### Đã kiểm
- Bộ kiểm đủ của bản phát triển (cả ảnh chụp hành vi) qua ở Windows và Linux (Docker) trước khi đóng gói; dấu "đã kiểm đủ" gắn với đúng mã băm của gói này.
- Test mới: ủy quyền (mười bảy ca, gồm quyền theo kế hoạch, dòng Được làm, duyệt nối tiếp, một dịch vụ một bên ghi, tạm ngưng khi mã cổng đổi, một tin vừa thu hồi vừa duyệt, báo cáo không cần mã việc; gồm các cách vượt: lệnh bị sửa, chữ ký giả, kế hoạch đổi sau khi duyệt, lệnh sang phiên khác, hết hạn, thu hồi giữa chừng, cờ mở giả, sổ bị xóa dòng; và chạy qua hook thật của cây giả), sub-agent và bảng việc (sáu ca).
- Đo bằng phiên `claude -p` thật (Claude Code 2.1.300, haiku, Windows): agent ở `.claude/agents/` của gốc được nạp và danh sách `tools` có hiệu lực, agent trong thư mục repo thì không; sub-agent gọi được công cụ MCP của harness; hook nhận loại agent và mã agent; sub-agent gọi được sub-agent khác; một phiên điều phối thật nhận dòng ủy quyền, mã phiên của công cụ MCP khớp mã phiên của hook, `plan_approve` ghi lệnh duyệt và phiên làm việc mở cổng bằng lệnh đó.

### Chưa kiểm và giới hạn
- Không chặn được một agent cố tình phá: cùng tài khoản hệ điều hành và có Bash, nó có thể đọc khóa nếu lọt hook, hoặc chạy một phiên `claude` mới để tự tạo ủy quyền. Lớp này chặn lỗi vô tình, tấn công qua nội dung và sửa tay thô sơ, và để lại dấu vết.
- Máy không đọc chữ trong kế hoạch để từ chối (đọc chữ từng chặn nhầm kế hoạch onboard vô hại, vì nó buộc phải nói `.harness/` và `.claude/` của đơn vị). Việc cấm bị chặn ở lúc làm bằng lệnh và đường dẫn thật; chỗ hở: lệnh chạy qua Bash mà hook không phân tích được, hoặc một chương trình tự ghi ra ngoài. Phiên điều phối vẫn phải đọc kế hoạch.
- Lần chạy thật với bốn phiên làm thay (onboard bốn repo) qua bản trước của cơ chế này; bản quyền-theo-kế-hoạch chưa chạy với phiên Claude thật.
- Mới thử một bản Claude Code, một máy, phiên chạy bằng `claude -p`; chưa thử nhiều phiên nền chạy song song lâu ngày; chưa đo token tiết kiệm được.
- Công cụ không tự nhắn phiên nhận việc; chỉ trả lời nhắn mẫu.

## 2.8.1 (2026-10-16)

Sửa ba lỗi của 2.8.0 tìm ra khi dựng skill và note cho các đơn vị thật: một note làm mất hiệu lực khối mở rộng đã xác nhận, mô tả skill có dấu hai chấm làm Claude Code bỏ qua skill, và lời chặn theo skill không chỉ đúng tệp của skill đơn vị. Bản này không bỏ gì và không có bước chuyển cấu hình.

### Có gì mới
- `doctor` và `host_status` báo LỖI khi `SKILL.md` viết tay có `description:` chứa `: ` hoặc ` #` mà chưa bọc nháy (phần đầu tệp không còn là YAML hợp lệ, Claude Code bỏ qua cả skill). Và ghi chú khi đơn vị nằm trong thư mục bị `.gitignore` ở gốc dự án: Claude Code không liệt kê skill của đơn vị đó, chỉ nạp được rule (note).

### Hành vi đổi
- `host_define` tự bọc nháy kép dòng `description:` khi giá trị có `: `, ` #` hay mở đầu bằng ký tự đặc biệt (trước đây ghi nguyên văn nên `description: Dùng khi: sửa mã` làm hỏng YAML và skill biến mất). Mô tả an toàn vẫn viết trần. Gọi lại `host_define` với cùng tên là sửa được skill cũ.
- Lời chặn theo skill nêu đường dẫn thật của skill đơn vị và bảo đọc trọn tệp bằng công cụ Read (công cụ Skill báo "Unknown skill" khi thư mục đơn vị bị `.gitignore`). Skill chung ở gốc dự án giữ lời cũ.
- Dấu vân tay của khối mở rộng của đơn vị (luật ở `.harness/rules/`, công cụ, lệnh) không còn tính thư mục `notes/`. Trước đây: đơn vị đã xác nhận luật riêng, rồi có người (hay agent) thêm một note bằng `host_define` thì `doctor` báo "khối mở rộng đã sửa sau lần xác nhận" và bản mới không có hiệu lực cho tới khi xác nhận lại bằng tay. Skill và tài liệu (`skills/`, `docs/`) đã được bỏ qua từ trước; note là ghi chép giống chúng.

### Nâng cấp
- Nâng cấp như mọi lần; không có bước chuyển cấu hình. Đơn vị đã gặp cảnh báo trên sẽ hết cảnh báo ngay, không phải xác nhận lại, nếu chỉ khác nhau ở `notes/`.

### Đã kiểm
- Bộ kiểm đủ của bản phát triển qua ở Windows và Linux (Docker) trước khi đóng gói; dấu "đã kiểm đủ" gắn với đúng mã băm của gói này.
- Test mới đỏ với mã 2.8.0 (đã dựng lại lỗi), xanh với mã mới: thêm skill và note không đổi dấu vân tay; sửa một tệp luật thì dấu vẫn đổi; mô tả có dấu hai chấm hay dấu thăng được bọc nháy, đọc ngược ra đúng chuỗi, skill viết tay hỏng bị doctor báo LỖI; lời chặn nêu đúng đường dẫn skill đơn vị; ghi chú đơn vị trong thư mục bị .gitignore.
- Đo bằng phiên claude -p thật (2.1.299, haiku, Windows, một lần): skill đặt ở <đơn vị>/.claude/skills/ gọi được bằng công cụ Skill sau khi phiên chạm một tệp trong đơn vị, NHƯNG chỉ khi thư mục đơn vị không bị .gitignore ở gốc dự án; cùng cây, thêm `apps/` vào .gitignore thì công cụ Skill báo Unknown skill. Rule (note) thì nạp trong cả hai trường hợp.

### Chưa kiểm và giới hạn
- Chưa thử trên dự án khác đã cài 2.8.0 và đã xác nhận khối mở rộng.
- Đơn vị nằm trong thư mục bị .gitignore ở gốc dự án thì Claude Code không liệt kê skill của nó (đã đo, chưa biết có cách khai báo nào để mở); lúc đó skill chỉ mở được bằng cách đọc trọn SKILL.md (hook sổ phiên tính cách này), note và việc ép theo skill vẫn chạy.

## 2.8.0 (2026-10-16)

Vòng đời trọn vẹn của skill riêng của đơn vị: một lời gọi `host_define` là đủ (skill kèm điều kiện ép, hoặc note nạp theo đường dẫn), có đổi tên, gỡ, nhận skill của team, bảng vòng đời và kiểm bằng `doctor`. Bản này không bỏ gì và không có bước chuyển cấu hình.

### Có gì mới
- **Điều kiện ép nằm ngay trong skill.** Skill ở `<đơn vị>/.harness/skills/<tên>/SKILL.md` khai thêm hai dòng ở đầu tệp: `harness-files` (mẫu đường dẫn, tính từ gốc đơn vị) và `harness-reads` (tài liệu phải đọc thêm). Hook chặn theo skill tự gộp phần này vào bảng nối ở gốc dự án: sửa tệp khớp mẫu mà phiên chưa mở skill thì bị chặn. Không còn bước sửa bảng nối ở gốc. Đơn vị chỉ thêm được yêu cầu, không bớt được yêu cầu của bảng gốc; mẫu hỏng bị bỏ và `doctor` báo.
- **Note: quy tắc tự nạp khi chạm tệp.** `<đơn vị>/.harness/notes/<tên>.md` có `paths:` (mẫu kiểu glob, tính từ thư mục đơn vị); harness sinh `<đơn vị>/.claude/rules/<tên>.md`. Note chỉ nhắc, không ép.
- **Bốn công cụ MCP** (thêm ba): `host_define` nhận `kind` (skill hoặc note), `enforce`, `paths`; `host_rename` (bản gốc, bản sinh, điều kiện ép đi cùng nhau); `host_remove`; `host_adopt` (nhận skill của team về `.harness/`, mặc định chạy khô, cần `confirm=true`, từ chối khi skill có tệp kèm theo).
- **Bảng vòng đời** trong `host_status`: từng skill và note đang ở trạng thái nào (bản sinh khớp, lệch hay bị sửa tay; có ép hay chưa; số lần mở và lần cuối). Mỗi thao tác ghi một dòng sự kiện vào sổ phiên (chỉ tên đơn vị, tên mục, loại thao tác), tra được bằng `db_query`.
- **Tự sinh lại sau khi sửa tay.** Hook mới `host-resync`: ghi vào `.harness/skills/` hay `.harness/notes/` thì tệp công cụ được sinh lại ngay.
- **`doctor` báo thêm:** lỗi khi mẫu ép hỏng hoặc skill khai ép mà chưa được sinh; cảnh báo khi mẫu ép không khớp tệp nào hoặc skill 30 ngày chưa ai mở; ghi chú khi skill chưa ép.

### Hành vi đổi
- Lỗi cũ được sửa: một tệp mã chỉ NHẮC tới dòng dấu sinh (ví dụ bộ chuyển công cụ) từng bị coi là tệp do harness sinh và bị chặn sửa. Nay chỉ dòng dấu đúng khuôn ở đầu dòng mới tính.
- Công cụ `host_define` nhận thêm tham số, các lời gọi cũ (service, name, description, body) vẫn chạy y nguyên. Thông báo lỗi tên sai không đổi.
- Không đổi: skill của team giữ nguyên và thắng khi trùng tên; tệp sinh vẫn không sửa tay được; bố cục đơn vị không tự đổi.

### Nâng cấp
- Nâng cấp như mọi lần (`upgrade`); không có bước chuyển cấu hình. `settings.json` được sinh lại có thêm hook `host-resync`; công cụ MCP mới hiện sau khi gõ `/mcp`.
- Skill riêng có sẵn ở `.harness/skills/` vẫn chạy; muốn ép thì thêm hai dòng `harness-*` vào đầu tệp hoặc gọi lại `host_define` với `enforce`.

### Đã kiểm
- Bộ kiểm đủ của bản phát triển (cả ảnh chụp hành vi) qua ở Windows và Linux (Docker) trước khi đóng gói; dấu "đã kiểm đủ" gắn với đúng mã băm của gói này.
- Test vòng đời (11 ca): điều kiện ép nằm trong tệp và bản sinh không chép nó; gộp vào bảng nối chỉ thêm, dòng gốc nguyên vẹn, hook thật đòi skill; note giữ `paths`; đổi tên và gỡ dọn đủ ba chỗ, bản sinh sửa tay được giữ; nhận skill của team (chạy khô, `confirm`, từ chối khi có tệp kèm); `doctor` và bảng vòng đời; hook sinh lại; sự kiện vào sổ phiên; tệp mã nhắc tới dấu sinh không bị chặn.
- Đo bằng phiên `claude -p` thật (Claude Code 2.1.299 qua haiku, Windows, một lần): rule ở `<đơn vị>/.claude/rules/` có `paths: ["src/core/**"]` chỉ nạp khi phiên chạm tệp khớp, mẫu tính từ thư mục đơn vị (mẫu tính từ gốc dự án không khớp); rule không có `paths` nạp ngay khi phiên chạm bất cứ tệp nào của đơn vị.

### Chưa kiểm và giới hạn
- Việc ép theo `harness-files` mới kiểm bằng test và kịch bản ảnh chụp chạy hook thật, chưa qua một phiên Claude CLI thật ở dự án khác.
- `host_adopt` mới kiểm trên cây thử, chưa trên một repo của team có skill thật đang được git theo dõi.
- Mọi phép đo Claude Code chỉ trên một bản, một máy; chưa có Codex hay công cụ khác.
- Phiên mở thẳng trong thư mục đơn vị không có hook nào, nên không có sinh lại và không có ép.

## 2.7.0 (2026-10-15)

Khuôn kế hoạch thoáng: chỉ cần đủ năm mục, viết kiểu nào cũng được. Sửa lỗi trải nghiệm khiến người dùng phải duyệt hai lần chỉ vì cách viết. Bản này không bỏ gì và không có bước chuyển cấu hình.

### Có gì mới
- **Cổng đọc kế hoạch theo nội dung, không theo hình thức.** Tiêu đề kèm chữ gì cũng được (`## Kế hoạch (v2)`, `## Kế hoạch: đổi cỡ chữ`, `**Kế hoạch**`, `## Plan`); không có tiêu đề mà đủ năm mục vẫn đọc được. Tên mục có nhiều tên gần nghĩa có sẵn (Đơn vị, Việc làm, Tệp sẽ sửa, Ngoài phạm vi, Service, What, Files, Out of scope, Risks...), cho kèm chú thích ngắn ("Rủi ro / giả định", "Sửa tệp nào"), nhận gạch đầu dòng, số thứ tự, in đậm, nhãn dạng tiêu đề, dòng bảng và nội dung ở dòng sau.
- **Dòng "Dịch vụ" đọc tên đơn vị từ đầu dòng.** Nhiều đơn vị nối bằng dấu phẩy, "và", "&"; chữ hoa được hạ thành chữ thường; phần sau ngoặc, dấu chấm phẩy, gạch dài hay dấu chấm hết câu là chú thích; "không", "không có", "n/a", "chung" nghĩa là chỉ đụng phần dùng chung.

### Hành vi đổi
- Những kế hoạch trước đây bị coi là sai chỉ vì cách viết (đã đo: 25 trên 29 cách viết tự nhiên) nay đọc được; lời "duyệt" mở cổng ngay, không phải duyệt lần hai.
- Cổng chỉ còn chưa mở khi thật sự thiếu: thiếu hoặc trống một mục (vẫn chỉ viết bù đúng mục đó), hoặc đầu dòng "Dịch vụ" không đọc ra tên đơn vị nào.
- Lời nhắc cho agent đổi chữ: "cổng CHƯA đọc ra đủ năm mục" thay cho "KHÔNG theo khuôn chuẩn".
- Không đổi: năm mục vẫn bắt buộc có nội dung; mục thêm của dự án (`plan.extra`) và của đơn vị vẫn bắt buộc; lời người dùng dài hơn `maxPromptChars` (600 ký tự) vẫn luôn là việc mới.

### Nâng cấp
- Nâng cấp như mọi lần; không có bước chuyển cấu hình. `plan.heading`, `plan.labels`, `plan.extra` đã khai vẫn dùng được; tên gọi khác khai thêm được cộng vào các tên có sẵn.
- Skill hay tài liệu riêng của dự án có kiểm chữ "KHÔNG theo khuôn chuẩn" trong lời nhắc của cổng thì đổi sang "CHƯA đọc ra đủ năm mục".

### Đã kiểm
- Bộ kiểm đủ của bản phát triển (cả ảnh chụp hành vi) qua ở Windows và Linux (Docker) trước khi đóng gói; dấu "đã kiểm đủ" gắn với đúng mã băm của gói này.
- Test khuôn thoáng: 41 cách viết tự nhiên (kể cả đúng dòng "Dịch vụ" làm lời duyệt trượt) đọc đủ năm trường và đúng đơn vị; vẫn chặn khi thiếu mục, mục trống, không tiêu đề mà không đủ mục, đầu dòng "Dịch vụ" không có tên; câu văn thường và dòng thụt sâu không bị nhận nhầm; đoạn bổ sung ghép được vào kế hoạch viết kiểu khác.

### Chưa kiểm và giới hạn
- Chưa thử bằng phiên Claude CLI thật ở dự án khác.
- Cụm chữ thường cách nhau bằng khoảng trắng ở dòng "Dịch vụ" (ví dụ "api trang login") được đọc thành nhiều tên; tên không có thật bị `scope_register` từ chối nhưng vẫn nằm trong danh sách đơn vị của kế hoạch.
- Lời người dùng dài hơn 600 ký tự vẫn luôn bị coi là việc mới: một lời duyệt kèm đoạn dán dài sẽ không mở cổng.

## 2.6.0 (2026-10-15)

Dự án đã có `.claude/` do team tự viết: harness kiểm kê, báo trước thứ nào ngừng chạy, giữ nguyên bản của team khi trùng tên, và không cho sửa tay tệp harness sinh. Bản này không bỏ gì và không đổi cấu hình.

### Có gì mới
- **Kiểm kê `.claude/` của team ở từng đơn vị:** lệnh `node .claude/modules/core/cli/cli.js host-inventory` (thêm `--json` cho máy đọc), công cụ MCP `host_status` (chỉ đọc) và `doctor` nêu skill, rule, lệnh, agent, số hook, quyền, biến môi trường, máy chủ MCP riêng của team. Tệp harness sinh đếm riêng. Skill `onboard` có bước kiểm kê này.
- **Công cụ MCP `host_define`** (service, name, description, body): tạo hoặc sửa một skill riêng của đơn vị ở `<đơn vị>/.harness/skills/<tên>/SKILL.md` có kiểm tên, mô tả một dòng, nội dung, rồi sinh tệp cho Claude Code. Từ chối tên trùng skill team đã có.
- **Hook `guard-host`:** chặn Write, Edit và lệnh shell ghi vào tệp có dấu `harness-host` (tệp harness sinh), lời chặn chỉ đúng đường (`host_define` hoặc `host-sync`). Tệp của team không có dấu nên không bị ảnh hưởng.

### Hành vi đổi
- Skill team viết ở `<đơn vị>/.claude/skills/` là nguồn native: trùng tên với skill ở `.harness/skills/` thì bản của team thắng, harness không sinh bản của nó. Chỗ trùng tên được báo ở `host-sync`, `doctor`, `host_status`; không báo lại ở mỗi phiên mở như 2.5.0.
- Bảng công cụ của lõi thêm hai công cụ (`host_status`, `host_define`), nên mỗi phiên tốn thêm một ít token. `settings.json` có thêm hook `guard-host` (bộ cài tự sinh).

### Nâng cấp
- Nâng cấp như mọi lần (`install` hoặc `setup` sinh lại `settings.json`); không có bước chuyển cấu hình.
- Dự án có bảng nối skill riêng (`skills-map.json`): thêm `host_status` vào `readonly`; muốn đòi skill `services` trước khi tạo skill thì thêm `"host_define": "services"` vào `tools`. Bộ khuôn nhẹ đã có `host_status`.
- Phiên Claude Code đang mở: gõ `/mcp` để thấy hai công cụ mới; hook mới hiệu lực khi `settings.json` được đọc lại.

### Đã kiểm
- Bộ kiểm đủ của bản phát triển (cả ảnh chụp hành vi) qua ở Windows và Linux (Docker) trước khi đóng gói; dấu "đã kiểm đủ" gắn với đúng mã băm của gói này.
- Test kiểm kê, `host_define`, hook chặn tệp sinh (hook thật qua stdin, kể cả lệnh shell), luật với bộ chuyển giả, bản của team thắng khi trùng tên.
- Phiên `claude` thật (bản 2.1.299, Windows, một lần, mở ở gốc): skill, rule của đơn vị nạp muộn; hook, quyền (đọc tệp bị deny vẫn được), lệnh, agent, máy chủ MCP riêng của đơn vị không nạp.

### Chưa kiểm và giới hạn
- Biến môi trường trong `settings.json` của đơn vị khi mở ở gốc chưa đo; chưa thử trên repo thật có `.claude/` của nhóm.
- Chiều đọc mới có cho skill ở bộ chuyển Claude; chưa dùng để sinh sang công cụ khác (Codex, Opencode). Rule của team chỉ được kiểm kê, chưa vào bộ định nghĩa chung.
- Lệnh shell ghi mà đích không phân tích được (biến, ghép chuỗi) lách được hook `guard-host`; lần đồng bộ sau vẫn báo tệp bị sửa tay.
- Chưa thử agent thật có chịu dùng `host_define` thay vì Write hay không.

## 2.5.0 (2026-10-15)

Skill riêng của một repo viết một lần, harness sinh ra phần Claude Code tự nạp. Bản này không bỏ gì và không đổi cấu hình.

### Có gì mới
- **Bộ sinh tệp cho Claude Code.** Định nghĩa gốc của một đơn vị nằm ở `<đơn vị>/.harness/` (skill ở `.harness/skills/<tên>/SKILL.md`, tệp cửa vào ở `.harness/CLAUDE.md`). Harness sinh `<đơn vị>/.claude/skills/<tên>/SKILL.md` và `<đơn vị>/.claude/rules/harness.md` (một dòng nhắc đọc cửa vào) để Claude Code tự nạp. Sinh ở đầu mỗi phiên (im lặng khi đã đúng) hoặc chạy tay `node .claude/modules/core/cli/cli.js host-sync` (`--check` chỉ báo).
- **Hợp đồng bộ chuyển công cụ** (`ports/host-adapter.js`) kèm bảng năng lực của công cụ (skill, rule, hook, MCP, lệnh nạp ở đâu). Bộ chuyển thứ hai cho công cụ khác thêm sau mà không sửa lõi; hiện chỉ có bộ chuyển Claude.
- `doctor` báo đơn vị thiếu hoặc lệch tệp sinh.

### Hành vi đổi
- Skill sinh ở đơn vị được tính là skill hợp lệ: mở bằng công cụ Skill hay đọc trọn `SKILL.md` thì sổ phiên ghi nhận, và bảng nối skill (`skills-map.json`) có thể đòi nó. Trước đây skill chỉ nằm ở `.harness/skills/` thì không được tính.
- Tệp sinh có dòng dấu `harness-host:claude` sau frontmatter. Tệp bị sửa tay hoặc tệp cùng tên của nhóm (không có dấu) không bao giờ bị ghi đè; bỏ định nghĩa gốc thì bản sinh còn nguyên bị xóa. Tệp sinh được thêm vào `.git/info/exclude` của repo đơn vị.

### Nâng cấp
- Nâng cấp như mọi lần; không có bước chuyển cấu hình. Dự án chưa có skill ở `<đơn vị>/.harness/skills/` thì không có tệp nào được sinh.
- Dự án đã có skill ở đó: lần mở phiên kế tiếp harness sinh bản ở `<đơn vị>/.claude/skills/`. Đặt tên khác tên skill chung của dự án.
- Repo đơn vị đã có `.claude/rules/harness.md` của nhóm: harness không đụng vào và báo.

### Đã kiểm
- Bộ kiểm đủ của bản phát triển (cả ảnh chụp hành vi) qua ở Windows và Linux (Docker) trước khi đóng gói; dấu "đã kiểm đủ" gắn với đúng mã băm của gói này.
- Test bộ sinh: hợp đồng, sinh skill và tệp nhắc, chạy lại không đổi, đổi định nghĩa gốc, bản sửa tay và tệp của nhóm không bị ghi đè, bản mồ côi bị xóa, `--check` không ghi, skill sinh được nhận là hợp lệ, lệnh `host-sync`.
- Phiên `claude` thật (bản 2.1.299, Windows): skill sinh hiện sau khi chạm tệp trong đơn vị và gọi được bằng công cụ Skill; tệp nhắc nạp sau khi chạm tệp.

### Chưa kiểm và giới hạn
- Chỉ đo một lần, một model, trên Windows; chưa thử trên repo thật đã có `.claude/` của nhóm.
- Chưa có bộ chuyển cho công cụ khác (Codex, Opencode), nên hợp đồng chưa được thử với công cụ thứ hai.
- Hook và máy chủ MCP ở thư mục con không nạp, nên không sinh `settings.json` hay `.mcp.json` ở đơn vị; luật và công cụ riêng của đơn vị vẫn đi qua khối mở rộng.

## 2.4.0 (2026-10-14)

Agent tự tra sổ phiên của harness bằng một công cụ mới. Bản này không bỏ gì và không đổi cấu hình.

### Có gì mới
- **Công cụ `db_query`**: chạy MỘT câu `SELECT` (hoặc `WITH ... SELECT`) trên sổ phiên (`harness.db`) để agent tự trả lời "phiên này đã được duyệt kế hoạch nào, đã sửa dịch vụ nào, đã mở skill nào, đã bị luật nào chặn". Gọi không có câu SQL thì trả danh sách bảng và cột. Tự thêm `LIMIT` (mặc định 50, tối đa 200).

### Hành vi đổi
- Bộ công cụ của lõi thêm một công cụ (`db_query`), nên bảng công cụ của mỗi phiên dài thêm một dòng.
- Công cụ chỉ đọc: sổ mở ở chế độ chỉ đọc của SQLite, mọi câu có lệnh ghi, `PRAGMA`, `ATTACH` hay nhiều câu một lúc bị từ chối. Sổ chỉ có tên công cụ, tên dịch vụ và lý do một dòng; không có tham số lời gọi hay nội dung tệp.

### Nâng cấp
- Nâng cấp như mọi lần; không có bước chuyển cấu hình.
- Dự án có bảng nối skill riêng (`skills-map.json`) và muốn `db_query` không bị chặn vì chưa mở skill: thêm `db_query` vào danh sách `readonly` của bảng đó (bộ khuôn mặc định đã có).
- Phiên Claude Code đang mở: gõ `/mcp` để thấy công cụ mới.

### Đã kiểm
- Bộ kiểm đủ của bản phát triển (cả ảnh chụp hành vi) qua ở Windows và Linux (Docker) trước khi đóng gói; dấu "đã kiểm đủ" gắn với đúng mã băm của gói này.
- Test công cụ: đọc dữ liệu, tự thêm và kẹp `LIMIT`, tám cách ghi bị từ chối mà sổ không đổi, dấu chấm phẩy trong chuỗi chữ, chưa có sổ thì báo rõ; thử trên sổ thật.

### Chưa kiểm và giới hạn
- Chưa thử bằng phiên Claude CLI thật xem agent có tự viết đúng câu SQL ngay lần đầu hay không.
- Bộ cấp phép của SQLite cần bản Node có `setAuthorizer`; bản Node không có thì hai lớp còn lại (chế độ chỉ đọc, kiểm câu lệnh) vẫn giữ.
- Chỉ tra được sổ phiên; sổ đo (`eval.db`) không mở.

## 2.3.0 (2026-10-14)

Kế hoạch trình duyệt tốn ít token hơn và ít bị viết lại. Bản này BỎ một công cụ (`plan_draft`) và hai khóa cấu hình; đọc phần "Nâng cấp".

### Có gì mới
- **Thiếu mục thì chỉ viết thêm đúng mục đó.** Người dùng đồng ý mà kế hoạch có tiêu đề nhưng thiếu hoặc để trống một số mục: cổng nêu đúng các mục đó, agent chỉ viết thêm các dòng ấy, hệ thống ghép vào kế hoạch cũ và chờ người dùng đồng ý lần nữa trên bản đầy đủ. Agent viết lại cả kế hoạch vẫn được.
- **`UPGRADING.md` ở gốc gói**: bảng mỗi bản cần làm gì, danh sách thứ bị bỏ hoặc đổi tên, hành vi nào sẽ khác, điều chưa kiểm. Sinh tự động; người ở bản cũ đọc một tệp là biết cần làm gì, không phải đọc git diff.
- **Mỗi lời gọi công cụ MCP nhanh hơn khoảng 0,7 giây** (danh sách đơn vị chỉ quét đĩa một lần mỗi lần dựng bộ công cụ, trước đây 25 lần). Kiểm đủ ở Windows giảm khoảng 230 giây.

### Hành vi đổi
- **Công cụ `plan_draft` bị bỏ**, cùng lưới cuối lượt giữ lượt khi agent không dùng nó. Công cụ này làm agent tốn output gấp đôi (điền tham số rồi dán lại khối). Agent viết thẳng khối kế hoạch (skill `plan`).
- **Khuôn kế hoạch còn năm mục bắt buộc**: Dịch vụ, Làm gì, Sửa tệp, Không làm, Rủi ro. Mục "Lý do" bỏ khỏi khuôn (đã có đoạn tổng hợp yêu cầu ngay trước kế hoạch); lời nhắc và sổ phiên dùng dòng đầu của "Làm gì" thay cho lý do.
- **Hai mức lỗi.** Lỗi nhẹ cho qua im lặng: thiếu dấu, hoa thường, gạch đầu dòng hay số thứ tự hay không có, in đậm, thứ tự mục, cấp tiêu đề, dấu gạch ngang thay dấu hai chấm, khoảng trắng. Lỗi nghiêm trọng thì lời đồng ý chưa mở cổng: thiếu tiêu đề, thiếu hoặc để trống một mục, tên đơn vị ở mục Dịch vụ không đọc được.
- So với 2.2.0 (chỉ "Dịch vụ" bắt buộc, mục khác thiếu thì cảnh báo), kế hoạch thiếu "Rủi ro" hay "Không làm" nay phải bù trước khi cổng mở; bù chỉ tốn vài dòng.
- Lời nhắc và lời chặn hiển thị cho agent nói "công cụ MCP của harness" thay vì "bsn-docs" (tên máy chủ cũ trước khi MCP tách theo khối). Luật vẫn nhận tên cũ cho phiên đang mở.

### Nâng cấp
- Từ 2.2.x hoặc 2.1.x: nâng cấp như mọi lần. Lệnh nâng cấp tự gỡ hai khóa `plan.draft` và `plan.strict` khỏi `.claude/project/gate.config.json` (để lại cũng không hại).
- **Việc bạn cần làm tay nếu có:** skill hay tài liệu riêng của dự án còn bảo agent gọi `plan_draft` thì sửa lại: công cụ không còn, gọi sẽ báo lỗi. Bảng skill ở `.claude/rules/harness-skills.md` tự sinh lại ở phiên kế tiếp.
- Phiên Claude Code đang mở: gõ `/mcp` để bộ công cụ cập nhật (bớt `plan_draft`).

### Đã kiểm
- Bộ kiểm đủ của bản phát triển (cả ảnh chụp hành vi) qua ở Windows và Linux (Docker) trước khi đóng gói; dấu "đã kiểm đủ" gắn với đúng mã băm của gói này.
- Test khuôn: chín ca lỗi nhẹ cho qua, bốn loại lỗi nghiêm trọng bị chặn kèm đúng danh sách mục cần bù; luồng bù đủ, bù thiếu, viết lại cả kế hoạch, đổi ý, không tiêu đề, hết hạn; ghép thay mục hỏng và giữ mục tốt.
- Test đóng gói: `UPGRADING.md` có một dòng cho mỗi bản, bản bỏ công cụ hiện ở phần bị bỏ.

### Chưa kiểm và giới hạn
- Chưa thử bằng phiên Claude CLI thật ở dự án khác: agent có thật sự chỉ viết các dòng thiếu hay không chưa kiểm.
- Chưa đo mức giảm token thật trên phiên của agent.
- Nới dấu phân cách có thể nhận nhầm một dòng văn xuôi bắt đầu bằng "Rủi ro - ..." là mục (chỉ trong khối kế hoạch).
- `UPGRADING.md` chỉ phân loại mức việc phải làm cho các bản có tờ thay đổi máy đọc; các bản trước đó trỏ về `RELEASES.md`.

## 2.2.2 (2026-10-14)

Bản nhỏ: mỗi lời gọi công cụ MCP của harness nhanh hơn khoảng 0,6 đến 0,7 giây.

### Có gì mới
- Hàm dựng danh sách công cụ MCP (`tools()`) trước đây quét danh sách đơn vị trên đĩa một lần cho mỗi công cụ (25 lần) ở mọi lời gọi `list` và `call`. Nay quét một lần. Đo trên một dự án 5 đơn vị: mỗi lời gọi công cụ từ khoảng 750 đến 900 ms xuống 70 đến 220 ms (dự án nhiều đơn vị hơn sẽ thấy khác biệt lớn hơn).

### Hành vi đổi
- Không có. Mô tả của các công cụ giữ y nguyên từng ký tự; mỗi lời gọi vẫn chạy trong một tiến trình mới nên mã mới vẫn có hiệu lực ngay.

### Nâng cấp
- Từ 2.2.x: nâng cấp như mọi lần. Không có bước chuyển cấu hình, không có việc làm tay.

### Đã kiểm
- Bộ kiểm đủ của bản phát triển (cả ảnh chụp hành vi, phải không đổi một byte) qua ở Windows và Linux (Docker) trước khi đóng gói; dấu "đã kiểm đủ" gắn với đúng mã băm của gói này.
- Test đếm số lần quét danh sách đơn vị khi dựng bộ công cụ (đúng một lần, cho cả `list` và `tools`) và mô tả tham số `service` vẫn đủ danh sách.

### Chưa kiểm và giới hạn
- Mức tiết kiệm thật phụ thuộc số đơn vị và tốc độ đĩa; số trên là đo ở một máy Windows.
- Phần cố định còn lại của mỗi lời gọi (khởi động tiến trình, đọc cấu hình) chưa đụng tới.

## 2.2.1 (2026-10-14)

Bản nhỏ: bảng skill ở `.claude/rules` tự theo skill đang cài khi mở phiên, và sửa một câu còn sót ở 2.2.0.

### Có gì mới
- **Bảng skill tự đồng bộ.** Hook đầu phiên so `.claude/rules/harness-skills.md` với `.claude/skills/` và tự ghi lại khi lệch, nên thêm hay sửa skill không cần chạy `setup` tay. Dòng đầu tệp ghi mã băm của phần thân; tệp có người sửa tay hay không phải bản do harness sinh thì KHÔNG bị ghi đè, hook chỉ nói một dòng. `setup` vẫn sinh lại có chủ ý.

### Hành vi đổi
- Câu về kế hoạch trong bảng đổi từ "luôn lập bằng `plan_draft`" thành "theo skill `plan`, `plan_draft` là tùy chọn". Bản 2.2.0 còn câu cũ này dù lưới ép dùng đã tắt mặc định.
- Tệp bảng của bản 2.1.x còn dòng chú thích cũ (không có mã băm) được ghi đè một lần ở phiên đầu sau khi nâng cấp.

### Nâng cấp
- Từ 2.2.0 hoặc 2.1.x: nâng cấp như mọi lần. Không có bước chuyển cấu hình, không có việc làm tay.

### Đã kiểm
- Bộ kiểm đủ của bản phát triển (cả ảnh chụp hành vi) qua ở Windows và Linux (Docker) trước khi đóng gói; dấu "đã kiểm đủ" gắn với đúng mã băm của gói này.
- Test đồng bộ: tạo mới, thêm skill thì cập nhật, bản cũ không mã băm được cập nhật, tệp sửa tay và tệp lạ không bị ghi đè, không có thư mục skill thì không làm gì.

### Chưa kiểm và giới hạn
- Chưa thử hook đầu phiên bằng một phiên Claude CLI thật ở dự án khác.
- Bảng chỉ được xét lại khi mở phiên, không xét giữa phiên.

## 2.2.0 (2026-10-14)

Kế hoạch trình duyệt ít bị viết lại hơn: cổng dễ tính với khuôn kế hoạch. Dự án nào muốn giữ khuôn chặt như trước đặt một khóa.

### Có gì mới
- **Khuôn kế hoạch dễ tính.** Cổng chỉ đòi tiêu đề kế hoạch và mục "Dịch vụ" (để đăng ký phạm vi). Năm mục còn lại (Lý do, Làm gì, Sửa tệp, Không làm, Rủi ro) thiếu hay trống thì cổng vẫn mở và chỉ ghi cảnh báo vào nhật ký cổng. Tên mục đọc không phân biệt hoa thường và dấu, có hay không có gạch đầu dòng, thứ tự nào cũng được.
- **Khóa `plan.strict`** trong cấu hình cổng duyệt: `true` thì đòi đủ sáu mục như bản trước. Mục thêm khai ở `plan.extra` và của đơn vị vẫn bắt buộc ở cả hai chế độ.
- Lời từ chối kế hoạch và lời nhắc của cổng ngắn hơn (không dán lại khối mẫu).

### Hành vi đổi
- Kế hoạch thiếu một trong năm mục không bắt buộc, trước đây làm lời duyệt không mở cổng, nay mở cổng.
- Khóa `plan.draft` mặc định đổi từ `block` sang `off`: tin kế hoạch viết thẳng không còn bị giữ lượt để làm lại bằng công cụ `plan_draft`. Dự án đã đặt giá trị này thì giữ nguyên.

### Nâng cấp
- Từ 2.1.x: nâng cấp như mọi lần. Không có bước chuyển cấu hình, không có việc làm tay. Muốn giữ hành vi cũ: đặt `"plan": { "strict": true, "draft": "block" }` trong `gate.config.json`.

### Đã kiểm
- Bộ kiểm đủ của bản phát triển (cả ảnh chụp hành vi) qua ở Windows và Linux (Docker) trước khi đóng gói; dấu "đã kiểm đủ" gắn với đúng mã băm của gói này.
- Test khuôn: thiếu từng mục thì mặc định vẫn qua trừ "Dịch vụ", `strict` thì sai khuôn ở mọi cấu hình; đọc không dấu, đánh số, đổi thứ tự; lời từ chối ngắn.

### Chưa kiểm và giới hạn
- Chưa đo mức giảm token thật trên phiên của agent.
- Kế hoạch thiếu Rủi ro hay Không làm có thể qua mà người dùng không để ý; chỉ có cảnh báo trong nhật ký cổng.
- Lời nhắc mới của cổng chưa thử bằng phiên Claude CLI thật.

## 2.1.1 (2026-10-14)

Bản nhỏ cho người đóng gói từ một repo nguồn: lệnh đóng gói có thể đòi dấu "đã kiểm đủ". Người cài ở dự án thường không bị ảnh hưởng.

### Có gì mới
- **Khóa `requireVerified`** trong `.claude/project/export.json` của repo nguồn: bật thì `public-export` chỉ đóng gói bản đã qua bộ kiểm đủ ở Windows và Linux. Dấu nằm ở `.claude/.state/gate-full-check.json`, gắn với mã băm của bản đóng gói (không tính `MANIFEST.json`, vì tệp đó ghi đường dẫn thư mục đích). Kết quả lệnh có thêm trường `digest`.
- Hàm công khai `fullCheckPath` ở `core/gate/gate-paths.js` (tên chỉ thêm).

### Hành vi đổi
- Không có khi không bật khóa (mặc định tắt). Khi bật: thiếu dấu, dấu của bản khác hay thiếu một nền thì lệnh từ chối. Khẩn cấp: `BSN_RELEASE_UNVERIFIED=1` bỏ qua và in cảnh báo.

### Nâng cấp
- Từ 2.1.0: nâng cấp như mọi lần. Không có bước chuyển cấu hình, không có việc làm tay.

### Đã kiểm
- Chạy đủ (`run-changed.js --release`, gồm ảnh chụp hành vi): Windows 535/535 qua (925 giây); Linux (Docker) 529/535 qua, 6 bỏ qua (439 giây). Dấu đã kiểm đủ ghi cho bản đóng gói `ff3aa4c38ee6`.
- Lần chạy đầu bắt được một chỗ sót (test kiến trúc: hai tệp mới của bộ test chưa có trong bản đồ bố cục); đã sửa rồi chạy lại cho qua.

### Chưa kiểm và giới hạn
- Dấu chỉ chặn việc quên chạy bộ kiểm, không chặn người cố ý ghi dấu giả.
- Chưa dùng ở một repo nguồn khác ngoài repo hiện tại.

## 2.1.0 (2026-10-14)

Agent lập kế hoạch bằng công cụ thay vì tự gõ, để kế hoạch không thể sai khuôn và không tốn một lượt của bạn vì lỗi định dạng.

### Có gì mới
- **Công cụ `plan_draft`** (máy chủ `harness`, công cụ thứ 25 của bộ): agent điền nội dung (`services`, `reason`, `work`, `files`, `skip`, `risks`, và `extra` cho mục bắt buộc thêm của dự án hay đơn vị), công cụ dựng khối `## Kế hoạch` đúng khuôn từ cùng nguồn khuôn với cổng duyệt. Mục trống, đơn vị không có thật, thiếu mục bắt buộc thêm bị từ chối ngay kèm lý do. Công cụ chỉ đọc, nhớ khối đã dựng theo phiên.
- **Lưới cuối lượt**: khi luật phạm vi ở chế độ `enforce`, tin kế hoạch không chứa nguyên khối do `plan_draft` dựng thì hook cuối lượt giữ lượt đúng một lần và nhắc gọi công cụ. Lượt nói tiếp sau lần giữ thì cho qua, nên không kẹt. Khóa `plan.draft` trong `gate.config.json`: `block` (mặc định) hoặc `off`.
- **Skill `plan`** (ngắn) nói cách lập kế hoạch bằng công cụ; skill `services` bỏ phần khuôn và trỏ tới nó.
- **Bảng skill sinh tự động**: `setup` viết `.claude/rules/harness-skills.md` từ tên và mô tả các skill đang cài; Claude Code nạp tệp này từ đầu phiên. Muốn đổi bảng thì sửa skill rồi chạy lại `setup`.

### Hành vi đổi
- Hook cuối lượt trước đây không bao giờ nói gì với phiên; nay có thể giữ lượt một lần khi agent tự gõ kế hoạch (mặc định bật). Đặt `"plan": { "draft": "off" }` trong `gate.config.json` để giữ cách cũ.
- `setup` viết thêm một tệp ở `.claude/rules/`; `setup --check` và `doctor` báo lệch khi tệp thiếu hay cũ.
- Bộ MCP có 25 công cụ (trước là 24).

### Nâng cấp
- Từ 2.0.x: nâng cấp như mọi lần (`upgrade`, agent báo cáo, bạn duyệt). Bước cài chạy `setup` nên có ngay tệp rules. Phiên đang mở gõ `/mcp` một lần để thấy `plan_draft`. Bảng skill ghi tay trong `CLAUDE.md` của dự án có thể thay bằng một dòng trỏ tới tệp rules. Không có bước chuyển cấu hình.

### Đã kiểm
- Bộ test của phần đổi trên bản đã commit, cả hai nền: test công cụ và lưới cuối lượt (12 ca), máy chủ lõi (gọi `plan_draft` qua máy chủ thật, bảng skill ở `.claude/rules` do `setup` sinh, sửa tay thì báo lệch), cổng duyệt, tờ thay đổi, đóng gói và cài (15 test ở Windows, 14 qua và 1 bỏ qua ở Linux trong Docker). Một lần chạy trước đó hỏng 10 test đóng gói vì tờ thay đổi 2.1.0 sai lược đồ; đã sửa và chạy lại qua.
- Ảnh chụp hành vi chụp lại ở cả hai nền (Windows và Linux trong Docker), 321 bước, thêm hai bước gọi `plan_draft` (từ chối đơn vị không có thật, và đúng khuôn).
- Thử phá 8 ca mới (lưới giữ mãi, không đối chiếu khối, bỏ qua khóa tắt, nhận đơn vị lạ, bỏ mục thêm, bộ chuyển không ra dạng chặn của Stop, không nhớ khối, `setup` không sinh bảng skill): bắt 8/8. Hai ca đầu tiên lọt vì thiếu test; đã thêm hai test rồi bắt được.
- Một phiên `claude` CLI thật ở thư mục thử đọc đúng một tệp trong `.claude/rules/` (không dùng công cụ). Trong phiên làm việc thật của harness, lưới cuối lượt đã giữ đúng một tin kế hoạch do agent tự gõ, và agent sau đó dựng khối bằng công cụ.
- Bộ test đầy đủ hai nền trên bản đã commit CHƯA chạy lại sau lần sửa tờ thay đổi; chỉ chạy phần liên quan (xem trên).

### Chưa kiểm và giới hạn
- Chưa đo trong phiên thật xem agent có luôn gọi `plan_draft` và dán nguyên khối hay không; lưới cuối lượt chỉ bắt được lỗi sau khi tin kế hoạch đã sinh xong (tin kế hoạch là chữ thường nên không hook nào chặn được trước khi sinh).
- Lưới không đối chiếu kế hoạch viết lại sau lần giữ; lần giữ thứ hai không có.
- Tệp rules thêm khoảng 2 KB chữ vào mọi phiên; chưa đo ảnh hưởng tới việc chọn skill.
- Skill hay `CLAUDE.md` đã sửa tay ở dự án đã cài được giữ nguyên; muốn dùng bản mới thì chép từ `.claude/modules/core/skills/`.

## 2.0.1 (2026-10-14)

Bản chỉ thêm tài liệu: bộ hướng dẫn cho người vận hành và người mở rộng harness. Không đổi hành vi nào của mã.

### Có gì mới
- **Thư mục `.claude/modules/core/guides/`** (có trong gói và trong mọi dự án đã cài): `README.md` (mục lục theo vai trò, ba chỗ đặt, ai làm việc gì), `01-van-hanh.md` (một phiên làm việc từ đầu đến cuối, khi hook chặn thì làm gì, lệnh hằng ngày, việc chỉ người dùng được làm ở terminal, nâng cấp, quay lại và gỡ, sự cố thường gặp), `02-skill-toan-cuc.md` (viết skill dùng chung ở `.claude/skills/`, bắt buộc mở nó bằng bảng nối `skills` trong `project.json`, cách kiểm, giới hạn, nâng cấp giữ skill của bạn thế nào), `03-skill-theo-repo.md` (phần riêng của từng repo trong `.harness/`: tài liệu bắt buộc đọc, skill gắn theo đường dẫn, skill riêng chỉ được nhắc), `04-mo-rong.md` (khối mở rộng, máy chủ MCP ngoài, bật tắt khối, tiền tố, sửa mã của gói).
- README của gói có thêm một đoạn trỏ tới thư mục này.

### Hành vi đổi
- Không có. Chỉ thêm tệp tài liệu và đính chính hai chỗ lời hướng dẫn (`FORMAT.md` và skill `skill-map`) về matcher của hook chặn theo skill: matcher thêm tay cho công cụ ngoài harness bị `setup` và nâng cấp viết lại.

### Nâng cấp
- Từ 2.0.0: nâng cấp như mọi lần (`upgrade`, agent báo cáo, bạn duyệt). Không có bước chuyển cấu hình, không có việc làm tay.

### Đã kiểm
- Mọi lệnh và ví dụ cấu hình trong hướng dẫn được chạy thử trong một dự án cài thử từ gói: `doctor`, `new-service`, `extension new`, `extension list`, `extension test`, `mcp add`, `mcp list`, `setup`, `upgrade status`, và hook chặn theo skill với một skill gắn theo đường dẫn của một repo (lời chặn nêu đúng skill và tài liệu còn thiếu).
- Bộ test phát triển trên Windows, trừ ảnh chụp hành vi và nâng cấp: 503 test, 503 qua; riêng nâng cấp và đóng gói chạy lại trên bản đã commit: 23 qua. Linux (Docker, Node 24): nhóm tài liệu, skill, sổ tính năng, tờ thay đổi, đóng gói, nâng cấp: 49 test, 48 qua, 1 bỏ qua, 0 hỏng. Ảnh chụp hành vi chụp lại hai nền: chỉ đổi số bản trong lời `doctor` và hai dấu băm suy ra từ nó.
- Cả bộ test hai nền chưa chạy lại một lượt trọn cho bản này (bản chỉ thêm tài liệu); bản 2.0.0 đã chạy trọn.

### Chưa kiểm và giới hạn
- Hướng dẫn chỉ có tiếng Việt. Chưa có người ngoài đọc và làm theo từ đầu.
- `extension trust` và `mcp trust` chưa được chạy thử từ đầu đến cuối vì chỉ chạy được ngoài phiên Claude; phần mô tả hai lệnh này lấy từ lời của chính lệnh và từ test.
- Khai bền công cụ ngoài harness cho hook chặn theo skill: chưa có khóa cấu hình (giới hạn còn mở, hướng dẫn nói rõ).
- Skill riêng của repo (`<repo>/.harness/skills/`) chỉ được nhắc, chưa được ép: muốn ép thì gắn skill dùng chung theo đường dẫn.

## 2.0.0 (2026-10-13)

Máy chủ MCP của harness tách theo khối. Trước đây một máy chủ tên `bsn-docs` giữ cả bộ công cụ; nay mỗi khối đang bật có máy chủ riêng, nên một máy chủ hỏng hay chậm không kéo theo công cụ của khối khác. Đây là bản 2.0.0 vì tên đầy đủ của mọi công cụ đổi: kịch bản, quyền hay tài liệu của bạn có ghi `mcp__bsn-docs__...` phải đổi theo.

### Có gì mới
- **Mỗi khối một máy chủ.** `harness` (phạm vi của phiên, chuyển phiên), `harness-docs` (ba tầng, tài liệu của đơn vị, sổ vấn đề), `harness-diagrams` (sơ đồ), `harness-context` (kho ngữ nghĩa, soát sơ đồ tự sinh), `harness-portal` (dựng cổng) và `harness-mcp` (cổng tới các máy chủ MCP khác khai ở `.claude/project/mcp.json`). Cùng một tệp mồi chạy mọi máy chủ; khối là đối số cuối của mục trong `.mcp.json`.
- **Mỗi công cụ nằm ở đúng một máy chủ**, hợp lại vẫn đủ bộ công cụ cũ. Tắt một khối ở cấu hình dự án (`modules`) thì máy chủ của nó biến mất.
- **Tiền tố tên máy chủ khai được**: khóa `mcp.prefix` trong `project.json` (mặc định `harness`).
- **Chạy tệp mồi không đối số vẫn cho máy chủ cũ một cục**, để phiên đang mở và dự án chưa chuyển không gãy.
- **Hai bước chuyển cấu hình** cho dự án đã cài (lần đầu một bản thật dùng tính năng này): `.mcp.json` đổi tên mục `bsn-docs` thành `harness` (giữ mọi trường bạn đã thêm); `.claude/settings.json` đổi tên trong `enabledMcpjsonServers` và `permissions.allow`. Rồi bước `setup` của nâng cấp đặt đối số khối và thêm các máy chủ còn lại.

### Hành vi đổi
- Tên đầy đủ của công cụ là `mcp__<máy chủ>__<công cụ>`, ví dụ `mcp__harness-docs__design_record`. Công cụ của máy chủ phía sau cổng là `mcp__harness-mcp__<máy chủ>_<công cụ>`.
- Ba hook (đủ kiến thức, từ cấm, công cụ ghi ra ngoài) và sổ phiên nhận công cụ của mọi máy chủ của harness; mẫu của hook phủ cả máy chủ (`mcp__<máy chủ>__.*`), và vẫn phủ tên cũ `bsn-docs` để phiên chưa nối lại không mất chốt.
- Bộ cài (`setup`) sinh một mục cho mỗi khối đang bật. Mục `bsn-docs` mà chạy tệp mồi của harness được đổi tên thành máy chủ lõi `harness` (giữ trường bạn đã thêm như `env`); mục trùng tên của bạn mà không chạy tệp mồi thì giữ. `doctor` báo máy chủ nào còn thiếu và báo khi mục cũ còn nằm cạnh các máy chủ mới.
- Lời nhắc đầu phiên nêu số máy chủ và tổng số công cụ; dòng cảnh báo "phiên đang chạy máy chủ cũ" mang tên máy chủ cụ thể.

### Nâng cấp
- Từ 1.7.0: để agent làm theo lệnh `upgrade` như mọi lần (báo cáo từng mục, bạn duyệt, agent cài); hai bước chuyển cấu hình chạy trong lúc cài.
- Sau khi cài: mọi phiên Claude Code đang mở gõ `/mcp` (hoặc mở lại) một lần để thấy tên mới. Phiên chưa nối lại vẫn gọi được công cụ qua máy chủ cũ, và vẫn bị các hook chặn như trước.
- Việc cần làm tay: kịch bản, tài liệu hay quyền khai theo từng công cụ (`mcp__bsn-docs__<công cụ>`) đổi sang tên mới. Bước chuyển chỉ đổi quyền khai theo cả máy chủ (`mcp__bsn-docs`). Nếu bạn đặt `mcp.prefix` khác `harness`, bước chuyển vẫn đặt tên `harness` rồi bộ cài thêm các máy chủ theo tiền tố của bạn: xóa tay mục `harness` thừa.
- Mỗi phiên chạy thêm vài tiến trình Node (mỗi máy chủ một tiến trình).

### Đã kiểm
- Chạy thật từng máy chủ qua giao thức MCP: mỗi công cụ ở đúng một máy chủ, hợp lại đúng bộ công cụ cũ; máy chủ không đối số cho đúng bộ cũ; giết một máy chủ thì máy chủ khác vẫn trả lời; tắt một khối thì máy chủ và công cụ của nó biến mất; mẫu hook phủ mọi máy chủ; luật nhận cả tên cũ, tên theo khối, tiền tố khai riêng và không nhận máy chủ lạ.
- Bước chuyển cấu hình chạy trên dữ liệu thật của bản 1.x: giữ trường người dùng đã thêm, chạy lại không đổi thêm; bộ cài sau đó đặt đúng đối số khối.
- Bộ test phát triển, chạy cả bộ trên bản đã commit: 512 test; Linux (Docker, Node 24) 506 qua, 6 bỏ qua (cần lịch sử git của dự án nguồn), 0 hỏng; Windows 511 qua, 1 hỏng (ảnh chụp hành vi, một bước chỉ lệch khi máy đang chạy cả bộ test Linux cùng lúc: tình trạng nối của máy chủ cổng chưa kịp ghi) và chạy riêng lại thì qua. Từ lần chạy trọn đó chỉ đổi dòng này của sổ.
- Ảnh chụp hành vi chụp lại trên hai nền, 319 bước: bộ giả lập nối cả sáu máy chủ và gọi công cụ qua đúng máy chủ giữ nó. Sau khi quy tên máy chủ về một dạng, kết quả mọi lời gọi công cụ không đổi một ký tự; chỉ khác lời của lệnh tạo đơn vị mới, dòng MCP của tóm tắt đầu phiên, số bản và thứ tự sắp xếp.
- Bảy ca thử phá riêng của bản này (bỏ lọc theo khối, mẫu hook thiếu một máy chủ, luật chỉ nhận tên cũ, bộ cài gỡ cả mục của người dùng, quên đối số khối, bỏ đọc đối số, bước chuyển xóa thay vì đổi tên) đều bị test bắt.
- Một phiên Claude Code thật trên dự án cài mới: cả sáu máy chủ nối được, công cụ có tên mcp__harness-docs__..., mcp__harness__...; lời gọi ghi tài liệu khi chưa mở skill bị hook chặn và nói đúng còn thiếu gì.
- Cài đè 1.7.0 bằng 2.0.0 (lệnh cài trần, không qua lệnh nâng cấp) trên dự án có máy chủ của người dùng, trường env đã thêm và quyền riêng: máy chủ cũ được đổi tên thành máy chủ lõi giữ nguyên env, máy chủ và quyền của người dùng còn đủ, kiểm sức khỏe không lỗi.

### Chưa kiểm và giới hạn
- Chưa chạy trên dự án thật của người dùng khác. Chưa đo mức bộ nhớ tăng thêm của các tiến trình thêm trên máy yếu.
- Lệnh `upgrade` trọn vòng (báo cáo, duyệt, cài) từ 1.7.0 lên 2.0.0 bằng hai gói thật chưa được chạy; đã kiểm hai bước chuyển bằng dữ liệu thật của bản 1.x và lệnh cài trần bằng hai gói thật.
- Thêm một khối bật sau khi đã mở phiên cần mở lại phiên; cách Claude Code nối máy chủ mới giữa phiên chưa được kiểm.
- Quyền khai theo từng công cụ không tự đổi tên; chỉ quyền theo cả máy chủ được đổi.
- Luật mở rộng của dự án tự so tên máy chủ với `bsn-docs` sẽ không còn khớp: so theo tiền tố.

## 1.7.0 (2026-10-13)

Bản này bỏ bước người dùng phải tự chạy khi nâng cấp. Harness dựng sẵn bản mới ở nền, agent báo cáo cụ thể từng thay đổi và xin ý kiến, người dùng duyệt một câu trong khung chat, agent cài và kiểm; kiểm hỏng thì tự quay lại bản cũ.

### Có gì mới
- **Tờ thay đổi cho máy đọc.** Mỗi bản của gói kèm `.claude/modules/core/releases/<số bản>.json`: từng thay đổi có loại (thêm, đổi, bỏ, sửa lỗi), khối, tệp, hành vi trước và sau, khóa cấu hình và lệnh đổi, dự án đã cài thấy gì, điểm người dùng phải quyết, đã kiểm và chưa kiểm. Lệnh đóng gói từ chối khi bản đang đóng thiếu tờ, tờ thiếu trường, một tệp đã đổi không thuộc mục nào, hoặc một mục trỏ tới tệp không đổi. Gói này có tờ của bản 1.6.0 và 1.7.0.
- **Báo cáo nâng cấp theo từng mục thay đổi.** `upgrade preview` và `upgrade prepare` ghép các tờ của mọi bản đi qua với chính dự án: mục nào chạm tệp bạn đã sửa và gộp ra sao, khóa cấu hình nào dự án đang khai, khối nào dự án không cài, bước chuyển cấu hình sẽ sửa gì. Bản phát hành trước khi có tờ thì báo cáo nói rõ là chỉ có danh sách tệp. Bản cho máy: `briefing.json` trong thư mục dựng sẵn.
- **Agent cài sau khi người dùng duyệt.** `upgrade apply` chạy được trong phiên khi kế hoạch người dùng vừa duyệt của chính phiên đó ghi mã duyệt `upgrade:<bản>@<8 ký tự>`. Mã tính từ toàn bộ nội dung sắp cài; nội dung đổi sau lúc duyệt thì mã đổi. Lệnh còn đối chiếu gói trong thư mục dựng sẵn với kho gói từng tệp, và chỉ nhận kho gói dự án đã ghi nhận. Người dùng tự chạy lệnh ở terminal thì không cần mã.
- **Kiểm sau khi cài, hỏng thì tự quay lại.** Bước cài kiểm toàn vẹn cổng duyệt, kiểm sức khỏe và chạy các lệnh kiểm dự án tự khai (`upgrade.verify` trong `project.json`). Hỏng bước nào thì trả lại mã, skill và cấu hình như trước khi cài, in nguyên văn lỗi.
- **Bước chuyển cấu hình.** Khi một bản đổi tên khóa, công cụ hay máy chủ, tờ thay đổi của nó khai các thao tác trên `.mcp.json`, `.claude/settings.json` và tệp JSON trong `.claude/project/`; bước cài tự chạy, báo cáo nói trước sẽ sửa gì. Phần bạn tự thêm được giữ. Hai bản đầu chưa cần bước chuyển nào.
- **Tự dựng sẵn ở nền.** Khi kho gói có bản mới, harness dựng sẵn gói mới, phần đã gộp và báo cáo; đầu phiên có một dòng trỏ agent tới báo cáo. Khóa `upgrade.auto`: `prepare` (mặc định), `check`, `off`.
- **Lệnh mới:** `upgrade review` (đọc lại bản dựng sẵn sau khi xử lý chỗ đụng nhau, in mã duyệt), `upgrade decide <id> <giá trị>` (ghi câu trả lời của người dùng), `upgrade apply`, `upgrade auto`.

### Hành vi đổi
- Trong phiên Claude, `upgrade prepare` từ một kho gói chưa được ghi nhận bị từ chối cho tới khi người dùng duyệt kế hoạch có ghi mã `upgrade-source@...` của kho đó. `check` và `preview` vẫn chạy nhưng không ghi nhớ kho. Lệnh `install` chạy từ một bản clone tự ghi nhận nơi đó.
- Chạy thẳng `apply.js` của thư mục dựng sẵn trong một phiên Claude bị từ chối: đi qua `upgrade apply`.
- Cổng duyệt cho sửa tệp trong `overlay/` của một bản dựng sẵn khi chưa có lời duyệt (để agent xử lý chỗ đụng nhau trước khi trình). Phần còn lại của thư mục dựng sẵn và mã đang chạy vẫn sau cổng duyệt.
- Lệnh `install` dựng bản mới đủ ở thư mục cạnh bên rồi đổi chỗ: phiên đang mở chỉ gặp thư mục mã trống trong khoảng giữa hai lần đổi tên, không phải suốt lúc chép.
- Đầu phiên: dự án mà lệnh cài đã ghi nhận kho gói thì lần kiểm bản mới đầu tiên tự chạy, không cần ai chạy `upgrade check` trước.
- Lời của `upgrade preview` và `upgrade prepare` bắt đầu bằng báo cáo theo mục; phần theo từng tệp như cũ nằm sau, dưới tiêu đề "Theo từng tệp".

### Nâng cấp
- Từ 1.6.0: chạy từ bản clone của kho gói, `node <bản clone>/.claude/modules/core/cli/cli.js upgrade prepare --project <dự án>`, rồi `upgrade apply --project <dự án>` ở terminal. Bản 1.6.0 chưa có lệnh `apply`, nên lần này người dùng tự chạy; từ 1.7.0 trở đi agent làm trọn.
- Từ 1.5.0 trở về trước: như trên; báo cáo sẽ có mục của cả 1.6.0 và 1.7.0.
- Không có việc bắt buộc với cấu hình. Nên khai lệnh test của phần bạn đã sửa vào `upgrade.verify`.
- Phiên đang mở: gõ `/mcp` một lần nếu kết quả công cụ có dòng cảnh báo máy chủ cũ.

### Đã kiểm
- Bộ test phát triển: Windows 503 test, 503 qua; Linux (Docker, Node 24) 503 test, 497 qua, 6 bỏ qua (cần lịch sử git của dự án nguồn), 0 hỏng.
- Ảnh chụp hành vi chụp lại trên hai nền, 319 bước: 3 bước cũ đổi đúng chủ ý (số bản, dòng cách dùng), 4 bước mới của lệnh `upgrade`; các bước còn lại không lệch.
- Bài kiểm của bản này: mười bảy đường không có lời duyệt đúng đều bị từ chối và dự án không đổi một byte; sáu ca hỏng sau khi cài đều quay lại đúng từng tệp; tờ thay đổi của 1.6.0 và 1.7.0 được đối chiếu với các tệp thật sự đã đổi.
- Diễn tập bằng gói thật: cài 1.6.0, sửa tay ba tệp của gói, một skill và thêm một khối riêng, rồi lên 1.7.0; phần sửa tay còn đủ, kiểm sức khỏe không lỗi.
- Một phiên Claude Code thật trên dự án thử, đi từ 1.7.0 lên một bản thử có bước chuyển cấu hình và một điểm cần quyết: agent báo cáo theo từng mục, hỏi điểm cần quyết, trình kế hoạch có mã duyệt, cài sau lời duyệt; bước chuyển chạy đúng lựa chọn của người dùng.
- Bộ thử phá (cố ý làm hỏng mã để xem test có bắt không): mười bảy ca mới của bản này cùng một ca đối chứng, test bắt được cả mười tám, không ca nào lọt.

### Chưa kiểm và giới hạn
- Lời duyệt do một mô hình phán: nó có thể hiểu nhầm một câu trả lời là lời duyệt. Ở đây hiểu nhầm nghĩa là mã cổng duyệt bị thay. Mã duyệt gắn với nội dung, phép đối chiếu với kho gói và giới hạn kho gói thu hẹp rủi ro này, không xóa được.
- Mã duyệt là chốt chặn agent làm nhầm, không phải hàng rào: một tiến trình cố ý chép tệp bằng lệnh khác không đi qua nó.
- Lệnh đóng gói kiểm được tờ thay đổi đủ và trỏ đúng tệp; nó không kiểm được lời mô tả hành vi có đúng không.
- Gộp theo dòng không hiểu nghĩa: "gộp sạch" chưa chứng minh chạy đúng. Dự án không khai `upgrade.verify` thì phần đã sửa chưa được ai kiểm với bản mới.
- Trong khoảng giữa hai lần đổi tên thư mục mã, hook của phiên khác không tìm thấy tệp và được cho qua.
- Tự quay lại phủ mã, skill, cấu hình mà bước cài đã đổi; không phủ thứ một phiên khác sửa trong lúc đó.
- Chưa có lệnh dời ghi chép của đơn vị cũ sang `.harness/`. Chưa chạy trên macOS.

## 1.6.0 (2026-10-13)

Bản này dành cho dự án có hình dạng khác dự án nơi harness được viết ra, và cho dự án đã sửa mã của gói. Ba điều harness từng tự cho là đúng với mọi dự án nay khai được; và bản mới của gói không còn phải cài đè lên phần bạn đã sửa.

### Có gì mới
- **Nâng cấp có gộp.** Lệnh `node .claude/modules/core/cli/cli.js upgrade <status | check | preview | prepare>`. `status` liệt kê tệp của gói bạn đã sửa và khối bạn tự thêm. `check --fetch` xem kho gói có bản mới không. `preview` so ba bản của từng tệp (bản gốc của bản đang cài, bản trên đĩa, bản mới) và báo theo từng khối: tệp gói đổi, tệp bạn đã sửa, gộp sạch hay đụng nhau ở đâu; lệnh này không ghi gì vào mã. `prepare` dựng sẵn gói mới, bản đã gộp và một script đọc được để bạn tự chạy ở terminal. Hai bên cùng thêm một tên làm bản gộp không nạp được cũng bị bắt (kiểm cú pháp bản gộp). Cần một bản clone git của kho gói có đủ lịch sử. Skill `harness-upgrade` dạy agent làm trọn việc này.
- **Báo có bản mới ở đầu phiên.** Sau lần `upgrade check` đầu tiên, mỗi ngày harness kiểm lại ở nền (chỉ lấy bản mới về bản clone) và tóm tắt đầu phiên có một dòng khi có bản mới. Harness không bao giờ tự nâng cấp. Tắt: biến môi trường `BSN_UPGRADE_AUTOCHECK=0`.
- **`CHANGED.md` ở gốc gói.** Máy sinh từ lịch sử của dự án nguồn: tệp mã thêm, sửa, bỏ và tên hàm công khai thêm, bỏ so với bản trước. Tên hàm công khai (hàm tìm đường dẫn, các cổng, hợp đồng khối mở rộng) từ bản này chỉ thêm, không đổi, không bỏ.
- **Mã nằm ngoài thư mục mở phiên.** Khai `"workspace": { "root": "../code" }` (tương đối, được đi ra ngoài, hoặc tuyệt đối) trong `project.json`: đường dẫn của đơn vị tính từ đó; thư mục mở phiên vẫn giữ `.claude/`, trạng thái, tài liệu chung và cổng HTML. Khi có gốc mã riêng, `units.parents` nhận `"."` (các repo nằm ngay dưới gốc mã).
- **Phần tại chỗ của đơn vị gom trong `<đơn vị>/.harness/`.** Tệp cửa vào ở `.harness/CLAUDE.md`, ghi chép ở `.harness/docs/` (sổ trạng thái, ba tầng, `service.yaml`, sơ đồ, từ vựng), cạnh khối mở rộng đã có từ 1.1.0. Thư mục `docs/` và `CLAUDE.md` ở gốc đơn vị khi đó là của repo, harness không đọc, không giữ. Khai `units.layout` (`harness`, `legacy`), `units.entry` (tên tệp cửa vào); từng đơn vị khai riêng được trong `units.dirs`.
- **Ghi chép không vào git của đơn vị.** `"units": { "docs": "local" }`: `new-service.js` ghi `/.harness/` vào `.git/info/exclude` của đơn vị (không sửa `.gitignore` của repo); cổng HTML và kho ngữ nghĩa đọc phần đó từ đĩa thay vì từ bản đã commit.
- **Cổng duyệt khai được, chỉ chặt hơn.** Trong `gate.config.json`: `plan.heading` và `plan.labels` (tên gọi khác của tiêu đề và sáu mục, ví dụ tiếng Anh), `plan.extra` (mục bắt buộc thêm), `judge` (`model` mặc định, hoặc `strict` không gọi model nào), `approveWords` (câu duyệt của dự án, khớp cả câu). Một đơn vị đòi thêm mục cho kế hoạch nêu tên nó: khóa `plan.extra` trong `module.json` của khối mở rộng đã được người dùng xác nhận. Không khóa nào bớt được một mục gốc hay tắt được bước duyệt.
- **Kiểm sức khỏe thấy nhiều hơn.** `doctor` nêu tệp của gói đã bị sửa, khối tự thêm, tệp của gói đang thiếu, gốc mã khai sai, đơn vị có ghi chép ở cả hai chỗ, đơn vị khai ghi chép tại chỗ mà git vẫn thấy.

### Hành vi đổi
- **Đơn vị CHƯA có gì của harness (không có `docs/`, không có tệp cửa vào ở gốc) từ nay được dựng khung trong `.harness/`.** Đơn vị đã có `docs/` hay tệp cửa vào ở gốc giữ nguyên bố cục cũ, không bị đổi chỗ. Muốn mọi đơn vị mới vẫn theo bố cục cũ: khai `"units": { "layout": "legacy" }`. Khuôn `project.json` của bản cài mới khai sẵn `"layout": "harness"`.
- `new-service.js` chạy trên một thư mục đã có sẵn mã và theo bố cục `.harness/` thì không tạo `.gitignore` ở gốc đơn vị nữa (tệp đó là của repo).
- Lệnh `install` giữ lại khối bạn tự thêm vào `.claude/modules/` (thư mục có `module.json` mà gói không có). Tệp lẻ bạn thêm vào khối của gói và tệp của gói bạn đã sửa vẫn bị thay khi dùng `install` trần (bản cũ nằm ở chỗ cất): dùng `upgrade` để giữ.
- Máy chủ công cụ trả lời hết các lời gọi đang xử lý rồi mới thoát khi đầu vào đóng (trước đây một phép thử gửi dồn rồi đóng ống chỉ nhận được lời đáp đầu).
- Tệp nằm ở gốc mã khai riêng được các luật coi là trong dự án (chặn sửa tay tệp do công cụ sở hữu, tài liệu phải đọc trước khi sửa, quét từ cấm). Mẫu `skills.files` và `policies.unitSheets` cho tệp ở đó tính trên đường dẫn từ gốc mã.
- Bộ phán `strict`: mọi tin không phải lời duyệt được coi là việc mới, nên cổng đang mở thì đóng lại; kế hoạch đang chờ vẫn chờ thêm vài lượt.
- Lời của công cụ và hook nêu đường dẫn thật của ghi chép (`.harness/docs/...` ở bố cục mới). Ở bố cục cũ lời in ra không đổi một ký tự.

### Nâng cấp
- Từ 1.5.0, chưa sửa mã của gói: `node <gói>/.claude/modules/core/cli/cli.js install <dự án>` rồi `--apply` như trước.
- Đã sửa mã của gói, hoặc có tệp tự thêm: chạy từ bản clone của kho gói (bản đang cài chưa có lệnh này): `node <bản clone>/.claude/modules/core/cli/cli.js upgrade preview --project <dự án>`, rồi `upgrade prepare --project <dự án>`, sửa chỗ đụng nhau trong thư mục dựng sẵn, và tự chạy script lệnh in ra. Từ bản này trở đi lệnh chạy ngay trong dự án.
- Dự án đã tự thêm khóa `workspace.root` bằng cách sửa mã: cùng tên khóa, cùng nghĩa; bỏ phần sửa tương ứng. Hàm của gói là `workspaceRoot(root)` với `root` vẫn là thư mục mở phiên (không đổi nghĩa của `root`).
- Không có việc bắt buộc với cấu hình: mọi khóa mới đều có mặc định là hành vi cũ, trừ điều thứ nhất ở "Hành vi đổi".
- Phiên đang mở: gõ `/mcp` một lần nếu kết quả công cụ có dòng cảnh báo máy chủ cũ.

### Đã kiểm
- Bộ test phát triển: Windows 489 test, 489 qua; Linux (Docker, Node 24) 489 test, 484 qua, 5 bỏ qua (cần lịch sử git của dự án nguồn), 0 hỏng.
- Ảnh chụp hành vi của một dự án theo bố cục cũ (313 bước qua mọi cửa vào) không lệch một ký tự so với bản 1.5.0.
- Một dự án thử cố ý khác dự án nguồn (thư mục mở phiên và gốc mã tách nhau, repo có sẵn `docs/` và `CLAUDE.md` của nhóm, ghi chép tại chỗ): chạy lệnh tạo khung, máy chủ công cụ thật, luật, dựng cổng và kho ngữ nghĩa, rồi soát từng tệp được tạo: không tệp nào của harness nằm ngoài `.harness/` của đơn vị, tệp của nhóm không đổi một byte, `git status` của repo sạch.
- Nâng cấp: bảng quyết định đủ mọi tổ hợp của ba bản, kèm bất biến "tệp bạn đã sửa không bao giờ bị thay hay bị xóa"; một kho gói git hai bản và một dự án đã sửa theo mười bảy kiểu, chạy trọn tới script (từ chối khi còn chỗ đụng nhau, khi mã gộp không nạp được, khi tệp đổi sau lúc dựng sẵn).
- Diễn tập nâng cấp thật: một dự án cài bản 1.5.0 từ kho gói, sửa tay bốn tệp của gói, thêm một khối riêng và một tệp vào khối của gói, sửa một skill; lên 1.6.0 bằng gói đóng thật. Xem trước báo gói đổi 55 tệp, phần của dự án 8 tệp, gộp sạch 2, cần người xem 2. Script từ chối chạy khi còn dấu đụng nhau, rồi từ chối lần nữa khi bản đã sửa vẫn trùng một tên hàm với gói; sau khi sửa thì cài xong, phần của dự án còn đủ, kiểm sức khỏe không có lỗi.
- Thử phá 14 chỗ ở phần mới (và một đối chứng): bộ test bắt đủ 14, đối chứng xanh.
- Cổng duyệt: hai mươi ba khai báo cố bớt mục hay tắt bước duyệt đều cho ra đúng khuôn gốc sáu mục bắt buộc.

### Chưa kiểm và giới hạn
- Chưa chạy lệnh `upgrade` trên một dự án thật của người dùng khác; chưa chạy bằng phiên Claude Code thật; chưa chạy trên macOS.
- Gộp theo dòng không hiểu nghĩa: "gộp sạch" và "qua kiểm cú pháp" chưa chứng minh hành vi đúng. Sau khi nâng cấp phải chạy test của phần bạn đã sửa.
- Bước cài cuối cùng do người dùng tự chạy ở terminal: một phiên Claude Code không tự thay được harness của chính nó.
- Ghi chép tại chỗ: cổng HTML chỉ dựng lại sau một commit hoặc khi chạy `cli.js portal`, nên ghi chép vừa đổi chưa lên trang ngay. Công cụ `diagram_generate` không chạy lệnh tạo bảng ở chế độ này (dùng dòng lệnh). Lịch sử sơ đồ dựa vào git nên không có.
- Chưa có lệnh dời ghi chép của một đơn vị từ bố cục cũ sang `.harness/`; đơn vị cũ và đơn vị mới của cùng một dự án có thể ở hai bố cục.
- Bộ sinh trang riêng của đơn vị vẫn nằm ở `.claude/project/generators/`, chưa dời về `.harness/`. Skill riêng của đơn vị đặt ở `.harness/skills/` chưa được harness nạp hay nhắc.
- Chưa làm: sổ phiên sống qua lần nén ngữ cảnh; bộ nhận dạng ngôn ngữ khác cho kho ngữ nghĩa; bảng phiên lọc theo thư mục mở phiên.
- Định danh `bsn-docs` và các biến môi trường như `BSN_SERVICE` giữ nguyên như 1.5.0.

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
