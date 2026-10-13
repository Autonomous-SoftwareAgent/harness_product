'use strict';
// spec: PORT-S-002
// Khung xem MỘT sơ đồ, dùng chung cho mọi trang của cổng (khuôn mặc định và bộ sinh riêng của dịch vụ): thanh nút thu phóng,
// vùng vẽ ở kích thước thật, dòng nguồn, và phần giải thích bốn mục. Trang không tự viết HTML cho sơ đồ: gọi figure(d).
// Hình luôn vẽ trên nền sáng (màu nút do bộ vẽ quyết là nền nhạt chữ tối), kể cả khi trang ở giao diện tối.
const { RENDERER_VERSION } = require('./render');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const BAR = '<div class="dz-bar" role="group" aria-label="Thu phóng sơ đồ">' +
  '<button type="button" data-dz="out" aria-label="Thu nhỏ">−</button>' +
  '<span class="dz-level" aria-live="polite">100%</span>' +
  '<button type="button" data-dz="in" aria-label="Phóng to">+</button>' +
  '<button type="button" data-dz="fit">Vừa khung</button>' +
  '<button type="button" data-dz="one">100%</button>' +
  '<button type="button" data-dz="full" aria-pressed="false">Toàn màn hình</button>' +
  '<span class="dz-hint">Ctrl + cuộn để zoom · kéo để di chuyển</span></div>';

// Phần giải thích do diagram_explain ghi: { meaning, read[], details[{term,text}], pitfalls[] }; stale = sơ đồ đã đổi sau khi viết.
function explainHtml(d) {
  const e = d.explain;
  if (!e) return '';
  const list = (tag, xs) => `<${tag}>${xs.map((x) => `<li>${esc(x)}</li>`).join('')}</${tag}>`;
  return `<section class="diagram-explain" aria-label="Giải thích sơ đồ ${esc(d.title || d.id)}">
${d.explainStale ? '<p class="explain-stale">Sơ đồ đã đổi sau khi phần giải thích này được viết; nội dung dưới đây có thể đã cũ.</p>\n' : ''}${e.machine ? '<p class="dz-src">Phần giải thích này do máy viết từ dữ liệu của hình, cập nhật theo hình sau mỗi commit.</p>\n' : ''}<h5>Ý nghĩa</h5>
<p>${esc(e.meaning)}</p>
<h5>Cách đọc</h5>
${list('ol', e.read)}${e.details && e.details.length ? `
<h5>Chi tiết</h5>
<dl>${e.details.map((x) => `<dt>${esc(x.term)}</dt><dd>${esc(x.text)}</dd>`).join('')}</dl>` : ''}${e.pitfalls && e.pitfalls.length ? `
<h5>Dễ hiểu nhầm</h5>
${list('ul', e.pitfalls)}` : ''}
</section>`;
}

// d: { id, title, mermaid, sources?, explain?, explainStale? }. opts.caption=false: không in tên sơ đồ (trang đã có tiêu đề mục riêng).
function figure(d, opts = {}) {
  const caption = opts.caption === false ? '' : `<figcaption>${esc(d.title)}</figcaption>\n`;
  // Sơ đồ dữ liệu nói rõ nó đến từ đâu: đọc từ cơ sở dữ liệu thật (chắc chắn) hay agent khai từ mã (có thể sót).
  // Sơ đồ harness tự sinh từ mã: nói rõ nguồn gốc, và agent đã soát nó với mã hay chưa.
  const review = d.origin ? (!d.review ? 'Chưa có agent nào soát với mã. ' : d.reviewStale ? 'Hình đã đổi sau lần soát gần nhất. ' : d.review.verdict === 'đúng' ? `Agent đã soát là đúng với mã (${esc(d.review.at)}). ` : `Agent báo SAI (${esc(d.review.at)}): ${esc(d.review.note)} `) : '';
  const auto = d.origin ? `${esc(d.origin.charAt(0).toUpperCase() + d.origin.slice(1))} sau mỗi commit; không ai khai sơ đồ này. ${review}` : '';
  const origin = d.origin ? auto : d.type !== 'erd' ? '' : d.generated ? `Tự sinh từ cơ sở dữ liệu thật (${esc(d.generated)}): công cụ chạy lệnh tạo bảng của dịch vụ vào một cơ sở dữ liệu tạm rồi đọc cấu trúc. ` : 'Agent khai qua công cụ, từ mã (không đọc từ cơ sở dữ liệu). ';
  const from = d.sources && d.sources.length ? `Theo: ${d.sources.map((x) => `<code>${esc(x)}</code>`).join(' ')}` : '';
  const src = origin || from ? `\n<p class="dz-src">${origin}${from}</p>` : '';
  return `<figure class="diagram" id="dg-${esc(d.id)}" data-renderer="${RENDERER_VERSION}">${caption}${BAR}
<div class="dz-view"><pre class="mermaid" data-diagram="${esc(d.id)}">${esc(d.mermaid)}</pre></div>
<p class="dz-note mm-note">Đang hiện dạng chữ vì trang chưa có thư viện vẽ Mermaid (<code>docs/portal/assets/mermaid.min.js</code>).</p>${src}</figure>${explainHtml(d) ? `\n${explainHtml(d)}` : d.origin && !opts.noExplainHint ? '\n<p class="explain-stale">Sơ đồ này chưa có phần giải thích (agent ghi bằng <code>diagram_explain</code>).</p>' : ''}`;
}

