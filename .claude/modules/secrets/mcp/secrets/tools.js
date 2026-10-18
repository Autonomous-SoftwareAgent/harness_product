'use strict';
// Công cụ MCP của khối bí mật (máy chủ harness-secrets). Không công cụ nào nhận hay trả token: mọi thứ đi qua công cụ đều vào ngữ cảnh của model.
// Phạm vi theo kế hoạch đang duyệt của phiên gọi: đối tượng (repo của đơn vị ở mục Dịch vụ, repo/tổ chức/tài khoản ở dòng "GitHub") và việc
// (dòng "Được làm"). Không có kế hoạch được duyệt thì chỉ đọc repo của các đơn vị trong dự án.
const github = () => require('../../cli/github');
const sid = () => process.env.CLAUDE_CODE_SESSION_ID || '';

const TOOLS = [
  {
    name: 'secret_status',
    description: 'XEM tình trạng token GitHub của máy: còn dùng được không, còn bao nhiêu ngày, quyền thừa hay thiếu, kho nào, lần dùng cuối, và việc NGƯỜI DÙNG phải làm nếu có vấn đề. Không bao giờ trả token. Chỉ đọc.',
    inputSchema: { type: 'object', properties: { fresh: { type: 'boolean', description: 'true = hỏi lại GitHub ngay, bỏ bản tạm 6 giờ.' } } },
    noService: true,
    run: (a) => github().health(github().ROOT, { fresh: Boolean(a.fresh) }).then(github().healthText),
  },
  {
    name: 'github_ci',
    description: 'XEM GitHub Actions của một repo: các lần chạy gần đây (xanh, đỏ, đang chạy) hoặc log các bước hỏng của một lần chạy. Repo phải nằm trong phạm vi (repo của đơn vị, hoặc nêu trong kế hoạch đang duyệt). Chỉ đọc.',
    inputSchema: {
      type: 'object', required: ['repo'],
      properties: {
        repo: { type: 'string', description: 'Repo dạng chủ/tên.' },
        run: { type: 'string', description: 'Mã một lần chạy: trả log các bước hỏng của lần đó. Bỏ trống: danh sách lần chạy gần đây.' },
        branch: { type: 'string', description: 'Lọc theo nhánh (tùy chọn).' },
        limit: { type: 'integer', description: 'Số lần chạy (mặc định 10).' },
      },
    },
    noService: true,
    run: (a) => {
      const args = a.run
        ? ['run', 'view', String(a.run), '-R', String(a.repo), '--log-failed']
        : ['run', 'list', '-R', String(a.repo), '-L', String(Math.min(Number(a.limit) || 10, 50)), ...(a.branch ? ['-b', String(a.branch)] : [])];
      const r = github().runGh(args, { sid: sid() });
      if (!r.ok) throw new Error(r.text);
      return r.text || '(không có lần chạy nào)';
    },
  },
  {
    name: 'github_run',
    description: 'CHẠY một lệnh gh (kể cả `gh api` mọi phương thức) với token của máy, theo đúng kế hoạch đang duyệt: máy tự xác định lệnh đụng đối tượng nào (repo chủ/tên, tổ chức, tài khoản) và là việc gì (đọc; hoặc đẩy, gắn nhãn, deploy, quay lui, xóa, ghi đè, tạo repo, quản trị), rồi chỉ chạy khi đối tượng nằm trong phạm vi kế hoạch (mục Dịch vụ, dòng "- GitHub:") và việc có ở dòng "- Được làm:". Lệnh phải nêu đối tượng rõ (-R chủ/tên, --org, hoặc đường dẫn API). Không dùng để đẩy mã: đẩy bằng `git push`. Kết quả đã che token.',
    inputSchema: {
      type: 'object', required: ['args'],
      properties: { args: { type: 'array', items: { type: 'string' }, description: 'Đối số của gh, không có chữ "gh" ở đầu. Ví dụ ["run","rerun","123","-R","chủ/tên"] hoặc ["api","-X","DELETE","repos/chủ/tên"].' } },
    },
    noService: true,
    run: (a) => {
      if (!Array.isArray(a.args) || !a.args.length) throw new Error('args phải là danh sách đối số của gh');
      const r = github().runGh(a.args, { sid: sid() });
      if (!r.ok) throw new Error(r.text);
      return r.text || '(xong, không có đầu ra)';
    },
  },
];

module.exports = { TOOLS };
