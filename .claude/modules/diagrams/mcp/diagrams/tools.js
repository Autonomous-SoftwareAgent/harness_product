'use strict';
// spec: HOOK-S-010
// Công cụ MCP của khối diagrams (S-064): sơ đồ khai bằng dữ liệu. mcp-tools.js gom qua bảng đăng ký (khóa `tools` trong modules/diagrams.json).
const { spawnSync } = require('node:child_process');
const core = require('../../../servicedocs/mcp/docs/core');
const diagrams = require('./diagrams');

// Nội dung ĐÃ COMMIT của một tệp trong thư mục dịch vụ (null nếu chưa commit): diagram_generate chỉ chạy cấu hình đã commit.
const committed = (dir, rel) => {
  const r = spawnSync('git', ['-C', dir, 'show', `HEAD:./${rel}`], { encoding: 'utf8', timeout: 15000, windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  return r.status === 0 && !r.error ? r.stdout : null;
};

const DIAGRAM_SPEC_HELP =
  'Chung: {id (chữ thường/số/gạch ngang), type: flowchart|sequence|state|erd|class, title, tab?: business|architecture|problems (mặc định architecture), sources?: [đường dẫn tệp trong dịch vụ chứng minh sơ đồ, phải có thật]}. ' +
  'flowchart: direction?: TB|LR|BT|RL, groups?: [{id,label,direction?}], nodes: [{id,label,lines?: [tối đa 6 dòng phụ],style?: gray|green|blue|amber|pink|red|teal,shape?: box|round|stadium|cylinder|diamond|circle,group?}], ' +
  'edges?: [{from,to,label?,line?: solid|dotted|thick,arrow?: forward|none|both}]. ' +
  'sequence: autonumber?: true|false, participants: [{id,label,actor?}], steps: [mỗi bước đúng MỘT trong {message:{from,to,text,reply?}} | {note:{over:[id],text}} | {alt:{branches:[{when,steps}],otherwise?:{steps}}} (alt không lồng alt)]. ' +
  'state: direction?: TB|LR|BT|RL, states: [{id,label?,style?: màu như flowchart}] (id là chữ hiện trên hình nếu không có label), start?: [id], end?: [id], transitions?: [{from,to,label?}]. ' +
  'erd (sơ đồ dữ liệu, tab architecture): direction?: TB|LR|BT|RL, entities: [{id,label?,store?: table|json|document (bảng thật | đối tượng nằm trong cột JSON | tài liệu của db dạng tài liệu),columns?: [{type,name,keys?: [PK|FK|UK],note?}]}], ' +
  'relations?: [{from,to,from_card?: one|zero-or-one,to_card?: many|one|zero-or-one,label}] trong đó from LUÔN là phía "một", to là phía "nhiều". Cơ sở dữ liệu quan hệ thì agent KHÔNG tự khai bảng: dùng diagram_generate (đọc từ db thật). ' +
  'class (sơ đồ lớp, tab architecture): direction?: TB|LR|BT|RL, classes: [{id,label?,stereotype?: interface|abstract|module|service|struct|enum,members?: [tối đa 20 dòng],style?}], ' +
  'relations?: [{from,to,kind?: composition|aggregation|inheritance|implementation|association|dependency,label?}] đọc theo nghĩa: from CHỨA to (composition, aggregation), from KẾ THỪA to, from CÀI ĐẶT to, from DÙNG to (association, dependency). ' +
  'Mã phần tử: chữ, số, gạch dưới, bắt đầu bằng chữ, không trùng từ dành riêng của Mermaid (end, class, note...). Mọi chuỗi là một dòng. Trường lạ bị từ chối. ' +
  'BỐ CỤC do công cụ quyết (chiều vẽ, ngắt dòng chữ dài, cỡ chữ, khung thu phóng): chỉ khai sơ đồ CHỨA GÌ. Sơ đồ nhiều phần nên khai theo DẠNG TẦNG: mỗi nhóm là một tầng 1-4 nút, ' +
  'cạnh trong tầng nối nút với nút, cạnh giữa hai tầng nối NHÓM với NHÓM (from/to là mã nhóm, line: thick); khi đó các tầng xếp từ trên xuống và trong mỗi tầng đi từ trái sang phải. ' +
  'Không gửi trường explain ở đây: phần giải thích ghi bằng diagram_explain.';

const TOOLS = [
  {
    name: 'diagram_validate',
    description:
      'Kiểm MỘT bản khai báo sơ đồ và trả bản xem trước, KHÔNG ghi gì. Sơ đồ khai bằng DỮ LIỆU (nút, cạnh, người tham gia, bước); công cụ tự sinh Mermaid. ' +
      'Không bao giờ tự viết cú pháp Mermaid vào tệp nào. ' + DIAGRAM_SPEC_HELP,
    inputSchema: { type: 'object', properties: { spec: { type: 'object', description: 'Bản khai báo sơ đồ, đúng lược đồ nêu trong mô tả công cụ' } }, required: ['spec'] },
    run: (a) => diagrams.validate(a),
  },
  {
    name: 'diagram_save',
    description:
      'Kiểm rồi LƯU một bản khai báo sơ đồ vào docs/diagrams/<id>.yaml của dịch vụ (ghi đè sơ đồ cùng id). Sai lược đồ thì không ghi gì. ' +
      'Sơ đồ hiện ở tab ghi trong trường `tab` trên trang của dịch vụ sau khi repo dịch vụ commit. Nên gọi diagram_validate trước. ' + DIAGRAM_SPEC_HELP,
    inputSchema: { type: 'object', properties: { spec: { type: 'object', description: 'Bản khai báo sơ đồ, đúng lược đồ nêu trong mô tả công cụ' } }, required: ['spec'] },
    run: (a) => diagrams.save(a),
  },
  {
    name: 'diagram_explain',
    description:
      'Ghi PHẦN GIẢI THÍCH bốn mục cho một sơ đồ ĐÃ LƯU (hiện ngay dưới hình trên trang của dịch vụ). Không đổi hình. Mỗi sơ đồ nên có phần này; viết từ mã thật, điều chưa kiểm thì nói là chưa kiểm. ' +
      'explain: {meaning: một đoạn nói sơ đồ cho biết điều gì và vì sao quan trọng, read: [1-8 bước cách đọc hình: chiều đọc, nét đậm, nét chấm, màu nghĩa là gì], ' +
      'details?: [{term, text}] mỗi mục giải nghĩa một nút, nhóm, người tham gia, trạng thái, thực thể, cột, lớp hoặc bước (term phải chứa tên của nó trên hình, hoặc là số thứ tự bước), pitfalls?: [tối đa 6 chỗ người đọc dễ hiểu sai]}. ' +
      'Mọi chuỗi là một dòng. Sửa hình bằng diagram_save sau đó thì trang báo phần giải thích có thể đã cũ cho tới khi gọi lại công cụ này.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Mã sơ đồ đã lưu' }, explain: { type: 'object', description: '{meaning, read: [..], details?: [{term, text}], pitfalls?: [..]}' } },
      required: ['id', 'explain'],
    },
    run: (a) => diagrams.explain(a),
  },
  {
    name: 'diagram_list',
    description: 'Liệt kê sơ đồ của dịch vụ theo loại (luồng, trình tự, trạng thái, dữ liệu, lớp), kèm: agent khai hay tự sinh, phần giải thích còn khớp hay đã cũ, và LOẠI CÒN THIẾU. Mỗi dịch vụ cần đủ cả 5 loại; loại không áp dụng thì ghi lý do vào architecture.diagram_na bằng service_doc_set. Chỉ đọc.',
    inputSchema: { type: 'object', properties: {} },
    run: () => diagrams.listDetail(),
  },
  {
    name: 'diagram_get',
    description: 'Đọc MỘT sơ đồ (agent khai hoặc tự sinh, mã "tu-sinh-...") ở DẠNG GỌN: mỗi nút một dòng, mỗi cạnh một dòng, kèm tình trạng giải thích và soát. Dùng để đọc và soát với mã; không mở tệp docs/diagrams/*.yaml. ' +
      'Chỉ khi cần SỬA một sơ đồ do agent khai thì gọi với format="json" để lấy bản khai báo, sửa rồi lưu lại bằng diagram_save cùng id. Chỉ đọc.',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'Mã sơ đồ' }, format: { type: 'string', enum: ['gon', 'json'], description: 'gon (mặc định): dạng gọn để đọc và soát. json: bản khai báo để sửa rồi lưu lại.' } }, required: ['id'] },
    run: (a) => diagrams.get(a),
  },
  {
    name: 'diagram_remove',
    description: 'XÓA một sơ đồ đã lưu (tệp docs/diagrams/<id>.yaml) của dịch vụ, kể cả phần giải thích của nó. Chỉ dùng khi sơ đồ sai hẳn hoặc được thay bằng sơ đồ khác; sửa nội dung thì dùng diagram_save cùng id.',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'Mã sơ đồ cần xóa' } }, required: ['id'] },
    run: (a) => diagrams.remove(a),
  },
  {
    name: 'diagram_generate',
    description:
      'SINH LẠI một sơ đồ dữ liệu TỰ SINH từ cơ sở dữ liệu thật: công cụ tạo một cơ sở dữ liệu PostgreSQL tạm, chạy lệnh tạo bảng của dịch vụ (cấu hình đã commit trong sơ đồ đó), đọc bảng, cột, khóa, quan hệ rồi ghi lại sơ đồ; không đụng dữ liệu của hệ đang chạy. ' +
      'Gọi sau khi mã đổi cấu trúc bảng (docs check sẽ nhắc). Cần PostgreSQL local của hạ tầng chung đang chạy. Công cụ này KHÔNG nhận lệnh mới: tạo sơ đồ tự sinh lần đầu (hoặc đổi lệnh) làm bằng dòng lệnh ' +
      '`node .claude/modules/core/cli/cli.js --service <tên> diagram-generate <tệp.json>` rồi commit (skill diagrams). Sau khi sinh: viết hoặc viết lại phần giải thích bằng diagram_explain.',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'Mã sơ đồ dữ liệu tự sinh đã có' }, title: { type: 'string', description: 'Đổi tiêu đề (tùy chọn)' } }, required: ['id'] },
    run: (a) => diagrams.generate(a, { allowConfig: false, committedText: committed(core.ROOT, `docs/diagrams/${a && a.id}.yaml`) }),
  },
];

module.exports = { TOOLS };
