# Mở rộng harness mà không sửa mã của gói

| Bạn cần | Cách làm | Bản mới của harness |
|---|---|---|
| Dạy agent cách làm một loại việc | Skill: [02](02-skill-toan-cuc.md), [03](03-skill-theo-repo.md) | Giữ nguyên |
| Đổi hình dạng dự án (đơn vị ở đâu, tên gọi, ngôn ngữ, khối bật) | Khai trong `project.json` | Giữ nguyên |
| Chặn thêm một việc, thêm công cụ hay lệnh riêng | Khối mở rộng (mục 1) | Giữ nguyên |
| Dùng thêm một máy chủ MCP (trình duyệt, API khác) | `mcp add` (mục 2) | Giữ nguyên |
| Tắt khối không dùng, đổi tiền tố tên máy chủ | `modules`, `mcp.prefix` (mục 3) | Giữ nguyên |
| Đổi cách một phần của gói hoạt động mà cấu hình không với tới | Sửa tệp của gói (mục 4) | Gộp ba bên khi nâng cấp |

Bộ khung không đổi theo dự án: quy trình yêu cầu, kế hoạch, duyệt, đăng ký phạm vi, làm; ba chỗ đặt (`.claude/modules/`, `.claude/project/`, `<đơn vị>/.harness/`); hợp đồng khối. Khối mở rộng chỉ chặn THÊM: không có cách nào nới luật của harness hay làm một mục của kế hoạch thành tùy chọn.

## 1. Khối mở rộng: luật, công cụ, lệnh
Hai chỗ đặt, cùng một khuôn `module.json`:
| Chỗ | Áp cho | Khóa |
|---|---|---|
| `.claude/project/extensions/<tên>/` | Cả dự án, mọi loại sự kiện | `project:<tên>` |
| `<đơn vị>/.harness/` | Chỉ việc đụng tới đơn vị đó; chỉ trước và sau một hành động | `unit:<đơn vị>` |

**Dựng khối cho cả dự án:**
```
node .claude/modules/core/cli/cli.js extension new nho
```
Lệnh chép khối mẫu vào `.claude/project/extensions/nho/` (hai luật, một công cụ chỉ đọc, một lệnh, ca thử ở `cases.json`). Sửa cho đúng việc của bạn.

**Dựng khối cho một đơn vị:** `extension new --unit <đơn vị>` chỉ làm khi thư mục `<đơn vị>/.harness/` CHƯA có. Đơn vị đã được dựng khung bằng `new-service.js` thì đã có `.harness/` và lệnh từ chối ghi đè. Khi đó chép khối mẫu (`.claude/modules/core/product/examples/extension/`) vào `<đơn vị>/.harness/` rồi sửa `module.json`: `"scope": "unit"` và `"name": "<tên đơn vị>"` (khai `project` hay tên khác thì `extension list` báo LỖI "tên theo chỗ đặt là ...").

`module.json`:
```json
{ "name": "web", "api": "1.0", "scope": "unit", "rules": ["rules/khong-ghi-vendor.js"], "tools": ["tools/dem-tep.js"], "commands": ["commands/tom-tat.js"], "timeout": 2 }
```
| Phần | Tệp xuất | Ghi chú |
|---|---|---|
| Luật | `{ id, on: [loại sự kiện], matcher?, run(ctx) }` | `run` trả `ctx.block(lý do)`, `ctx.ask(lý do)`, `ctx.note(lời)` hoặc `null` |
| Công cụ | `{ name, description, inputSchema?, write?, run(args, ctx) }` | Tên trên máy chủ của khối lõi là `<tên khối>_<name>` |
| Lệnh | `{ name, description, run(argv, ctx) }` | `cli.js extension run <khóa> <name> [...]` |

Hợp đồng đầy đủ của `ctx` (đọc tệp, git, đơn vị chứa tệp) và các loại sự kiện: mục "Khối mở rộng" của `FORMAT.md`. Mã hook chạy ở mọi lần ghi tệp, nên luật phải nhanh: quá `timeout` (mặc định 2 giây, tối đa 5), ném lỗi hay trả sai hợp đồng thì bị bỏ qua và ghi vào sổ lỗi.

**Chạy thử, không cần phiên thật:**
```
node .claude/modules/core/cli/cli.js extension test project:nho
node .claude/modules/core/cli/cli.js extension test unit:web
```
Lệnh chạy các ca ở `cases.json` (`{ name, event: { kind, action: { type, file } }, expect: "deny" | "ask" | "note" | "block" | "pass" }`) và in ĐẠT hay không. Thêm ca cho mọi luật chặn bạn viết, kể cả ca "được qua".

**Xác nhận (chỉ người dùng, ở terminal, ngoài phiên Claude):**
```
node .claude/modules/core/cli/cli.js extension trust project:nho
```
Khối mới hay vừa sửa CHƯA chạy cho tới khi bạn xác nhận. Xác nhận chép khối sang `.claude/local/extensions/` (chỉ ở máy, không commit) và chạy `setup`; mã luôn chạy từ bản đã chép, nên sửa hay xóa khối trong repo không đổi mã đang chạy cho tới khi bạn xác nhận lại. Agent chỉ đưa lệnh cho bạn, không tự chạy được. Mỗi người trong nhóm xác nhận một lần trên máy mình.

