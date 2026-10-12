---
name: service-docs
description: Ghi tài liệu của một dịch vụ bằng công cụ bsn-docs: ba tầng thiết kế, đặc tả, hiện thực; docs/service.yaml; sổ vấn đề P-nnn. Dùng khi ghi hay sửa tài liệu, chốt quyết định thiết kế, điền đặc tả, gắn mã với đặc tả, ghi một vấn đề, hoặc khi docs check báo lệch.
---

# Ghi tài liệu của một dịch vụ

## Khi nào dùng
Ghi hay sửa tài liệu của một dịch vụ. Phiên mở ở gốc dự án. Đơn vị nằm ở thư mục khai trong `.claude/project/project.json`. Mọi lời gọi `bsn-docs` truyền `service="<tên>"`.

Việc liền kề:
- Sơ đồ: skill `diagrams`.
- Trang ba tab trên cổng, publish: skill `service-page`.
- Dịch vụ mới: skill `new-service`.

## Trước khi làm
Hook chặn lời gọi ghi cho tới khi phiên đã mở skill `services`, skill này, và đã đọc `CLAUDE.md` cùng `docs/agent/STATUS.md` của dịch vụ đang làm. Nắm các nguyên tắc sau:
- Chỉ ghi điều đã đọc thấy trong mã hoặc người dùng đã chốt. Điều chưa kiểm với hệ thống thật ghi vào `business.unverified`, không viết như đã chắc.
- Trong dịch vụ chỉ có Markdown và dữ liệu cho agent. Không tạo HTML trong dịch vụ.
- Tệp do công cụ sở hữu, sửa tay sẽ bị hook từ chối: `docs/modules/*/{1-design,2-spec,3-impl}.md`, `docs/_generated/`, `docs/service.yaml`, `docs/diagrams/`.
- Tệp sửa tay bình thường: `docs/agent/STATUS.md`, `DECISIONS.md`, `CONVENTIONS.md`, `CLAUDE.md` và README của dịch vụ.
- Số công cụ phải đủ như tóm tắt đầu phiên nêu. Thiếu, hoặc thấy dòng "CẢNH BÁO bsn-docs": báo người dùng gõ `/mcp` để nối lại, đừng tìm đường khác.

## Các bước
1. Xác định việc cần ghi thuộc dòng nào trong bảng "Việc nào dùng công cụ nào".
2. Đọc hiện trạng trước khi ghi: `service_doc_get` cho `docs/service.yaml`, `docs_status` cho ba tầng.
3. Ghi bằng đúng công cụ của dòng đó, truyền `service="<tên>"`.
4. Việc xuất phát từ mã vừa đổi hành vi: làm đủ danh sách ở mục "Mã vừa đổi hành vi: cập nhật những gì".
5. Kiểm theo mục "Cách kiểm".

## Việc nào dùng công cụ nào
| Việc | Công cụ | Ghi vào |
|---|---|---|
| Chốt một quyết định thiết kế của module | `design_record`, `design_update` | `docs/modules/<module>/1-design.md` |
| Điền yêu cầu, hợp đồng, tiêu chí nghiệm thu (SAU khi có mã) | `spec_fill` | `2-spec.md` |
| Gắn spec với mã và test đã làm | `impl_link` | `3-impl.md` |
| Xem tiến độ, kiểm đồng bộ | `docs_status`, `docs_check` | `docs/_generated/traceability.md` |
| Mô tả nghiệp vụ, kiến trúc, tiến độ | `service_doc_get` rồi `service_doc_set` | `docs/service.yaml` |
| Ghi hoặc cập nhật MỘT vấn đề | `problem_record` | `docs/service.yaml` |
| Sơ đồ (năm loại, mỗi dịch vụ cần đủ; kể cả sơ đồ tự sinh từ mã) | `diagram_list`, `diagram_get`, `diagram_validate`, `diagram_save`, `diagram_explain`, `diagram_review`, `diagram_generate` (skill `diagrams`) | `docs/diagrams/<id>.yaml` |
| Tra cứu một việc trước khi sửa; từ vựng nghiệp vụ; quan hệ máy không đọc ra | `context_explore`, `context_term`, `context_relate` (skill `context`) | `docs/context/` |
| Dựng lại cổng ngay | `portal_build` | `docs/portal/` |

## Ba tầng
- Thứ tự: design chốt trước; spec và impl chỉ điền SAU KHI có mã.
- Mã đánh dấu spec bằng một dòng chú thích `spec: <PREFIX>-S-nnn`, theo cú pháp chú thích của ngôn ngữ (JavaScript `// spec: ...`, Python, YAML, shell `# spec: ...`, SQL `-- spec: ...`); tệp JSON không cần. `docs check` cảnh báo tệp đã gắn mà chưa có dấu. `impl_link` yêu cầu tệp mã có thật.
- Sửa design làm spec và impl liên quan thành STALE cho tới khi rà lại bằng `spec_fill`.

