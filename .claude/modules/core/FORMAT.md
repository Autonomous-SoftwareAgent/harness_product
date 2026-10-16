# Khuôn làm việc chung của harness

Tờ này nói một dự án dùng harness được tổ chức thế nào: tệp nào có ở đâu, ai ghi, bắt buộc hay tùy chọn. Mọi công cụ, hook và skill của harness đọc và ghi theo đúng khuôn này. Chỗ duy nhất mỗi dự án tự quyết là **đơn vị nằm ở đâu** và **việc nào cần skill nào**: khai trong `.claude/project/project.json` (mục "Cấu hình dự án" bên dưới).

Dự án mới chưa có gì trong khuôn thì không chép từ dự án khác: skill `onboard` dẫn agent đọc dự án, trình kế hoạch, rồi dựng phần còn thiếu bằng chính công cụ của harness.

## Từ ngữ
- **Đơn vị** (hay dịch vụ): một phần của dự án có mã, tài liệu và nhịp sửa riêng, thường là một repo git riêng. Mọi luật "một phiên một đơn vị", "đọc tài liệu trước khi sửa", "sửa trong phạm vi kế hoạch" tính theo đơn vị.
- **Gốc dự án**: thư mục chứa `.claude/` và `.mcp.json`. Phiên Claude Code luôn mở ở đây (hook và MCP chỉ nạp ở gốc).
- **Ghi qua công cụ**: tệp chỉ được ghi bằng công cụ MCP của harness (hook chặn ghi tay, `docs check` phát hiện lệch bằng băm).

## Ở gốc dự án

| Tệp | Là gì | Ai ghi | Bắt buộc |
|---|---|---|---|
| `.claude/modules/<khối>/` | Mã của harness chia theo khối, kèm `module.json` (tệp tự khai: hook, công cụ, lệnh, skill của khối); `index.json`, `FILES.json`, `MANIFEST.json`, `VERSION` | Bộ cài (`install`); bản mới thay toàn bộ | Có |
| `.claude/project/` | Phần của dự án: `project.json`, công tắc, khối mở rộng `extensions/`, luật kiểu cũ `rules/`, bộ sinh trang riêng `generators/`. Nâng cấp không bao giờ đụng | Agent qua skill `onboard`, người dùng | Có |
| `.claude/project/project.json` | Cấu hình dự án | Agent qua skill `onboard`, sau khi người dùng duyệt | Có |
| `.claude/skills/`, `.claude/settings.json` | Skill (chỗ Claude Code đọc); khai hook. Bộ cài (`setup`) viết phần của harness, giữ phần của dự án | Bộ cài, dự án | Có |
| `.claude/rules/harness-skills.md` | Bảng "việc gì thì mở skill nào", Claude Code nạp ngay từ đầu phiên. `setup` SINH từ các skill đang cài ở `.claude/skills/` (tên và mô tả đầu); không chỉnh tại chỗ, sửa skill rồi chạy lại `setup`. `doctor` báo lệch | Bộ cài | Có |
| `.mcp.json` | Khai các máy chủ MCP của harness (mỗi khối đang bật một mục, đối số cuối là tên khối) | Harness tự tạo hay tự thêm mục khi mở phiên | Có |
| `CLAUDE.md` | Luật chung của dự án: quy trình duyệt kế hoạch, một phiên một đơn vị, đọc gì trước khi sửa, việc gì dùng skill nào | Agent (onboard), người dùng duyệt | Có |
| `docs/handoff/` | Yêu cầu giữa các phiên: một tờ một việc, có dòng `Trạng thái: open` hoặc `done` | Mọi phiên | Khi có việc chéo đơn vị |
| `docs/system/decisions.md` | Quyết định chung của cả dự án, mỗi mục `## S-nnn: tiêu đề`; chỉ thêm, đổi ý thì ghi mục mới | Agent khi người dùng chốt | Khi có quyết định chung |
| `docs/portal/` | Cổng HTML cho người đọc, sinh tự động sau mỗi commit | Công cụ | Không (bật khi dùng `service.yaml`) |
| `.claude/local/cam-tu.json` | Danh sách từ cấm của máy, không bao giờ commit | Chỉ người dùng, ngoài Claude | Không |
| `.claude/local/extensions/` | Bản đã xác nhận của các khối mở rộng và sổ xác nhận; mỗi máy một bản, không commit | Chỉ người dùng (`extension trust`), ngoài Claude | Không |

