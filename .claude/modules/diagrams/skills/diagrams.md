---
name: diagrams
description: Thêm, sửa, giải thích và soát sơ đồ của một dịch vụ bằng dữ liệu qua công cụ MCP của harness; năm loại: luồng, trình tự, trạng thái, dữ liệu, lớp. Dùng khi cần vẽ sơ đồ, khi mã đổi làm sơ đồ sai, khi sơ đồ tự sinh cần giải thích, hoặc docs check báo thiếu loại. Không tự viết Mermaid.
---

# Sơ đồ khai bằng dữ liệu

## Khi nào dùng
Cần một sơ đồ mới, hoặc mã vừa đổi làm một sơ đồ đang có sai. Phiên mở ở gốc dự án; mọi lời gọi truyền `service="<tên>"`.

## Trước khi làm
Hook chặn lời gọi ghi cho tới khi phiên đã mở skill `services`, skill này, và đã đọc `CLAUDE.md` cùng `docs/agent/STATUS.md` của dịch vụ đang làm. Quy tắc cứng:
- **Không tự viết cú pháp Mermaid vào bất cứ tệp nào** (tài liệu, HTML, bộ sinh). Hook `guard-owned.js` từ chối. Bạn khai DỮ LIỆU; công cụ sinh Mermaid mỗi lần dựng trang.
- Bản khai báo nằm ở `<thư mục đơn vị>/docs/diagrams/<id>.yaml`, chỉ ghi qua công cụ. Sửa tay bị chặn và `docs check` sẽ báo.
- Sơ đồ vẽ theo mã thật. Ghi tệp chứng minh vào `sources` (đường dẫn trong dịch vụ, phải có thật).
- Không thay sơ đồ người dùng đã duyệt bằng bản khác khi chưa hỏi. Sửa nội dung cho khớp mã thì được; đổi cách trình bày thì hỏi.
- **Bạn khai sơ đồ CHỨA GÌ; công cụ quyết VẼ THẾ NÀO.** Chiều vẽ, ngắt dòng chữ dài, cỡ chữ, màu và khung xem có nút thu phóng là việc của bộ vẽ. Đừng cố chỉnh hình bằng cách bẻ nội dung (chèn khoảng trắng, cắt cụt nhãn, đổi tên cho ngắn). Hình xấu thì khai lại theo dạng tầng bên dưới, hoặc tách sơ đồ.

## Ai khai, ai vẽ
Có hai nguồn nội dung, và chỉ MỘT bộ vẽ:

| Nội dung sơ đồ đến từ | Sơ đồ nào | Việc của bạn |
|---|---|---|
| Harness tự quét mã sau mỗi commit | Mã `tu-sinh-...`: phụ thuộc giữa các tệp mã, các lớp đã khai, cửa vào và cửa ra của dịch vụ (mỗi loại cửa vào một tầng: đường dẫn API, công cụ MCP, lệnh dòng lệnh, hook); và bản đồ cả hệ ở trang riêng | Đọc, viết giải thích, soát với mã (mục "Sơ đồ tự sinh từ mã") |
| Harness đọc từ cơ sở dữ liệu thật | `du-lieu-bang` | Chạy `diagram_generate` khi mã đổi cấu trúc bảng, viết giải thích |
| Agent khai qua công cụ | Trình tự, luồng nghiệp vụ, trạng thái, lớp, mô hình đối tượng trong cột JSON | Đưa nội dung dạng dữ liệu cho `diagram_save`, viết giải thích |

Dù nội dung đến từ đâu, hình luôn do công cụ vẽ, qua cùng một bộ vẽ và cùng một khung xem. Trang ghi rõ nguồn gốc dưới mỗi hình. Không ai vẽ bằng tay, không ai viết cú pháp sơ đồ.

