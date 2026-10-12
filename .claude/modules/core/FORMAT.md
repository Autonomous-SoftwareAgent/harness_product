# Khuôn làm việc chung của harness

Tờ này nói một dự án dùng harness được tổ chức thế nào: tệp nào có ở đâu, ai ghi, bắt buộc hay tùy chọn. Mọi công cụ, hook và skill của harness đọc và ghi theo đúng khuôn này. Chỗ duy nhất mỗi dự án tự quyết là **đơn vị nằm ở đâu** và **việc nào cần skill nào**: khai trong `.claude/project/project.json` (mục "Cấu hình dự án" bên dưới).

Dự án mới chưa có gì trong khuôn thì không chép từ dự án khác: skill `onboard` dẫn agent đọc dự án, trình kế hoạch, rồi dựng phần còn thiếu bằng chính công cụ của harness.

## Từ ngữ
- **Đơn vị** (hay dịch vụ): một phần của dự án có mã, tài liệu và nhịp sửa riêng, thường là một repo git riêng. Mọi luật "một phiên một đơn vị", "đọc tài liệu trước khi sửa", "sửa trong phạm vi kế hoạch" tính theo đơn vị.
- **Gốc dự án**: thư mục chứa `.claude/` và `.mcp.json`. Phiên Claude Code luôn mở ở đây (hook và MCP chỉ nạp ở gốc).
- **Ghi qua công cụ**: tệp chỉ được ghi bằng công cụ MCP `bsn-docs` (hook chặn ghi tay, `docs check` phát hiện lệch bằng băm).

## Ở gốc dự án

| Tệp | Là gì | Ai ghi | Bắt buộc |
|---|---|---|---|
| `.claude/modules/<khối>/` | Mã của harness chia theo khối, kèm `module.json` (tệp tự khai: hook, công cụ, lệnh, skill của khối); `index.json`, `FILES.json`, `MANIFEST.json`, `VERSION` | Bộ cài (`install`); bản mới thay toàn bộ | Có |
| `.claude/project/` | Phần của dự án: `project.json`, công tắc, luật mở rộng `rules/`, bộ sinh trang riêng `generators/`. Nâng cấp không bao giờ đụng | Agent qua skill `onboard`, người dùng | Có |
| `.claude/project/project.json` | Cấu hình dự án | Agent qua skill `onboard`, sau khi người dùng duyệt | Có |
| `.claude/skills/`, `.claude/settings.json` | Skill (chỗ Claude Code đọc); khai hook. Bộ cài (`setup`) viết phần của harness, giữ phần của dự án | Bộ cài, dự án | Có |
| `.mcp.json` | Khai máy chủ MCP `bsn-docs` | Harness tự tạo hay tự thêm mục khi mở phiên | Có |
| `CLAUDE.md` | Luật chung của dự án: quy trình duyệt kế hoạch, một phiên một đơn vị, đọc gì trước khi sửa, việc gì dùng skill nào | Agent (onboard), người dùng duyệt | Có |
| `docs/handoff/` | Yêu cầu giữa các phiên: một tờ một việc, có dòng `Trạng thái: open` hoặc `done` | Mọi phiên | Khi có việc chéo đơn vị |
| `docs/system/decisions.md` | Quyết định chung của cả dự án, mỗi mục `## S-nnn: tiêu đề`; chỉ thêm, đổi ý thì ghi mục mới | Agent khi người dùng chốt | Khi có quyết định chung |
| `docs/portal/` | Cổng HTML cho người đọc, sinh tự động sau mỗi commit | Công cụ | Không (bật khi dùng `service.yaml`) |
| `.claude/local/cam-tu.json` | Danh sách từ cấm của máy, không bao giờ commit | Chỉ người dùng, ngoài Claude | Không |