## Trong mỗi đơn vị

Bảng dưới viết đường dẫn theo TÊN LOGIC. Ở bố cục gom (`units.layout: "harness"`, mặc định của dự án mới) mọi thứ trong bảng nằm trong `<đơn vị>/.harness/`: `CLAUDE.md` là `.harness/CLAUDE.md`, `docs/...` là `.harness/docs/...`; thư mục `docs/` và `CLAUDE.md` ở gốc đơn vị khi đó là của repo, harness không đụng. Ở bố cục cũ (`legacy`) đường dẫn đúng như bảng.

| Tệp | Là gì | Ai ghi | Bắt buộc |
|---|---|---|---|
| `CLAUDE.md` | Cửa vào duy nhất của đơn vị; bốn mục `## Phạm vi`, `## Đọc gì khi nào`, `## Quy tắc riêng`, `## Lệnh thường dùng` | Agent, tay | Có |
| `docs/agent/STATUS.md` | Đang làm dở gì, việc còn mở, điều chưa kiểm, nhật ký (ngày, đổi gì, kiểm bằng gì) | Agent, tay | Có |
| `docs/agent/DECISIONS.md` | Quyết định riêng của đơn vị | Agent, tay | Khi có |
| `docs/agent/CONVENTIONS.md` | Quy ước mã: các lớp nằm ở thư mục nào, test giữ ranh giới nào | Agent, tay | Nên có trước khi viết mã |
| `docs/modules/<phần>/1-design.md`, `2-spec.md`, `3-impl.md` | Ba tầng: thiết kế chốt trước; đặc tả và hiện thực chỉ điền sau khi có mã | Công cụ (`design_record`, `spec_fill`, `impl_link`) | Tùy chọn |
| `docs/service.yaml` | Nguồn có cấu trúc: nghiệp vụ, kiến trúc, tiến độ, sổ vấn đề `P-nnn` | Công cụ (`service_doc_set`, `problem_record`) | Tùy chọn (cần cho trang trên cổng) |
| `docs/diagrams/<id>.yaml` | Sơ đồ khai bằng dữ liệu; công cụ vẽ | Công cụ (`diagram_save`, `diagram_explain`) | Tùy chọn |
| `docs/context/` | Từ vựng và quan hệ cho kho ngữ nghĩa | Công cụ (`context_term`, `context_relate`) | Tùy chọn |
| `docs/_generated/` | Bản tổng quan và bảng truy vết sinh tự động | Công cụ | Đi kèm khi dùng ba tầng hay `service.yaml` |
| `.harness/` | Khối mở rộng của đơn vị: luật, công cụ, lệnh riêng (mục "Khối mở rộng" bên dưới). `docs/` là dữ liệu để đọc; `.harness/` là phần chạy được | Phiên của đơn vị; chỉ chạy sau khi người dùng xác nhận | Không |

"Tùy chọn" nghĩa là dự án bật khi cần. Đơn vị chỉ có `CLAUDE.md` và `STATUS.md` vẫn được mọi hook bảo vệ đầy đủ; dùng công cụ ghi tài liệu lần đầu thì công cụ tự tạo khung còn thiếu. Mã nguồn đánh dấu đặc tả bằng một dòng chú thích `spec: <MÃ>-S-nnn` khi đơn vị dùng ba tầng.

## Cấu hình dự án: `.claude/project/project.json`

```json
{
  "name": "Tên hiển thị của dự án",
  "preset": "full",
  "lang": "vi",
  "modules": ["core", "servicedocs", "diagrams", "context", "portal", "guard-push"],
  "defaultUnit": "",
  "units": { "parents": ["apps", "services"], "dirs": { "shared": "libs/shared" } },
  "skills": {
    "mode": "enforce",
    "overview": "services",
    "serviceDocs": ["CLAUDE.md", "docs/agent/STATUS.md"],
    "unitDocs": { "web": ["CLAUDE.md", "docs/agent/STATUS.md", "docs/agent/UI.md"] },
    "tools": { "design_*": "service-docs", "diagram_save": ["diagrams", "service-docs"], "mcp__github__create_pull_request": "release" },
    "readonly": ["docs_status", "context_explore"],
    "files": [{ "pattern": "^db/migrations/", "skills": ["db"], "reads": ["docs/agent/DB.md"] }]
  },
  "policies": { "rootNeverPush": false, "docsNeverPush": false, "unitSheets": [], "readOnlyDirs": ["vendor"] }
}
```