## Mỗi dịch vụ đủ năm loại
Mỗi dịch vụ phải có ít nhất một sơ đồ của MỖI loại. `diagram_list` (hoặc `node .claude/modules/core/cli/cli.js --service <tên> diagrams`) liệt kê sơ đồ theo loại và nói loại nào còn thiếu; `docs check` cảnh báo (không chặn commit); trang của dịch vụ ghi "CHƯA CÓ" ở đúng mục.

| Loại | `type` | Trả lời câu hỏi | Tab |
|---|---|---|---|
| Luồng | `flowchart` | Thành phần nào nối thành phần nào; một việc đi qua các bước nào | `architecture` hoặc `business` |
| Trình tự | `sequence` | Ai gọi ai, theo thứ tự nào | `business` |
| Trạng thái | `state` | Một đối tượng đi qua những trạng thái nào | `architecture` |
| Dữ liệu | `erd` | Lưu gì, bảng nào, quan hệ, khóa chống trùng | `architecture` (mục "Dữ liệu") |
| Lớp | `class` | Các kiểu, module, giao diện trong mã quan hệ thế nào | `architecture` (mục "Kiểu và giao diện") |

Loại THẬT SỰ không áp dụng (ví dụ dịch vụ không lưu dữ liệu nào): không bỏ trống im lặng. Ghi lý do vào `architecture.diagram_na: [{type, reason}]` bằng `service_doc_set` (đọc `service_doc_get` trước, gửi lại đủ cả phần `architecture`); lý do hiện trên trang. Đừng khai "không áp dụng" chỉ vì chưa kịp vẽ.

## Các bước
1. Đọc mã để biết sơ đồ nói gì. Gọi `diagram_list` để xem các sơ đồ đang có, không vẽ trùng hay nói ngược nhau.
2. Gọi `diagram_validate` với hai tham số: `service` (tên dịch vụ) và `spec` (một ĐỐI TƯỢNG JSON theo lược đồ dưới, không phải chuỗi). Sai thì công cụ nêu đúng chỗ; sửa rồi gọi lại. Đúng thì công cụ trả bản xem trước.
3. Gọi `diagram_save` với cùng `service` và `spec`.
4. Gọi `diagram_explain` với `service`, `id` và `explain` để ghi phần giải thích dưới hình (mục "Phần giải thích" bên dưới). Sửa một sơ đồ đã có giải thích thì viết lại phần này, nếu không trang sẽ báo "có thể đã cũ".
5. `node .claude/modules/core/cli/cli.js --service <tên> check` (chạy từ gốc dự án) phải sạch.
6. Cập nhật danh sách và số sơ đồ trong `CLAUDE.md` của dịch vụ nếu có ghi.
7. Báo người dùng: sơ đồ đã lưu nhưng CHƯA lên trang cho tới khi repo dịch vụ commit. Chỉ commit khi người dùng yêu cầu.
8. Sau commit: `node .claude/modules/core/cli/cli.js diagrams-check` (chạy từ gốc dự án) mở trang bằng trình duyệt không giao diện và báo từng trang vẽ được bao nhiêu sơ đồ. Chạy trước commit thì lệnh chỉ thấy trang cũ. Kết quả "BỎ QUA" nghĩa là CHƯA kiểm, không phải đạt. Lệnh cũng báo sơ đồ nào "quá lớn" (rộng hơn 1800px hoặc cao hơn 2400px ở kích thước thật): sơ đồ đó nên khai lại theo dạng tầng hoặc tách ra.

