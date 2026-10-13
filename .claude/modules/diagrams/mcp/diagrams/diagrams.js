'use strict';
// spec: PORT-S-002
// Sơ đồ của MỘT dịch vụ: <dịch-vụ>/docs/diagrams/<id>.yaml. Tệp lưu là BẢN KHAI BÁO (dữ liệu), không phải Mermaid; Mermaid được sinh
// lại từ bản khai báo mỗi lần dựng trang, nên sửa bộ dựng thì mọi sơ đồ cũ tự hưởng, không phải chuyển đổi gì.
// Chỉ ghi qua công cụ (MCP bsn-docs: diagram_save), trong giao dịch có khóa của core; hook guard-owned chặn sửa tay.
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const core = require('../../../servicedocs/mcp/docs/core');
const yaml = require('../../../core/core/lib/yaml-lite');
const specs = require('../../core/diagrams/spec');
const mermaid = require('../../adapters/mermaid/render');
const reader = require('./data-reader');

const P = require('../../../core/gate/gate-paths');
const { AUTO_PREFIX } = specs;
// Sơ đồ tự sinh do khối context góp qua bảng đăng ký; khối đó tắt thì không có sơ đồ tự sinh nào.
const autoProvider = () => { const f = P.provided(core.BSN_DIR, 'autoDiagrams'); return f ? require(f) : null; };
const model = require('../../core/diagrams/model');
const { contentHash, elementNames, termMatches, canonical, coverage, TYPE_LABEL } = model;
const GET_MAX = 6000; // trần ký tự của một lần đọc sơ đồ ở dạng gọn
const dir = () => core.at('docs/diagrams');
const fileOf = (id) => path.join(dir(), `${id}.yaml`);
const serviceName = () => core.serviceName();
// Phần giải thích có cũ so với hình không. Dấu không khớp thẳng thì hỏi lịch sử git của tệp sơ đồ: giải thích viết cho một bản
// trước mà hình giống hệt bây giờ (chỉ khác đường dẫn tệp nguồn) vẫn là khớp.
const staleOf = (spec) => model.explainStale(spec, () => require('./history').earlier(fileOf(spec.id)));

// Kiểm một bản khai báo, không ghi gì. Trả { ok, errors: [chuỗi], spec, mermaid }.
function check(input) {
  const { spec, errors } = specs.parse(input);
  const out = specs.formatErrors(errors);
  if (spec) {
    // Nguồn chứng minh sơ đồ (tệp mã hay tài liệu) phải có thật trong dịch vụ: sơ đồ không vẽ theo trí nhớ.
    spec.sources.forEach((s, i) => {
      const abs = path.resolve(core.ROOT, s);
      const rel = path.relative(core.ROOT, abs);
      if (rel.startsWith('..') || path.isAbsolute(rel)) out.push(`sources[${i}]: phải là đường dẫn trong dịch vụ (${s})`);
      else if (!fs.existsSync(abs)) out.push(`sources[${i}]: không có tệp ${s} trong ${serviceName()}`);
    });
  }
  return out.length ? { ok: false, errors: out, spec: null, mermaid: '' } : { ok: true, errors: [], spec, mermaid: mermaid.render(spec) };
}

function validate({ spec }) {
  const r = check(spec);
  if (!r.ok) return `KHÔNG HỢP LỆ (${r.errors.length} lỗi), chưa ghi gì:\n  - ${r.errors.join('\n  - ')}`;
  return `Hợp lệ. Chưa ghi gì (ghi bằng diagram_save). Bản xem trước do công cụ sinh:\n\n${r.mermaid}`;
}

