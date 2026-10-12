---
name: service-page
description: Trang ba tab của một đơn vị trên cổng HTML docs/portal - mục nào thuộc tab nào, nội dung lấy từ đâu, dựng lại và kiểm. Dùng khi trang thiếu mục, sai nội dung, hay cần dựng lại.
---

# Trang của đơn vị trên cổng

## Khi nào dùng
Trang `docs/portal/<tên>/index.html` thiếu mục, sai nội dung, hoặc cần dựng lại. Ghi nội dung nguồn thì dùng skill `service-docs`; sơ đồ thì dùng skill `diagrams`.

## Trước khi làm
- Không sửa tay tệp nào trong `docs/portal/` (hook chặn): sửa NGUỒN rồi dựng lại.
- Trang chỉ hiện bản ĐÃ COMMIT của repo đơn vị, và tự dựng lại sau mỗi commit (git hook `post-commit`).
- Không đặt HTML trong thư mục đơn vị.

## Các bước
1. Xác định phần thiếu hay sai thuộc tab nào và lấy từ nguồn nào (hai bảng dưới).
2. Sửa NGUỒN: chữ và sổ vấn đề bằng skill `service-docs`, sơ đồ bằng skill `diagrams`.
3. Commit ở repo đơn vị khi người dùng bảo; cổng tự dựng lại. Dựng tay: `node .claude/modules/core/cli/cli.js portal` (hoặc công cụ `portal_build`).
4. Kiểm theo mục "Cách kiểm".

## Ba tab: mục nào ở đâu
| Tab | Thuộc về tab này |
|---|---|
| Nghiệp vụ | Đơn vị làm gì cho người dùng: luồng chính, sơ đồ trình tự và sơ đồ luồng nghiệp vụ, quy tắc, trường hợp bất thường |
| Kiến trúc kỹ thuật | Lớp và thành phần, sơ đồ trạng thái và sơ đồ kết nối, mục Dữ liệu (sơ đồ dữ liệu), mục Kiểu và giao diện (sơ đồ lớp), hệ thống bên ngoài, cách chạy |
| Vấn đề và tinh chỉnh | Sổ vấn đề `P-nnn`, tiến độ, việc tiếp theo, điều chưa kiểm |

## Nội dung lấy từ đâu
| Phần | Nguồn | Ghi bằng |
|---|---|---|
| Nghiệp vụ, kiến trúc dạng chữ, sổ vấn đề, tiến độ | `docs/service.yaml` | `service_doc_set`, `problem_record` |
| Sơ đồ | `docs/diagrams/*.yaml` | `diagram_save` |

## Đã có thì sao, chưa có thì làm gì
| Thứ | Đã có | Chưa có |
|---|---|---|
| Trang của đơn vị | Sửa nguồn, đợi commit hoặc dựng tay | Trang có sau khi đơn vị commit `docs/service.yaml` (tạo bằng `service_doc_set`) |
| Thư viện vẽ `.claude/modules/diagrams/mcp/vendor/mermaid.min.js` | Sơ đồ vẽ thành hình | Sơ đồ hiện dạng chữ; người dùng tự tải thư viện (xem `vendor/README.md`) |

## Lỗi hay gặp
- Sửa `service.yaml` hay sơ đồ rồi chờ trang đổi ngay: phải đợi đơn vị commit.
- Sửa tay trang đã sinh: hook chặn, và lần dựng sau ghi đè.

## Cách kiểm
- `node .claude/modules/core/cli/cli.js portal`: dòng kết quả nêu đơn vị nào chưa có trang.
- `node .claude/modules/core/cli/cli.js diagrams-check`: mọi sơ đồ vẽ được trong trình duyệt. Kết quả "BỎ QUA" là CHƯA kiểm.
- Mở cả ba tab bằng mắt trước khi báo xong.
