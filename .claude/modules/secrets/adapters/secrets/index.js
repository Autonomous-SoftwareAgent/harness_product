'use strict';
// Chọn kho bí mật của máy: kho của hệ điều hành nếu có, không thì tệp quyền 600 (không mã hóa). Biến BSN_SECRET_STORE ép một loại
// (để test). Mỗi bộ chuyển qua phép kiểm hợp đồng của cổng ports/secret-store.js.
const { check } = require('../../ports/secret-store');

const ORDER = ['windows-dpapi', 'macos-keychain', 'linux-secret-tool', 'file-0600'];
const load = (kind) => check(require(`./${kind}`));

function pick() {
  const forced = process.env.BSN_SECRET_STORE;
  if (forced) return load(forced);
  for (const kind of ORDER) { const s = load(kind); if (s.available()) return s; }
  return load('file-0600');
}

module.exports = { pick, load, ORDER };
