// MPH reader: opens an uploaded HTML document in a sandbox and adds reading tools around it.
// Resume position, bookmarks, highlights with notes, contents, search, text size, progress, focus mode.
// The document talks to MPH only through postMessage, so it can never reach your login or data.
import { esc, icon, uid } from './core.js?v=0.9.7';
import { store, mutate, touch, readDoc, readDocState, saveDocState } from './store.js?v=0.9.7';
import { colName } from './views.js?v=0.9.7';

const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
const keep = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const toast = (text, undo) => window.dispatchEvent(new CustomEvent('mph:toast', { detail: { text, undo } }));

export const R = { id: null, frame: null, panel: load('mph:rpanel', ''), find: false, q: '', count: 0, index: 0, sel: null, pct: 0, toc: [], focus: load('mph:focus', false) };
const doc = () => store.state.docs.find(d => d.id === R.id);
const send = m => { if (R.frame && R.frame.contentWindow) R.frame.contentWindow.postMessage(Object.assign({ mphcmd: true }, m), '*'); };
const marksOf = d => (d && d.marks) || [];

// Script placed inside the document. It keeps the document's own saved data (localStorage) and reports reading position.
function inside(id, data) {
  const D = JSON.stringify(data || {}).replace(/</g, '\\u003c');
  const storage = `(function(){var D=${D},I=${JSON.stringify(id)},T;var H=Object.prototype.hasOwnProperty;
function send(){clearTimeout(T);T=setTimeout(function(){try{parent.postMessage({mph:'ls',id:I,data:D},'*')}catch(e){}},300)}
function make(st,p){var api={getItem:function(k){k=String(k);return H.call(st,k)?st[k]:null},setItem:function(k,v){st[String(k)]=String(v);if(p)send()},removeItem:function(k){delete st[String(k)];if(p)send()},clear:function(){Object.keys(st).forEach(function(k){delete st[k]});if(p)send()},key:function(i){var k=Object.keys(st);return i<k.length?k[i]:null}};
return new Proxy(api,{get:function(t,k){if(k==='length')return Object.keys(st).length;if(k in t)return t[k];return typeof k==='string'?api.getItem(k):undefined},set:function(t,k,v){api.setItem(k,v);return true},deleteProperty:function(t,k){api.removeItem(k);return true},has:function(t,k){return k in t||H.call(st,k)},ownKeys:function(){return Object.keys(st)},getOwnPropertyDescriptor:function(t,k){if(H.call(st,k))return{value:st[k],writable:true,enumerable:true,configurable:true}}})}
var L=make(D,true),S=make({},false);
try{Object.defineProperty(window,'localStorage',{configurable:true,get:function(){return L}})}catch(e){}
try{Object.defineProperty(window,'sessionStorage',{configurable:true,get:function(){return S}})}catch(e){}
})();`;
  const bridge = `(function(){
var P=parent,last=null,T,ST,user=false,found=[],cur=-1,fq=null,hls=[];
var HL=!!(window.CSS&&CSS.highlights&&window.Highlight);
function post(m){try{P.postMessage(m,'*')}catch(e){}}
function root(){return document.scrollingElement||document.documentElement}
function scrollable(e){if(!e||e===document.body)return false;if(e===root())return e.scrollHeight-e.clientHeight>40;var o=getComputedStyle(e).overflowY;return(o==='auto'||o==='scroll'||o==='overlay')&&e.scrollHeight-e.clientHeight>40&&e.clientHeight>innerHeight*0.4}
function pick(){var best=null,area=0;if(scrollable(root())){best=root();area=innerWidth*innerHeight}var all=document.body?document.body.getElementsByTagName('*'):[];for(var i=0;i<all.length&&i<6000;i++){var e=all[i];if(e.scrollHeight-e.clientHeight<=40)continue;if(!scrollable(e))continue;var a=e.clientWidth*e.clientHeight;if(a>area*1.05){best=e;area=a}}return best||root()}
function sc(){if(!last||!last.isConnected||!scrollable(last))last=pick();return last}
function isRoot(s){return s===root()||s===document.documentElement||s===document.body}
function pathOf(el){var p=[];while(el&&el!==document.body&&el.parentElement){p.unshift([].indexOf.call(el.parentElement.children,el));el=el.parentElement}return el===document.body?p:null}
function elOf(p){if(!p)return root();var el=document.body;for(var i=0;i<p.length;i++){if(!el||!el.children[p[i]])return null;el=el.children[p[i]]}return el}
function pct(s){var m=s.scrollHeight-s.clientHeight;return m>0?Math.min(100,Math.round(s.scrollTop/m*100)):0}
function where(){var s=sc();return{path:isRoot(s)?null:pathOf(s),top:Math.round(s.scrollTop),pct:pct(s)}}
function heads(){return [].slice.call(document.querySelectorAll('h1,h2,h3')).filter(function(h){return h.textContent.trim()&&h.getClientRects().length})}
function toc(){return heads().slice(0,400).map(function(h,i){return{i:i,l:+h.tagName[1],t:h.textContent.trim().replace(/\\s+/g,' ').slice(0,90)}})}
function label(){var hs=heads(),b=null;for(var i=0;i<hs.length;i++){if(hs[i].getBoundingClientRect().top<=innerHeight*0.4)b=hs[i]}return b?b.textContent.trim().replace(/\\s+/g,' ').slice(0,80):(document.title||'Beginning')}
function ranges(q,limit){var out=[];if(!q)return out;q=q.toLowerCase();var w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,{acceptNode:function(n){var p=n.parentElement;if(!p)return 2;var t=p.tagName;return(t==='SCRIPT'||t==='STYLE'||t==='NOSCRIPT'||t==='TEMPLATE')?2:1}});var n;while((n=w.nextNode())){var s=n.nodeValue.toLowerCase(),i=0;while((i=s.indexOf(q,i))>-1){var r=document.createRange();r.setStart(n,i);r.setEnd(n,i+q.length);out.push(r);i+=q.length;if(out.length>=limit)return out}}return out}
function reveal(r){var el=r.startContainer.parentElement;if(el&&el.scrollIntoView)el.scrollIntoView({block:'center'})}
function paintHl(){if(!HL)return;var rs=[];hls.forEach(function(t){var r=ranges(t,1)[0];if(r)rs.push(r)});if(rs.length)CSS.highlights.set('mph-hl',new Highlight(...rs));else CSS.highlights.delete('mph-hl')}
function find(q,dir){if(q!==fq){found=ranges(q,800);cur=-1;fq=q}if(!q||!found.length){if(HL){CSS.highlights.delete('mph-find');CSS.highlights.delete('mph-cur')}post({mph:'find',count:0,index:0});return}cur=(cur+(dir||1)+found.length)%found.length;if(HL){CSS.highlights.set('mph-find',new Highlight(...found));CSS.highlights.set('mph-cur',new Highlight(found[cur]))}reveal(found[cur]);post({mph:'find',count:found.length,index:cur+1})}
function go(path,top,text){var el=elOf(path);if(el){el.scrollTo({top:top||0});if(isRoot(el)){window.scrollTo(0,top||0)}}if(text){var r=ranges(text,1)[0];if(r)reveal(r)}}
function style(){var s=document.createElement('style');s.textContent='::highlight(mph-find){background-color:rgba(57,180,74,.35)}::highlight(mph-cur){background-color:#39B44A;color:#000}::highlight(mph-hl){background-color:rgba(255,210,0,.42)}';(document.head||document.documentElement).appendChild(s)}
document.addEventListener('scroll',function(e){var t=e.target===document?root():e.target;var s=sc();if(t!==s){if(scrollable(t)&&t.clientWidth*t.clientHeight>s.clientWidth*s.clientHeight*1.05){last=t}else return}user=true;clearTimeout(T);T=setTimeout(function(){var w=where();w.mph='pos';post(w)},400)},true);
document.addEventListener('selectionchange',function(){clearTimeout(ST);ST=setTimeout(function(){var s=getSelection(),t=s?String(s).trim():'';var w=where();w.mph='sel';w.text=t.slice(0,600);post(w)},250)});
window.addEventListener('message',function(e){if(e.source!==P)return;var m=e.data;if(!m||!m.mphcmd)return;
if(m.cmd==='goto'){go(m.path,m.top,m.text)}
else if(m.cmd==='resume'){var tryGo=function(){if(user)return;var el=m.path?elOf(m.path):sc();if(el&&el.scrollHeight-el.clientHeight>=m.top){el.scrollTo({top:m.top});if(isRoot(el))window.scrollTo(0,m.top)}};setTimeout(tryGo,150);setTimeout(tryGo,1000)}
else if(m.cmd==='toc'){var h=heads()[m.i];if(h)h.scrollIntoView({block:'start'})}
else if(m.cmd==='find'){find(m.q,m.dir)}
else if(m.cmd==='zoom'){document.documentElement.style.zoom=m.z}
else if(m.cmd==='mark'){var w=where();w.mph='here';w.label=label();post(w)}
else if(m.cmd==='hl'){hls=m.list||[];paintHl()}
else if(m.cmd==='clearSel'){var s=getSelection();if(s)s.removeAllRanges()}});
function ready(){style();last=pick();post({mph:'ready',toc:toc(),pct:where().pct});setTimeout(function(){post({mph:'toc',toc:toc()});paintHl()},1500)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready);else ready();
})();`;
  return `<script>${storage}\n${bridge}<\/script>`;
}
function inject(html, id, data) {
  const s = inside(id, data);
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, m => m + s);
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, m => m + '<head>' + s + '</head>');
  return s + html;
}

