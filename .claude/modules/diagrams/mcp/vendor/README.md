# vendor

Thư viện bên ngoài mà cổng `docs/portal` cần để vẽ sơ đồ trong trình duyệt. Đây là thư viện ngoài duy nhất của harness.

| Tệp | Thư viện | Phiên bản | Nguồn | SHA-256 |
|---|---|---|---|---|
| `mermaid.min.js` | Mermaid (giấy phép MIT) | 11.4.1 | https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js | `a43bc1afd446f9c4cc66ac5dd45d02e8d65e26fc5344ec0ef787f88d6ddb6f9e` |

- Người dùng tự tải tệp này ngày 2026-10-05 (Claude Code không cho phiên Claude tải mã ngoài vào repo).
- Bộ dựng cổng chép tệp sang `docs/portal/assets/mermaid.min.js`; trang của dịch vụ nạp nó từ đó.
- Test `test/diagrams.test.js` so mã băm của tệp với dòng trong bảng trên. Muốn đổi phiên bản: người dùng tải bản mới, sửa bảng này, rồi chạy `node .claude/modules/core/cli/cli.js diagrams-check` để chắc mọi sơ đồ vẫn vẽ được.
