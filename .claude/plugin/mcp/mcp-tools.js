'use strict';
// spec: MCP-S-001
// spec: LEDG-S-003
// LỚP DƯỚI của máy chủ MCP bsn-docs: định nghĩa và chạy công cụ. Tệp này và mọi tệp nó nạp được sửa tự do:
// lớp bề mặt (mcp-server.js) chạy tệp này trong một tiến trình MỚI cho mỗi yêu cầu, nên phiên đang mở dùng mã mới ngay ở lời gọi kế,
// không phải nối lại. Công cụ không giữ gì trong bộ nhớ giữa hai lần gọi (mọi thứ ở tệp, có khóa và giao dịch).
const core = require('./docs/core');
const serviceDoc = require('./docs/service-doc');
const diagrams = require('./diagrams/diagrams');
const path = require('path');

const str = (description) => ({ type: 'string', description });
const strs = (description) => ({ type: 'array', items: { type: 'string' }, description });

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
    name: 'design_record',
    description:
      'Ghi một quyết định design mới vào docs/modules/<module>/1-design.md. Tự tạo module (nếu chưa có), gán ID PREFIX-D-nnn, và tự scaffold khung spec (2-spec.md) và impl (3-impl.md) tương ứng.',
    inputSchema: {
      type: 'object',
      properties: {
        module: str('Tên module, chữ thường, ví dụ: booking, payment'),
        prefix: str('Prefix ID 2-6 ký tự in hoa (chỉ cần khi tạo module mới), ví dụ BOOK. Mặc định lấy 4 ký tự đầu của tên.'),
        title: str('Tiêu đề ngắn của quyết định'),
        decision: str('Quyết định là gì'),
        rationale: str('Vì sao chọn như vậy, đã cân nhắc gì'),
        impacts: str('Ảnh hưởng tới module/service khác, ràng buộc kéo theo'),
        status: { type: 'string', enum: ['proposed', 'accepted', 'superseded', 'rejected'], description: 'Mặc định accepted' },
      },
      required: ['module', 'title', 'decision', 'rationale'],
    },
    run: core.designRecord,
  },
  {
    name: 'design_update',
    description: 'Sửa một quyết định design đã có. Spec/impl liên quan sẽ bị đánh dấu STALE cho tới khi rà lại. Muốn thay thế quyết định thì đặt status=superseded và ghi design mới bằng design_record.',
    inputSchema: {
      type: 'object',
      properties: {
        id: str('ID design, ví dụ BOOK-D-001'),
        title: str('Tiêu đề mới'),
        decision: str('Nội dung quyết định mới'),
        rationale: str('Lý do mới'),
        impacts: str('Ảnh hưởng mới'),
        status: { type: 'string', enum: ['proposed', 'accepted', 'superseded', 'rejected'] },
      },
      required: ['id'],
    },
    run: core.designUpdate,
  },
  {
    name: 'spec_fill',
    description:
      'Điền hoặc rà lại spec (tầng 2) cho một quyết định design: requirement, contract, acceptance, tasks. Gọi lại sau khi design đổi để xóa trạng thái STALE (có thể không truyền trường nào nếu spec vẫn đúng). Spec thành ready khi có cả requirement và acceptance.',
    inputSchema: {
      type: 'object',
      properties: {
        id: str('ID spec, ví dụ BOOK-S-001'),
        requirement: str('Hệ thống phải làm gì (có thể nhiều dòng)'),
        contract: str('API, sự kiện, schema, ràng buộc giao tiếp'),
        acceptance: str('Tiêu chí nghiệm thu kiểm chứng được'),
        tasks: str('Thay toàn bộ danh sách task, dạng "- [ ] việc" mỗi dòng'),
        add_tasks: strs('Thêm task mới vào cuối danh sách'),
      },
      required: ['id'],
    },
    run: core.specFill,
  },
  {
    name: 'impl_link',
    description:
      'Ghi tầng 3: gắn spec với code và test đã làm, trạng thái và chỗ lệch spec. Mọi file code liệt kê phải tồn tại và nên chứa marker "// spec: <ID>". Chỉ dùng khi spec đã ready.',
    inputSchema: {
      type: 'object',
      properties: {
        id: str('ID spec, ví dụ BOOK-S-001'),
        status: { type: 'string', enum: ['planned', 'in-progress', 'done', 'deviated'] },
        code: strs('Đường dẫn file code tương đối từ gốc repo (thay toàn bộ danh sách)'),
        tests: strs('Đường dẫn file test'),
        deviation: str('Chỗ code lệch spec và lý do (tự đặt status=deviated nếu không truyền status)'),
        notes: str('Ghi chú'),
      },
      required: ['id'],
    },
    run: core.implLink,
  },
  {
    name: 'docs_status',
    description: 'Xem tiến độ design -> spec -> impl theo module và các vấn đề (STALE, thiếu, lệch). Không truyền module thì xem tất cả.',
    inputSchema: { type: 'object', properties: { module: str('Tên module (tùy chọn)') } },
    run: core.docsStatus,
  },
  {
    name: 'docs_check',
    description: 'Kiểm tra đồng bộ toàn bộ docs và code: STALE, thiếu khung, code path không tồn tại, marker spec mồ côi. Tự tạo khung còn thiếu và cập nhật docs/_generated/traceability.md.',
    inputSchema: { type: 'object', properties: {} },
    run: () => core.formatCheck(core.check()),
  },
  {
    name: 'service_doc_get',
    description: 'Đọc nguồn có cấu trúc của dịch vụ (docs/service.yaml): nghiệp vụ, kiến trúc kỹ thuật, vấn đề và tiến độ. Đây là nguồn sinh ra docs/_generated/overview.md (cho agent) và trang ba tab của dịch vụ ở BSN_/docs/portal/<dịch-vụ>/ (cho người đọc).',
    inputSchema: { type: 'object', properties: {} },
    run: () => serviceDoc.get(),
  },
  {
    name: 'service_doc_set',
    description:
      'Ghi THAY TOÀN BỘ một phần của docs/service.yaml (đọc bằng service_doc_get trước, sửa rồi ghi lại cả phần). Kiểm lược đồ trước khi ghi; sai thì không ghi gì. ' +
      'section=meta: {title, summary}. ' +
      'section=business: {goal, users:[{who,need}], value:[..], flows:[{id,title,steps:[..]}], out_of_scope:[..], unverified:[..]} (unverified = điều CHƯA kiểm với hệ thống thật). ' +
      'section=architecture: {summary, layers:[{id,title,role,paths:[..]}], components:[{id,title,layer?,role,paths:[..]}], depends_on:[{target,kind:service|external|infra,via,purpose}], provides:[{to,via,purpose}], ' +
      'diagrams?:[] (trường CŨ, không còn được vẽ; sơ đồ mới khai bằng diagram_save), decisions:[{id,title}], ' +
      'diagram_na?:[{type: flowchart|sequence|state|erd|class, reason}] (loại sơ đồ KHÔNG áp dụng cho dịch vụ này, kèm lý do; đang có thì nhớ gửi lại kẻo mất)}. ' +
      'section=progress: {done:[..], doing:[..], next:[..]}. Mã (id) viết chữ thường, số, gạch ngang. Chỉ ghi điều đã đọc thấy trong mã hoặc người dùng đã chốt.',
    inputSchema: {
      type: 'object',
      properties: {
        section: { type: 'string', enum: ['meta', 'business', 'architecture', 'progress'] },
        value: { type: 'object', description: 'Toàn bộ nội dung mới của phần đó, đúng lược đồ nêu trong mô tả công cụ' },
      },
      required: ['section', 'value'],
    },
    run: (a) => serviceDoc.setSection(a),
  },
  {
    name: 'problem_record',
    description: 'Ghi hoặc cập nhật MỘT vấn đề trong sổ "vấn đề và tinh chỉnh" của dịch vụ (tab 3 ở cổng). Bỏ id để tạo mới (tự gán P-nnn); truyền id để cập nhật các trường được truyền. Khi xử lý xong: status=resolved và ghi cách xử lý vào refine.',
    inputSchema: {
      type: 'object',
      properties: {
        id: str('Mã vấn đề đã có, dạng P-001 (bỏ trống để tạo mới)'),
        title: str('Tiêu đề ngắn'),
        severity: { type: 'string', enum: ['low', 'medium', 'high'] },
        status: { type: 'string', enum: ['open', 'refining', 'resolved'] },
        detail: str('Vấn đề là gì, ảnh hưởng tới tiền, đơn hay người dùng thế nào'),
        refine: str('Đã/đang tinh chỉnh thế nào, kết quả đo được'),
        refs: strs('Tham chiếu: mã spec, mã quyết định, đường-dẫn:dòng'),
      },
    },
    run: (a) => serviceDoc.problemRecord(a),
  },
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
      '`node .claude/plugin/cli/cli.js --service <tên> diagram-generate <tệp.json>` rồi commit (skill diagrams). Sau khi sinh: viết hoặc viết lại phần giải thích bằng diagram_explain.',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'Mã sơ đồ dữ liệu tự sinh đã có' }, title: { type: 'string', description: 'Đổi tiêu đề (tùy chọn)' } }, required: ['id'] },
    run: (a) => diagrams.generate(a, { allowConfig: false, committedText: require('./portal/service-page').show(core.ROOT, `docs/diagrams/${a && a.id}.yaml`) }),
  },
  {
    name: 'diagram_review',
    description: 'Ghi KẾT QUẢ SOÁT một sơ đồ TỰ SINH (mã "tu-sinh-..."): đọc nó bằng diagram_get, đối chiếu với mã, rồi ghi verdict "đúng", hoặc "sai" kèm note nói sai chỗ nào (bộ quét thuộc harness, phiên harness sẽ sửa). ' +
      'Hình đổi sau một commit thì lần soát cũ hết hiệu lực. Quan hệ có thật mà máy không đọc ra (nhập động, tuân thủ lúc chạy) thì không phải "sai": khai thêm bằng context_relate.',
    inputSchema: { type: 'object', properties: { id: str('Mã sơ đồ tự sinh'), verdict: { type: 'string', enum: ['đúng', 'sai'] }, note: str('Bắt buộc khi "sai": sai chỗ nào, theo tệp và dòng nào') }, required: ['id', 'verdict'] },
    run: (a) => require('./context/annotations').review(a),
  },
  {
    name: 'context_explore',
    description:
      'HỎI KHO NGỮ NGHĨA của cả hệ TRƯỚC KHI dùng Grep/Glob để tìm hiểu một việc. Một câu hỏi, một câu trả lời gom mã, vòng đời và tài liệu: LÀ GÌ (từ vựng, luồng, thành phần), Ở ĐÂU (tệp, khai báo, kèm dòng), CHẠY THẾ NÀO (đường dẫn API, topic, bảng), TEST, ' +
      'VÌ SAO (quyết định, thiết kế, đặc tả), SƠ ĐỒ, LƯU Ý (vấn đề đang mở, điều chưa kiểm, chỗ dễ nhầm). Mỗi dòng là tóm tắt kèm địa chỉ tệp:dòng; đọc nguyên văn thì mở tệp ở đó. Ba cách gọi: ' +
      '(1) q: một từ, một mã (P-003, S-017, PHUB-D-020), một tên tệp, tên bảng, "POST /refunds", hoặc một câu; tiếng Việt không dấu cũng được. (2) q và to: đường nối giữa hai vật. ' +
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
    run: (a) => require('./context/context-query').explore(a),
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
        refs: strs('Mã nút của kho mà từ này chỉ tới, ví dụ file:payment-hub:src/hub.js'),
        evidence: { type: 'array', items: { type: 'object', properties: { file: { type: 'string' }, line: { type: 'integer' } }, required: ['file', 'line'] }, description: 'Ít nhất một bằng chứng {file, line} trong dịch vụ' },
        remove: { type: 'boolean', description: 'true: xóa mục từ vựng này' },
      },
      required: ['term'],
    },
    run: (a) => (a.remove ? require('./context/annotations').termRemove(a) : require('./context/annotations').term(a)),
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
    run: (a) => require('./context/annotations').relate(a),
  },
  {
    name: 'portal_build',
    description: 'Dựng lại cổng HTML BSN_/docs/portal/: trang ba tab của từng dịch vụ (từ bản đã commit của repo dịch vụ) và trang tổng chỉ gom liên kết tới các trang đó. Cổng cũng tự dựng lại sau mỗi commit và khi kết thúc lượt.',
    inputSchema: { type: 'object', properties: {} },
    noService: true,
    run: () => require('./portal/portal').build().summary,
  },
  // Phạm vi của phiên (S-050). Hai công cụ này làm việc trên sổ phiên của harness, theo mã phiên Claude Code truyền qua biến môi trường.
  {
    name: 'scope_register',
    description: 'ĐĂNG KÝ dịch vụ mà phiên sẽ sửa theo kế hoạch người dùng VỪA DUYỆT. Thứ tự bắt buộc: trình kế hoạch theo khuôn (## Kế hoạch, sáu mục: Dịch vụ, Lý do, Làm gì, Sửa tệp, Không làm, Rủi ro) -> người dùng duyệt -> gọi công cụ này -> mới sửa tệp. Chỉ đăng ký được dịch vụ có trong mục "Dịch vụ" của kế hoạch đã duyệt; sửa dịch vụ chưa đăng ký bị hook chặn. Phần dùng chung (docs/system, docs/handoff) không cần đăng ký.',
    inputSchema: { type: 'object', required: ['services'], properties: { services: strs('Tên các dịch vụ cần đăng ký, ví dụ ["provider-service"]. Đơn vị ngoài (infra, harness) cũng là dịch vụ.') } },
    noService: true,
    run: (a) => {
      const r = require('../hooks/scope-lib').register(path.resolve(__dirname, '..', '..', '..'), process.env.CLAUDE_CODE_SESSION_ID, a.services);
      if (!r.ok) throw new Error(r.text);
      return r.text;
    },
  },
  {
    name: 'scope_status',
    description: 'Xem phạm vi của phiên này: kế hoạch nào đang được duyệt, kế hoạch nêu dịch vụ nào, đã đăng ký dịch vụ nào, còn thiếu gì. Chỉ đọc.',
    inputSchema: { type: 'object', properties: {} },
    noService: true,
    run: () => require('../hooks/scope-lib').statusText(path.resolve(__dirname, '..', '..', '..'), process.env.CLAUDE_CODE_SESSION_ID),
  },
];