// Messages from the document
let posTimer = null;
window.addEventListener('message', e => {
  if (!R.frame || e.source !== R.frame.contentWindow) return;
  const m = e.data; if (!m || !m.mph) return; const d = doc(); if (!d) return;
  if (m.mph === 'ls') saveDocState(R.id, m.data);
  else if (m.mph === 'ready') {
    R.toc = m.toc || []; R.pct = d.pos ? d.pos.pct : 0;
    send({ cmd: 'zoom', z: d.zoom || 1 });
    send({ cmd: 'hl', list: marksOf(d).filter(x => x.kind === 'hl').map(x => x.text) });
    if (d.pos && d.pos.top > 40) { send({ cmd: 'resume', path: d.pos.path, top: d.pos.top }); if (d.pos.pct > 2) toast('Resumed where you left off'); }
    refresh();
  }
  else if (m.mph === 'toc') { R.toc = m.toc || []; if (R.panel === 'toc') refresh(); }
  else if (m.mph === 'pos') {
    R.pct = m.pct; setPct();
    clearTimeout(posTimer);
    posTimer = setTimeout(() => touch(s => { const x = s.docs.find(x => x.id === R.id); if (x) { x.pos = { path: m.path, top: m.top, pct: m.pct }; x.pct = m.pct; x.read = Math.max(x.read || 0, m.pct); } }), 1200);
  }
  else if (m.mph === 'sel') { R.sel = m.text ? m : null; refresh(); }
  else if (m.mph === 'here') {
    const id = uid('m');
    mutate(s => { const x = s.docs.find(x => x.id === R.id); if (x) { x.marks = x.marks || []; x.marks.push({ id, kind: 'mark', label: m.label, note: '', pct: m.pct, path: m.path, top: m.top, at: Date.now() }); } });
    toast(`Bookmarked at ${m.pct}%`, true);
  }
  else if (m.mph === 'find') { R.count = m.count; R.index = m.index; const c = document.querySelector('.rfind .rcount'); if (c) c.textContent = R.q ? (m.count ? `${m.index} of ${m.count}` : 'No matches') : ''; }
});