function save({ spec }) {
  if (spec && typeof spec === 'object' && spec.explain !== undefined) throw new Error('Phần giải thích không ghi qua diagram_save: lưu sơ đồ trước, rồi ghi phần giải thích bằng diagram_explain. KHÔNG ghi gì.');
  if (spec && typeof spec === 'object' && typeof spec.id === 'string' && spec.id.startsWith(AUTO_PREFIX)) throw new Error(`Mã bắt đầu bằng "${AUTO_PREFIX}" dành cho sơ đồ do harness TỰ SINH từ mã sau mỗi commit; chọn mã khác. KHÔNG ghi gì.`);
  if (spec && typeof spec === 'object' && spec.generated !== undefined) throw new Error('Trường `generated` do diagram_generate đặt, không truyền qua diagram_save. KHÔNG ghi gì.');
  const r = check(spec);
  if (!r.ok) throw new Error(`Bản khai báo sơ đồ không hợp lệ, KHÔNG ghi:\n  - ${r.errors.join('\n  - ')}`);
  if (fs.existsSync(fileOf(r.spec.id)) && (specs.parse(yaml.parse(core.readText(fileOf(r.spec.id)))).spec || {}).generated) {
    throw new Error(`Sơ đồ '${r.spec.id}' do công cụ TỰ SINH từ cơ sở dữ liệu; không ghi đè bằng bản agent khai. Sinh lại bằng diagram_generate, hoặc xóa bằng diagram_remove rồi khai lại. KHÔNG ghi gì.`);
  }
  core.makeDir(dir());
  // Sửa hình thì phần giải thích cũ được giữ lại (kèm dấu cũ): trang sẽ báo "có thể đã cũ" cho tới khi được viết lại.
  let kept = '';
  if (fs.existsSync(fileOf(r.spec.id))) {
    const old = specs.parse(yaml.parse(core.readText(fileOf(r.spec.id)))).spec;
    if (old && old.explain) { r.spec.explain = old.explain; kept = staleOf(r.spec) ? ' Phần giải thích cũ được giữ nhưng hình đã đổi: viết lại bằng diagram_explain.' : ''; }
  }
  core.writeText(fileOf(r.spec.id), yaml.stringify(canonical(r.spec)));
  return `Đã ghi sơ đồ '${r.spec.id}' (${r.spec.type}, tab ${r.spec.tab}) của ${serviceName()} vào ${core.rel('docs/diagrams')}/${r.spec.id}.yaml. ` +
    `${core.LAYOUT.local ? 'Sơ đồ lên trang của dịch vụ ở lần dựng cổng kế tiếp (ghi chép tại chỗ, không qua commit).' : 'Sơ đồ lên trang của dịch vụ sau khi repo dịch vụ commit (cổng chỉ hiện bản đã commit).'}${kept}`;
}

// Ghi phần giải thích bốn mục cho một sơ đồ ĐÃ LƯU. Không đổi hình. Mục "Chi tiết" phải nói về phần tử có thật trên hình.
function explain({ id, explain: input }) {
  if (typeof id !== 'string' || !specs.SPEC_ID_RE.test(id)) throw new Error('id sơ đồ không hợp lệ');
  if (id.startsWith(AUTO_PREFIX)) {
    const ap = autoProvider();
    if (!ap) throw new Error(`Sơ đồ '${id}' là sơ đồ tự sinh, nhưng khối kho ngữ nghĩa (context) đang tắt trong cấu hình dự án. KHÔNG ghi gì.`);
    return ap.autoExplain({ id, explain: input });
  }
  if (!fs.existsSync(fileOf(id))) throw new Error(`Không có sơ đồ '${id}' trong ${serviceName()}: lưu sơ đồ bằng diagram_save trước.`);
  const errs = specs.checkExplain(input);
  const spec = specs.parse(yaml.parse(core.readText(fileOf(id)))).spec;
  if (!spec) throw new Error(`Sơ đồ '${id}' đang không hợp lệ; sửa bằng diagram_save trước.`);
  if (!errs.length) {
    const names = elementNames(spec);
    (input.details || []).forEach((d, i) => { if (!termMatches(d.term, names)) errs.push(`explain.details[${i}].term: '${d.term}' không khớp nút, nhóm, người tham gia, trạng thái, thực thể, cột, lớp hay bước nào trên hình`); });
  }
  if (errs.length) throw new Error(`Phần giải thích không hợp lệ, KHÔNG ghi:\n  - ${errs.join('\n  - ')}`);
  delete spec.explain;
  spec.explain = { ...specs.fillExplain(input), basis: contentHash(spec) };
  core.writeText(fileOf(id), yaml.stringify(canonical(spec)));
  return `Đã ghi phần giải thích cho sơ đồ '${id}' của ${serviceName()} (${spec.explain.read.length} bước đọc, ${spec.explain.details.length} mục chi tiết, ${spec.explain.pitfalls.length} chỗ dễ nhầm). Lên trang sau khi repo dịch vụ commit.`;
}

