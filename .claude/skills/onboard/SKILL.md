---
name: onboard
description: Cài harness vào một dự án lần đầu, hoặc bổ sung khi dự án đổi bố cục - đọc dự án, trình kế hoạch tổ chức, ghi .claude/project/project.json, dựng khung tài liệu còn thiếu cho từng đơn vị, kiểm bằng doctor. Dùng khi tóm tắt đầu phiên báo "CHƯA CÀI ĐẶT DỰ ÁN", khi người dùng nói "cài harness", "onboard", "thêm đơn vị", hoặc khi doctor báo cấu hình thiếu.
---

# Cài harness vào dự án

Harness không biết gì về dự án cho tới khi `.claude/project/project.json` khai: đơn vị nằm ở đâu, trước khi sửa phải đọc gì, việc nào cần skill nào. Skill này dẫn bạn dựng phần đó **từ chính dự án**, không chép từ dự án khác. Khuôn chung (tệp nào ở đâu, ai ghi): `.claude/modules/core/FORMAT.md`.

## Khi nào dùng
- Tóm tắt đầu phiên có dòng "CHƯA CÀI ĐẶT DỰ ÁN".
- Người dùng bảo cài harness, onboard dự án, thêm hay bớt một đơn vị, đổi chỗ đặt đơn vị.
- `node .claude/modules/core/cli/cli.js doctor` báo cấu hình thiếu hay sai.

## Trước khi làm
- Phiên phải mở ở gốc dự án (thư mục chứa `.claude/`). Mở ở thư mục con thì không có hook và công cụ.
- Cổng duyệt kế hoạch chạy ngay từ đầu: chưa được duyệt thì không ghi tệp nào, kể cả `project.json`.
- Chỉ ghi điều đọc thấy trong dự án hoặc người dùng đã chốt. Chỗ chưa rõ thì hỏi, hoặc ghi "chưa rõ"; không đoán.
- Không ghi đè tệp đang có (`CLAUDE.md`, tài liệu, `.mcp.json`): chỉ thêm phần còn thiếu, và nói rõ đã thêm gì.
- Claude Code coi mọi tệp trong `.claude/` là tệp nhạy cảm: lần ghi `.claude/project/project.json` (và skill trong `.claude/skills/`) hiện hộp xin quyền, kể cả sau khi kế hoạch đã duyệt. Báo trước cho người dùng là họ sẽ phải bấm cho phép. Bị từ chối thì dừng, đưa người dùng nguyên văn phần cần sửa để họ tự sửa; KHÔNG ghi bằng đường vòng (lệnh shell, script), vì cấu hình này quyết định harness chặn gì. (Đo trên Claude Code 2.1.296: phiên `claude -p` không hỏi được nên luôn bị từ chối.)

## Các bước
1. **Đọc dự án (chỉ đọc).** Liệt kê thư mục cấp một và cấp hai; tìm tệp khai dự án (`package.json`, `pyproject.toml`, `go.mod`, `pom.xml`, `Cargo.toml`...), các thư mục có `.git` riêng, lệnh test, tài liệu đang có (`README.md`, `docs/`, `CLAUDE.md`). Đọc `project.json` nếu đã có.
2. **Đề xuất cách tổ chức.** Trả lời từng câu, mỗi câu kèm bằng chứng đã thấy:
   - Đơn vị là gì? Thường là mỗi repo git riêng, mỗi ứng dụng hay dịch vụ chạy riêng. Chúng nằm chung trong một thư mục cha (khai `units.parents`) hay rải rác (khai `units.dirs`)?
   - Trước khi sửa một đơn vị phải đọc gì (`skills.serviceDocs`)? Mặc định `CLAUDE.md` và `docs/agent/STATUS.md` của đơn vị.
   - Có công cụ hay thư mục nào cần skill riêng (`skills.tools`, `skills.files`)? Ví dụ thư mục migration cần skill về cơ sở dữ liệu, workflow CI cần skill phát hành.
   - Có bật kiểu tài liệu có cấu trúc không (ba tầng, `docs/service.yaml`, sơ đồ, cổng HTML)? Dự án nhỏ có thể chỉ cần `CLAUDE.md` và `STATUS.md`.
   - Luật riêng (`policies`): repo gốc có bao giờ được đẩy không, `docs/` ở gốc có được lên remote không, thư mục nào chỉ để đọc.
   Câu nào không có bằng chứng thì HỎI người dùng, đừng tự chọn.
