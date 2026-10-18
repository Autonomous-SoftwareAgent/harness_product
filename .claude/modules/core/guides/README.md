# Hướng dẫn cho người vận hành và người mở rộng harness

Bộ này viết cho dev đã cài harness vào một dự án và cần biết: làm việc hằng ngày với nó ra sao, thêm skill ở đâu, thêm luật hay công cụ riêng thế nào, và việc nào do ai làm. Cách cài nằm ở `README.md` của gói; bảng tra cứu từng khóa cấu hình nằm ở `.claude/modules/core/FORMAT.md`; từng bản đổi gì nằm ở `RELEASES.md`. Các tệp ở đây không lặp lại những tờ đó, mà nói "làm gì, theo thứ tự nào".

## Đọc theo việc bạn cần làm
| Bạn là | Bạn cần | Đọc |
|---|---|---|
| Người vừa cài xong | Hiểu một phiên Claude làm việc ra sao dưới harness, lệnh nào để kiểm | [01-van-hanh.md](01-van-hanh.md) |
| Người vận hành dự án | Biết khi nào hook chặn, việc nào chỉ người dùng được làm, nâng cấp và gỡ | [01-van-hanh.md](01-van-hanh.md) |
| Người muốn dạy Claude cách làm một loại việc chung cho cả dự án | Thêm skill dùng chung, gắn nó vào việc cụ thể | [02-skill-toan-cuc.md](02-skill-toan-cuc.md) |
| Người giữ một repo trong dự án | Cho repo đó tài liệu bắt buộc, skill và luật riêng | [03-skill-theo-repo.md](03-skill-theo-repo.md) |
| Người muốn chặn thêm hay thêm công cụ riêng | Khối mở rộng, máy chủ MCP ngoài, bật tắt khối | [04-mo-rong.md](04-mo-rong.md) |
| Người muốn chỉ nói chuyện với một phiên mà nhiều repo cùng được làm | Phiên điều phối, ủy quyền duyệt kế hoạch, sub-agent của repo, bảng việc | [05-dieu-phoi-va-sub-agent.md](05-dieu-phoi-va-sub-agent.md) |

## Ba chỗ đặt, nhớ một lần
| Chỗ | Của ai | Bản mới của harness có đụng không |
|---|---|---|
| `.claude/modules/` | Gói | Có: thay toàn bộ. Sửa ở đây là sửa mã của gói (được phép, nhưng nâng cấp phải gộp) |
| `.claude/project/` | Dự án | Không bao giờ |
| `<repo>/.harness/` | Từng repo (đơn vị) | Không bao giờ |

Skill dùng chung nằm ở `.claude/skills/` (chỗ Claude Code đọc): bộ cài chỉ chép skill của gói còn thiếu vào đó và không ghi đè skill bạn đã sửa hay đã thêm.

## Ai làm việc gì
- **Agent (phiên Claude):** đọc dự án, trình kế hoạch, ghi cấu hình sau khi bạn duyệt, ghi tài liệu bằng công cụ MCP của harness, dựng sẵn và cài bản nâng cấp sau khi bạn duyệt.
- **Bạn (người dùng):** duyệt kế hoạch bằng một câu thường ("ok", "duyệt"); chạy ở terminal, ngoài phiên Claude, những lệnh cấp quyền chạy mã (`extension trust`, `mcp trust`); giữ danh sách từ cấm của máy.
- **Hook của harness:** chặn khi chưa duyệt, ngoài phạm vi, chưa đọc đủ tài liệu hay skill, hoặc ghi tay vào tệp do công cụ sở hữu. Hook là hàng rào cho phiên Claude, không phải sandbox: người ngồi trước máy vẫn sửa được mọi thứ.

## Kiểm nhanh mọi thứ đang đúng
```
node .claude/modules/core/cli/cli.js doctor
```
Không có dòng LỖI là đạt. Dòng CẢNH BÁO nói rõ thiếu gì và lệnh sửa.