// CSS tự đủ: mọi màu có giá trị dự phòng, nên dùng được trên trang có bộ biến màu khác (trang do bộ sinh riêng của một đơn vị dựng).
const CSS = `
figure.diagram{margin:14px 0 10px;padding:0;min-width:0;background:#fff;color:#15212b;border:1px solid var(--line,#d5dde4);border-radius:8px;overflow:hidden;display:flex;flex-direction:column}
figure.diagram figcaption{font-weight:600;font-size:.95rem;margin:0;padding:8px 12px;background:var(--surface,#fff);color:var(--text,var(--fg,#15212b));border-bottom:1px solid var(--line,#d5dde4)}
.dz-bar{display:none;flex-wrap:wrap;align-items:center;gap:6px;padding:6px 8px;background:var(--surface,#fff);border-bottom:1px solid var(--line,#d5dde4)}
.mm-ok .dz-bar{display:flex}
.dz-bar button{font:500 12.5px/1 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--text,var(--fg,#15212b));background:var(--bg,#f2f5f7);border:1px solid var(--line,#d5dde4);border-radius:4px;padding:6px 9px;cursor:pointer;min-width:30px}
.dz-bar button:hover{border-color:var(--accent,#1c5a85);color:var(--accent,#1c5a85)}
.dz-bar button:focus-visible{outline:2px solid var(--accent,#1c5a85);outline-offset:1px}
.dz-bar button[aria-pressed="true"]{border-color:var(--accent,#1c5a85);color:var(--accent,#1c5a85)}
.dz-level{font:500 12px/1 ui-monospace,SFMono-Regular,Consolas,monospace;color:var(--muted,#5b6976);min-width:44px;text-align:center;font-variant-numeric:tabular-nums}
.dz-hint{margin-left:auto;font-size:12px;color:var(--muted,#5b6976)}
.dz-view{overflow:auto;max-height:78vh;padding:20px;background:#fff;overscroll-behavior:contain}
.mm-ok .dz-view{cursor:grab}
.dz-view.is-dragging{cursor:grabbing;user-select:none}
.dz-view pre.mermaid{margin:0;padding:0;border:0;width:max-content;min-width:100%;background:none;font:13px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace;color:#3a4651;white-space:pre;overflow:visible;text-align:left}
.dz-view pre.mermaid[data-processed]{color:#15212b}
.dz-view svg{display:block;max-width:none!important}
figure.diagram.is-expanded{position:fixed;inset:12px;z-index:60;margin:0;box-shadow:0 0 0 100vmax rgba(8,14,20,.62)}
figure.diagram.is-expanded .dz-view{max-height:none;flex:1}
.dz-note{max-width:none;margin:0;padding:6px 12px;font-size:12.5px;color:#5b6976;background:#fff}
.mm-ok .dz-note{display:none}
.dz-src{max-width:none;margin:0;padding:8px 12px;border-top:1px solid var(--line,#d5dde4);background:var(--surface,#fff);font-size:12.5px;color:var(--muted,#5b6976)}
.diagram-explain{margin:0 0 22px;background:var(--surface,#fff);border:1px solid var(--line,#d5dde4);border-left:3px solid var(--accent,#1c5a85);border-radius:8px;padding:12px 16px;display:grid;gap:6px;font-size:.94rem;min-width:0}
.diagram-explain h5{font-size:.76rem;font-weight:650;letter-spacing:.06em;text-transform:uppercase;color:var(--muted,#5b6976);margin:8px 0 0}
.diagram-explain h5:first-of-type{margin-top:0}
.diagram-explain p{margin:0;max-width:none}
.diagram-explain ol,.diagram-explain ul{margin:0;padding-left:1.3em;display:grid;gap:4px}
.diagram-explain dl{margin:0;display:grid;grid-template-columns:minmax(120px,max-content) minmax(0,1fr);gap:6px 16px}
.diagram-explain dt{font-weight:600;overflow-wrap:anywhere}
.diagram-explain dd{margin:0}
.explain-stale{color:var(--warn,#8f5d00);background:var(--warn-bg,var(--warn-soft,#fbeed2));border-radius:6px;padding:6px 10px;font-size:.88rem}
@media (max-width:520px){.dz-hint{display:none}.diagram-explain dl{grid-template-columns:minmax(0,1fr)}}
@media print{.dz-bar{display:none!important}.dz-view{max-height:none;overflow:visible}.dz-view svg{max-width:100%!important;height:auto!important;width:auto!important}}
`;

