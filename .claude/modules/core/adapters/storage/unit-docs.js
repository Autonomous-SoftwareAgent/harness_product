'use strict';
// spec: HOOK-S-010
// spec: HOOK-S-018
// BỘ MÁY GHI TÀI LIỆU CỦA MỘT ĐƠN VỊ (thuộc lõi): chọn đơn vị đang làm ("gốc") và chạy mỗi thao tác ghi trong MỘT giao dịch có khóa.
// Tách ra từ mcp/docs/core.js để mọi khối ghi tài liệu (ba tầng, sơ đồ, kho ngữ nghĩa) dùng chung mà không khối nào phải nhập khối khác.
// "Gốc" là thư mục của MỘT đơn vị (nơi có docs/), chọn bằng tham số `service` của từng lời gọi (withService), hoặc mặc định theo
// BSN_SERVICE, BSN_ROOT, thư mục hiện tại, rồi đơn vị mặc định của cấu hình dự án.
const fs = require('node:fs');
const path = require('node:path');
const P = require('../../gate/gate-paths');
const store = require('./docs-store');

const BSN_DIR = P.rootFrom(__dirname);
const SERVICES_DIR = P.servicesDir(BSN_DIR);
const dirOf = (name) => P.serviceDir(BSN_DIR, name);
const SERVICE_RE = /^[a-z][a-z0-9-]{1,40}$/;

let ROOT;
let DOCS;
let MODULES;
let GENERATED;
let LAYOUT;

// Phần tại chỗ của đơn vị (tệp cửa vào, ghi chép) nằm ở đâu là do gate-paths quyết theo bố cục của đơn vị. Mã ghi tài liệu gọi bằng TÊN
// LOGIC ("CLAUDE.md", "docs/service.yaml"): rel() cho đường dẫn thật tính từ thư mục đơn vị (để in ra), at() cho đường dẫn tuyệt đối.
const rel = (logical) => P.unitRealRel(LAYOUT, logical);
const at = (logical) => path.join(ROOT, ...rel(logical).split('/'));
const unitAt = (dir, logical) => path.join(dir, ...P.unitRealRel(P.unitLayoutOfDir(BSN_DIR, dir), logical).split('/'));

function setRoot(root) {
  ROOT = path.resolve(root);
  LAYOUT = P.unitLayoutOfDir(BSN_DIR, ROOT);
  DOCS = at('docs');
  MODULES = path.join(DOCS, 'modules');
  GENERATED = path.join(DOCS, '_generated');
}

// Tên dịch vụ của gốc đang chọn. Gốc là thư mục của một đơn vị khai riêng thì lấy TÊN ĐƠN VỊ (tên có thể khác tên thư mục: harness nằm ở
// .claude/modules); ngược lại lấy tên thư mục (dịch vụ trong thư mục cha của đơn vị, hoặc gốc tùy ý do test đặt).
function serviceName() {
  const unit = P.serviceOf(BSN_DIR, ROOT);
  return unit && path.resolve(dirOf(unit)).toLowerCase() === ROOT.toLowerCase() ? unit : path.basename(ROOT);
}

function serviceRoot(name) {
  if (!SERVICE_RE.test(String(name))) throw new Error(`Tên service '${name}' không hợp lệ (chữ thường, số, dấu gạch ngang)`);
  const dir = dirOf(name);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new Error(`Service '${name}' không tồn tại trong ${SERVICES_DIR}`);
  return dir;
}

const serviceDirs = () => P.serviceEntries(BSN_DIR);

function listServices() {
  return serviceDirs()
    .filter((d) => fs.existsSync(unitAt(d.dir, 'docs/modules')))
    .map((d) => d.name)
    .sort();
}

// Mọi dịch vụ (kể cả dịch vụ chưa dùng tài liệu ba tầng): thư mục có docs/agent hoặc docs/modules. Dùng cho cổng HTML và tóm tắt đầu phiên.
function listAllServices() {
  return serviceDirs()
    .filter((d) => ['agent', 'modules'].some((x) => fs.existsSync(unitAt(d.dir, `docs/${x}`))))
    .map((d) => d.name)
    .sort();
}

// Đơn vị mặc định khi lời gọi không truyền `service` (cấu hình dự án, khóa defaultUnit). '' = luôn phải truyền.
function defaultUnit() { return P.projectConfig(BSN_DIR).defaultUnit; }

