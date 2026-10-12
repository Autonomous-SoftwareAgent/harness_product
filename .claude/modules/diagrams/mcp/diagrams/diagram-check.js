'use strict';
// spec: PORT-S-002
// Kiểm sơ đồ VẼ THẬT: mở từng trang của dịch vụ trong docs/portal bằng trình duyệt không giao diện (Edge hoặc Chrome có sẵn trên máy),
// đợi Mermaid vẽ, rồi đọc DOM: mỗi <pre class="mermaid"> phải thành hình (có <svg>) và không phải hình báo lỗi cú pháp.
// Bộ kiểm lược đồ chỉ chứng minh bản khai báo đúng dạng; chỉ lần chạy này mới chứng minh Mermaid chịu vẽ nó.
// Không có trình duyệt thì KHÔNG báo đạt: trả skipped kèm lý do.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { pathToFileURL } = require('url');
const core = require('../../../servicedocs/mcp/docs/core');

const CANDIDATES = [
  process.env.BSN_BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

const findBrowser = () => CANDIDATES.find((p) => fs.existsSync(p)) || null;

function dumpDom(browser, url) {
  const r = spawnSync(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--virtual-time-budget=20000', '--dump-dom', url],
    { encoding: 'utf8', timeout: 120000, maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  if (r.error || r.status !== 0) throw new Error(`trình duyệt không chạy được: ${r.error ? r.error.message : (r.stderr || '').slice(0, 200)}`);
  return r.stdout;
}

// Hình rộng hoặc cao quá ngưỡng này (px, ở kích thước thật, chữ 16px) thì phải thu nhỏ nhiều mới thấy hết: liệt kê là "quá lớn" để người xem xét tách.
const OVERSIZE = { width: 1800, height: 2400 };

// Đọc DOM đã vẽ: mỗi <pre class="mermaid" id="..."> -> { id, drawn, failed, width, height }. Sơ đồ ở tab ẩn không được vẽ (kiểm ở lượt mở tab đó).
function inspect(dom) {
  const out = [];
  const re = /<pre class="mermaid"([^>]*)>([\s\S]*?)<\/pre>/g;
  for (let m = re.exec(dom); m; m = re.exec(dom)) {
    out.push({
      id: (/data-diagram="([^"]*)"/.exec(m[1]) || [])[1] || `#${out.length + 1}`,
      drawn: /<svg[\s>]/.test(m[2]),
      failed: /Syntax error in text|class="error-icon"|aria-roledescription="error"/.test(m[2]),
      ...sizeOf(m[2]),
    });
  }
  return out;
}

// Kích thước thật của hình: viewBox của thẻ svg ngoài cùng ("minx miny rộng cao").
function sizeOf(inner) {
  const m = /<svg[^>]*\sviewBox="\s*-?[\d.]+[ ,]+-?[\d.]+[ ,]+([\d.]+)[ ,]+([\d.]+)\s*"/.exec(inner);
  return m ? { width: Math.round(Number(m[1])), height: Math.round(Number(m[2])) } : { width: 0, height: 0 };
}

// Kiểm mọi trang HTML của các dịch vụ trong cổng. Trang có tab thì mở từng tab (#business, #architecture, #problems).
function run({ service } = {}) {
  const portal = path.join(core.BSN_DIR, 'docs', 'portal');
  if (!fs.existsSync(path.join(portal, 'assets', 'mermaid.min.js'))) {
    return { skipped: true, reason: 'chưa có docs/portal/assets/mermaid.min.js (đặt thư viện vào .claude/modules/diagrams/mcp/vendor/ rồi dựng lại cổng)', pages: [] };
  }
  const browser = findBrowser();
  if (!browser) return { skipped: true, reason: 'máy không có Edge hay Chrome (đặt đường dẫn vào biến BSN_BROWSER)', pages: [] };
  const names = fs.readdirSync(portal, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^[a-z][a-z0-9-]{1,40}$/.test(d.name) && !['assets', 'history'].includes(d.name) && (!service || d.name === service)).map((d) => d.name);
  const pages = [];
  for (const name of names) {
    for (const file of fs.readdirSync(path.join(portal, name)).filter((f) => f.endsWith('.html')).sort()) {
      const abs = path.join(portal, name, file);
      const html = fs.readFileSync(abs, 'utf8');
      const declared = (html.match(/<pre class="mermaid"/g) || []).length;
      if (!declared) continue;
      const tabs = /class="panel"/.test(html) ? ['business', 'architecture', 'problems'] : [''];
      const good = new Set(); const bad = new Set(); const sizes = new Map();
      for (const tab of tabs) {
        for (const d of inspect(dumpDom(browser, pathToFileURL(abs).href + (tab ? `#${tab}` : '')))) {
          if (d.failed) bad.add(d.id); else if (d.drawn) { good.add(d.id); if (d.width) sizes.set(d.id, { id: d.id, width: d.width, height: d.height }); }
        }
      }
      const all = [...sizes.values()];
      pages.push({ page: `${name}/${file}`, declared, drawn: good.size, failed: [...bad], ok: good.size === declared && bad.size === 0,
        sizes: all, oversize: all.filter((x) => x.width > OVERSIZE.width || x.height > OVERSIZE.height) });
    }
  }
  return { skipped: false, browser, pages, ok: pages.every((p) => p.ok) };
}

function format(r) {
  if (r.skipped) return `BỎ QUA, CHƯA KIỂM: ${r.reason}.`;
  if (!r.pages.length) return 'Không có trang nào chứa sơ đồ Mermaid.';
  const big = (p) => ((p.oversize || []).length ? `; quá lớn (hơn ${OVERSIZE.width}x${OVERSIZE.height}px): ${p.oversize.map((x) => `${x.id} ${x.width}x${x.height}`).join(', ')}` : '');
  const lines = r.pages.map((p) => `${p.ok ? 'đạt ' : 'HỎNG'} ${p.page}: ${p.drawn}/${p.declared} sơ đồ vẽ được${p.failed.length ? `; báo lỗi cú pháp: ${p.failed.join(', ')}` : ''}${big(p)}`);
  return `${lines.join('\n')}\n${r.ok ? 'Mọi sơ đồ đều vẽ được.' : 'CÓ SƠ ĐỒ KHÔNG VẼ ĐƯỢC.'}`;
}

module.exports = { run, format, inspect, sizeOf, findBrowser, OVERSIZE };