### Sửa một sơ đồ đang có
- Đọc một sơ đồ để hiểu hay để soát: `diagram_get` với `id`. Công cụ trả DẠNG GỌN (mỗi nút, mỗi cạnh một dòng), ngắn hơn nhiều so với bản khai báo.
- Cần SỬA một sơ đồ do agent khai: gọi `diagram_get` với `format: "json"` để lấy bản khai báo đang lưu.
- `diagram_save` THAY TOÀN BỘ sơ đồ cùng `id`. Sửa chỗ cần sửa trong bản khai báo rồi gửi lại ĐỦ bằng `diagram_save`. Gửi mỗi phần mới là mất phần còn lại. Không cần mở tệp `.yaml`.
- Sơ đồ dữ liệu TỰ SINH (kết quả `diagram_get` ghi "TỰ SINH") không sửa bằng `diagram_save`: sinh lại bằng `diagram_generate` (mục "Sơ đồ dữ liệu").
- Giữ nguyên `id`, `tab` và `title` trừ khi người dùng bảo đổi.
- Mã vừa đổi thì sơ đồ nào phải sửa: tìm tên tệp mã trong trường `sources` của các tệp `docs/diagrams/*.yaml`, rồi đọc từng sơ đồ khớp.

### Dạng tầng: cách khai chuẩn cho sơ đồ nhiều phần
Sơ đồ luồng có từ hai phần trở lên (các giai đoạn của một quy trình, các lớp của một hệ) thì khai thế này, hình sẽ gọn và đọc được ở kích thước thật:
- Mỗi `group` là MỘT TẦNG, 1 đến 4 nút. Thứ tự các nhóm trong danh sách là thứ tự tầng từ trên xuống.
- Cạnh trong một tầng nối nút với nút.
- Cạnh GIỮA hai tầng nối NHÓM với NHÓM: `from` và `to` là mã nhóm, `line: "thick"`, kèm nhãn ngắn nói điều gì đi sang tầng kia.
- Vòng lặp, đường quay lại: `line: "dotted"`.
- Màu (`style`) nói LOẠI của nút (ví dụ lớp vào/ra, lớp logic), không nói vị trí.

Khi đó công cụ xếp các tầng từ trên xuống và trong mỗi tầng đi từ trái sang phải. Chỉ cần MỘT cạnh nối thẳng một nút ở tầng này với một nút ở tầng khác là thư viện vẽ bỏ cách xếp trong tầng, và hình giãn ra rất rộng (đã đo trên một sơ đồ thật: 3423px so với 1619px). Cần nói rõ nút nào nối nút nào giữa hai tầng thì ghi vào nhãn của cạnh nối nhóm và vào phần giải thích.

Sơ đồ quá 12 nút hoặc quá 5 tầng: tách thành hai sơ đồ (ví dụ một sơ đồ tổng theo tầng, một sơ đồ chi tiết cho tầng phức tạp nhất).

### Sơ đồ tự sinh từ mã (mã `tu-sinh-...`)
Sau mỗi commit, harness quét mã của bản đã commit và dựng lại các sơ đồ này. Bạn không khai và không sửa được chúng; `diagram_save` từ chối mã bắt đầu bằng `tu-sinh-`. Muốn hình đổi thì đổi mã rồi commit.

1. `diagram_list` liệt kê chúng ở cuối, kèm tình trạng "giải thích" và "soát".
2. `diagram_get` với `id`: trả hình ở dạng gọn (mỗi nút một dòng, mỗi cạnh một dòng). Với sơ đồ phụ thuộc, bên dưới có danh sách ĐỦ mọi lệnh nhập theo từng tệp, vì trên hình các lệnh nhập giữa hai lớp đã được gộp thành một cạnh có số đếm.
3. Soát: đối chiếu danh sách đó với mã (mở vài tệp, xem các dòng nhập). Rồi gọi `diagram_review` với `id` và `verdict`:
   - `"đúng"`: hình khớp mã ở bản này.
   - `"sai"` kèm `note` nói sai chỗ nào, theo tệp và dòng nào. Bộ quét thuộc harness; phiên harness sẽ sửa. Đừng tìm cách vá hình.
