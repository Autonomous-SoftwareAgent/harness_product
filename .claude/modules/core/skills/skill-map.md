---
name: skill-map
description: Khai việc nào cần skill nào và tài liệu nào trong .claude/project/project.json (phần skills), và viết một skill riêng của dự án. Dùng khi thêm skill mới, khi muốn hook chặn một công cụ hay một loại tệp cho tới khi phiên đã đọc hướng dẫn, khi doctor báo "khai mà KHÔNG chặn".
---

# Khai bảng việc - skill

Hook `guard-skill.js` chặn lời gọi ghi khi phiên chưa mở đủ skill và chưa đọc đủ tài liệu cho việc đó. "Việc nào cần gì" khai ở MỘT nơi: phần `skills` của `.claude/project/project.json` (hoặc tệp riêng mà phần đó trỏ tới). Nghĩa từng trường: `.claude/modules/core/FORMAT.md`, mục "Cấu hình dự án".

## Khi nào dùng
- Dự án có một quy trình mà agent phải đọc hướng dẫn trước khi làm (sửa migration, sửa workflow CI, gọi công cụ phát hành).
- Thêm một skill mới cho dự án.
- `doctor` báo skill được nhắc mà không có, hoặc công cụ khai mà không chặn.

## Trước khi làm
- Sửa `project.json` là sửa tệp: phải có kế hoạch được duyệt.
- Mỗi điều viết ở một nơi: luật chung ở `CLAUDE.md` gốc, cách làm từng bước ở skill, điều riêng của một đơn vị ở tài liệu của đơn vị đó. Đừng tạo skill cho điều chỉ một đơn vị dùng.

## Các bước
1. **Viết skill** (nếu chưa có) ở `.claude/skills/<tên>/SKILL.md`, tên chữ thường và gạch ngang. Khuôn:
   ```
   ---
   name: <tên>
   description: <làm gì; dùng khi nào - một câu đủ để agent tự chọn đúng skill>
   ---
   # <tiêu đề>
   ## Khi nào dùng
   ## Trước khi làm
   ## Các bước
   ## Lỗi hay gặp
   ## Cách kiểm
   ```
2. **Khai việc cần skill đó** trong `skills`:
   - Công cụ: `"tools": { "<tên>": "<skill>" }`. Tên là tên công cụ của harness (`diagram_save`), hoặc tên đầy đủ của công cụ bất kỳ (`Bash`, `mcp__github__create_pull_request`). Dấu `*` khớp mọi chuỗi (`"mcp__db__*"`). Cần nhiều skill thì ghi danh sách.
   - Tệp: `"files": [{ "pattern": "^db/migrations/", "skills": ["db"], "reads": ["docs/agent/DB.md"] }]`. `pattern` là biểu thức chính quy trên đường dẫn tính từ gốc. `reads` là tài liệu phải đọc thêm, tính trong đơn vị chứa tệp (hoặc từ gốc nếu tệp không thuộc đơn vị nào).
   - Công cụ chỉ đọc mà mẫu `*` vô tình khớp: thêm vào `"readonly"`.
   - Một đơn vị cần đọc tài liệu khác mặc định: `"unitDocs": { "<đơn vị>": [ ... ] }`.
3. **Công cụ ngoài harness:** thêm tên (hoặc mẫu) vào `matcher` của nhóm PreToolUse đang gọi `guard-skill.js` trong `.claude/settings.json`, nếu không thì hook không bao giờ được gọi cho công cụ đó.
4. **Kiểm:** `node .claude/modules/core/cli/cli.js doctor`.

## Đã có thì sao, chưa có thì làm gì
| Thứ | Đã có | Chưa có |
|---|---|---|
| Skill | Sửa đúng mục cần sửa, giữ khuôn | Viết theo khuôn ở bước 1 |
| Dòng khai trong `skills` | Đổi giá trị; công cụ đang dùng thật thì báo người dùng trước khi nới | Thêm dòng; chạy `doctor` |
| Matcher trong `settings.json` | Thêm tên vào biểu thức đang có | Không tự tạo nhóm hook mới; thêm vào nhóm `guard-skill.js` sẵn có |

## Lỗi hay gặp
- Khai skill chưa có tệp `SKILL.md`: hook không đòi skill không tồn tại (thà không chặn còn hơn kẹt), và `doctor` báo.
- Mẫu `*` quá rộng chặn cả công cụ đọc: thêm công cụ đó vào `readonly`.
- Quên matcher cho công cụ ngoài harness.

## Cách kiểm
- `doctor` không có LỖI.
- Mở phiên mới, gọi đúng việc đã khai mà chưa mở skill: hook chặn và nêu đúng skill còn thiếu. Mở skill rồi gọi lại: qua.