3. **Trình kế hoạch theo khuôn** (`## Kế hoạch`, sáu mục, mỗi mục một dòng) và DỪNG chờ duyệt. Mục "Dịch vụ" ghi tên các đơn vị sẽ khai và sẽ được ghi tài liệu (ví dụ `api, web`). Kèm nguyên văn `project.json` sẽ ghi, và danh sách tệp sẽ tạo trong từng đơn vị.
4. **Được duyệt thì dựng:**
   1. Ghi `.claude/project/project.json` đúng như đã trình. Mẫu và nghĩa từng trường: `.claude/modules/core/FORMAT.md`.
   2. Gọi `scope_register` với các đơn vị trong mục "Dịch vụ" (từ lúc này harness đã biết chúng là đơn vị; sửa tệp trong đơn vị chưa đăng ký sẽ bị chặn).
   3. Gốc dự án chưa có `CLAUDE.md` thì tạo: luật chung (duyệt kế hoạch trước khi sửa, một phiên một đơn vị, việc của đơn vị khác ghi `docs/handoff/`), bảng đơn vị, bảng "việc gì dùng skill nào". Đã có thì chỉ THÊM mục còn thiếu.
   4. Mỗi đơn vị thiếu khung: `node .claude/modules/core/cli/new-service.js <tên>`. Lệnh chỉ tạo phần còn thiếu, không ghi đè. Rồi điền `CLAUDE.md` và `docs/agent/STATUS.md` của đơn vị từ mã thật: đơn vị làm gì, lệnh chạy và test, thư mục nào chứa gì. Điều chưa đọc thấy thì ghi "chưa rõ".
   5. Khai skill riêng của dự án nếu kế hoạch có: tạo `.claude/skills/<tên>/SKILL.md` (khuôn ở skill `skill-map`) và khai vào `skills.tools` hay `skills.files`.
5. **Kiểm:** `node .claude/modules/core/cli/cli.js doctor` phải không có dòng LỖI. Sửa tới khi sạch. Có dòng CẢNH BÁO thì nói với người dùng.
6. **Báo người dùng:** đã khai gì, tạo tệp nào, `doctor` nói gì, và việc người dùng cần làm (gõ `/mcp` nếu tóm tắt đầu phiên nhắc; commit khi họ muốn).

## Đã có thì sao, chưa có thì làm gì
| Thứ | Đã có | Chưa có |
|---|---|---|
| `project.json` | Đọc, chỉ đề xuất phần cần đổi | Dựng theo bước 2 |
| `CLAUDE.md` ở gốc | Giữ nguyên, thêm mục còn thiếu | Tạo từ đầu |
| `CLAUDE.md` của đơn vị | Giữ nguyên; thiếu một trong bốn mục bắt buộc thì thêm mục đó | `new-service.js` tạo khung, rồi điền từ mã |
| `docs/agent/STATUS.md` | Giữ nguyên | `new-service.js` tạo khung; thêm dòng nhật ký đầu tiên |
| Tài liệu có cấu trúc | Dùng skill `service-docs`, `diagrams` | Chỉ tạo khi người dùng bật; công cụ tự tạo khung ở lần ghi đầu |
| `.mcp.json` | Harness tự thêm một mục cho mỗi khối đang bật (`harness`, `harness-docs`, ...) khi mở phiên | Harness tự tạo khi mở phiên |

## Lỗi hay gặp
- Ghi `project.json` trước khi được duyệt: cổng duyệt chặn, và đó là đúng.
- Đoán đơn vị theo tên thư mục mà không có bằng chứng (repo riêng, tệp khai dự án riêng).
- Khai thư mục cha quá rộng (ví dụ gốc dự án): mọi thư mục cấp một, kể cả `docs/`, thành đơn vị. Khai đúng thư mục chứa đơn vị, hoặc khai từng đơn vị trong `units.dirs`.
- Khai công cụ ngoài harness trong `skills.tools` mà quên thêm tên đó vào matcher của nhóm hook `guard-skill.js` trong `.claude/settings.json`: khai mà không chặn (`doctor` báo).
- Viết nội dung tài liệu theo trí nhớ thay vì theo mã.

## Cách kiểm
- `node .claude/modules/core/cli/cli.js doctor` không có LỖI.
- Mở một phiên mới ở gốc: tóm tắt đầu phiên không còn "CHƯA CÀI ĐẶT DỰ ÁN" và liệt kê đúng các đơn vị.
- Thử ghi một tệp trong một đơn vị khi chưa đọc tài liệu bắt buộc: hook chặn và nói rõ còn thiếu gì.
