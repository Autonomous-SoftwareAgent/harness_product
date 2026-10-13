'use strict';
// spec: HOOK-S-007
// BỘ CHUYỂN cho Claude Code, phần cấu hình: đọc .claude/settings.json của dự án để biết cửa vào nào đang được khai.
const fs = require('node:fs');
const path = require('node:path');

// Mọi lệnh hook đang khai trong settings.json của dự án (mảng chuỗi). Không đọc được thì [] (phép kiểm sức khỏe của cổng duyệt đã báo).
function hookCommands(root) {
  try {
    return Object.values(JSON.parse(fs.readFileSync(path.join(root, '.claude', 'settings.json'), 'utf8')).hooks || {}).flat().flatMap((g) => (g.hooks || []).map((h) => String(h.command || '')));
  } catch { return []; }
}

// Mẫu tên công cụ (matcher) của mọi nhóm PreToolUse có lệnh chứa `needle` (ví dụ 'guard-skill.js'). Nhóm không ghi matcher khớp mọi công cụ.
function preToolMatchers(root, needle) {
  try {
    const pre = JSON.parse(fs.readFileSync(path.join(root, '.claude', 'settings.json'), 'utf8')).hooks.PreToolUse || [];
    return pre.filter((g) => (g.hooks || []).some((h) => String(h.command || '').includes(needle))).map((g) => (typeof g.matcher === 'string' && g.matcher ? g.matcher : '.*'));
  } catch { return []; }
}

module.exports = { hookCommands, preToolMatchers };
