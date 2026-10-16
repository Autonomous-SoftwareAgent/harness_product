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
| **Skill riêng của repo** | viết ở `<đơn vị>/.harness/skills/<tên>/SKILL.md`; harness SINH `<đơn vị>/.claude/skills/<tên>/SKILL.md` | **Claude Code tự nạp** (muộn: hiện trong danh sách sau khi phiên chạm tệp trong đơn vị) và sổ phiên đếm khi mở; muốn ÉP thì khai hai dòng `harness-files`, `harness-reads` ngay trong `SKILL.md` (không phải sửa bảng nối ở gốc), xem "Vòng đời của skill và note" |

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
Cách này và skill riêng của repo (mục dưới) đều ép được; skill riêng của repo thì viết ở `.harness/skills/` (khai điều kiện ép ngay trong tệp) và để harness sinh ra.

### Skill riêng của repo (viết một lần ở `.harness/`, harness sinh ra cho công cụ)
```
apps/web/.harness/skills/them-man-hinh/SKILL.md      <- viết ở đây (định nghĩa gốc, trung lập với công cụ)
apps/web/.claude/skills/them-man-hinh/SKILL.md       <- harness tự sinh cho Claude Code (đừng sửa tay)
```
Khuôn `SKILL.md` như skill dùng chung. Harness sinh bản cho Claude Code ở đầu mỗi phiên, hoặc chạy tay `node .claude/modules/core/cli/cli.js host-sync` (`--check` chỉ báo). Điều đã đo bằng phiên `claude` thật (bản 2.1.299, Windows, một lần):
- Skill sinh ra KHÔNG có trong danh sách lúc mở phiên; nó hiện sau khi phiên chạm một tệp trong đơn vị, rồi gọi được bằng công cụ Skill (nội dung nạp đủ).
- Tệp nhắc `<đơn vị>/.claude/rules/harness.md` (trỏ tới `.harness/CLAUDE.md`) cũng nạp sau khi phiên chạm tệp trong đơn vị.
- Hook và máy chủ MCP ở `<đơn vị>/.claude/` KHÔNG nạp, nên harness không sinh `settings.json` hay `.mcp.json` ở đó; luật, công cụ, lệnh riêng của đơn vị vẫn đi qua khối mở rộng ở mục 3.
Cách harness giữ tệp sinh:
- Mỗi tệp sinh có dòng dấu `<!-- harness-host:claude src:... sha:... -->` (đặt sau frontmatter). Tệp có dấu mà bị sửa tay thì không ghi đè (báo ra); tệp cùng tên không có dấu (của nhóm) không bao giờ bị đụng.
- Bỏ skill ở `.harness/skills/` thì bản sinh còn nguyên bị xóa. Tệp sinh được thêm vào `.git/info/exclude` của repo đơn vị.
- Skill sinh ở đơn vị được tính là skill hợp lệ: mở bằng công cụ Skill hay đọc trọn `SKILL.md` thì sổ phiên ghi nhận. Tên skill nên khác tên skill chung của dự án (cùng tên thì skill chung được dùng trước).

### Vòng đời của skill và note (một lời gọi là đủ)
Agent chỉ cần công cụ `host_define`; không bao giờ sửa tay tệp sinh hay bảng nối ở gốc. Mỗi thao tác sinh lại tệp công cụ ngay và ghi một dòng sự kiện vào sổ phiên (tra bằng `db_query`: nhóm `act_rule_decisions`, `rule = 'host'`).

| Việc | Công cụ | Ghi ở đâu |
|---|---|---|
| Tạo hay sửa skill | `host_define` (service, name, description, body, `enforce` tùy chọn) | `<đơn vị>/.harness/skills/<tên>/SKILL.md` |
| Tạo hay sửa note | `host_define` với `kind: "note"` (service, name, paths, body) | `<đơn vị>/.harness/notes/<tên>.md` |
| Đổi tên | `host_rename` (service, name, to, `kind`) | cả bản gốc, bản sinh, điều kiện ép |
| Gỡ | `host_remove` (service, name, `kind`) | bản sinh còn nguyên thì xóa theo; bản sinh bị sửa tay thì giữ và báo |
| Nhận skill của team | `host_adopt` (service, name, `confirm`) | chạy khô mặc định; `confirm=true` mới chép và thay |
| Xem | `host_status` | bảng vòng đời từng skill và note |

