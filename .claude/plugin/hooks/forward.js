'use strict';
// spec: HOOK-S-003
// spec: HOOK-S-005
// CỬA VÀO theo dõi lần sửa và tài liệu cho phiên mở ở gốc BSN_ (harness chỉ ở gốc; service không còn .claude riêng).
//   node forward.js track   (PostToolUse Write|Edit|NotebookEdit): luật core/rules/track.js
//   node forward.js stop    (Stop): luật core/rules/wrap-up.js
// Tệp này chỉ nối bộ chuyển Claude Code với hai luật đó (S-055), và cho luật biết tên hai tệp cửa vào của phần theo dõi tài liệu:
// thiếu một trong hai tệp thì luật nói rõ chứ không im lặng (chốt chặn không được biến mất cùng tệp của nó).
const DOCS_ENTRIES = { track: 'docs-track.js', stop: 'docs-stop.js' };

if (require.main === module) {
  const mode = process.argv[2];
  if (mode === 'track') require('./wire').hook({ name: 'forward', id: 'track', kind: 'after-action', badInput: 'empty', params: { entry: DOCS_ENTRIES.track } });
  else if (mode === 'stop') require('./wire').hook({ name: 'forward', id: 'wrap-up', kind: 'turn-end', badInput: 'empty', params: { entry: DOCS_ENTRIES.stop } });
  else {
    console.error('Dùng: node forward.js track|stop');
    process.exit(2);
  }
}