function defaultRoot() {
  if (process.env.BSN_SERVICE) return serviceRoot(process.env.BSN_SERVICE);
  if (process.env.BSN_ROOT) return path.resolve(process.env.BSN_ROOT);
  const top = P.serviceOf(BSN_DIR, process.cwd());
  if (top && SERVICE_RE.test(top) && fs.existsSync(unitAt(dirOf(top), 'docs/modules'))) return dirOf(top);
  const def = defaultUnit();
  if (!def) throw new Error(`Cần truyền \`service\`: dự án chưa khai đơn vị mặc định (defaultUnit trong ${path.relative(BSN_DIR, P.projectConfigPath(BSN_DIR)).split(path.sep).join('/')}).`);
  return serviceRoot(def);
}

// Chạy fn với gốc là service đã chọn rồi trả gốc cũ. Đồng bộ nên không có hai lời gọi xen vào nhau trong một tiến trình.
function withService(name, fn) {
  const prev = ROOT;
  setRoot(name ? serviceRoot(name) : defaultRoot());
  try {
    return fn();
  } finally {
    if (prev) setRoot(prev);
  }
}

try {
  setRoot(defaultRoot());
} catch {
  setRoot(BSN_DIR); // chưa chọn được service: mọi công cụ vẫn phải truyền `service`
}

// ---------- giao dịch: đọc và ghi trong cùng một khóa, cam kết mọi tệp của một thao tác như MỘT đơn vị ----------
// Mỗi thao tác công cụ (design_record, spec_fill, impl_link, docs_check, diagram_save...) chạy trong transaction(): giữ khóa `docs-<service>`,
// đọc đĩa MỚI NHẤT (kể cả thay đổi vừa có của phiên khác), gom mọi ghi vào bộ đệm, rồi cam kết tất cả một lần (nguyên tử, có sao lưu
// và hoàn tác). Thao tác ném lỗi thì không ghi gì. Nhờ đọc rồi ghi ngay trong khóa nên hai phiên không thể ghi đè cập nhật của nhau.
let TX = null; // { writes: Map(đường dẫn tuyệt đối -> nội dung), dirs: [thư mục mới tạo] } khi đang trong một thao tác
const lockName = () => `docs-${serviceName()}`;

const readText = (p) => (TX && TX.writes.has(p) ? TX.writes.get(p) : fs.readFileSync(p, 'utf8'));
const fileExists = (p) => (TX && TX.writes.has(p)) || fs.existsSync(p);

function makeDir(p) {
  if (fs.existsSync(p)) return;
  const created = []; // mọi thư mục tổ tiên sẽ được tạo mới, từ sâu nhất lên
  for (let cur = p; !fs.existsSync(cur); cur = path.dirname(cur)) created.push(cur);
  fs.mkdirSync(p, { recursive: true });
  if (TX) TX.dirs.push(...created); // hủy giao dịch thì dọn các thư mục rỗng đã tạo (từ sâu lên), khỏi để lại module mồ côi
}

function transaction(reason, fn) {
  if (TX) return fn(); // lồng nhau: dùng chung giao dịch ngoài cùng
  return store.withLock(BSN_DIR, lockName(), () => {
    TX = { writes: new Map(), dirs: [] };
    try {
      const result = fn();
      const changes = [];
      for (const [p, content] of TX.writes) {
        if (!fs.existsSync(p) || fs.readFileSync(p, 'utf8') !== content) changes.push({ path: p, content });
      }
      if (changes.length) store.commit(BSN_DIR, changes, { reason, service: serviceName(), lock: lockName() });
      return result;
    } catch (err) {
      for (const d of TX.dirs) { try { fs.rmdirSync(d); } catch { /* không rỗng hoặc đã mất */ } }
      throw err;
    } finally {
      TX = null;
    }
  });
}

function writeText(p, content) {
  if (TX) TX.writes.set(p, content);
  else transaction('ghi tệp', () => TX.writes.set(p, content));
}

module.exports = {
  get ROOT() { return ROOT; },
  get DOCS() { return DOCS; },
  get MODULES() { return MODULES; },
  get GENERATED() { return GENERATED; },
  get LAYOUT() { return LAYOUT; },
  rel, at, unitAt,
  BSN_DIR, SERVICES_DIR, SERVICE_RE,
  serviceName, dirOf, setRoot, withService, serviceRoot, listServices, listAllServices, defaultUnit,
  readText, writeText, fileExists, makeDir, transaction, store,
};