function remove({ id }) {
  if (typeof id !== 'string' || !specs.SPEC_ID_RE.test(id)) throw new Error('id sơ đồ không hợp lệ');
  if (!fs.existsSync(fileOf(id))) throw new Error(`Không có sơ đồ '${id}' trong ${serviceName()}`);
  fs.unlinkSync(fileOf(id));
  return `Đã xóa sơ đồ '${id}' của ${serviceName()}.`;
}

function list() {
  if (!fs.existsSync(dir())) return [];
  return fs.readdirSync(dir()).filter((f) => f.endsWith('.yaml')).sort().map((f) => f.replace(/\.yaml$/, ''));
}

// Từ văn bản YAML (ví dụ bản đã commit, đọc bằng git) -> { id, title, tab, type, mermaid } hoặc { id, error }.
function fromText(id, text) {
  try {
    const { spec, errors } = specs.parse(yaml.parse(text));
    if (!spec) return { id, error: specs.formatErrors(errors).slice(0, 3).join('; ') };
    if (spec.id !== id) return { id, error: `tệp ${id}.yaml chứa sơ đồ mã '${spec.id}'` };
    return { id, title: spec.title, tab: spec.tab, type: spec.type, sources: spec.sources, mermaid: mermaid.render(spec), generated: spec.generated ? spec.generated.reader : null,
      explain: spec.explain || null, explainStale: staleOf(spec), layout: spec.type === 'flowchart' ? mermaid.layoutOf(spec).kind : spec.type };
  } catch (e) {
    return { id, error: e.message };
  }
}

// Dùng trong docs check: mọi tệp trong docs/diagrams phải là bản khai báo hợp lệ do công cụ ghi.
function checkErrors() {
  const out = [];
  for (const id of list()) {
    const text = core.readText(fileOf(id));
    const r = fromText(id, text);
    if (r.error) { out.push(`[diagrams] ${id}.yaml: ${r.error}`); continue; }
    const again = yaml.stringify(specs.parse(yaml.parse(text)).spec);
    if (again !== text) out.push(`[diagrams] ${id}.yaml không đúng dạng công cụ ghi (sửa tay? ghi lại bằng diagram_save)`);
  }
  return out;
}

// ---------- đủ bộ: mỗi dịch vụ cần đủ MỌI loại sơ đồ (quyết định chung của hệ) ----------
function declaredNa() {
  try { const doc = require('../../../servicedocs/mcp/docs/service-doc').load(); return (doc && doc.architecture && doc.architecture.diagram_na) || []; } catch { return []; }
}
const readSpec = (id) => specs.parse(yaml.parse(core.readText(fileOf(id)))).spec;

