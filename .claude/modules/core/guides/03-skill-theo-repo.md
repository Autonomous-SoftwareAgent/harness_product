# Phần riêng của từng repo: tài liệu bắt buộc, skill và luật

Trong harness, mỗi thư mục có tài liệu và nhịp sửa riêng (thường là một repo git) là một **đơn vị**. Phần harness giữ ở một đơn vị gọi là "phần tại chỗ" và nằm gọn trong `<đơn vị>/.harness/` (bố cục `harness`, mặc định của dự án mới), nên nó không lẫn với `docs/` hay `CLAUDE.md` mà repo vốn có. Nâng cấp harness không bao giờ đụng chỗ này.

## 1. Khai đơn vị nằm ở đâu
Trong `.claude/project/project.json`:
```json
{
  "units": { "parents": ["apps", "services"], "dirs": { "shared": "libs/shared" }, "layout": "harness" }
}
```
- `parents`: mỗi thư mục con của các thư mục này là một đơn vị (tên chữ thường, số, gạch ngang).
- `dirs`: đơn vị nằm ở chỗ riêng.
- `workspace.root`: khi mã nằm NGOÀI thư mục mở phiên (ví dụ `../code`), khai gốc mã ở đây; `.claude/`, trạng thái và tài liệu chung vẫn ở thư mục mở phiên.
- `layout`: `harness` (gom trong `.harness/`) hoặc `legacy` (`docs/` và tệp cửa vào ở gốc đơn vị). Không khai thì harness nhận theo thứ đang có, đơn vị chưa có gì thì `harness`. Đơn vị đang ở bố cục cũ không bao giờ tự đổi chỗ.
- `units.docs: "local"`: ghi chép của harness không vào git của đơn vị (chỉ ở bố cục `harness`).

Dựng khung cho một đơn vị (chỉ bổ sung phần thiếu, không ghi đè):
```
node .claude/modules/core/cli/new-service.js <tên>
```
Lệnh tạo `<đơn vị>/.harness/CLAUDE.md` (cửa vào duy nhất của đơn vị, bốn mục `## Phạm vi`, `## Đọc gì khi nào`, `## Quy tắc riêng`, `## Lệnh thường dùng`) và `.harness/docs/agent/` gồm `STATUS.md`, `DECISIONS.md`, `CONVENTIONS.md`. Kiểm: `doctor` liệt kê đơn vị thiếu gì.

Đường dẫn trong tài liệu và cấu hình viết theo TÊN LOGIC (`CLAUDE.md`, `docs/agent/STATUS.md`); chỗ thật do `layout` quyết (`.harness/docs/agent/STATUS.md` ở bố cục `harness`).

## 2. Ba cách để một repo có hướng dẫn riêng, và cách nào ép được
| Cách | Nằm ở đâu | Harness làm gì |
|---|---|---|
| **Tài liệu bắt buộc đọc** | `<đơn vị>/.harness/docs/agent/*.md`, khai ở `skills.unitDocs` | **Ép:** sửa tệp trong đơn vị bị chặn cho tới khi phiên đã đọc đủ bằng công cụ Read |
| **Skill dùng chung gắn theo đường dẫn** | `.claude/skills/<tên>/SKILL.md` + mục trong `skills.files` | **Ép:** sửa tệp có đường dẫn khớp bị chặn cho tới khi phiên đã mở skill |
| **Skill riêng của repo** | `<đơn vị>/.harness/skills/<tên>/SKILL.md` | **Chỉ nhắc:** lần sửa đầu tiên của phiên trong đơn vị, harness nêu tên các skill này và bảo đọc bằng công cụ Read khi làm đúng loại việc |