`extension list` cho biết khối nào chưa xác nhận, đã sửa sau xác nhận, hay khai báo hỏng.

Luật kiểu cũ ở `.claude/project/rules/<id>.js` (`{ id, on, api: "0.1", matcher?, run(event, ports) }`) vẫn chạy, không cần xác nhận; dự án mới nên dùng khối mở rộng.

## 2. Máy chủ MCP ngoài
Harness có một máy chủ MCP cho mỗi khối đang bật, và `harness-mcp` là cổng: máy chủ MCP khác khai ở `.claude/project/mcp.json` chạy phía sau nó, có hiệu lực ở phiên đang mở mà không phải nối lại.
```
node .claude/modules/core/cli/cli.js mcp add pw --command npx --arg @playwright/mcp@latest
node .claude/modules/core/cli/cli.js mcp add api --url https://may-chu/mcp --header "Authorization=Bearer ${TEN_BIEN}"
node .claude/modules/core/cli/cli.js mcp list
```
- `mcp add` chỉ KHAI; máy chủ chưa chạy. Lệnh in một mã dạng `mcp:<tên>@<8 ký tự>`.
- Trong phiên Claude: agent trình kế hoạch ghi mã đó và lệnh chạy hay địa chỉ của máy chủ, bạn duyệt, rồi `mcp trust <tên>` (agent chạy được khi kế hoạch đã duyệt nêu đúng mã; hoặc bạn chạy ở terminal).
- Khóa truy cập không bao giờ ghi vào tệp: đặt ở biến môi trường của máy, trong khai báo viết `${TÊN_BIẾN}`. `mcp add` từ chối giá trị trông như khóa.
- Công cụ ghi ra hệ thống khác khai bằng `--writes <mẫu>`: gọi chúng cần một kế hoạch đã duyệt, như một lần sửa tệp.
- Tên đầy đủ của công cụ ở phiên: `mcp__harness-mcp__<tên máy chủ>_<công cụ>`.
- Máy chủ hỏng thì cổng bỏ qua, các máy chủ khác vẫn chạy; `mcp list` ghi tình trạng.
- Kết nối của tài khoản claude.ai (cần đăng nhập) do bạn nối trên web; harness chỉ ghi nhận đã dùng, không điều khiển.

Cách làm từng bước: skill `mcp-servers`.

## 3. Bật, tắt khối và đặt tiền tố
`project.json`:
```json
{ "modules": ["core", "servicedocs", "guard-push"], "mcp": { "prefix": "harness" } }
```
- `modules`: khối được bật; không khai thì mọi khối có. `core` luôn bật. Khối bật mà khối nó dùng không bật thì bị tắt theo và `doctor` nêu.
- Khối: `core` (cổng duyệt, phạm vi, chặn theo skill, sổ phiên, máy chủ MCP, bộ cài), `servicedocs` (tài liệu ba tầng), `diagrams`, `context` (kho ngữ nghĩa), `portal` (trang HTML), `guard-push` (từ cấm, chặn đẩy).
- Đổi xong chạy `node .claude/modules/core/cli/cli.js setup` để viết lại hook, `.mcp.json` và quyền, rồi mở lại phiên Claude (máy chủ của khối bật thêm hay tắt đi cần nối lại).
- `mcp.prefix`: tiền tố tên máy chủ (mặc định `harness`): máy chủ lõi mang tên đó, các khối khác là `<tiền tố>-<khối>`. Đổi tiền tố thì tên đầy đủ của mọi công cụ đổi theo.
- Khối riêng của bạn: `.claude/modules/<tên>/module.json` khai hook, công cụ, lệnh, skill; bộ cài đọc nó như các khối của gói. Chỉ dùng khi khối mở rộng ở mục 1 không đủ.

## 4. Sửa mã của gói
Được phép. `upgrade status` và `doctor` liệt kê tệp của gói bạn đã sửa. Bản mới không đè lên phần đó: nâng cấp dựng bản gộp ba bên, agent xử lý chỗ đụng nhau, báo bạn từng mục và bạn duyệt rồi mới cài. Giữ cho dễ gộp:
- Sửa ít, tập trung; không đổi tên hàm công khai.
- Khai lệnh test phần đã sửa vào `upgrade.verify` (`[["npm", "test"]]`) để bước cài kiểm nó và tự quay lại khi hỏng.
- Việc cấu hình hay khối mở rộng làm được thì đừng sửa gói.
Đọc `RELEASES.md` ("Nâng cấp") và `CHANGED.md` đi kèm gói (tệp nào đổi, tên xuất nào thêm hay bỏ giữa hai bản) trước khi nâng cấp phần bạn đã sửa.

## 5. Bộ sinh trang riêng của đơn vị
Trang HTML ba tab của một đơn vị có bộ sinh mặc định. Đơn vị cần phần riêng (thêm mục, đổi cách trình bày) thì đặt bộ sinh ở `.claude/project/generators/<đơn vị>/`; mã trong repo của đơn vị chưa xác nhận không bao giờ được chạy. Cách làm: skill `service-page`.
