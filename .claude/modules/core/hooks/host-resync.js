'use strict';
// spec: HOOK-S-010
// CỬA VÀO: PostToolUse (Write|Edit|NotebookEdit). Sửa tay một định nghĩa gốc ở <đơn vị>/.harness/skills/ hay .harness/notes/ thì sinh lại tệp công cụ
// ngay, không chờ tới đầu phiên sau. Việc ghi do adapters/hosts/sync.js làm (ghi có kiểm dấu băm); tệp này chỉ nối với Claude Code.
const wire = require('./wire');

const DEFINITION = /[\\/]\.harness[\\/](skills[\\/][^\\/]+[\\/]SKILL\.md|notes[\\/][^\\/]+\.md)$/;

if (require.main === module) {
  const { note } = require('../ports/events');
  require('../adapters/claude-code/hook').serve({ name: 'host-resync', kind: 'after-action', root: wire.ROOT, cwdFallback: wire.ROOT, badInput: 'skip' }, (event) => {
    const a = event.action;
    if (!a || a.type !== 'write-file' || !DEFINITION.test(a.file || '')) return null;
    const r = require('../adapters/hosts/sync').syncAll(wire.ROOT);
    return r.text ? note(r.text) : null;
  });
}

module.exports = { DEFINITION };