4. Quan hệ CÓ THẬT mà máy không đọc ra (nhập theo tên tính lúc chạy, tuân theo một hợp đồng được kiểm lúc chạy) không phải là "sai": khai thêm bằng `context_relate` (skill `context`). `diagram_get` và trang dịch vụ đều ghi rõ máy chỉ thấy lệnh nhập viết rõ trong mã.
5. Viết giải thích bằng `diagram_explain` như mọi sơ đồ khác. Nói điều máy không nói được: vì sao các lớp phụ thuộc theo chiều đó, cạnh nào là chủ ý, cạnh nào là nợ kỹ thuật.
6. Hình đổi sau một commit thì giải thích và lần soát cũ bị đánh dấu là cũ; làm lại hai bước 3 và 5 cho phần đổi.

Phần bạn ghi nằm ở `docs/context/auto.yaml` của dịch vụ (tệp do công cụ sở hữu) và lên trang sau khi repo dịch vụ commit.

### Sơ đồ dữ liệu (`erd`): tự sinh trước, agent khai phần còn lại
Dịch vụ dùng cơ sở dữ liệu quan hệ (PostgreSQL) thì KHÔNG tự khai các bảng: công cụ đọc từ cơ sở dữ liệu thật. Nó tạo một cơ sở dữ liệu tạm trên PostgreSQL local, chạy LỆNH TẠO BẢNG của dịch vụ vào đó, đọc bảng, cột, kiểu, khóa chính, ràng buộc duy nhất và khóa ngoại, rồi xóa cơ sở dữ liệu tạm. Dữ liệu của hệ đang chạy không bị đụng tới. Cần một PostgreSQL đang chạy trên máy.

- **Lần đầu (hoặc khi đổi lệnh tạo bảng)**: viết một tệp JSON rồi chạy `node .claude/modules/core/cli/cli.js --service <tên> diagram-generate <tệp.json>` (từ gốc dự án). Tệp gồm:
  - `id`, `title`
  - `sources`: tệp mã khai cấu trúc bảng (ví dụ `src/store-postgres.js`); tệp này đổi thì `docs check` nhắc sinh lại
  - `command`: lệnh tạo bảng dạng DANH SÁCH đối số, chạy trong thư mục dịch vụ, không qua shell; phần tử đầu phải là `node`, `python`, `python3`, `py` hoặc `uv`. Lệnh chỉ được tạo bảng rồi thoát (không mở cổng, không chạy mãi).
  - `url_env`: tên biến môi trường mà lệnh đó đọc địa chỉ cơ sở dữ liệu; `url_format`: khuôn địa chỉ có đủ `{user}`, `{password}`, `{host}`, `{port}`, `{db}`
  - `tables` (tùy chọn): chỉ lấy các bảng này, khi dịch vụ có quá 30 bảng và cần chia nhiều sơ đồ
- **Các lần sau** (mã vừa đổi cấu trúc bảng): gọi công cụ `diagram_generate` với `id`. Công cụ MCP chỉ chạy lệnh ĐÃ COMMIT trong sơ đồ đó, không nhận lệnh mới.
- Sau khi sinh: viết (hoặc viết lại) phần giải thích bằng `diagram_explain`; nếu cấu trúc không đổi thì phần giải thích cũ còn khớp.
- Kiểu cột dài được rút gọn (`character varying(128)` thành `varchar(128)`); dấu cách và dấu phẩy trong kiểu thành gạch dưới trên hình (`numeric(12,2)` hiện là `numeric(12_2)`) vì thư viện vẽ không nhận.

Phần mô hình KHÔNG đọc được từ cơ sở dữ liệu thì agent khai qua công cụ, bằng `diagram_save` với `type: "erd"`, thành một sơ đồ RIÊNG (đừng trộn vào sơ đồ tự sinh):
- Đối tượng nằm trong một cột JSON: thực thể có `store: "json"`.
- Tài liệu của cơ sở dữ liệu dạng tài liệu: `store: "document"`.
- Quan hệ LUÔN khai từ phía "một" (`from`) sang phía "nhiều" (`to`). Ví dụ một đơn có nhiều lần thử: `{from: "payment", to: "attempt", label: "paymentId"}`.
- Chỉ khai trường đọc thấy trong mã (ghi tệp vào `sources`); trang ghi rõ sơ đồ này là "agent khai qua công cụ, từ mã".