// Một server dùng chung cho mọi service: mỗi công cụ nhận thêm `service`. Đơn vị nằm ở đâu và đơn vị mặc định lấy từ cấu hình dự án (S-063).
{
  const P = require('../gate/gate-paths');
  const cfg = P.projectConfig(core.BSN_DIR);
  const base = require('node:path').basename(core.BSN_DIR);
  const where = cfg.units.parents.map((p) => `${base}/${p}/`).join(', ');
  const extra = Object.keys(P.extraUnits(core.BSN_DIR))[0];
  const what = [where && `thư mục dưới ${where}`, extra && `một đơn vị ngoài như ${extra}`].filter(Boolean).join(', hoặc ') || 'đơn vị khai trong .claude/plugin/project.json';
  const dflt = cfg.defaultUnit ? `Bỏ trống = ${cfg.defaultUnit}.` : 'Bắt buộc truyền.';
  for (const t of TOOLS) {
    if (t.noService) continue; // công cụ của cả hệ: tự khai tham số service (nếu có), không ép về một dịch vụ
    t.inputSchema.properties = t.inputSchema.properties || {};
    t.inputSchema.properties.service = str(`Tên service (${what}), có thể là: ${core.listAllServices().join(', ') || '(chưa có)'}. ${dflt}`);
  }
}

const list = () => TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));

// Trả { text, isError } hoặc { unknown: true }.
function call(name, args = {}) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { unknown: true };
  try {
    // Công cụ GHI vào một dịch vụ: để lại dấu (kể cả khi lời gọi sau đó bị từ chối) "phiên này vừa làm dịch vụ đó" cho bảng phiên
    // (hook sửa tệp không thấy việc ghi qua MCP). Chỉ có khi Claude Code truyền mã phiên qua biến môi trường; thiếu thì bỏ qua.
    if (!tool.noService && args.service && !/_(get|list|status|check|explore|validate)$/.test(tool.name)) {
      try { require('../hooks/sessions-lib').mark(path.resolve(__dirname, '..', '..', '..'), process.env.CLAUDE_CODE_SESSION_ID, String(args.service)); } catch { /* bỏ qua */ }
    }
    const text = tool.noService ? tool.run(args) : core.withService(args.service, () => tool.run(args));
    return { text: String(text), isError: false };
  } catch (e) {
    return { text: e.message, isError: true };
  }
}

module.exports = { list, call };
