# Skill dùng chung cho cả dự án

Skill là bản hướng dẫn cách làm MỘT loại việc, để agent đọc trước khi làm. Skill dùng chung nằm ở `.claude/skills/<tên>/SKILL.md`, chỗ Claude Code đọc, nên mọi phiên và mọi repo của dự án đều thấy nó. Harness thêm hai thứ lên trên: **bảng nối** (việc nào bắt buộc phải mở skill nào, hook chặn nếu chưa) và **sổ phiên** (ghi phiên nào đã mở skill nào).

## 1. Viết skill
Tạo thư mục và tệp:
```
.claude/skills/web-ui/SKILL.md
```
```markdown
---
name: web-ui
description: Quy ước giao diện của ứng dụng web. Dùng khi sửa mã giao diện, thêm màn hình hay đổi kiểu.
---

# Giao diện web

## Khi nào dùng
Sửa mã trong apps/web: màn hình mới, đổi kiểu, sửa thành phần.

## Trước khi làm
- Đọc docs/agent/UI.md của đơn vị.

## Các bước
1. Dùng thành phần có sẵn trước khi viết mới.
2. ...

## Lỗi hay gặp
- Tự viết CSS riêng thay vì dùng token có sẵn.

## Cách kiểm
- Chạy test giao diện; xem trang bằng trình duyệt.
```
- `name` phải trùng tên thư mục. `description` ngắn (các skill của gói giữ dưới 300 ký tự) và nói rõ DÙNG KHI NÀO, vì Claude Code dùng dòng này để chọn skill.
- Năm mục (Khi nào dùng, Trước khi làm, Các bước, Lỗi hay gặp, Cách kiểm) là khuôn mà mọi skill của gói theo. Harness không ép khuôn này cho skill của bạn, nhưng giữ nó thì agent đọc nhanh và dễ soát.
- Mỗi chủ đề một nơi: skill nói cách làm, `CLAUDE.md` chỉ giữ quy tắc. Đừng chép cùng một hướng dẫn vào cả hai.
- Đặt tên có tiền tố hay từ riêng của dự án (ví dụ `web-ui`, `release`), để khỏi trùng với skill gói thêm ở bản sau.

## 2. Bắt buộc phải mở skill khi làm việc nào: bảng nối
Có skill chưa có nghĩa agent bị ép mở nó. Ép bằng khóa `skills` trong `.claude/project/project.json`:

```json
{
  "skills": {
    "mode": "enforce",
    "overview": "services",
    "serviceDocs": ["CLAUDE.md", "docs/agent/STATUS.md"],
    "files": [{ "pattern": "^apps/web/", "skills": ["web-ui"], "reads": ["docs/agent/UI.md"] }],
    "tools": { "design_*": "service-docs", "diagram_save": ["diagrams", "service-docs"] },
    "readonly": ["docs_status"]
  }
}
```
| Khóa | Ép gì |
|---|---|
| `mode` | `enforce` chặn; `remind` chỉ nhắc; `off` tắt |
| `overview` | Skill tổng quát, cần cho mọi việc có yêu cầu |
| `serviceDocs` | Tài liệu phải đọc (bằng công cụ Read) trước khi sửa bất kỳ đơn vị nào |
| `files` | Sửa tệp có đường dẫn khớp `pattern` (biểu thức chính quy, tính từ gốc dự án) thì cần các skill này, và đọc thêm `reads` (đường dẫn tính trong đơn vị chứa tệp) |
| `tools` | Gọi công cụ này thì cần skill này. Khóa là tên công cụ của harness (`design_record`), hoặc tên đầy đủ của công cụ bất kỳ (`mcp__<máy chủ>__<tên>`), `*` khớp mọi chuỗi; giá trị là một skill hay danh sách |
| `readonly` | Công cụ chỉ đọc, không bao giờ bị chặn (thắng mẫu `*`) |