| Trường | Nghĩa |
|---|---|
| `preset` | Bộ khuôn có sẵn: `full` (mọi khối, luật repo gốc không đẩy và `docs/` không lên remote bật) hoặc `light` (chỉ lõi và chặn đẩy; mỗi đơn vị chỉ cần `CLAUDE.md`, `STATUS.md`). Khóa nào dự án khai thì thắng bộ khuôn |
| `lang` | Ngôn ngữ của lời chặn và lời nhắc của hook: `vi` (mặc định) hoặc `en`. Tên mục của khuôn kế hoạch mặc định là tiếng Việt; tên gọi khác khai ở cấu hình cổng duyệt (`plan.labels`) |
| `modules` | Khối được bật; không khai là mọi khối đang có. `core` luôn bật; khối bật mà khối nó dùng không bật thì bị tắt theo (`doctor` nêu). Đổi xong chạy `cli.js setup` để viết lại hook |
| `mcp.prefix` | Tiền tố tên các máy chủ MCP của harness (mặc định `harness`): khối lõi mang tên đó, các khối khác `<tiền tố>-<khối>` (`harness-docs`, `harness-diagrams`, `harness-context`, `harness-portal`), cổng tới máy chủ khác là `<tiền tố>-mcp`. Đổi xong chạy `cli.js setup` rồi mở lại phiên |
| `units.parents` | Thư mục chứa đơn vị: mỗi thư mục con (tên chữ thường, số, gạch ngang) là một đơn vị. Thư mục đầu là nơi đơn vị mới được tạo |
| `units.dirs` | Đơn vị nằm ở chỗ riêng: `{ tên: thư mục }`, hoặc `{ tên: { "dir": ..., "reads": [tệp ngoài thư mục mà kho ngữ nghĩa đọc thêm] } }` |
| `defaultUnit` | Đơn vị mặc định của công cụ ghi tài liệu khi không truyền `service`; rỗng là luôn phải truyền |
| `skills.mode` | `enforce` (chặn), `remind` (chỉ nhắc), `off` |
| `skills.overview` | Skill tổng quát, cần cho mọi việc có yêu cầu |
| `skills.serviceDocs` | Tài liệu phải đọc (bằng công cụ Read) trước khi sửa một đơn vị, đường dẫn trong đơn vị |
| `skills.unitDocs` | Thay `serviceDocs` cho riêng một đơn vị |
| `skills.tools` | Công cụ nào cần skill nào. Khóa là tên công cụ của harness (`design_record`) hoặc tên đầy đủ của công cụ bất kỳ (`Bash`, `mcp__<máy chủ>__<tên>`); dấu `*` khớp mọi chuỗi; giá trị là một skill hoặc danh sách skill. Công cụ ngoài harness phải có trong matcher của nhóm hook `guard-skill.js` ở `.claude/settings.json` (lệnh `doctor` báo khi thiếu); hiện chưa có khóa khai thêm bền, và `setup` hay nâng cấp viết lại phần hook của harness nên matcher thêm tay phải thêm lại (xem `guides/02-skill-toan-cuc.md`) |
| `skills.readonly` | Công cụ chỉ đọc, không bao giờ bị chặn (thắng mẫu `*`) |
| `skills.files` | Mẫu đường dẫn (biểu thức chính quy, tính từ gốc) cần thêm skill và tài liệu phải đọc. `reads` tính trong đơn vị chứa tệp, hoặc từ gốc nếu tệp không thuộc đơn vị nào. `serviceDocs: false` thì không đòi tài liệu của đơn vị |
| `harness-files`, `harness-reads` (đầu tệp `<đơn vị>/.harness/skills/<tên>/SKILL.md`) | Điều kiện ép của skill riêng của đơn vị, một dòng mỗi trường, giá trị là mảng JSON hoặc chuỗi trần. `harness-files`: mẫu đường dẫn TÍNH TỪ GỐC ĐƠN VỊ; `harness-reads`: tài liệu phải đọc thêm trong đơn vị. Hook chặn theo skill gộp chúng vào `skills.files` (thêm mẫu, không bớt dòng nào của bảng gốc); bản sinh cho công cụ không có hai dòng này. Ghi bằng công cụ `host_define` (tham số `enforce`) |
| `policies.rootNeverPush` | Repo gốc không bao giờ được đẩy lên remote |
| `policies.docsNeverPush` | Nội dung `docs/` ở gốc không bao giờ lên remote, kể cả bản chép trong repo khác |
| `policies.unitSheets` | Mẫu đường dẫn của "tờ của một đơn vị" nằm trong thư mục đơn vị khác; nhóm bắt đầu tiên là tên đơn vị chủ |
| `policies.readOnlyDirs` | Thư mục chỉ để đọc (mã bên ngoài để tham khảo): sửa ở đó thì hỏi người dùng |
| `workspace.root` | Gốc mã, khi mã KHÔNG nằm trong thư mục mở phiên: đường dẫn tuyệt đối, hoặc tương đối tính từ thư mục mở phiên (được đi ra ngoài, ví dụ `../code`). Khai thì `units.parents` và `units.dirs` tính từ đó; thư mục mở phiên vẫn giữ `.claude/`, trạng thái, tài liệu chung và cổng HTML. Không khai: gốc mã là thư mục mở phiên. Khai sai (không phải thư mục, trỏ vào `.claude/`) thì harness ở lại thư mục mở phiên và `doctor` báo LỖI |
| `units.parents` có `"."` | Chính gốc mã là thư mục chứa đơn vị (các repo nằm ngay dưới nó). Chỉ nhận khi có `workspace.root` |
| `units.dirs` dạng đầy đủ | Thêm `"base": "home"` (đơn vị nằm ở thư mục mở phiên dù dự án có gốc mã riêng), `"layout"`, `"docs"` (khai riêng cho đơn vị đó, thắng khóa của dự án) |
| `units.layout` | Phần tại chỗ của đơn vị đặt ở đâu. `harness`: gom trong `<đơn vị>/.harness/` (tệp cửa vào `.harness/CLAUDE.md`, ghi chép `.harness/docs/`); thư mục `docs/` và `CLAUDE.md` ở gốc đơn vị khi đó là của repo. `legacy`: tệp cửa vào và `docs/` ở gốc đơn vị. Không khai: đơn vị đã có `.harness/docs` hay `.harness/<tệp cửa vào>` thì `harness`; đã có `docs/` hay tệp cửa vào ở gốc thì `legacy`; chưa có gì thì `harness` |
| `units.entry` | Tên tệp cửa vào của đơn vị (mặc định `CLAUDE.md`), cho repo không được có tệp tên đó |
| `units.docs` | `committed` (mặc định): ghi chép vào git của đơn vị, cổng HTML và kho ngữ nghĩa đọc bản đã commit. `local`: ghi chép KHÔNG vào git của đơn vị (chỉ ở bố cục `harness`); `new-service.js` ghi `/.harness/` vào `.git/info/exclude`; cổng và kho đọc từ đĩa |
| `upgrade.auto` | Việc harness tự làm ở nền đầu phiên khi kho gói có bản mới. `prepare` (mặc định): lấy bản mới về bản clone rồi DỰNG SẴN (gói mới, phần đã gộp, báo cáo theo từng mục thay đổi) vào thư mục trạng thái, để agent trình người dùng. `check`: chỉ báo có bản mới. `off`: không làm gì. Không có giá trị nào nghĩa là tự cài: cài luôn cần người dùng duyệt |
| `upgrade.verify` | Các lệnh kiểm dự án tự khai, chạy sau khi cài bản mới: mảng các lệnh, mỗi lệnh là một mảng đối số (`[["npm", "test"]]`), chạy ở gốc dự án, không qua shell. Lệnh nào thoát khác 0 thì bước cài tự quay lại bản cũ. Dùng cho test của phần bạn đã sửa trong mã của gói và của khối riêng |

