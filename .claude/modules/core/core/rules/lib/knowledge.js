'use strict';
// spec: LEDG-S-002
// spec: HOOK-S-009
// Phần "nghĩ" của luật đủ kiến thức: việc nào cần skill và tài liệu nào, phiên còn thiếu gì, lời từ chối viết ra sao.
// Thuần: hỏi dự án qua cổng workspace (đồng bộ), không tự đọc đĩa. Sổ "phiên đã nạp gì" do luật lấy qua cổng store rồi đưa vào.
const path = require('node:path');

const posix = (p) => String(p).split(path.sep).join('/');
const same = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

// Bảng nối đã đọc thành vật (ws.skillsMapRaw()) -> dạng dùng được, hoặc null. Khai báo:
//   mode         "enforce" | "remind" | "off"
//   overview     skill tổng quát, cần cho mọi việc có yêu cầu
//   serviceDocs  tài liệu phải đọc trước khi sửa một đơn vị (đường dẫn trong đơn vị); "beforeEdit" là tên khác của trường này
//   unitDocs     { <đơn vị>: [tài liệu] } thay serviceDocs cho riêng đơn vị đó
//   tools        { <tên công cụ hoặc mẫu có *>: <skill> | [skill, ...] }. Tên là tên công cụ của bsn-docs (design_record) HOẶC tên đầy đủ
//                của công cụ bất kỳ (Bash, mcp__github__create_pull_request, mcp__x__*). Công cụ ngoài bsn-docs chỉ được xét khi hook
//                guard-skill được khai cho công cụ đó trong settings.json (phép kiểm sức khỏe báo khi thiếu).
//   readonly     công cụ chỉ đọc (tên hoặc mẫu có *): không bao giờ bị chặn
//   files        [{ pattern: <biểu thức chính quy trên đường dẫn tính từ gốc>, skill | skills: [...], reads: [tài liệu], serviceDocs: bool }]
//                `reads` tính trong đơn vị chứa tệp nếu tệp thuộc một đơn vị, ngược lại tính từ gốc dự án.
// Dạng dùng được: { mode, overview, tools: [{ re, key, skills }], readonly: [re], files: [{ re, pattern, skills, reads, serviceDocs }], serviceDocs, unitDocs }
const globRe = (s) => new RegExp(`^${String(s).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`, 'i');
const asList = (v) => (Array.isArray(v) ? v : [v]).filter((x) => typeof x === 'string' && x);
const docList = (v) => (Array.isArray(v) ? v.filter((d) => typeof d === 'string') : []);
function parseMap(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const files = [];
  for (const f of Array.isArray(raw.files) ? raw.files : []) {
    try { files.push({ re: new RegExp(f.pattern, 'i'), pattern: f.pattern, skills: asList(f.skills || f.skill), skill: asList(f.skills || f.skill)[0] || '', reads: docList(f.reads), serviceDocs: f.serviceDocs !== false }); } catch { /* mẫu hỏng: bỏ dòng đó */ }
  }
  const tools = Object.entries(raw.tools && typeof raw.tools === 'object' ? raw.tools : {}).map(([key, v]) => ({ key, re: globRe(key), exact: !key.includes('*'), skills: asList(v) }));
  const unitDocs = {};
  for (const [u, d] of Object.entries(raw.unitDocs && typeof raw.unitDocs === 'object' ? raw.unitDocs : {})) unitDocs[u] = docList(d);
  return {
    mode: ['enforce', 'remind', 'off'].includes(raw.mode) ? raw.mode : 'enforce',
    overview: typeof raw.overview === 'string' ? raw.overview : '',
    tools,
    readonly: (Array.isArray(raw.readonly) ? raw.readonly : []).filter((x) => typeof x === 'string').map(globRe),
    files,
    serviceDocs: docList(raw.serviceDocs || raw.beforeEdit),
    unitDocs,
  };
}
const loadMap = (ws) => parseMap(ws.skillsMapRaw());
// Tài liệu phải đọc của đơn vị `svc`.
const docsOfUnit = (map, svc) => (map.unitDocs[svc] || map.serviceDocs);
// Skill mà công cụ tên `names` (thử theo thứ tự) cần: tên viết đúng thắng mẫu có *; công cụ chỉ đọc thì không cần gì. null = không khai.
function toolSkills(map, names) {
  for (const n of names) if (map.readonly.some((re) => re.test(n))) return null;
  for (const n of names) { const t = map.tools.find((x) => x.exact && x.key.toLowerCase() === n.toLowerCase()); if (t) return t.skills; }
  for (const n of names) { const t = map.tools.find((x) => !x.exact && x.re.test(n)); if (t) return t.skills; }
  return null;
}