## `docs/service.yaml`
- Tệp có bốn phần ghi bằng `service_doc_set` và một sổ vấn đề ghi bằng `problem_record`. Bốn phần: `meta` (tên, tóm tắt), `business` (mục tiêu, người dùng, giá trị, luồng, ngoài phạm vi, chưa kiểm), `architecture` (tóm tắt, lớp, thành phần, phụ thuộc vào, cung cấp cho, quyết định liên quan), `progress` (xong, đang làm, tiếp theo).
- `service_doc_set` thay TOÀN BỘ một phần: luôn `service_doc_get` trước, sửa rồi ghi lại cả phần.
- Sổ vấn đề CHỈ ghi bằng `problem_record`, không ghi qua `service_doc_set`. Các trường: `title`, `severity` (`low`, `medium`, `high`), `status` (`open`, `refining`, `resolved`), `detail` (vấn đề là gì, ảnh hưởng tới tiền, đơn hay người dùng thế nào), `refine` (đã hay đang tinh chỉnh ra sao), `refs` (danh sách: mã spec, mã quyết định, `đường-dẫn:dòng`).
  - Tạo mới: bỏ `id` (công cụ tự gán `P-nnn`); mặc định `status: "open"`, `severity: "medium"`.
  - Cập nhật: truyền `id` và chỉ các trường cần đổi.
  - Xử lý xong: `status: "resolved"` và ghi cách xử lý vào `refine`.
  - Trước khi tạo mới: `service_doc_get` và xem phần `problems` để tránh ghi trùng.
  - Vấn đề do người dùng nêu thì ghi được ngay (người dùng đã chốt). Nếu bạn chưa thấy nó trong mã, ghi rõ trong `detail` là "chưa đối chiếu với mã".
- Trường `architecture.diagrams` là trường cũ, không còn được vẽ. Đừng ghi sơ đồ vào đó.
- Trường `architecture.diagram_na` (tùy chọn): danh sách `{type, reason}` các loại sơ đồ KHÔNG áp dụng cho dịch vụ, kèm lý do (skill `diagrams`, mục "Mỗi dịch vụ đủ năm loại"). `service_doc_set` thay cả phần `architecture`, nên đang có trường này thì nhớ gửi lại.
- Từ `service.yaml` công cụ sinh `docs/_generated/overview.md` cho agent đọc.

## Mã vừa đổi hành vi: cập nhật những gì
Làm theo thứ tự, kể cả khi mã do người dùng sửa (lúc đó hook Stop không nhắc):
1. Sơ đồ nào nói về đoạn mã đó: sửa bằng skill `diagrams` (tìm tên tệp mã trong `sources` của `docs/diagrams/*.yaml`).
2. Ba tầng: tìm spec qua chú thích `// spec: ...` trong tệp mã hoặc `docs_status`. Thay đổi là một quyết định thiết kế mới của module thì `design_update` (hoặc `design_record`); rồi `spec_fill` cho đúng yêu cầu mới và `impl_link` lại.
3. `docs/service.yaml`: chỉ khi mô tả nghiệp vụ, kiến trúc hay tiến độ ở đó không còn đúng. Hành vi dựa trên điều chưa kiểm với hệ thống thật thì thêm vào `business.unverified`.
4. `docs/agent/STATUS.md`: thêm một dòng nhật ký (ngày, đổi gì, kiểm bằng gì, điều chưa kiểm).
5. Dịch vụ có bộ sinh `code`: `node .claude/modules/core/cli/cli.js --service <tên> code` để làm mới `code-map.md`.

Quyết định ghi ở đâu: quyết định thiết kế của MỘT module ghi bằng `design_record` (vào `1-design.md`); quyết định cho cả dịch vụ (cách làm việc, hạ tầng, quy ước) ghi tay vào `docs/agent/DECISIONS.md`.

## Lỗi hay gặp
- Gọi `service_doc_set` mà không `service_doc_get` trước: công cụ thay TOÀN BỘ một phần, nên gửi thiếu là mất phần còn lại (kể cả `architecture.diagram_na`).
- Ghi vấn đề qua `service_doc_set`: sổ vấn đề chỉ ghi bằng `problem_record`, từng vấn đề một.
- Điền đặc tả hay hiện thực trước khi có mã: `impl_link` đòi tệp mã có thật.
- Sửa tay tệp do công cụ sở hữu: hook từ chối, và `docs check` báo lệch.
- Viết điều chưa kiểm với hệ thống thật như đã chắc: phải ghi vào `business.unverified`.
- Ghi sơ đồ vào `architecture.diagrams`: trường cũ, không còn được vẽ; dùng skill `diagrams`.

## Cách kiểm
- Sửa mã thì cập nhật `docs/agent/STATUS.md` bằng Edit (hook Stop nhắc nếu quên). Chỉ sửa tài liệu thì thêm dòng nhật ký khi thay đổi đáng ghi (sơ đồ mới, vấn đề mới thì không bắt buộc).
- Kiểm đồng bộ sạch. Ba cách này là MỘT lệnh: công cụ `docs_check`; `node .claude/modules/core/cli/cli.js --service <tên> check` chạy từ gốc dự án; hoặc `npm run docs` chạy trong thư mục dịch vụ (nếu dịch vụ có script đó).
- Commit trong repo của dịch vụ khi người dùng yêu cầu. Trang trên cổng chỉ đổi sau commit; kiểm lại trang bằng skill `service-page`.