// Danh sách sơ đồ của dịch vụ theo loại, kèm tình trạng phần giải thích và loại còn thiếu. Chỉ đọc.
function listDetail() {
  const rows = list().map((id) => fromText(id, core.readText(fileOf(id))));
  const lines = rows.map((d) => (d.error ? `  [HỎNG] ${d.id}: ${d.error}`
    : `  [${TYPE_LABEL[d.type]}] ${d.id} · tab ${d.tab} · ${d.generated ? `tự sinh (${d.generated})` : 'agent khai'} · giải thích: ${!d.explain ? 'CHƯA CÓ' : d.explainStale ? 'CÓ THỂ ĐÃ CŨ' : 'khớp'} · ${d.title}`));
  const cov = coverage(rows.filter((d) => !d.error), declaredNa());
  const missing = cov.filter((c) => c.missing).map((c) => c.label);
  const na = cov.filter((c) => c.na).map((c) => `${c.label} (không áp dụng: ${c.na})`);
  // Sơ đồ harness tự sinh từ mã sau mỗi commit (kho ngữ nghĩa): agent không khai, chỉ viết giải thích và soát.
  const autos = autoDiagrams();
  const autoLines = autos.map((a) => `  [${TYPE_LABEL[a.spec.type]}] ${a.spec.id} · tự sinh từ mã · giải thích: ${!a.state.explain ? 'CHƯA CÓ' : a.state.explainStale ? 'CÓ THỂ ĐÃ CŨ' : a.state.explain.machine ? 'khớp (máy viết)' : 'khớp'} · soát: ${!a.state.review ? 'chưa' : a.state.reviewStale ? 'hình đã đổi sau lần soát' : a.state.review.verdict} · ${a.spec.title}`);
  return `Sơ đồ của ${serviceName()} (${rows.length}):\n${lines.join('\n') || '  (chưa có sơ đồ nào)'}\n` +
    (autoLines.length ? `Sơ đồ tự sinh từ mã (${autoLines.length}; đọc bằng diagram_get; máy tự viết giải thích, muốn viết bản riêng thì diagram_explain; soát với mã thì diagram_review):\n${autoLines.join('\n')}\n` : '') +
    `Đủ bộ ${specs.TYPES.length} loại (${specs.TYPES.map((t) => TYPE_LABEL[t]).join(', ')}): ${missing.length ? `CÒN THIẾU ${missing.join(', ')}` : 'đủ'}${na.length ? `; ${na.join('; ')}` : ''}.`;
}

// Trả bản khai báo đã lưu của MỘT sơ đồ (JSON), để sửa rồi lưu lại bằng diagram_save. Không kèm phần giải thích và phần `generated`.
// Sơ đồ tự sinh từ mã của dịch vụ đang chọn, kèm tình trạng phần agent viết (đọc từ thư mục làm việc). [] nếu chưa có kho.
function autoDiagrams() {
  const ap = autoProvider();
  return ap ? ap.autoDiagrams() : [];
}

// Trả MỘT sơ đồ để đọc và soát, ở DẠNG GỌN (mỗi nút, mỗi cạnh một dòng). format="json": trả bản khai báo đầy đủ, chỉ dùng khi cần sửa một
// sơ đồ do agent khai rồi lưu lại bằng diagram_save. Sơ đồ tự sinh không có dạng JSON để sửa (muốn đổi thì đổi mã rồi commit).
function get({ id, format = 'gon' }) {
  if (typeof id !== 'string' || !specs.SPEC_ID_RE.test(id)) throw new Error('id sơ đồ không hợp lệ');
  if (!['gon', 'json'].includes(format)) throw new Error('format phải là "gon" (mặc định, để đọc và soát) hoặc "json" (để sửa rồi lưu lại)');
  const compact = require('../../core/diagrams/compact');
  if (id.startsWith(AUTO_PREFIX)) {
    const a = autoDiagrams().find((x) => x.spec.id === id);
    if (!a) throw new Error(`Không có sơ đồ tự sinh '${id}' trong kho của ${serviceName()}. Đang có: ${autoDiagrams().map((x) => x.spec.id).join(', ') || '(chưa có; kho dựng sau commit)'}`);
    if (format === 'json') throw new Error('Sơ đồ tự sinh không sửa bằng tay: nó được dựng lại từ mã sau mỗi commit. Thấy sai thì báo bằng diagram_review (verdict "sai"); quan hệ máy không đọc ra thì khai bằng context_relate.');
    const st = a.state;
    // Thứ hình đã gộp (ví dụ lệnh nhập giữa hai tầng) được liệt kê đủ ở đây, để soát với mã mà không phải hỏi thêm.
    const detail = a.detail ? `\n${a.detail.title}:\n${a.detail.lines.map((l) => `  ${l}`).join('\n')}` : '';
    return `${compact.capped(compact.compact(a.spec, { origin: a.origin }) + detail, GET_MAX)}\nGiải thích: ${!st.explain ? 'CHƯA CÓ (ghi bằng diagram_explain)' : st.explainStale ? 'CÓ THỂ ĐÃ CŨ (hình đổi sau khi viết; viết lại bằng diagram_explain)' : st.explain.machine ? 'do máy viết từ dữ liệu của hình (muốn viết bản riêng: diagram_explain)' : 'khớp với hình'}. Soát: ${!st.review ? 'chưa (không bắt buộc; đối chiếu với mã rồi ghi bằng diagram_review)' : st.reviewStale ? 'hình đã đổi sau lần soát' : `${st.review.verdict} (${st.review.at})`}.`;
  }
  if (!fs.existsSync(fileOf(id))) throw new Error(`Không có sơ đồ '${id}' trong ${serviceName()}. Đang có: ${[...list(), ...autoDiagrams().map((x) => x.spec.id)].join(', ') || '(chưa có)'}`);
  const spec = readSpec(id);
  if (!spec) throw new Error(`Sơ đồ '${id}' đang không hợp lệ: ${fromText(id, core.readText(fileOf(id))).error}`);
  const { explain: ex, generated, ...content } = spec;
  const state = `Giải thích: ${!ex ? 'chưa có' : staleOf(spec) ? 'có thể đã cũ' : 'khớp với hình'} (ghi bằng diagram_explain).`;
  if (format === 'json') {
    if (generated) throw new Error(`Sơ đồ '${id}' do công cụ TỰ SINH (${generated.reader}); không sửa bằng diagram_save, sinh lại bằng diagram_generate id="${id}". Đọc nó ở dạng gọn (bỏ tham số format).`);
    return `Sửa bản dưới đây rồi lưu lại bằng diagram_save (cùng id). ${state}\n\n${JSON.stringify(content)}`;
  }
  return `${compact.capped(compact.compact(spec), GET_MAX)}\n${state}${generated ? ` Sơ đồ TỰ SINH (${generated.reader}): sinh lại bằng diagram_generate id="${id}".` : ' Cần sửa: gọi lại với format="json" để lấy bản khai báo.'}`;
}