// Tệp `abs` có phải SKILL.md của một skill không: trả tên skill hoặc ''.
function skillOfFile(ws, abs) {
  const rel = posix(path.relative(ws.skillsDir, path.resolve(abs)));
  const m = /^([a-z][a-z0-9-]*)\/SKILL\.md$/i.exec(rel);
  if (m && ws.skillExists(m[1].toLowerCase())) return m[1].toLowerCase();
  // Skill của một đơn vị, do bộ chuyển công cụ sinh: <đơn vị>/.claude/skills/<tên>/SKILL.md.
  const u = /(?:^|\/)\.claude\/skills\/([a-z][a-z0-9-]*)\/SKILL\.md$/i.exec(posix(path.resolve(abs)));
  return u && ws.skillExists(u[1].toLowerCase()) ? u[1].toLowerCase() : '';
}
// Tệp `abs` có phải một tài liệu bắt buộc không: trả { service, doc } hoặc null. Tài liệu của đơn vị (serviceDocs, unitDocs, reads
// của mẫu tệp) tính trong đơn vị; reads của mẫu tệp nằm ngoài đơn vị thì service là '' và doc tính từ gốc.
function docOfFile(ws, map, abs) {
  const service = ws.serviceOf(abs);
  const reads = map.files.flatMap((f) => f.reads);
  if (ws.isService(service)) {
    const doc = [...docsOfUnit(map, service), ...reads].find((d) => same(path.join(ws.serviceDir(service), ...ws.unitRel(service, d).split('/')), abs));
    if (doc) return { service, doc };
  }
  const doc = reads.find((d) => same(path.join(ws.root, ...d.split('/')), abs));
  return doc ? { service: '', doc } : null;
}

// Việc này cần gì: { skills: [tên], docs: [{ service, doc, rel }], service }. Rỗng = không yêu cầu gì.
// `action` theo hợp đồng sự kiện (ports/events.js). Skill không tồn tại và tệp tài liệu không tồn tại thì KHÔNG đòi
// (thà không chặn còn hơn làm phiên kẹt); test giữ cho bảng nối khớp thực tế.
function requirementsFor(ws, map, action, toolServer) {
  // `toolServer`: tên một máy chủ, hoặc hàm hỏi "đây có phải máy chủ của harness không" (harness có vài máy chủ, mỗi khối một cái).
  const isOwn = typeof toolServer === 'function' ? toolServer : (s) => s === toolServer;
  const skills = [];
  const docs = [];
  let service = '';
  let applies = false;
  const addDoc = (svc, d) => {
    // Tài liệu của đơn vị khai bằng TÊN LOGIC trong bảng nối; chỗ thật do bố cục của đơn vị quyết (ws.unitRel).
    const real = svc ? ws.unitRel(svc, d) : d;
    const abs = svc ? path.join(ws.serviceDir(svc), ...real.split('/')) : path.join(ws.root, ...d.split('/'));
    if (ws.exists(abs) && !docs.some((x) => x.service === svc && x.doc === d)) docs.push({ service: svc, doc: d, rel: svc ? `${ws.serviceRel(svc)}/${real}` : d });
  };
  const wantDocs = (svc) => {
    if (!ws.isService(svc)) return;
    service = svc;
    for (const d of docsOfUnit(map, svc)) addDoc(svc, d);
  };
  if (action.type === 'call-tool' || action.type === 'run-command') {
    // Tên công cụ để tra bảng: tên ngắn của bsn-docs (bảng cũ khai theo tên này), rồi tên đầy đủ của công cụ (Bash, mcp__<máy chủ>__<tên>).
    const names = [...(action.type === 'call-tool' && isOwn(action.server) ? [action.name] : []), action.tool].filter(Boolean);
    const need = toolSkills(map, names);
    if (!need || !need.length) return { skills, docs, service };
    applies = true;
    skills.push(...need);
    if (action.type === 'call-tool' && action.args && typeof action.args.service === 'string') wantDocs(action.args.service);
  } else if (action.type === 'write-file') {
    const abs = action.file;
    if (!abs) return { skills, docs, service };
    if (!ws.inside(abs)) return { skills, docs, service };
    const rel = ws.projectRel(abs); // mẫu tệp của bảng nối tính trên đường dẫn này
    let withDocs = true;
    const svc = ws.serviceOf(abs);
    const unit = ws.isService(svc) ? svc : '';
    for (const f of map.files) {
      if (!f.re.test(rel)) continue;
      applies = true;
      skills.push(...f.skills);
      for (const d of f.reads) addDoc(unit, d);
      if (!f.serviceDocs) withDocs = false;
    }
    if (unit) { applies = true; if (withDocs) wantDocs(unit); else service = unit; }
  }
  if (!applies) return { skills: [], docs: [], service };
  const wanted = [map.overview, ...skills].filter((s, i, a) => s && a.indexOf(s) === i && ws.skillExists(s));
  return { skills: wanted, docs, service };
}

function missing(req, had) {
  return {
    skills: req.skills.filter((s) => !had.skills.has(s)),
    docs: req.docs.filter((d) => !had.docs.has(`${d.service}|${d.doc}`)),
  };
}

