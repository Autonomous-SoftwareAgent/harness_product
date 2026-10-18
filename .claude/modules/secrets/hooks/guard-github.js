'use strict';
// CỬA VÀO: PreToolUse (Bash). Luật "git push lên GitHub theo kế hoạch" nằm ở core/rules/github.js; tệp này chỉ nối bộ chuyển Claude Code với
// luật đó và cấp phạm vi của phiên, remote của repo. Hook lỗi thì cho qua (trình cấp mật khẩu vẫn không cấp token cho repo ngoài phạm vi).
const params = () => {
  const g = require('../cli/github');
  return { scopeFor: (sid) => g.scopeFor(g.ROOT, sid), remoteUrl: (dir, name) => require('../adapters/secrets/github').remoteUrl(dir, name) };
};
if (require.main === module) require('../../core/hooks/wire').hook({ name: 'guard-github', id: 'github', kind: 'before-action', cwdFallback: 'root', params });