Cơ sở dữ liệu loại khác (hướng cột, tài liệu) chưa có bộ đọc: agent khai qua công cụ, hoặc ghi yêu cầu thêm bộ đọc vào `docs/handoff/` cho phiên harness.

### Sơ đồ lớp (`class`)
Vẽ các kiểu, module, giao diện trong mã và quan hệ giữa chúng. Mã không có kiểu khai sẵn (JavaScript) thì mỗi `class` là một module hoặc một hợp đồng, `members` là các hàm hay hằng nó cung cấp.
- Chỉ vẽ thứ có thật trong mã, và chỉ các thành viên chính (tối đa 20 dòng mỗi lớp). Sơ đồ quá 12 lớp thì tách.
- Quan hệ khai bằng NGHĨA ở trường `kind`, đọc là "from ... to": `composition` và `aggregation` (from CHỨA to), `inheritance` (from KẾ THỪA to), `implementation` (from CÀI ĐẶT to), `association` và `dependency` (from DÙNG to; `dependency` là mặc định). Không nghĩ tới ký hiệu mũi tên.
- `stereotype` nói đó là gì: `interface`, `abstract`, `module`, `service`, `struct`, `enum`.
- Hướng phụ thuộc trong hình phải khớp test giữ ranh giới ba lớp của dịch vụ (lõi không phụ thuộc ngược lên lớp vào/ra).

### Phần giải thích (`diagram_explain`)
Mỗi sơ đồ có một phần giải thích hiện ngay dưới hình, gồm bốn mục. Gọi `diagram_explain` với `service`, `id` (sơ đồ đã lưu) và `explain`:

| Trường | Viết gì |
|---|---|
| `meaning` | Một đoạn: sơ đồ cho biết điều gì, vì sao quan trọng với tiền, đơn hay người dùng |
| `read` | 1 đến 8 bước cách đọc hình: đọc theo chiều nào, nét đậm, nét chấm, màu nghĩa là gì, chỗ nào là điểm quyết định |
| `details` | Danh sách `{term, text}`: giải nghĩa từng nút, nhóm, người tham gia, trạng thái, thực thể, cột (`bảng.cột`), lớp, thành viên hoặc bước. `term` phải chứa tên của nó trên hình, hoặc là số thứ tự bước ("Bước 3") |
| `pitfalls` | Tối đa 6 chỗ người đọc dễ hiểu sai (điều sơ đồ KHÔNG nói, điều chưa kiểm với hệ thống thật) |

- Viết từ mã thật (các tệp trong `sources`). Điều chưa kiểm với hệ thống thật thì ghi là chưa kiểm, đừng viết như đã chắc.
- Mọi chuỗi là một dòng. Không lặp lại chữ đã có trên hình; nói điều hình không tự nói được.
- `diagram_save` không nhận trường `explain`. Sửa hình bằng `diagram_save` thì phần giải thích cũ được giữ nhưng trang báo "có thể đã cũ": đọc lại và gọi `diagram_explain` lần nữa.

### Đặt mã (`id`)
Bắt buộc theo mẫu dưới, tiếng Việt không dấu, kể cả với dịch vụ mới (một phiên thử đã đặt mã tiếng Anh kiểu `ping-sequence`; đừng làm vậy). Theo loại, để nhìn tên là biết: `trinh-tu-<ý>` (trình tự), `luong-<ý>` (luồng xử lý), `trang-thai-<ý>` (trạng thái), `ket-noi-<ý>` (cấu trúc, kết nối), `du-lieu-<ý>` (dữ liệu; sơ đồ tự sinh từ cơ sở dữ liệu đặt `du-lieu-bang`), `kieu-<ý>` (lớp).