Cách đúng để gắn một skill dùng chung vào MỘT repo: khai nó trong `files` với `pattern` là thư mục của repo đó (ví dụ `^apps/web/`). Mọi lần sửa tệp trong repo bị chặn cho tới khi phiên đã mở skill và đọc các tài liệu `reads`. Đã thử: lời chặn nêu đúng "Còn thiếu: skill `services`, `web-ui`; tài liệu của dịch vụ ..." kèm cách sửa.

Mở skill nghĩa là: dùng công cụ Skill, hoặc đọc TRỌN `SKILL.md` bằng công cụ Read. Đọc bằng `cat` hay Grep không được tính. Sau mỗi lần nén ngữ cảnh phải mở lại (sổ phiên tính lại từ đầu). Agent con có ngữ cảnh riêng nên phải tự mở.

## 3. Kiểm
- `node .claude/modules/core/cli/cli.js doctor`: dòng "bảng việc -> skill" cho biết chế độ, số mẫu, và báo skill được nhắc mà không có `SKILL.md`.
- Thử hook không cần phiên thật (đã chạy được): đưa cho hook một lời gọi ghi tệp rồi xem lời chặn.
  ```
  echo '{"session_id":"thu","hook_event_name":"PreToolUse","cwd":"<gốc dự án>","tool_name":"Write","tool_input":{"file_path":"<gốc dự án>/apps/web/src/a.js","content":"x"}}' | node .claude/modules/core/hooks/guard-skill.js
  ```
  Đầu ra có `permissionDecision":"deny"` và liệt kê đúng skill, tài liệu còn thiếu thì bảng nối đang chạy. Trên Windows dùng đường dẫn Windows.
- `node .claude/modules/core/cli/session.js skills`: phiên nào đã mở skill nào, hook chặn ở đâu; dòng "VẤN ĐỀ" nghĩa là đang KHÔNG chặn.

## 4. Giới hạn cần biết
- **Công cụ ngoài harness trong bảng `tools`.** Hook chặn theo skill chỉ được gọi cho các công cụ ghi tệp và công cụ của harness. Khai `"mcp__github__create_pull_request": "release"` trong `tools` mà hook không được gọi cho công cụ đó thì `doctor` báo "khai mà KHÔNG chặn". Thêm tên công cụ vào matcher của nhóm hook `guard-skill.js` trong `.claude/settings.json` chỉ có tác dụng cho tới lần chạy `setup` hay nâng cấp kế tiếp: bộ cài viết lại phần hook của harness (đã thử: matcher thêm tay biến mất sau `setup`). Hiện chưa có khóa cấu hình để khai thêm bền; nếu cần, thêm lại sau mỗi lần `setup` hay nâng cấp, và `doctor` sẽ nhắc khi thiếu. Muốn chặn một công cụ ngoài bền vững thì dùng luật của khối mở rộng ([04-mo-rong.md](04-mo-rong.md)).
- Skill bị `doctor` coi là lỗi khi bảng nối nhắc tên mà không có `SKILL.md`; hook thì cho qua trong trường hợp đó (thà không chặn còn hơn làm phiên kẹt).

## 5. Nâng cấp skill của bạn
- Skill bạn thêm (tên không có trong gói) không bao giờ bị đụng.
- Gói bản mới thêm một skill trùng tên với skill của bạn: báo cáo nâng cấp nêu "cả hai cùng thêm" và agent gộp trước khi trình bạn. Tên có tiền tố của dự án tránh được chuyện này.
- Skill của gói mà bạn đã sửa: nâng cấp gộp ba bên (bản gốc, bản của bạn, bản mới), chỗ đụng nhau nằm ở thư mục dựng sẵn để agent xử lý rồi mới trình bạn. `upgrade status` liệt kê những gì bạn đã sửa. Nếu chỉ cần thêm hướng dẫn riêng thì viết skill mới thay vì sửa skill của gói.