function setPct() { const p = document.querySelector('.reader .rpct'); if (p) p.textContent = R.pct + '%'; const b = document.querySelector('.reader .rprog i'); if (b) b.style.width = R.pct + '%'; }

// Chrome around the document
function header(d) {
  const where = d ? `${d.section === 'learning' ? 'Learning' : 'Library'} · ${colName(d.col)}` : '';
  const btn = (act, ico, label, extra = '') => `<button class="iconbtn" data-act="${act}" ${extra} aria-label="${label}" title="${label}">${icon(ico, 17)}</button>`;
  const on = p => R.panel === p ? 'style="background:#2A2A2A;color:#39B44A"' : '';
  return `<button class="bk-back" data-act="readerHome" aria-label="Back" title="Back">${icon('left', 16)}<span>Back</span></button>
    <div class="rt"><b>${esc(d ? d.title : 'Document')}</b><small><span class="rwhere">${esc(where)}</span><span class="rsep"></span><span class="rpct">${R.pct}%</span></small></div>
    ${R.sel ? `<button class="btn sm primary" data-act="rHighlight">${icon('highlight', 15)}Highlight</button>` : ''}
    <span class="rtools">
      ${btn('rFind', 'search', 'Search in document', R.find ? 'style="background:#2A2A2A;color:#39B44A"' : '')}
      <span class="rzoom">${btn('rZoom', 'textsm', 'Smaller text', 'data-d="-1"')}${btn('rZoom', 'textlg', 'Larger text', 'data-d="1"')}</span>
      ${btn('rMark', 'bookmark', 'Add bookmark')}
      ${btn('rPanel', 'list', 'Contents, bookmarks and highlights', on('toc') || on('marks') || on('hl'))}
      ${btn('readerFocus', 'expand', 'Focus mode')}
    </span>`;
}
function findbar() {
  return `<input class="field" data-k="rq" id="rq" value="${esc(R.q)}" placeholder="Search in this document" autocomplete="off">
    <span class="rcount">${R.q ? (R.count ? `${R.index} of ${R.count}` : 'No matches') : ''}</span>
    <button class="iconbtn" data-act="rFindStep" data-d="-1" aria-label="Previous match">${icon('up', 16)}</button>
    <button class="iconbtn" data-act="rFindStep" data-d="1" aria-label="Next match">${icon('down', 16)}</button>
    <button class="iconbtn" data-act="rFind" aria-label="Close search">${icon('x', 16)}</button>`;
}
function panel(d) {
  const ms = marksOf(d); const bm = ms.filter(x => x.kind === 'mark'); const hl = ms.filter(x => x.kind === 'hl');
  const tab = (p, label, n) => `<button class="${R.panel === p ? 'on' : ''}" data-act="rPanel" data-p="${p}">${label}${n !== undefined ? ` <em>${n}</em>` : ''}</button>`;
  const when = ts => new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  let body = '';
  if (R.panel === 'toc') body = R.toc.length ? R.toc.map(t => `<button class="rtoc l${t.l}" data-act="rToc" data-i="${t.i}">${esc(t.t)}</button>`).join('') : `<p class="empty">This document has no headings to list. Use search or bookmarks to move around.</p>`;
  if (R.panel === 'marks') body = (bm.length ? bm.slice().sort((a, b) => a.pct - b.pct).map(m => `<div class="rmark">
      <button class="rjump" data-act="rGo" data-m="${m.id}"><span class="rp num">${m.pct}%</span><span class="rl">${esc(m.label)}</span><small>${when(m.at)}</small></button>
      <input class="inline" data-chg="rNote" data-m="${m.id}" value="${esc(m.note || '')}" placeholder="Add a note">
      <button class="iconbtn" data-act="rDel" data-m="${m.id}" aria-label="Delete bookmark">${icon('trash', 15)}</button></div>`).join('') : `<p class="empty">No bookmarks yet. Tap the bookmark button to save your place.</p>`)
    + `<div style="margin-top:14px"><button class="btn sm" data-act="rMark">${icon('bookmark', 14)}Bookmark this place</button></div>`;
  if (R.panel === 'hl') body = hl.length ? hl.slice().sort((a, b) => a.pct - b.pct).map(m => `<div class="rmark hl">
      <button class="rjump" data-act="rGo" data-m="${m.id}"><span class="rq">${esc(m.text)}</span><small>${m.pct}% · ${when(m.at)}</small></button>
      <input class="inline" data-chg="rNote" data-m="${m.id}" value="${esc(m.note || '')}" placeholder="Add a note">
      <button class="iconbtn" data-act="rDel" data-m="${m.id}" aria-label="Delete highlight">${icon('trash', 15)}</button></div>`).join('') : `<p class="empty">Select text in the document, then tap Highlight. Your highlights and notes collect here.</p>`;
  return `<div class="rtabs">${tab('toc', 'Contents')}${tab('marks', 'Bookmarks', bm.length)}${tab('hl', 'Highlights', hl.length)}<button class="iconbtn" data-act="rPanel" data-p="" aria-label="Close panel">${icon('x', 15)}</button></div><div class="rlist">${body}</div>`;
}
export function refresh() {
  const el = document.querySelector('.reader'); if (!el) return; const d = doc();
  el.classList.toggle('focus', !!R.focus);
  el.querySelector('header').innerHTML = header(d);
  const fb = el.querySelector('.rfind'); fb.hidden = !R.find;
  if (R.find && !fb.querySelector('#rq')) { fb.innerHTML = findbar(); }
  const p = el.querySelector('.rpanel'); p.hidden = !R.panel; el.classList.toggle('with-panel', !!R.panel);
  if (R.panel) { const a = document.activeElement; const keepFocus = a && p.contains(a) ? a.dataset.m : null; p.innerHTML = panel(d); if (keepFocus) { const i = p.querySelector(`input[data-m="${keepFocus}"]`); if (i) i.focus(); } }
  el.querySelector('.rprog i').style.width = R.pct + '%';
}