Trong tài liệu này và trong bảng việc -> skill, đường dẫn kiểu `CLAUDE.md`, `docs/agent/STATUS.md`, `docs/service.yaml` của một đơn vị là TÊN LOGIC: chỗ thật do `units.layout` quyết (`.harness/docs/agent/STATUS.md` ở bố cục `harness`). Mã của harness và khối mở rộng hỏi chỗ thật qua `gate-paths` (`unitPath`, `unitPathRel`), không tự ghép chữ `docs`.

## Cấu hình cổng duyệt: `.claude/project/gate.config.json`

Chỉ người dùng sửa tệp này (hook chặn phiên ghi vào nó).

```json
{
  "mode": "enforce",
  "judge": "model",
  "approveWords": ["bắt đầu đi", "triển khai"],
  "plan": { "heading": ["Plan"], "labels": { "Dịch vụ": ["Service"], "Rủi ro": ["Risks"] }, "extra": ["Kiểm thử"] }
}
```

| Trường | Nghĩa |
|---|---|
| `judge` | Ai phán câu trả lời của người dùng khi nó không phải một câu đồng ý ngắn, rõ. `model` (mặc định): hỏi một model. `strict`: không gọi model nào; mọi tin không phải lời duyệt là việc mới (cổng đang mở thì đóng, kế hoạch đang chờ vẫn chờ thêm vài lượt) |
| `approveWords` | Câu duyệt của dự án, thêm vào các câu đồng ý ngắn có sẵn ("ok", "duyệt", "làm đi"...). Chỉ khớp khi CẢ tin nhắn đúng bằng một câu đã khai (bỏ dấu câu, không phân biệt hoa thường). Tối đa 20 câu, mỗi câu tối đa 6 từ và 40 ký tự, không có dấu hỏi; câu không hợp lệ bị bỏ qua |
| `plan.heading` | Tên gọi khác của tiêu đề `## Kế hoạch`. Đã có sẵn `Plan`; tiêu đề cũng được kèm chữ sau tên (`## Kế hoạch (v2)`), và không có tiêu đề mà đủ năm mục vẫn đọc được |
| `plan.labels` | Tên gọi khác của năm mục gốc, cộng thêm vào các tên có sẵn (ví dụ Đơn vị, Việc làm, Tệp sẽ sửa, Ngoài phạm vi, Service, What, Files, Out of scope, Risks). Năm mục vẫn bắt buộc; cách viết (gạch đầu dòng, in đậm, bảng, chú thích sau tên mục) tùy ý |
| `plan.extra` | Mục bắt buộc THÊM của dự án. Một đơn vị đòi thêm mục cho kế hoạch nêu tên nó bằng khóa `plan.extra` trong `module.json` của khối mở rộng của nó (chỉ có hiệu lực từ bản người dùng đã xác nhận) |