- **Điều kiện ép** (chỉ skill) là hai dòng ở đầu `SKILL.md`: `harness-files: ["^src/adapters/"]` (mẫu đường dẫn tính TỪ GỐC ĐƠN VỊ) và `harness-reads: ["docs/agent/CONVENTIONS.md"]` (tài liệu phải đọc thêm). Hook chặn theo skill gộp chúng vào bảng nối ở gốc: sửa tệp khớp mà phiên chưa mở skill thì bị chặn. Đơn vị chỉ THÊM yêu cầu, không bớt yêu cầu của bảng gốc; mẫu hỏng bị bỏ và `doctor` báo lỗi. Skill không khai `enforce` là gợi ý tự nguyện. Bản sinh cho Claude Code không có hai dòng này.
- **Note** là quy tắc tự nạp khi phiên chạm tệp khớp `paths` (mẫu kiểu glob, TÍNH TỪ THƯ MỤC ĐƠN VỊ, ví dụ `src/core/**`): dùng cho điều phải nhớ khi sửa một vùng mã. Chỉ nhắc, không ép. Đã đo bằng phiên `claude -p` thật (2.1.299, Windows, một lần): rule có `paths` chỉ nạp khi chạm tệp khớp; mẫu tính từ gốc dự án (`apps/web/src/core/**`) không khớp; rule không có `paths` nạp khi chạm bất cứ tệp nào của đơn vị.
- **Tự sinh lại.** Sửa tay một tệp ở `.harness/skills/` hay `.harness/notes/` thì hook `host-resync` sinh lại ngay; đầu mỗi phiên và `host-sync` cũng sinh lại (máy mới clone tự có `.claude/` vì nó không nằm trong git).
- **`host_adopt`** thay tệp của team bằng bản sinh nên cần người dùng đồng ý; từ chối khi skill có tệp kèm theo ngoài `SKILL.md` (bộ sinh chỉ chép `SKILL.md`). Bản gốc ở `.harness/` là nguyên văn bản của team; tệp đang được git theo dõi thì thay đổi hiện thành diff để người dùng tự commit.
- **`doctor` báo:** lỗi khi mẫu ép hỏng hoặc skill khai ép mà chưa được sinh (hook không ép được nó); cảnh báo khi mẫu ép không khớp tệp nào trong đơn vị, hoặc skill 30 ngày chưa ai mở; ghi chú khi skill chưa ép. Phiên mở thẳng trong thư mục đơn vị không có hook nào, nên không có sinh lại và không có ép.

### Repo đã có `.claude/` do team tự viết
Team không phải đổi cách làm. Harness đọc những gì họ có và chỉ ghi phần thêm:
- Kiểm kê (chỉ đọc): `node .claude/modules/core/cli/cli.js host-inventory` (hoặc công cụ MCP `host_status`; `doctor` cũng nêu). Bảng nói với từng đơn vị: skill, rule, `CLAUDE.md` của team DÙNG ĐƯỢC khi phiên mở ở gốc dự án (nạp muộn); hook, quyền, lệnh, agent, máy chủ MCP riêng của đơn vị KHÔNG nạp khi mở ở gốc (đã đo, bản 2.1.299, Windows, một lần); biến môi trường trong `settings.json` chưa đo. Hook của team không chạy khi mở ở gốc: mở phiên ngay trong đơn vị khi cần chúng, hoặc chuyển thành luật ở `.harness/` (mục 3). Harness không tự gộp hook hay `settings.json` của đơn vị lên gốc.
- Mỗi tên chỉ có MỘT nguồn gốc: skill của team (viết ở `.claude/skills/`) trùng tên với skill ở `.harness/skills/` thì bản của team thắng, harness không sinh bản của nó và báo ở `doctor`, `host-sync`, `host_status` (không báo lại ở mỗi phiên). Skill team viết không bị harness sinh lại ra `.claude/` và không bị xóa.
- Skill riêng mới tạo bằng công cụ `host_define` (service, name, description, body): công cụ kiểm tên, mô tả một dòng, nội dung; từ chối tên trùng skill của team; ghi vào `.harness/skills/` rồi sinh tệp công cụ. Tệp sinh có dấu `harness-host` và bị hook `guard-host` chặn sửa tay (Write, Edit, lệnh shell ghi); muốn đổi thì gọi lại `host_define`.

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