// Câu từ chối: nói đúng thứ còn thiếu và cách nạp, để phiên tự làm tiếp mà không phải hỏi ai.
function denyText(miss, { agent, mapRel = '.claude/project/skills-map.json' } = {}) {
  const parts = [];
  if (miss.skills.length) parts.push(`skill ${miss.skills.map((s) => `\`${s}\``).join(', ')}`);
  const unitDocs = miss.docs.filter((d) => d.service);
  const rootDocs = miss.docs.filter((d) => !d.service);
  if (unitDocs.length) parts.push(`tài liệu của dịch vụ "${unitDocs[0].service}": ${unitDocs.map((d) => d.rel).join(', ')}`);
  if (rootDocs.length) parts.push(`tài liệu: ${rootDocs.map((d) => d.rel).join(', ')}`);
  const how = [];
  if (miss.skills.length) how.push(`mở từng skill bằng công cụ Skill (hoặc đọc trọn .claude/skills/<tên>/SKILL.md bằng công cụ Read)`);
  if (miss.docs.length) how.push('đọc từng tệp tài liệu bằng công cụ Read (tệp dài thì đọc từng phần; cat hay Grep không được tính)');
  return `Lời gọi này bị chặn vì phiên chưa nạp đủ kiến thức cho việc đang làm (bảng nối ${mapRel}). Còn thiếu: ${parts.join('; ')}. ` +
    `Cách làm: ${how.join('; ')}; rồi gọi lại đúng lời gọi này. Sau mỗi lần nén ngữ cảnh phải nạp lại.` +
    (agent ? ' Bạn là agent con: ngữ cảnh của bạn riêng, nên phải tự nạp, không dùng chung với phiên chính.' : '');
}

// Kiểm bảng nối với thực tế: skill được nhắc phải tồn tại; cửa vào của sổ phiên đã được khai với công cụ chủ; sổ mở được.
// `hookCommands` là các lệnh cửa vào đang được khai; `ledgerOpens()` cho biết sổ có mở được không (bên gọi đưa vào, chỉ được hỏi khi
// bảng nối đọc được, để phép kiểm không tạo sổ ở nơi chưa dùng sổ).
// Trả danh sách vấn đề (rỗng = sạch).
// `skillMatchers` (tùy chọn): mẫu tên công cụ của các nhóm hook đang gọi guard-skill.js; công cụ khai trong bảng mà không mẫu nào
// khớp thì hook không bao giờ được gọi cho nó, tức là khai mà KHÔNG chặn.
function health(ws, { hookCommands, ledgerOpens, skillMatchers }) {
  const problems = [];
  const map = loadMap(ws);
  const name = String(ws.skillsMapRel).split('/').pop();
  if (!map) return ws.skillsMapExists() ? [`${name} không đọc được: hook chặn theo skill đang KHÔNG hoạt động`] : [];
  for (const s of new Set([map.overview, ...map.tools.flatMap((t) => t.skills), ...map.files.flatMap((f) => f.skills)].filter(Boolean))) {
    if (!ws.skillExists(s)) problems.push(`${name} nhắc skill "${s}" nhưng không có .claude/skills/${s}/SKILL.md`);
  }
  if (Array.isArray(skillMatchers)) {
    const servers = typeof ws.mcpServerNames === 'function' ? ws.mcpServerNames() : ['bsn-docs'];
    const res = skillMatchers.map((m) => { try { return new RegExp(`^(?:${m})$`); } catch { return null; } }).filter(Boolean);
    for (const t of map.tools) {
      // tên ngắn (không có __) là công cụ của harness: hook khớp theo tên đầy đủ mcp__<máy chủ>__<tên>. Mẫu của hook phủ cả máy chủ
      // (mcp__<máy chủ>__.*), nên thử với máy chủ lõi và với từng máy chủ khối: thiếu một máy chủ nào là công cụ của nó không bị chặn.
      const fulls = t.key.includes('__') || /^[A-Z]/.test(t.key) ? [t.key] : servers.map((s) => `mcp__${s}__${t.key}`);
      for (const full of fulls) {
        const probe = full.replace(/\*/g, 'x');
        if (res.some((re) => re.test(probe))) continue;
        problems.push(`${name} khai công cụ "${t.key}" nhưng settings.json không gọi guard-skill.js cho ${full}: khai mà KHÔNG chặn (thêm tên máy chủ vào matcher của nhóm guard-skill)`);
      }
    }
  }
  for (const need of ['guard-skill.js', 'ledger.js" record', 'ledger.js" prompt', 'ledger.js" start']) {
    if (!hookCommands.some((c) => c.includes(need))) problems.push(`settings.json thiếu hook của sổ phiên: ${need.replace('"', '')}`);
  }
  if (!ledgerOpens()) problems.push('không mở được sổ phiên (SQLite): hook chặn theo skill đang KHÔNG hoạt động');
  return problems;
}

module.exports = { parseMap, loadMap, skillOfFile, docOfFile, requirementsFor, missing, denyText, health };
