'use strict';
// spec: PORT-S-005
// CÁC BẢN TRƯỚC của một sơ đồ, đọc từ lịch sử git của đơn vị. Chỉ được hỏi khi dấu của phần giải thích không khớp thẳng với hình
// hiện tại: lúc đó cần biết phần giải thích được viết cho bản nào, và hình của bản đó có giống hình bây giờ không (model.explainStale).
// Chỉ chạy lệnh ĐỌC của git. Không có git, không có lịch sử hay quá giờ thì trả [] (bên gọi coi phần giải thích là cũ, như trước).
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const yaml = require('../../../core/core/lib/yaml-lite');
const specs = require('../../core/diagrams/spec');

const MAX_COMMITS = 40;
const git = (dir, args) => {
  const r = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', timeout: 15000, windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
  return r.status === 0 && !r.error ? r.stdout : null;
};
const memo = new Map(); // tiến trình ngắn (mỗi lời gọi công cụ một tiến trình): nhớ trong một lần chạy là đủ

// file: đường dẫn tuyệt đối của tệp sơ đồ. Trả các bản đã commit [{ commit, spec }] (mới nhất trước), theo cả lần tệp dời chỗ (--follow).
function versions(file) {
  const key = path.resolve(file);
  if (memo.has(key)) return memo.get(key);
  const out = [];
  memo.set(key, out);
  const dir = path.dirname(key);
  const top = (git(dir, ['rev-parse', '--show-toplevel']) || '').trim();
  if (!top) return out;
  const log = git(dir, ['log', '--follow', `-n${MAX_COMMITS}`, '--name-only', '--format=@%H', '--', key]);
  if (!log) return out;
  let commit = '';
  for (const line of log.split('\n')) {
    const l = line.trim();
    if (!l) continue;
    if (l.startsWith('@')) { commit = l.slice(1); continue; }
    const text = git(top, ['show', `${commit}:${l}`]);
    if (text === null) continue;
    try { const spec = specs.parse(yaml.parse(text)).spec; if (spec) out.push({ commit, spec }); } catch { /* bản đó không đọc được: bỏ qua */ }
  }
  return out;
}
const earlier = (file) => versions(file).map((v) => v.spec);

// Đường dẫn mới trong một dòng của `git diff --numstat -M` ("a/{cũ => mới}/b" hoặc "cũ => mới" hoặc đường dẫn thường).
function newPath(p) {
  const brace = /\{[^{}]* => ([^{}]*)\}/;
  if (brace.test(p)) return p.replace(brace, '$1').replace(/\/\//g, '/');
  const i = p.indexOf(' => ');
  return i >= 0 ? p.slice(i + 4) : p;
}
// Mã mà sơ đồ vẽ theo đã đổi bao nhiêu kể từ khi HÌNH có dạng như bây giờ. Dùng để nêu sơ đồ do người khai có thể đã lệch với mã:
// máy không tự vẽ lại hình người đã duyệt, chỉ nêu ra. file: tệp sơ đồ; spec: bản hiện tại; unitRoot: thư mục đơn vị (gốc của `sources`).
// Trả { since (mã commit), files, added, removed } hoặc null khi không hỏi được lịch sử. Tệp dời chỗ mà không đổi nội dung không tính.
function drift(file, spec, unitRoot, samePicture) {
  const vs = versions(file);
  let since = '';
  for (const v of vs) { if (samePicture(v.spec, spec)) since = v.commit; else break; }
  if (!since || !spec.sources || !spec.sources.length) return null;
  const top = (git(unitRoot, ['rev-parse', '--show-toplevel']) || '').trim();
  if (!top) return null;
  const out = git(top, ['-c', 'diff.renameLimit=20000', 'diff', '--numstat', '-M', since, 'HEAD']);
  if (out === null) return null;
  const prefix = path.relative(top, unitRoot).split(path.sep).join('/');
  const want = new Set(spec.sources.map((s) => (prefix ? `${prefix}/${s}` : s)));
  let files = 0; let added = 0; let removed = 0;
  for (const line of out.split('\n')) {
    const m = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(line);
    if (!m || !want.has(newPath(m[3]))) continue;
    const a = Number(m[1]) || 0; const r = Number(m[2]) || 0;
    if (!a && !r) continue;
    files++; added += a; removed += r;
  }
  return { since: since.slice(0, 12), files, added, removed };
}

module.exports = { earlier, versions, drift, newPath, MAX_COMMITS };
