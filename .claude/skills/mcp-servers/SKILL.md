---
name: mcp-servers
description: Thêm, tùy biến, xác nhận, gỡ và soi tình trạng máy chủ MCP sau cổng của harness (Playwright, máy chủ HTTP, máy chủ tự viết). Dùng khi người dùng muốn thêm một máy chủ MCP, khi công cụ của một máy chủ biến mất, hoặc khi cần khai công cụ ghi ra ngoài.
---

# Máy chủ MCP sau cổng của harness

Claude Code chỉ thấy MỘT máy chủ MCP của dự án (tên `bsn-docs`). Phía sau nó là cổng: bộ công cụ tài liệu của harness, và mọi máy chủ MCP khai trong `.claude/project/mcp.json`. Thêm, sửa, gỡ một máy chủ thì phiên đang mở có ngay công cụ mới trong vài giây; không ai phải gõ `/mcp` hay mở lại phiên.

## Khi nào dùng
- Người dùng muốn thêm một máy chủ MCP (trình duyệt Playwright, một máy chủ HTTP công khai, máy chủ tự viết), bớt công cụ của nó, đổi tên, hay gỡ nó.
- Công cụ của một máy chủ biến mất, hoặc lời gọi trả về "Máy chủ MCP ... đang hỏng".
- Cần khai công cụ nào của một máy chủ là ghi ra ngoài (tạo việc, sửa trang ở hệ thống khác).
- Người dùng hỏi về máy chủ cần đăng nhập (Atlassian, Google Drive...): xem mục "Máy chủ cần đăng nhập".

## Trước khi làm
- Máy chủ MCP là mã của bên thứ ba chạy với quyền của người dùng, và có thể gửi dữ liệu ra ngoài. Vì vậy máy chủ mới CHỈ chạy sau khi được xác nhận, và phiên Claude chỉ xác nhận được khi người dùng đã duyệt kế hoạch nêu đúng máy chủ đó.
- Khóa truy cập không bao giờ ghi vào tệp: đặt vào biến môi trường của máy, trong khai báo viết `${TÊN_BIẾN}`. Lệnh `add` từ chối giá trị trông như khóa.
- Tên máy chủ: 2 đến 24 chữ thường hoặc số, bắt đầu bằng chữ. Tên này đứng đầu tên công cụ: `mcp__bsn-docs__<tên>_<công cụ>`.
- Sửa `.claude/project/mcp.json` là sửa tệp của harness: đi qua cổng duyệt như mọi lần sửa.

## Các bước
1. Xem hiện trạng: `node .claude/modules/core/cli/cli.js mcp list`.
2. Khai máy chủ (chưa chạy gì):
   - Chạy trên máy: `... mcp add <tên> --command npx --arg @playwright/mcp@latest`
   - Từ xa: `... mcp add <tên> --url https://máy-chủ/mcp` (thêm `--type sse` cho máy chủ SSE kiểu cũ; `--header "Authorization=Bearer ${TÊN_BIẾN}"` khi cần khóa)
   - Lệnh in một MÃ dạng `mcp:<tên>@<8 ký tự>`.
3. Trình kế hoạch theo khuôn cho người dùng. Trong mục "Làm gì" ghi đúng mã đó, kèm lệnh chạy hoặc địa chỉ của máy chủ, và nó dùng để làm gì. Chờ người dùng duyệt.
4. Được duyệt: `... mcp trust <tên>`. Công cụ của máy chủ hiện ra ở mọi phiên đang mở trong vài giây.
5. Kiểm: `... mcp list` phải ghi "đang chạy, N công cụ"; gọi thử một công cụ chỉ đọc.

## Tùy biến (không phải xác nhận lại)
Sửa các khóa này trong `.claude/project/mcp.json` thì có hiệu lực ngay, máy chủ không bị nối lại:

