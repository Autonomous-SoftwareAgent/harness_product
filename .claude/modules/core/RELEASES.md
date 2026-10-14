# Sổ phát hành của harness_product

Mỗi bản một mục, bản mới nhất ở trên. Mục nào cũng có đủ năm phần: có gì mới, hành vi đổi, nâng cấp phải làm gì, đã kiểm bằng gì, điều chưa kiểm và giới hạn. Lệnh đóng gói từ chối khi số bản đang đóng gói chưa có mục ở đầu sổ này hoặc mục thiếu phần, nên không có bản nào ra ngoài mà không kèm báo cáo.

Cách đọc số bản `A.B.C`: `A` đổi khi nâng cấp cần làm tay một việc ngoài lệnh `install`; `B` đổi khi có tính năng mới; `C` đổi khi chỉ sửa lỗi. Số bản nằm ở `.claude/modules/VERSION` của gói và trong dòng đầu của `doctor`.

Số test ở phần "Đã kiểm" là của bộ test phát triển, chạy ở dự án nguồn; bộ test đó không đi kèm gói. Trong dự án đã cài, phép kiểm là `node .claude/modules/core/cli/cli.js doctor`.

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
