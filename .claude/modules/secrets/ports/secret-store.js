'use strict';
// CỔNG RA "kho bí mật": nơi cất bí mật của máy (token) ngoài cây dự án, mã hóa bằng cơ chế của hệ điều hành khi có. Tệp này chỉ là hợp đồng.
//   kind                 tên bộ chuyển (chuỗi)
//   available()          bộ chuyển dùng được trên máy này không
//   secure               true nếu bí mật được mã hóa bởi hệ điều hành (false: chỉ là tệp quyền 600)
//   set(name, value)     cất bí mật; ném lỗi nếu không cất được
//   get(name)            đọc bí mật; chưa có thì ''
//   has(name)            đã có chưa (không đọc giá trị)
//   remove(name)         xóa; trả true nếu xóa được hoặc vốn không có
// Tên bí mật: chữ thường, số, gạch ngang. Không bộ chuyển nào in hay ghi giá trị ra đâu khác.
const NAME = 'secret-store';
const VALUES = ['kind'];
const METHODS = ['available', 'set', 'get', 'has', 'remove'];

function check(impl) {
  const miss = [...VALUES.filter((k) => typeof (impl || {})[k] !== 'string'), ...METHODS.filter((k) => typeof (impl || {})[k] !== 'function')];
  if (typeof (impl || {}).secure !== 'boolean') miss.push('secure');
  if (miss.length) throw new Error(`bộ chuyển cho cổng "${NAME}" thiếu: ${miss.join(', ')}`);
  return impl;
}

module.exports = { NAME, VALUES, METHODS, check };