| Khóa | Nghĩa |
|---|---|
| `tools.include`, `tools.exclude` | Chỉ lấy, hoặc bỏ, một số công cụ. Mẫu là tên, hoặc `tiền-tố*` |
| `tools.rename` | Đổi tên công cụ: `{ "tên_cũ": "tên_mới" }` |
| `writes` | Công cụ GHI RA NGOÀI: phiên chỉ gọi được khi người dùng đã duyệt kế hoạch (như một lần sửa tệp) |
| `timeoutMs`, `startTimeoutMs` | Hạn giờ của một lời gọi (mặc định 120 giây) và của lúc nối (mặc định 30 giây) |
| `disabled` | `true` để tạm tắt mà không gỡ |

Đổi `type`, `command`, `args`, `cwd`, `env`, `url`, `headers` là đổi mã nào chạy và nói với ai: bản đã xác nhận vẫn chạy, bản mới chờ duyệt lại (mã mới, làm lại bước 3 và 4).

## Máy chủ hỏng thì sao
- Máy chủ không nối được, treo, hay trả lời sai thì bị bỏ qua; các máy chủ khác và công cụ tài liệu vẫn chạy.
- Đang chạy mà lỗi hoặc quá giờ 3 lần liên tiếp thì bị tạm ngắt: công cụ của nó rút khỏi danh sách.
- Cổng tự thử lại theo nhịp thưa dần (5 giây, 15 giây, 1 phút, 5 phút). Chạy lại được thì công cụ tự hiện lại.
- Xem vì sao: `... mcp list` (cũng có ở `doctor` và tóm tắt đầu phiên). Nối thử riêng một máy chủ: `... mcp test <tên>`.

## Máy chủ cần đăng nhập
Máy chủ đòi đăng nhập qua trình duyệt (Atlassian, Google Drive, Microsoft 365...) KHÔNG đi qua cổng này. Người dùng nối một lần ở claude.ai (mục kết nối của tài khoản); công cụ tự có trong Claude Code dưới tên `mcp__claude_ai_<kết nối>__<công cụ>`. Harness không giữ mã đăng nhập, không điều khiển và không kiểm sức khỏe được các kết nối đó. Muốn công cụ ghi của chúng qua cổng duyệt: thêm mẫu vào `account.writes` của `.claude/project/mcp.json`, ví dụ `"mcp__claude_ai_*__create*"`.

## Gỡ
- Tạm thôi chạy: `... mcp untrust <tên>`. Gỡ hẳn khỏi khai báo: `... mcp remove <tên>`. Cả hai có hiệu lực ở mọi phiên trong vài giây.

## Lỗi hay gặp
- Chạy `mcp trust` khi kế hoạch chưa được duyệt, hoặc kế hoạch không ghi mã: lệnh từ chối và in mã cần ghi. Không tìm đường khác; sổ xác nhận (`.claude/local/mcp/`) được cổng duyệt bảo vệ.
- Sửa lệnh chạy sau khi đã duyệt rồi thắc mắc vì sao bản mới chưa chạy: mã đã đổi, phải trình và duyệt lại.
- Ghi khóa thẳng vào `headers` hay `env`: tệp khai báo được commit. Dùng `${TÊN_BIẾN}`; thiếu biến thì máy chủ bị đánh dấu hỏng và lời báo nêu tên biến.
- Bảo người dùng gõ `/mcp` sau khi thêm máy chủ: không cần. Chỉ cần khi kết quả công cụ có dòng "CẢNH BÁO bsn-docs".
- Khai mọi công cụ là `writes` cho chắc: công cụ đọc bị chặn oan, phiên phải trình kế hoạch cho việc chỉ xem.
- Đưa máy chủ cần đăng nhập qua cổng: không được; nối ở tài khoản claude.ai.

## Cách kiểm
- `node .claude/modules/core/cli/cli.js mcp list`: máy chủ ghi "đã xác nhận | đang chạy, N công cụ".
- Trong phiên: công cụ `mcp__bsn-docs__<tên>_...` gọi được; công cụ khai `writes` bị chặn khi chưa có kế hoạch được duyệt.
- `node .claude/modules/core/cli/cli.js doctor` không có dòng cảnh báo "máy chủ MCP".