## Trong mỗi đơn vị

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
| `lang` | Ngôn ngữ của lời chặn và lời nhắc của hook: `vi` (mặc định) hoặc `en`. Khuôn kế hoạch luôn giữ tên mục tiếng Việt |
| `modules` | Khối được bật; không khai là mọi khối đang có. `core` luôn bật; khối bật mà khối nó dùng không bật thì bị tắt theo (`doctor` nêu). Đổi xong chạy `cli.js setup` để viết lại hook |
| `units.parents` | Thư mục chứa đơn vị: mỗi thư mục con (tên chữ thường, số, gạch ngang) là một đơn vị. Thư mục đầu là nơi đơn vị mới được tạo |
| `units.dirs` | Đơn vị nằm ở chỗ riêng: `{ tên: thư mục }`, hoặc `{ tên: { "dir": ..., "reads": [tệp ngoài thư mục mà kho ngữ nghĩa đọc thêm] } }` |
| `defaultUnit` | Đơn vị mặc định của công cụ `bsn-docs` khi không truyền `service`; rỗng là luôn phải truyền |
| `skills.mode` | `enforce` (chặn), `remind` (chỉ nhắc), `off` |
| `skills.overview` | Skill tổng quát, cần cho mọi việc có yêu cầu |
| `skills.serviceDocs` | Tài liệu phải đọc (bằng công cụ Read) trước khi sửa một đơn vị, đường dẫn trong đơn vị |
| `skills.unitDocs` | Thay `serviceDocs` cho riêng một đơn vị |
| `skills.tools` | Công cụ nào cần skill nào. Khóa là tên công cụ `bsn-docs` (`design_record`) hoặc tên đầy đủ của công cụ bất kỳ (`Bash`, `mcp__<máy chủ>__<tên>`); dấu `*` khớp mọi chuỗi; giá trị là một skill hoặc danh sách skill. Công cụ ngoài `bsn-docs` phải có trong matcher của nhóm hook `guard-skill.js` ở `.claude/settings.json` (lệnh `doctor` báo khi thiếu) |
| `skills.readonly` | Công cụ chỉ đọc, không bao giờ bị chặn (thắng mẫu `*`) |
| `skills.files` | Mẫu đường dẫn (biểu thức chính quy, tính từ gốc) cần thêm skill và tài liệu phải đọc. `reads` tính trong đơn vị chứa tệp, hoặc từ gốc nếu tệp không thuộc đơn vị nào. `serviceDocs: false` thì không đòi tài liệu của đơn vị |
| `policies.rootNeverPush` | Repo gốc không bao giờ được đẩy lên remote |
| `policies.docsNeverPush` | Nội dung `docs/` ở gốc không bao giờ lên remote, kể cả bản chép trong repo khác |
| `policies.unitSheets` | Mẫu đường dẫn của "tờ của một đơn vị" nằm trong thư mục đơn vị khác; nhóm bắt đầu tiên là tên đơn vị chủ |
| `policies.readOnlyDirs` | Thư mục chỉ để đọc (mã bên ngoài để tham khảo): sửa ở đó thì hỏi người dùng |

## Luật mở rộng của dự án
Đặt `.claude/project/rules/<id>.js` xuất `{ id, on, api: "0.1", matcher?, run(event, ports) }`: `on` là loại sự kiện (`before-action`, `after-action`, `turn-end`, `user-prompt`, `session-start`), `run` trả quyết định (`deny`, `ask`, `note`, `block` từ `ports/events.js` của lõi) hoặc `null`. Chạy `cli.js setup` để khai hook cho luật. Luật khai bản giao diện khác số lớn, hoặc số nhỏ lớn hơn của harness, thì không được nạp (`doctor` báo). Không sửa mã trong `.claude/modules/`: bản mới thay toàn bộ thư mục đó.

Giá trị của `units.dirs` hay `skills` là một chuỗi thì đó là tên tệp JSON trong `.claude/modules/` chứa phần đó. Không có `project.json` thì harness dùng bố cục mặc định của các bản trước, để dự án đã dùng harness từ trước chạy y như cũ. Kiểm cấu hình: `node .claude/modules/core/cli/cli.js doctor`.

## Luật không đổi theo dự án
- Sửa tệp chỉ sau khi người dùng duyệt một kế hoạch có khối `## Kế hoạch` đủ sáu mục (Dịch vụ, Lý do, Làm gì, Sửa tệp, Không làm, Rủi ro); duyệt xong gọi `scope_register`.
- Một phiên làm một đơn vị; việc của đơn vị khác ghi vào `docs/handoff/`.
- Sơ đồ không bao giờ viết cú pháp Mermaid bằng tay; khai dữ liệu qua công cụ.
- Không ghi bí mật vào mã, tài liệu, nhật ký; chỉ ghi tên biến môi trường.
- Không bỏ qua git hook (`--no-verify`, đổi `core.hooksPath`).