// Chạy trong trình duyệt (viết kiểu ES5, không phụ thuộc gì ngoài window.mermaid). Chỉ vẽ sơ đồ đang hiện (phần tử ẩn không đo được).
const JS = `(function(){
  var root=document.documentElement;
  var mm=[].slice.call(document.querySelectorAll('pre.mermaid'));
  if(!mm.length)return;
  var MIN=0.2,MAX=4,STEP=1.2,inited=false;
  function init(){
    if(inited)return true;
    if(!window.mermaid)return false;
    var nat={useMaxWidth:false};
    try{
      window.mermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:'base',
        flowchart:nat,sequence:nat,state:nat,
        themeVariables:{background:'#ffffff',mainBkg:'#ffffff',primaryColor:'#ffffff',primaryTextColor:'#15212b',lineColor:'#6f6a5f',
          primaryBorderColor:'#6b6250',nodeBorder:'#6b6250',clusterBorder:'#6b6250',edgeLabelBackground:'#ffffff',
          clusterBkg:'rgba(127,127,127,0.07)',titleColor:'#15212b',actorBkg:'#eef2f8',actorBorder:'#6b6250',signalColor:'#3a4651',
          signalTextColor:'#15212b',labelBoxBkgColor:'#eef2f8',labelBoxBorderColor:'#6b6250',noteBkgColor:'#fdf0d6',noteBorderColor:'#c08a1e',
          fontSize:'16px',fontFamily:'system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif'},
        themeCSS:'.node rect, .node circle, .node polygon, .node path, .cluster rect { stroke-width: 2px; }'});
    }catch(e){return false;}
    inited=true;root.classList.add('mm-ok');return true;
  }
  function figOf(el){while(el&&!(el.classList&&el.classList.contains('diagram')))el=el.parentNode;return el;}
  function fitScale(fig){
    var v=fig.querySelector('.dz-view'),w=+fig.getAttribute('data-w')||0,h=+fig.getAttribute('data-h')||0;
    if(!v||!w)return 1;
    var s=(v.clientWidth-40)/w;
    if(fig.classList.contains('is-expanded')&&h)s=Math.min(s,(v.clientHeight-40)/h);
    return Math.max(MIN,Math.min(1,s));
  }
  function apply(fig,scale){
    var svg=fig.querySelector('.dz-view svg'),w=+fig.getAttribute('data-w'),h=+fig.getAttribute('data-h');
    if(!svg||!w)return;
    scale=Math.max(MIN,Math.min(MAX,scale));
    fig.setAttribute('data-scale',scale);
    svg.style.width=Math.round(w*scale)+'px';svg.style.height=Math.round(h*scale)+'px';
    var lv=fig.querySelector('.dz-level');if(lv)lv.textContent=Math.round(scale*100)+'%';
  }
  function setup(pre){
    var fig=figOf(pre),svg=pre.querySelector('svg');
    if(!fig||!svg||fig.getAttribute('data-w'))return;
    var vb=svg.viewBox&&svg.viewBox.baseVal,r=svg.getBoundingClientRect();
    var w=vb&&vb.width?vb.width:r.width,h=vb&&vb.height?vb.height:r.height;
    if(!w||!h)return;
    fig.setAttribute('data-w',Math.round(w));fig.setAttribute('data-h',Math.round(h));
    svg.removeAttribute('width');svg.removeAttribute('height');svg.style.maxWidth='none';
    // mở trang: kích thước thật; hình rộng hơn khung thì hiện vừa khung để thấy toàn cảnh trước
    apply(fig,fitScale(fig));
  }
  function draw(){
    if(!init())return;
    var todo=mm.filter(function(b){return !b.hasAttribute('data-processed')&&b.offsetParent!==null;});
    if(!todo.length)return;
    var done=function(){todo.forEach(setup);};
    try{var p=window.mermaid.run({nodes:todo});if(p&&p.then)p.then(done,done);else done();}catch(e){done();}
  }
  function zoomAt(fig,scale,cx,cy){
    var v=fig.querySelector('.dz-view'),old=+fig.getAttribute('data-scale')||1;
    if(!v)return;
    if(cx==null){cx=v.clientWidth/2;cy=v.clientHeight/2;}
    var px=(v.scrollLeft+cx)/old,py=(v.scrollTop+cy)/old;
    apply(fig,scale);
    var now=+fig.getAttribute('data-scale');
    v.scrollLeft=px*now-cx;v.scrollTop=py*now-cy;
  }
  function expand(fig,on){
    fig.classList.toggle('is-expanded',on);
    var b=fig.querySelector('[data-dz="full"]');if(b){b.setAttribute('aria-pressed',on?'true':'false');b.textContent=on?'Thu lại':'Toàn màn hình';}
    apply(fig,fitScale(fig));
  }
  document.addEventListener('click',function(ev){
    var b=ev.target;while(b&&!(b.getAttribute&&b.getAttribute('data-dz')))b=b.parentNode;
    if(!b)return;
    var fig=figOf(b),act=b.getAttribute('data-dz'),s=+fig.getAttribute('data-scale')||1;
    if(act==='in')zoomAt(fig,s*STEP);
    else if(act==='out')zoomAt(fig,s/STEP);
    else if(act==='fit')apply(fig,fitScale(fig));
    else if(act==='one')apply(fig,1);
    else if(act==='full')expand(fig,!fig.classList.contains('is-expanded'));
  });
  document.addEventListener('keydown',function(ev){
    if(ev.key!=='Escape')return;
    var open=document.querySelector('figure.diagram.is-expanded');if(open)expand(open,false);
  });
  [].slice.call(document.querySelectorAll('.dz-view')).forEach(function(v){
    v.addEventListener('wheel',function(ev){
      if(!ev.ctrlKey)return;
      var fig=figOf(v);if(!fig.getAttribute('data-w'))return;
      ev.preventDefault();
      var r=v.getBoundingClientRect(),s=+fig.getAttribute('data-scale')||1;
      zoomAt(fig,ev.deltaY<0?s*1.1:s/1.1,ev.clientX-r.left,ev.clientY-r.top);
    },{passive:false});
    var drag=null;
    v.addEventListener('pointerdown',function(ev){
      if(ev.button!==0||ev.pointerType==='touch')return;
      drag={x:ev.clientX,y:ev.clientY,l:v.scrollLeft,t:v.scrollTop};v.classList.add('is-dragging');
    });
    window.addEventListener('pointermove',function(ev){
      if(!drag)return;v.scrollLeft=drag.l-(ev.clientX-drag.x);v.scrollTop=drag.t-(ev.clientY-drag.y);
    });
    window.addEventListener('pointerup',function(){if(drag){drag=null;v.classList.remove('is-dragging');}});
  });
  draw();
  window.addEventListener('hashchange',function(){setTimeout(draw,0);});
})();
`;

module.exports = { figure, explainHtml, CSS, JS, BAR };
