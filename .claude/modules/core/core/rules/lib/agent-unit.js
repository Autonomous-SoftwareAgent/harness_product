'use strict';
// spec: HOOK-S-001
// Agent con do bộ chuyển công cụ sinh có tên "<đơn vị>-<tên>" (xem adapters/hosts/claude.js). Hàm thuần: từ tên đó suy ra đơn vị của agent.
// Tên đơn vị cũng có thể có gạch ngang (ví dụ api-gateway), nên thử tiền tố dài nhất trước. '' nghĩa là agent không thuộc đơn vị nào (Explore, general-purpose...).
function unitOfAgent(agentType, isUnit) {
  const parts = String(agentType || '').split('-');
  for (let i = parts.length - 1; i >= 1; i -= 1) {
    const cand = parts.slice(0, i).join('-');
    if (isUnit(cand)) return cand;
  }
  return '';
}

module.exports = { unitOfAgent };