## Lược đồ
Chung cho mọi loại:

| Trường | Ý nghĩa |
|---|---|
| `id` | chữ thường, số, gạch ngang; cũng là tên tệp |
| `type` | `flowchart`, `sequence`, `state`, `erd` hoặc `class` |
| `title` | một dòng |
| `tab` | LUÔN ghi rõ, đừng dựa vào mặc định (`architecture`). `business`: sơ đồ trình tự và sơ đồ luồng xử lý nghiệp vụ. `architecture`: sơ đồ trạng thái và sơ đồ cấu trúc, kết nối giữa các thành phần. `problems`: sơ đồ minh họa một vấn đề trong sổ vấn đề. Sơ đồ dữ liệu và sơ đồ lớp chỉ nhận `architecture` |
| `sources` | danh sách tệp trong dịch vụ chứng minh sơ đồ |

Sơ đồ luồng (`flowchart`):
- `direction`: `TB` (mặc định), `LR`, `BT`, `RL`. Chỉ là gợi ý: sơ đồ có nhóm thì công cụ tự chọn chiều (xem "Dạng tầng").
- `nodes`: `{id, label, lines?, style?, shape?, group?}`. `lines` là tối đa 6 dòng phụ dưới nhãn. `style`: gray, green, blue, amber, pink, red, teal. `shape`: box, round, stadium, cylinder, diamond (ô quyết định), circle.
- `edges`: `{from, to, label?, line?, arrow?}`. `line`: solid, dotted, thick. `arrow`: forward, none, both.
- `groups`: `{id, label, direction?}`, khung bao các nút có `group` trỏ tới nó. Cạnh nhận cả mã nhóm ở `from` và `to`.

Sơ đồ trình tự (`sequence`):
- `participants`: `{id, label, actor?}` (`actor: true` vẽ hình người).
- `autonumber` (trường cấp cao nhất của `spec`, cùng cấp với `participants`): `true` để đánh số bước.
- `steps`: mỗi bước là đúng MỘT trong:
  - `{message: {from, to, text, reply?}}` (`reply: true` là nét đứt trả lời; `from` bằng `to` là tự xử lý)
  - `{note: {over: [id], text}}`
  - `{alt: {branches: [{when, steps}], otherwise?: {steps}}}` (rẽ nhánh; alt không lồng alt)

Sơ đồ trạng thái (`state`):
- `states`: `{id, label?, style?}`. Không có `label` thì `id` là chữ hiện trên hình. `style` (cùng bảng màu với sơ đồ luồng) tô màu trạng thái theo LOẠI, ví dụ xanh lá cho kết thúc tốt, đỏ cho thất bại.
- `start`: danh sách trạng thái đầu. `end`: danh sách trạng thái cuối.
- `transitions`: `{from, to, label?}`.

Sơ đồ dữ liệu (`erd`):
- `entities`: `{id, label?, store?, columns?}`. `store`: `table` (mặc định, bảng thật), `json` (đối tượng trong cột JSON), `document`.
- `columns`: `{type, name, keys?, note?}`. `keys`: danh sách trong `PK`, `FK`, `UK` (duy nhất). `name` chỉ gồm chữ, số, gạch dưới.
- `relations`: `{from, to, label, from_card?, to_card?}`. `from` là phía "một" (`from_card`: `one` mặc định, `zero-or-one`); `to` là phía "nhiều" (`to_card`: `many` mặc định, `one`, `zero-or-one`). `label` bắt buộc, thường là tên trường nối hai bên.
- `direction` (tùy chọn): `TB`, `LR`, `BT`, `RL`.

Sơ đồ lớp (`class`):
- `classes`: `{id, label?, stereotype?, members?, style?}`.
- `relations`: `{from, to, kind?, label?}`.
- `direction`: `TB` (mặc định), `LR`, `BT`, `RL`.