export async function mountReader(id, shellHtml, app) {
  if (R.id === id && document.querySelector('.reader')) { refresh(); return; }
  R.id = id; R.frame = null; R.toc = []; R.sel = null; R.find = false; R.q = ''; R.count = 0;
  const d = doc(); R.pct = d && d.pos ? d.pos.pct : 0;
  app.innerHTML = shellHtml;
  const el = document.createElement('section'); el.className = 'reader';
  el.innerHTML = `<header></header><div class="rprog"><i></i></div><div class="rfind" hidden></div><div class="rbody"><div class="rframe"><div class="loading">${d ? 'Opening' : 'This document was removed'}</div></div><aside class="rpanel" hidden></aside></div>`;
  app.appendChild(el); refresh();
  if (!d) return;
  touch(s => { const x = s.docs.find(x => x.id === id); if (x) x.opened = Date.now(); });
  try {
    const [html, st] = await Promise.all([readDoc(d), readDocState(id).catch(() => ({}))]);
    if (R.id !== id) return;
    const f = document.createElement('iframe');
    f.setAttribute('sandbox', 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads');
    f.setAttribute('title', d.title);
    f.srcdoc = inject(html, id, st);
    el.querySelector('.loading').replaceWith(f); R.frame = f;
  } catch (err) { const l = el.querySelector('.loading'); if (l) l.textContent = 'Could not open. Check your connection and reload.'; }
}
export function leaveReader() { R.id = null; R.frame = null; }

const findMark = mid => marksOf(doc()).find(m => m.id === mid);
let findTimer = null;
document.addEventListener('input', e => {
  if (e.target.id !== 'rq') return;
  R.q = e.target.value; clearTimeout(findTimer);
  findTimer = setTimeout(() => send({ cmd: 'find', q: R.q.trim(), dir: 1 }), 250);
});
document.addEventListener('keydown', e => {
  if (e.target.id === 'rq' && e.key === 'Enter') { e.preventDefault(); send({ cmd: 'find', q: R.q.trim(), dir: e.shiftKey ? -1 : 1 }); }
});

// Actions, merged into the app's click handlers
export const RA = {
  readerFocus() { R.focus = !R.focus; keep('mph:focus', R.focus); refresh(); },
  rFind() { R.find = !R.find; if (!R.find) { R.q = ''; send({ cmd: 'find', q: '' }); document.querySelector('.rfind').innerHTML = ''; } refresh(); if (R.find) setTimeout(() => { const i = document.getElementById('rq'); if (i) i.focus(); }, 30); },
  rFindStep(el) { send({ cmd: 'find', q: R.q.trim(), dir: +el.dataset.d }); },
  rZoom(el) {
    const d = doc(); if (!d) return; const steps = [0.8, 0.9, 1, 1.1, 1.25, 1.4, 1.6];
    let i = steps.indexOf(d.zoom || 1); if (i < 0) i = 2; i = Math.max(0, Math.min(steps.length - 1, i + (+el.dataset.d)));
    const z = steps[i]; touch(s => { const x = s.docs.find(x => x.id === R.id); if (x) x.zoom = z; }); send({ cmd: 'zoom', z }); toast(`Text size ${Math.round(z * 100)}%`);
  },
  rMark() { send({ cmd: 'mark' }); },
  rHighlight() {
    const s = R.sel; if (!s || !s.text) return; const id = uid('h');
    mutate(st => { const x = st.docs.find(x => x.id === R.id); if (x) { x.marks = x.marks || []; x.marks.push({ id, kind: 'hl', text: s.text, note: '', pct: s.pct, path: s.path, top: s.top, at: Date.now() }); } });
    R.sel = null; send({ cmd: 'clearSel' }); syncHl(); toast('Highlighted', true);
  },
  rPanel(el) { const p = el.dataset.p !== undefined ? el.dataset.p : (R.panel ? '' : 'toc'); R.panel = p; keep('mph:rpanel', p); refresh(); },
  rToc(el) { send({ cmd: 'toc', i: +el.dataset.i }); if (innerWidth < 860) { R.panel = ''; refresh(); } },
  rGo(el) { const m = findMark(el.dataset.m); if (!m) return; send({ cmd: 'goto', path: m.path, top: m.top, text: m.kind === 'hl' ? m.text : '' }); if (innerWidth < 860) { R.panel = ''; refresh(); } },
  rDel(el) { const m = findMark(el.dataset.m); mutate(s => { const x = s.docs.find(x => x.id === R.id); if (x) x.marks = (x.marks || []).filter(k => k.id !== el.dataset.m); }); syncHl(); toast(m && m.kind === 'hl' ? 'Highlight removed' : 'Bookmark removed', true); }
};
export const RC = {
  rNote(el) { mutate(s => { const x = s.docs.find(x => x.id === R.id); const m = x && (x.marks || []).find(k => k.id === el.dataset.m); if (m) m.note = el.value.trim(); }, 'note' + el.dataset.m); }
};
export function syncHl() { const d = doc(); send({ cmd: 'hl', list: marksOf(d).filter(x => x.kind === 'hl').map(x => x.text) }); }
