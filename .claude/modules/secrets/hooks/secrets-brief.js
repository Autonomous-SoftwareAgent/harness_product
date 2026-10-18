'use strict';
// CỬA VÀO: SessionStart. Luật nhắc về token GitHub nằm ở core/rules/secrets-brief.js; tệp này chỉ nối bộ chuyển Claude Code với luật đó.
const params = () => ({ health: () => { const g = require('../cli/github'); return g.health(g.ROOT); } });
if (require.main === module) require('../../core/hooks/wire').hook({ name: 'secrets-brief', id: 'secrets-brief', kind: 'session-start', cwdFallback: 'root', badInput: 'skip', params });
