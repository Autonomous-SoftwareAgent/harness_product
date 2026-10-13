'use strict';
// spec: HOOK-S-010
// Công cụ MCP của khối context: kho ngữ nghĩa, từ vựng, quan hệ, soát sơ đồ tự sinh. mcp-tools.js gom qua bảng đăng ký
// (khóa `tools` trong modules/context.json).
const core = require('../../../servicedocs/mcp/docs/core');

const str = (description) => ({ type: 'string', description });
const strs = (description) => ({ type: 'array', items: { type: 'string' }, description });

const TOOLS = [
  {
    name: 'diagram_review',
    description: 'Ghi KẾT QUẢ SOÁT một sơ đồ TỰ SINH (mã "tu-sinh-..."): đọc nó bằng diagram_get, đối chiếu với mã, rồi ghi verdict "đúng", hoặc "sai" kèm note nói sai chỗ nào (bộ quét thuộc harness, phiên harness sẽ sửa). ' +
      'Hình đổi sau một commit thì lần soát cũ hết hiệu lực. Quan hệ có thật mà máy không đọc ra (nhập động, tuân thủ lúc chạy) thì không phải "sai": khai thêm bằng context_relate.',
    inputSchema: { type: 'object', properties: { id: str('Mã sơ đồ tự sinh'), verdict: { type: 'string', enum: ['đúng', 'sai'] }, note: str('Bắt buộc khi "sai": sai chỗ nào, theo tệp và dòng nào') }, required: ['id', 'verdict'] },
    run: (a) => require('./annotations').review(a),
  },
  {
    name: 'context_explore',
    description:
      'HỎI KHO NGỮ NGHĨA của cả hệ TRƯỚC KHI dùng Grep/Glob để tìm hiểu một việc. Một câu hỏi, một câu trả lời gom mã, vòng đời và tài liệu: LÀ GÌ (từ vựng, luồng, thành phần), Ở ĐÂU (tệp, khai báo, kèm dòng), CHẠY THẾ NÀO (đường dẫn API, topic, bảng), TEST, ' +
      'VÌ SAO (quyết định, thiết kế, đặc tả), SƠ ĐỒ, LƯU Ý (vấn đề đang mở, điều chưa kiểm, chỗ dễ nhầm). Mỗi dòng là tóm tắt kèm địa chỉ tệp:dòng; đọc nguyên văn thì mở tệp ở đó. Ba cách gọi: ' +
      '(1) q: một từ, một mã (P-003, BOOK-D-020), một tên tệp, tên bảng, "POST /refunds", hoặc một câu; tiếng Việt không dấu cũng được. (2) q và to: đường nối giữa hai vật. ' +
      '(3) impact: danh sách tệp vừa sửa hoặc sắp sửa, trả về ai nhập chúng, test, đường dẫn API, sơ đồ và tài liệu bị chạm. Kho dựng từ bản ĐÃ COMMIT của mọi dịch vụ, biết tới mức tệp và khai báo chính: ' +
      'chuỗi trong thân hàm và mã chưa commit thì vẫn phải Grep. "Không thấy" trong kho không có nghĩa là "không có".',
    inputSchema: {
      type: 'object',
      properties: {
        q: str('Một từ, một mã, một tên, hoặc một câu'),
        to: str('Vật thứ hai: tìm đường nối từ q tới đây'),
        impact: strs('Danh sách đường dẫn tệp mã (trong dịch vụ) để hỏi tầm ảnh hưởng'),
        section: { type: 'string', enum: ['la-gi', 'o-dau', 'chay', 'test', 'vi-sao', 'so-do', 'luu-y', 'khac'], description: 'Xem đủ một mục của câu trả lời trước (khi mục đó bị cắt)' },
        service: str(`Chỉ hỏi trong một dịch vụ: ${core.listAllServices().join(', ') || '(chưa có)'}. Bỏ trống = cả hệ.`),
      },
    },
    noService: true,
    run: (a) => require('./context-query').explore(a),
  },
  {
    name: 'context_term',
    description:
      'Ghi MỘT mục TỪ VỰNG NGHIỆP VỤ của dịch vụ: lời người dùng hay nói (ví dụ "tiền về muộn") ứng với vật nào trong mã và tài liệu. context_explore dùng bảng này để hiểu câu hỏi bằng lời thường. ' +
      'Bắt buộc có bằng chứng: evidence là danh sách {file, line} trỏ tới chỗ trong mã hay tài liệu chứng minh nghĩa đó. refs là mã nút của kho mà từ này chỉ tới (lấy từ context_explore). Ghi lại cùng term là cập nhật; remove=true là xóa.',
    inputSchema: {
      type: 'object',
      properties: {
        term: str('Từ hoặc cụm từ người dùng nói'), means: str('Nghĩa của nó, một dòng, nói bằng lời thường'), also: strs('Cách gọi khác (tối đa 12)'),
        refs: strs('Mã nút của kho mà từ này chỉ tới, ví dụ file:billing:src/app.js'),
        evidence: { type: 'array', items: { type: 'object', properties: { file: { type: 'string' }, line: { type: 'integer' } }, required: ['file', 'line'] }, description: 'Ít nhất một bằng chứng {file, line} trong dịch vụ' },
        remove: { type: 'boolean', description: 'true: xóa mục từ vựng này' },
      },
      required: ['term'],
    },
    run: (a) => (a.remove ? require('./annotations').termRemove(a) : require('./annotations').term(a)),
  },
  {
    name: 'context_relate',
    description:
      'Khai MỘT quan hệ có thật mà máy KHÔNG đọc ra được từ mã (nhập theo tên tính lúc chạy, tuân thủ một hợp đồng được kiểm lúc chạy, gọi qua mạng), kèm bằng chứng. Trong kho và trên sơ đồ, cạnh này mang nhãn "agent khai kèm bằng chứng". ' +
      'from và to là mã nút của kho (lấy từ context_explore); kind là tên quan hệ ngắn (ví dụ "tuân theo", "nạp lúc chạy", "gọi qua HTTP"); file và line trỏ tới dòng mã chứng minh.',
    inputSchema: {
      type: 'object',
      properties: { from: str('Mã nút nguồn'), to: str('Mã nút đích'), kind: str('Tên quan hệ, tối đa 40 ký tự'), file: str('Tệp bằng chứng trong dịch vụ'), line: { type: 'integer', description: 'Dòng bằng chứng' }, note: str('Ghi chú một dòng (tùy chọn)') },
      required: ['from', 'to', 'kind', 'file', 'line'],
    },
    run: (a) => require('./annotations').relate(a),
  },
];

module.exports = { TOOLS };
