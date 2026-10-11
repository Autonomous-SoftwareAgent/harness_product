'use strict';
// spec: HOOK-S-007
// spec: HOOK-S-008
// BỘ CHUYỂN git: làm cổng "kho mã" (ports/repo.js) bằng lệnh git của máy (S-055). Chỉ chạy lệnh ĐỌC; không sửa gì trong kho.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// Thư mục có thật gần nhất tính từ `dir` đi lên (thư mục chưa có thì hỏi thư mục cha).
function nearest(dir) {
  let d = dir;
  while (!fs.existsSync(d) && path.dirname(d) !== d) d = path.dirname(d);
  return d;
}

function create(root) {
  return {
    // Dò nội dung docs/ của dự án trong các commit sắp đẩy (adapters/git/docs-leaks.js). Không kiểm được thì [] (hook pre-push vẫn chặn).
    async docsLeaks(dir, remote, ref) {
      if (!root) return [];
      const r = require('./docs-leaks').checkRef(root, dir, remote, ref || 'HEAD');
      return r.error ? [] : r.leaks;
    },
    // Tệp `abs` có bị git bỏ qua không (hỏi kho chứa nó: repo gốc hoặc repo của dịch vụ). Không hỏi được thì coi là KHÔNG bỏ qua.
    async isIgnored(abs) {
      const r = spawnSync('git', ['-C', nearest(path.dirname(abs)), 'check-ignore', '-q', abs], { encoding: 'utf8' });
      return r.status === 0;
    },
    async topLevel(dir) {
      const r = spawnSync('git', ['-C', nearest(dir), 'rev-parse', '--show-toplevel'], { encoding: 'utf8' });
      return r.status === 0 ? r.stdout.trim() : '';
    },
  };
}

module.exports = { create };