Quy ước: mã phần tử gồm chữ, số, gạch dưới, bắt đầu bằng chữ, không trùng từ dành riêng của Mermaid (end, class, state, note, subgraph...). Mọi chuỗi là một dòng; nhãn tối đa 80 ký tự, lời trong sơ đồ trình tự tối đa 160. Trường lạ bị từ chối.

## Ví dụ (sơ đồ trạng thái)
Đây là ví dụ về hình dạng. Đừng dùng lại `id` của một sơ đồ đang có: lưu trùng `id` là ghi đè sơ đồ đó.
```json
{ "id": "trang-thai-vi-du", "type": "state", "title": "Ví dụ: đơn hàng", "tab": "architecture", "sources": ["src/hub.js"],
  "states": [{ "id": "OPEN" }, { "id": "PAID" }, { "id": "CLOSED" }],
  "start": ["OPEN"], "end": ["PAID", "CLOSED"],
  "transitions": [{ "from": "OPEN", "to": "PAID", "label": "có lần thử SUCCEEDED" }, { "from": "OPEN", "to": "CLOSED", "label": "quá hạn" }] }
```

## Việc khác
- Liệt kê sơ đồ và loại còn thiếu: `diagram_list`. Xóa một sơ đồ sai hẳn: `diagram_remove` với `id`.
- Phiên chưa nối lại MCP (thiếu `diagram_list`, `diagram_get`, `diagram_review`) thì báo người dùng gõ `/mcp`. Cùng các việc đó có ở dòng lệnh (chạy từ gốc dự án): `node .claude/modules/core/cli/cli.js --service <tên> diagrams`, `diagram-get <id> [--json]`, `diagram-review <tệp.json>`, `diagram-save <tệp.json>`, `diagram-explain <id> <tệp.json>`, `diagram-generate <id|tệp.json>`, `diagram-remove <id>`.
- Khi bộ vẽ đổi, mọi sơ đồ tự được vẽ lại và kiểm lại; bạn không phải lưu lại sơ đồ nào.
- Sơ đồ nằm ở đâu trên trang: skill `service-page`.
- Công cụ không diễn đạt được điều cần vẽ (thiếu loại sơ đồ, thiếu trường): KHÔNG lách bằng Mermaid viết tay. Ghi yêu cầu vào `docs/handoff/` cho phiên harness, hoặc xin người dùng cho sửa công cụ (`.claude/modules/diagrams/core/diagrams/spec.js`, `.claude/modules/diagrams/adapters/mermaid/render.js`).

## Lỗi hay gặp
- Gửi `diagram_save` chỉ với phần mới: công cụ THAY TOÀN BỘ sơ đồ cùng `id`, phần không gửi lại là mất.
- Dùng lại `id` của một sơ đồ đang có: ghi đè sơ đồ đó.
- Sửa hình mà không viết lại phần giải thích: trang báo "có thể đã cũ".
- Coi kết quả "BỎ QUA" của `diagrams-check` là đạt: đó là CHƯA kiểm.
- Bẻ nội dung để chỉnh hình (chèn khoảng trắng, cắt nhãn): khai lại theo dạng tầng hoặc tách sơ đồ.
- Khai "không áp dụng" chỉ vì chưa kịp vẽ.
- Báo xong trong khi sơ đồ chưa lên trang: trang chỉ đổi sau khi repo dịch vụ commit.

## Cách kiểm
Trước commit (việc của bạn xong ở đây nếu người dùng chưa bảo commit):
- `diagram_save` trả "Đã ghi sơ đồ"; `diagram_explain` trả "Đã ghi phần giải thích".
- `node .claude/modules/core/cli/cli.js --service <tên> check` không có lỗi; cảnh báo "chưa đủ bộ sơ đồ" còn thì nói với người dùng loại nào còn thiếu.
- Đã nói rõ với người dùng là sơ đồ chưa lên trang.

Sau commit:
- `diagrams-check` báo trang của dịch vụ vẽ được đủ số sơ đồ.