Không khóa nào bớt được một mục gốc, làm một mục thành tùy chọn hay tắt bước duyệt. Khai hỏng thì phần hỏng bị bỏ, khuôn gốc giữ nguyên.

## Bộ khung và phần mở rộng được

Bộ khung, giống nhau ở mọi dự án: quy trình yêu cầu -> kế hoạch -> duyệt -> đăng ký phạm vi -> làm; ba chỗ đặt (`.claude/modules/` mã của gói, `.claude/project/` phần của dự án, `<đơn vị>/.harness/` phần của từng đơn vị); hợp đồng khối và tên hàm công khai (chỉ thêm, không đổi); một cửa cho hook, máy chủ công cụ và dòng lệnh; dấu của từng tệp gói (`FILES.json`).

| Bạn cần | Cách làm | Khi có bản mới |
|---|---|---|
| Dự án có hình dạng khác (mã ở đâu, ghi chép ở đâu, tên gọi, mục thêm của kế hoạch) | Khai trong `project.json`, `gate.config.json` | Không phải làm gì |
| Thêm luật, công cụ, lệnh | Khối mở rộng của dự án hoặc của đơn vị (mục dưới), hoặc một khối riêng trong `.claude/modules/<tên>/` có `module.json` | Được giữ nguyên |
| Đổi cách một phần của gói hoạt động mà cấu hình không với tới | Sửa tệp của gói. Được phép: `doctor` và `upgrade status` liệt kê tệp đã sửa | Harness dựng sẵn bản gộp ba bên; agent báo từng mục thay đổi, bạn duyệt, agent cài và kiểm (skill `harness-upgrade`). Đừng cài đè bằng `install` |

Năm khối ngoài lõi (`servicedocs`, `diagrams`, `context`, `portal`, `guard-push`) không thuộc bộ khung: bật, tắt bằng `modules`, hoặc sửa theo môi trường của dự án.

