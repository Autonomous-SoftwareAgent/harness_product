'use strict';
// spec: HOOK-S-007
// spec: HOOK-S-009
// BỘ CHUYỂN dự án: làm cổng "dự án" (ports/workspace.js) bằng cây thư mục và các tệp cấu hình trên đĩa (S-055).
// Mọi đường dẫn của harness vẫn sinh ở MỘT nơi là gate/gate-paths.js; tệp này chỉ gọi lại và đọc tệp.
const fs = require('node:fs');
const path = require('node:path');
const P = require('../../gate/gate-paths');

const posix = (p) => String(p).split(path.sep).join('/');

// Danh sách từ cấm ở máy: { "words": ["...", ...] }. Trả mảng từ (đã bỏ rỗng), hoặc null khi không có tệp hay tệp hỏng.
// Danh sách chỉ nằm ở MÁY (tệp bị gitignore), không bao giờ được commit: chính danh sách là thông tin không được lộ.
function loadWords(root) {
  let raw;
  try { raw = JSON.parse(fs.readFileSync(P.bannedListPath(root), 'utf8')); } catch { return null; }
  const words = (Array.isArray(raw && raw.words) ? raw.words : []).filter((w) => typeof w === 'string' && w.trim()).map((w) => w.trim());
  return words.length ? words : null;
}

const skillFile = (root, name) => path.join(P.skillsDir(root), name, 'SKILL.md');
const skillExists = (root, name) => /^[a-z][a-z0-9-]*$/.test(String(name || '')) && fs.existsSync(skillFile(root, name));
const allSkills = (root) => { try { return fs.readdirSync(P.skillsDir(root)).filter((n) => skillExists(root, n)).sort(); } catch { return []; } };

function create(root) {
  return {
    root,
    servicesDirName: P.SERVICES_DIR,
    skillsMapRel: posix(path.relative(root, P.skillsMapPath(root))),
    skillsDir: P.skillsDir(root),
    bannedListRel: posix(path.relative(root, P.bannedListPath(root))),
    norm: (p) => P.norm(p),
    caseKey: (s) => (process.platform === 'win32' ? String(s).toLowerCase() : String(s)),
    inside: (abs) => P.inside(abs, root),
    resolveToken: (token, cwd) => P.resolveToken(token, cwd),
    exists: (abs) => fs.existsSync(abs),
    serviceOf: (abs) => P.serviceOf(root, abs),
    isService: (name) => P.serviceHasRepo(root, name),
    serviceRel: (name) => P.serviceRel(root, name),
    serviceDir: (name) => P.serviceDir(root, name),
    units: () => P.extraUnits(root),
    scopeMode: () => P.scopeMode(root),
    // Bảng nối là phần `skills` của cấu hình dự án (S-063): khai ngay trong project.json, hoặc tên một tệp riêng (BSN_: skills-map.json).
    skillsMapRaw: () => { try { return P.projectConfig(root).skillsRaw; } catch { return null; } },
    skillsMapExists: () => fs.existsSync(P.skillsMapPath(root)),
    skillExists: (name) => skillExists(root, name),
    allSkills: () => allSkills(root),
    bannedWords: () => loadWords(root),
    entryExists: (name) => fs.existsSync(P.codePath(root, `hooks/${name}`)),
    policy: (name) => P.policy(root, name),
    sheetOwner: (abs) => P.sheetOwner(root, abs),
  };
}

module.exports = { create, loadWords, skillExists, allSkills };