### Tài liệu bắt buộc đọc (ép được)
```json
{
  "skills": {
    "serviceDocs": ["CLAUDE.md", "docs/agent/STATUS.md"],
    "unitDocs": { "web": ["CLAUDE.md", "docs/agent/STATUS.md", "docs/agent/UI.md"] }
  }
}
```
`serviceDocs` áp cho mọi đơn vị; `unitDocs` thay nó cho riêng đơn vị nêu tên. Tệp phải có thật, không thì hook không đòi (thà không chặn còn hơn làm phiên kẹt). Đã thử: sửa `apps/web/src/a.js` khi chưa đọc thì bị chặn, lời chặn liệt kê `apps/web/.harness/CLAUDE.md`, `.../STATUS.md`, `.../UI.md`.

### Skill dùng chung gắn theo đường dẫn (ép được)
Viết skill như ở [02-skill-toan-cuc.md](02-skill-toan-cuc.md), rồi gắn vào repo:
```json
{ "skills": { "files": [{ "pattern": "^apps/web/", "skills": ["web-ui"], "reads": ["docs/agent/UI.md"] }] } }
```
Đây là cách khuyến nghị khi bạn muốn skill của một repo THỰC SỰ được mở trước khi sửa.

### Skill riêng của repo (chỉ nhắc)
```
apps/web/.harness/skills/them-man-hinh/SKILL.md
```
Khuôn `SKILL.md` như skill dùng chung. Giới hạn hiện tại, nói thẳng:
- Claude Code không tự liệt kê skill ở đây (nó chỉ đọc `.claude/skills/`); agent biết nó có nhờ lời nhắc ở lần sửa đầu và phải tự đọc bằng công cụ Read.
- Bảng nối `skills` chỉ nhận skill ở `.claude/skills/`: không khai được skill riêng của repo trong `files` hay `tools` (`doctor` báo nhắc skill không có `SKILL.md`). Muốn ép thì dùng một trong hai cách ở trên.
- Đọc `SKILL.md` ở đây không được sổ phiên tính là "đã mở skill".

## 3. Luật, công cụ, lệnh riêng của một repo
Đặt khối mở rộng ở `<đơn vị>/.harness/module.json` cùng thư mục `rules/`, `tools/`, `commands/`. Khối chỉ áp cho việc đụng tới đơn vị đó (ghi tệp trong đơn vị, hoặc gọi công cụ với `service` là đơn vị đó) và chỉ chặn thêm, không nới được luật của harness. Cách làm và xác nhận: [04-mo-rong.md](04-mo-rong.md).

## 4. Làm việc giữa nhiều repo
- Một phiên làm MỘT đơn vị. Việc đụng đơn vị khác thì ghi một tờ vào `docs/handoff/` (một tờ một việc, có dòng `Trạng thái: open` hoặc `done`) và nói với người dùng; phiên của bên nhận sẽ thấy ở đầu phiên.
- Muốn biết phiên nào trên máy này đã làm đơn vị nào: `node .claude/modules/core/cli/session.js for <đơn vị>`. Đặt tên phiên theo đơn vị cho bảng dễ đọc.
- Hai phiên cùng sửa một đơn vị: hook cảnh báo ở lần sửa đầu (dựa trên dấu hoạt động trong 2 giờ gần đây); chỉ là lời nhắc, không phải khóa.

## 5. Mẫu làm cho một repo mới, theo thứ tự
1. Khai đơn vị trong `project.json`, chạy `new-service.js <tên>`.
2. Điền `.harness/CLAUDE.md` (phạm vi, đọc gì khi nào, quy tắc riêng, lệnh test) và `STATUS.md` bằng điều đọc thấy trong mã; điều chưa kiểm ghi là chưa kiểm.
3. Viết tài liệu bắt buộc riêng (ví dụ `UI.md`) và khai vào `skills.unitDocs`.
4. Cần skill ép: viết ở `.claude/skills/`, gắn bằng `skills.files`.
5. `doctor` không có LỖI; thử bằng cách đưa cho hook một lời gọi ghi tệp (xem mục 3 của [02-skill-toan-cuc.md](02-skill-toan-cuc.md)).