## Nâng cấp: tờ thay đổi, mã duyệt, bước chuyển cấu hình
Người dùng không gõ lệnh nào để nâng cấp. Thứ tự: harness dựng sẵn ở nền (`upgrade.auto`); agent đọc báo cáo và trình người dùng từng mục thay đổi; người dùng duyệt; agent chạy `upgrade apply`; bước cài tự kiểm và tự quay lại khi hỏng.

- **Tờ thay đổi** `.claude/modules/core/releases/<số bản>.json`, mỗi bản một tệp, cho máy đọc. Mỗi mục có `kind` (`added`, `changed`, `removed`, `fixed`), `block`, `title`, `before`, `after`, `files` (tệp hoặc thư mục kết thúc bằng `/`, tính từ thư mục mã), `surface` (khóa cấu hình, lệnh, công cụ, skill, hook đổi), `impact` (dự án đã cài thấy gì), `migrations`, `decisions` (điểm người dùng phải quyết), `verified`, `unverified`. Lệnh đóng gói từ chối khi bản đang đóng chưa có tờ, tờ thiếu trường, một tệp đã đổi không thuộc mục nào, hoặc một mục trỏ tới tệp không đổi.
- **Báo cáo** `BAO-CAO.md` trong thư mục dựng sẵn ghép các tờ của mọi bản đi qua với dự án: mục nào chạm tệp bạn đã sửa và gộp ra sao, khóa nào dự án đang khai, khối nào dự án không cài, bước chuyển sẽ sửa gì. Bản phát hành trước khi có tờ thay đổi thì báo cáo nói rõ là chỉ có danh sách tệp.
- **Mã duyệt** `upgrade:<bản>@<8 ký tự>` tính từ toàn bộ nội dung sắp cài (gói mới, phần đã gộp, bản kê, script cài, câu trả lời các điểm cần quyết). Trong phiên Claude, `upgrade apply` chỉ chạy khi kế hoạch người dùng vừa duyệt của chính phiên đó ghi nguyên mã này, gói trong thư mục dựng sẵn còn trùng từng tệp với kho gói, và kho gói là kho dự án đã ghi nhận. Người dùng tự chạy lệnh ở terminal thì không cần mã. Đây là chốt chặn agent làm nhầm; nó không chặn được một tiến trình cố ý chép tệp bằng lệnh khác.
- **Bước chuyển cấu hình** là dữ liệu trong tờ thay đổi, không phải mã: một tệp JSON của dự án (chỉ `.mcp.json`, `.claude/settings.json`, tệp JSON ngay trong `.claude/project/`) và các thao tác `set` (mặc định không đè thứ đã có), `remove`, `rename`, `replace`. Chạy lại không đổi thêm. Bước có `when` chỉ chạy khi người dùng đã chọn đúng giá trị của một điểm cần quyết.
- **Sau khi cài**, bước cài kiểm toàn vẹn cổng duyệt, kiểm sức khỏe (lỗi có từ trước khi cài không tính) và chạy `upgrade.verify`. Hỏng bước nào thì trả lại mã, skill, cấu hình như trước khi cài, và in nguyên văn lỗi.

## Khối mở rộng: luật, công cụ, lệnh riêng của dự án và của từng đơn vị
Dự án hay một đơn vị thêm luật chặn, công cụ, lệnh của riêng mình mà không sửa mã harness. Cùng một khuôn, khác chỗ đặt:

| Chỗ đặt | Áp cho | Khóa |
|---|---|---|
| `.claude/project/extensions/<tên>/module.json` | Cả dự án, mọi loại sự kiện | `project:<tên>` |
| `<thư mục đơn vị>/.harness/module.json` | Chỉ việc đụng tới đơn vị đó (ghi tệp trong đơn vị, hoặc gọi công cụ với `service` là đơn vị đó); chỉ `before-action`, `after-action` | `unit:<đơn vị>` |

```json
{ "api": "1.0", "rules": ["rules/khong-ghi-vendor.js"], "tools": ["tools/dem-tep.js"], "commands": ["commands/tom-tat.js"], "timeout": 2 }
```