// ---------- sơ đồ dữ liệu TỰ SINH từ cơ sở dữ liệu ----------
// Dấu của các tệp khai cấu trúc bảng (sources) lúc sinh: mã đổi sau đó thì docs check báo cần sinh lại.
function sourcesBasis(sources) {
  const h = crypto.createHash('sha256');
  for (const s of [...sources].sort()) { h.update(`${s}\n`); try { h.update(fs.readFileSync(path.resolve(core.ROOT, s))); } catch { h.update('không có'); } }
  return h.digest('hex').slice(0, 16);
}

// Lần đầu: truyền đủ { id, title, sources, command, url_env, url_format, tables? } (chỉ qua dòng lệnh). Lần sau: chỉ cần { id }, cấu hình lấy
// từ sơ đồ đã lưu. opts.allowConfig=false (công cụ MCP): không nhận cấu hình mới, chỉ sinh lại theo cấu hình ĐÃ COMMIT của sơ đồ đó.
function generate(input, opts = {}) {
  const { id } = input || {};
  if (typeof id !== 'string' || !specs.SPEC_ID_RE.test(id)) throw new Error('id sơ đồ không hợp lệ');
  const old = fs.existsSync(fileOf(id)) ? readSpec(id) : null;
  if (fs.existsSync(fileOf(id)) && (!old || !old.generated)) throw new Error(`Sơ đồ '${id}' đang là bản agent khai; diagram_generate không ghi đè. Chọn id khác hoặc xóa bằng diagram_remove trước.`);
  const given = ['command', 'url_env', 'url_format', 'sources', 'tables', 'reader'].filter((k) => input[k] !== undefined);
  let cfg;
  if (opts.allowConfig === false) {
    if (given.length) throw new Error(`Công cụ này chỉ SINH LẠI theo cấu hình đã commit; không nhận ${given.join(', ')}. Tạo lần đầu hoặc đổi cấu hình: \`node .claude/modules/core/cli/cli.js --service ${serviceName()} diagram-generate <tệp.json>\`.`);
    // Ghi chép tại chỗ không qua commit nên không có bản người dùng đã xem: công cụ không tự chạy lệnh nào ở chế độ đó.
    if (opts.local) throw new Error(`Đơn vị ${serviceName()} giữ ghi chép tại chỗ (không commit), nên công cụ này không chạy lệnh tạo bảng. Sinh lại bằng dòng lệnh: \`node .claude/modules/core/cli/cli.js --service ${serviceName()} diagram-generate ${id}\`.`);
    const committed = opts.committedText ? specs.parse(yaml.parse(opts.committedText)).spec : null;
    if (!committed || !committed.generated) throw new Error(`Sơ đồ '${id}' chưa có bản tự sinh ĐÃ COMMIT trong ${serviceName()}. Tạo lần đầu bằng dòng lệnh: \`node .claude/modules/core/cli/cli.js --service ${serviceName()} diagram-generate <tệp.json>\`, rồi commit.`);
    cfg = { ...committed.generated, sources: committed.sources, title: input.title || (old || committed).title };
  } else {
    const base = old ? { ...old.generated, sources: old.sources, title: old.title } : { reader: 'postgres', tables: [] };
    cfg = { ...base, ...Object.fromEntries(['reader', 'command', 'url_env', 'url_format', 'sources', 'tables', 'title'].filter((k) => input[k] !== undefined).map((k) => [k, input[k]])) };
  }
  for (const k of ['title', 'command', 'url_env', 'url_format']) if (!cfg[k]) throw new Error(`thiếu ${k}`);
  if (!Array.isArray(cfg.sources) || !cfg.sources.length) throw new Error('thiếu sources: liệt kê tệp mã khai cấu trúc bảng của dịch vụ (để biết khi nào cần sinh lại)');
  if (!reader.READ[cfg.reader]) throw new Error(`chưa có bộ đọc '${cfg.reader}' (đang có: ${Object.keys(reader.READ).join(', ')})`);
  const raw = reader.READ[cfg.reader]({ command: cfg.command, url_env: cfg.url_env, url_format: cfg.url_format, cwd: core.ROOT });
  const body = reader.toErd(raw, { tables: cfg.tables || [] });
  const spec = { id, type: 'erd', title: cfg.title, tab: 'architecture', sources: cfg.sources, ...body,
    generated: { reader: cfg.reader, command: cfg.command, url_env: cfg.url_env, url_format: cfg.url_format, tables: cfg.tables || [], basis: sourcesBasis(cfg.sources) } };
  const r = check(spec);
  if (!r.ok) throw new Error(`Sơ đồ sinh ra không hợp lệ, KHÔNG ghi:\n  - ${r.errors.join('\n  - ')}`);
  let kept = ' Viết phần giải thích bằng diagram_explain.';
  if (old && old.explain) { r.spec.explain = old.explain; kept = staleOf(r.spec) ? ' CẤU TRÚC ĐÃ ĐỔI: viết lại phần giải thích bằng diagram_explain.' : ' Cấu trúc không đổi, phần giải thích còn khớp.'; }
  core.makeDir(dir());
  core.writeText(fileOf(id), yaml.stringify(canonical(r.spec)));
  return `Đã sinh sơ đồ dữ liệu '${id}' của ${serviceName()} từ ${cfg.reader}: ${body.entities.length} bảng, ${body.relations.length} quan hệ (${body.entities.map((e) => e.label || e.id).join(', ')}).${kept} Lên trang sau khi repo dịch vụ commit.`;
}

