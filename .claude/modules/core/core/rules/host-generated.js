'use strict';
// spec: HOOK-S-002
// spec: HOOK-S-009
// LUẬT tệp công cụ do harness SINH (trước khi phiên ghi tệp hoặc chạy lệnh). Bộ chuyển công cụ (adapters/hosts) sinh tệp như
// <đơn vị>/.claude/skills/<tên>/SKILL.md từ định nghĩa gốc ở <đơn vị>/.harness/; tệp sinh có dấu `harness-host` ở đầu. Sửa tay tệp đó thì
// lần đồng bộ sau không ghi đè được (báo "đã bị sửa tay") và định nghĩa gốc với tệp sinh lệch nhau, nên CHẶN từ đầu và chỉ đường đúng:
// sửa định nghĩa gốc (công cụ host_define) rồi để harness sinh lại. Chỉ chặn tệp ĐÃ CÓ dấu; tệp của team (không dấu) và tệp chưa có thì qua.
// Đây là hàng rào chứ không phải sandbox: lệnh shell ghi lách được (luật chỉ xét đích ghi bộ chuyển Claude Code đã phân tích sẵn).
const { deny } = require('../../ports/events');

const HOW = 'Tệp này do harness SINH từ định nghĩa gốc ở <đơn vị>/.harness/ (có dấu harness-host ở đầu), nên không sửa tay. Để đổi: gọi công cụ MCP host_define (service, name, description, body) để sửa định nghĩa gốc, harness tự sinh lại; hoặc sửa .harness/skills/<tên>/SKILL.md rồi chạy `node .claude/modules/core/cli/cli.js host-sync`. Muốn bỏ hẳn: xóa skill ở .harness/skills/, bản sinh còn nguyên sẽ tự bị xóa.';

async function run(event, { workspace: ws }) {
  const a = event.action;
  if (!a) return null;
  if (a.type === 'write-file' && a.file) {
    return ws.hostGenerated(a.file) ? deny(`Không sửa tay ${a.file}. ${HOW}`) : null;
  }
  if (a.type === 'run-command' && a.shell) {
    for (const t of a.shell.targets || []) {
      const abs = ws.resolveToken(t, event.cwd);
      if (ws.hostGenerated(abs)) return deny(`Lệnh này ghi/xóa/dời tệp harness sinh (${t}). ${HOW}`);
    }
  }
  return null;
}

module.exports = { id: 'host-generated', on: ['before-action'], run };