| Phần | Tệp xuất | Ghi chú |
|---|---|---|
| Luật | `{ id, on: [loại sự kiện], matcher?, run(ctx) }` | `run` trả `ctx.block(lý do)`, `ctx.ask(lý do)`, `ctx.note(lời)` hoặc `null`. Không có "cho qua": khối chỉ chặn thêm, không nới được luật của harness hay của khối khác (gộp: chặn mạnh nhất thắng) |
| Công cụ | `{ name, description, inputSchema?, write?, run(args, ctx) }` | Trên máy chủ `harness` (khối lõi) tên là `<tên khối>_<name>` (gạch ngang thành gạch dưới); không nhận tham số `service` |
| Lệnh | `{ name, description, run(argv, ctx) }` | `cli.js extension run <khóa> <name> [...]` |

`ctx` (hợp đồng bản 1.0, chỉ thêm, không bỏ): `kind`, `scope`, `unit` (`{ name, dir }` hoặc `null`), `session`, `prompt`, `reply`, `action` (`type`, `tool`, `file`, `writes`, `command`, `name`, `args`), `fs` (`read`, `exists`, `list`; công cụ có `write: true` và lệnh có thêm `write`), `git.isCommitted(tệp)`, `unitOf(tệp)`. Mọi đường dẫn tính từ thư mục của khối (thư mục đơn vị, hoặc gốc dự án), kiểu posix; `fs` từ chối đường dẫn ra ngoài. Khối không `require` mã của harness: nâng cấp harness không làm gãy khối. Đây là quy ước của hợp đồng, không phải hộp cát: mã của khối chạy với quyền của người dùng, nên mới cần xác nhận.

**Xác nhận.** Khối mới hay vừa sửa CHƯA chạy cho tới khi người dùng xác nhận: `cli.js extension trust <khóa>`, chạy trong terminal (lệnh từ chối khi chạy trong phiên Claude Code). Xác nhận chép khối sang `.claude/local/extensions/` (chỉ ở máy, hook cổng duyệt bảo vệ) và chạy `setup`. Mã luôn chạy từ bản đã chép: sửa hay xóa khối trong repo không đổi mã đang chạy và không tắt được luật chặn, cho tới khi người dùng xác nhận lại hoặc gỡ (`extension untrust <khóa>`, cũng chỉ người dùng). Mỗi máy xác nhận riêng: kéo repo về máy khác thì khối chưa chạy ở đó.

**Hỏng thì cho qua, có chỗ báo.** Luật ném lỗi, quá `timeout` (giây, tối đa 5, mặc định 2) hay trả lời sai hợp đồng thì bị bỏ qua, ghi vào sổ lỗi; `doctor`, `extension list` và tóm tắt đầu phiên nêu khối chưa xác nhận, đã sửa, đã xóa, khai báo hỏng và lỗi trong 24 giờ.

Các bước: `cli.js extension new <tên>` (cả dự án) hoặc `extension new --unit <đơn vị>` chép khối mẫu của harness; sửa; `extension test <khóa>` chạy các ca ở `cases.json` của khối (`{ name, event: { kind, action: { type, file } }, expect: "deny" | "ask" | "note" | "block" | "pass" }`); người dùng `extension trust <khóa>`; `extension list` để xem.

Luật kiểu cũ ở `.claude/project/rules/<id>.js` (`{ id, on, api: "0.1", matcher?, run(event, ports) }`, trả quyết định của `ports/events.js`) vẫn chạy, không cần xác nhận; dự án mới dùng khối mở rộng. Không sửa mã trong `.claude/modules/`: bản mới thay toàn bộ thư mục đó.

Giá trị của `units.dirs` hay `skills` là một chuỗi thì đó là tên tệp JSON trong `.claude/modules/` chứa phần đó. Không có `project.json` thì harness dùng bố cục mặc định của các bản trước, để dự án đã dùng harness từ trước chạy y như cũ. Kiểm cấu hình: `node .claude/modules/core/cli/cli.js doctor`.

## Luật không đổi theo dự án
- Sửa tệp chỉ sau khi người dùng duyệt một kế hoạch có khối `## Kế hoạch` đủ năm mục (Dịch vụ, Làm gì, Sửa tệp, Không làm, Rủi ro); duyệt xong gọi `scope_register`.
- Một phiên làm một đơn vị; việc của đơn vị khác ghi vào `docs/handoff/`.
- Sơ đồ không bao giờ viết cú pháp Mermaid bằng tay; khai dữ liệu qua công cụ.
- Không ghi bí mật vào mã, tài liệu, nhật ký; chỉ ghi tên biến môi trường.
- Không bỏ qua git hook (`--no-verify`, đổi `core.hooksPath`).