// Cảnh báo (không phải lỗi) cho docs check: loại sơ đồ còn thiếu, và sơ đồ tự sinh mà mã khai cấu trúc bảng đã đổi sau lần sinh.
function checkWarnings() {
  const out = [];
  const rows = [];
  for (const id of list()) {
    const spec = (() => { try { return readSpec(id); } catch { return null; } })();
    if (!spec) continue;
    rows.push(spec);
    if (spec.generated && spec.generated.basis !== sourcesBasis(spec.sources)) out.push(`[diagrams] ${id}: tệp khai cấu trúc bảng (${spec.sources.join(', ')}) đã đổi sau lần sinh; sinh lại bằng diagram_generate id="${id}"`);
  }
  if (!rows.length && !fs.existsSync(core.at('docs/service.yaml'))) return out; // dịch vụ vừa tạo, chưa có gì để đòi
  const missing = coverage(rows, declaredNa()).filter((c) => c.missing).map((c) => c.label);
  if (missing.length) out.push(`[diagrams] chưa đủ bộ sơ đồ, còn thiếu loại: ${missing.join(', ')} (khai bằng diagram_save / diagram_generate; loại không áp dụng thì ghi lý do vào architecture.diagram_na bằng service_doc_set)`);
  return out;
}

// Ghi lại DẤU của phần giải thích theo cách tính hiện tại cho mọi sơ đồ mà giải thích CÒN KHỚP với hình nhưng đang mang dấu kiểu cũ
// (dấu trước bản 1.5.0 tính cả đường dẫn tệp nguồn). Không đổi hình, không đổi lời giải thích. Sơ đồ mà hình thật sự đã đổi thì để nguyên và
// nêu tên. Chạy được nhiều lần; lần sau không còn gì để ghi. Lệnh đổi đường dẫn hàng loạt gọi phép này TRƯỚC khi đổi, trong cùng giao dịch.
function restampRaw() {
  const done = []; const stale = [];
  for (const id of list()) {
    let spec;
    try { spec = readSpec(id); } catch { spec = null; }
    if (!spec || !spec.explain) continue;
    if (spec.explain.basis === contentHash(spec)) continue;
    if (staleOf(spec)) { stale.push(id); continue; }
    spec.explain = { ...spec.explain, basis: contentHash(spec) };
    core.writeText(fileOf(id), yaml.stringify(canonical(spec)));
    done.push(id);
  }
  return { done, stale };
}
// Sơ đồ do người khai mà MÃ NÓ VẼ THEO đã đổi nhiều kể từ khi hình có dạng như bây giờ. Máy không vẽ lại hình người đã duyệt:
// chỉ nêu ra để người dùng hoặc phiên của đơn vị quyết có sửa hình không. [{ id, since, files, added, removed }], đổi nhiều trước.
const DRIFT_LINES = 150;
function drift() {
  const h = require('./history');
  const out = [];
  for (const id of list()) {
    let spec;
    try { spec = readSpec(id); } catch { spec = null; }
    if (!spec || spec.generated) continue;
    const d = h.drift(fileOf(id), spec, core.ROOT, model.samePicture);
    if (d && d.files) out.push({ id, ...d });
  }
  return out.sort((a, b) => (b.added + b.removed) - (a.added + a.removed));
}
function driftReport() {
  const rows = drift();
  if (!rows.length) return `Sơ đồ của ${serviceName()}: không sơ đồ nào có mã nguồn đổi sau khi hình có dạng hiện tại (hoặc không hỏi được lịch sử git).`;
  return `Sơ đồ của ${serviceName()} mà mã nó vẽ theo đã đổi từ khi hình có dạng hiện tại (máy chỉ nêu, không tự vẽ lại):\n` +
    rows.map((r) => `  ${r.added + r.removed >= DRIFT_LINES ? '[ĐỔI NHIỀU] ' : ''}${r.id}: +${r.added} -${r.removed} dòng trong ${r.files} tệp nguồn, từ commit ${r.since}`).join('\n');
}
function restamp() {
  const r = restampRaw();
  return `Sơ đồ của ${serviceName()}: đã ghi lại dấu cho ${r.done.length} phần giải thích còn khớp với hình${r.done.length ? ` (${r.done.join(', ')})` : ''}. ` +
    (r.stale.length ? `Hình ĐÃ ĐỔI THẬT sau khi giải thích được viết (${r.stale.length}): ${r.stale.join(', ')}; viết lại bằng diagram_explain.` : 'Không có sơ đồ nào mà hình đã đổi sau khi giải thích được viết.');
}

const tx = (reason, fn) => (...args) => core.transaction(reason, () => fn(...args));

module.exports = {
  check, fromText, list, listDetail, autoDiagrams, coverage, checkErrors, checkWarnings, sourcesBasis, dir, fileOf, contentHash, basisMatches: model.basisMatches, staleOf, restampRaw, drift, driftReport, DRIFT_LINES, elementNames, termMatches, TYPE_LABEL,
  get: tx('diagram_get', get),
  generate: tx('diagram_generate', generate),
  explain: tx('diagram_explain', explain),
  validate: tx('diagram_validate', validate),
  save: tx('diagram_save', save),
  remove: tx('diagram_remove', remove),
  restamp: tx('diagram_restamp', restamp),
};
