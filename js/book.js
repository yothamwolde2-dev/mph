// MPH study books. Rendered natively (no iframe) so bookmarks, resume and highlights are exact.
import { esc, icon, uid } from './core.js?v=0.9.0';
import { catalog, peek, progress, saveProgress } from './content.js?v=0.9.0';
import { webHost, startHost } from './webrun.js?v=0.9.0';

const redraw = () => window.dispatchEvent(new Event('mph:redraw'));
const toast = (t, undo) => window.dispatchEvent(new CustomEvent('mph:toast', { detail: { text: t, undo } }));
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
const keep = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const strip = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

const B = { wtext: {}, route: null, cur: null, id: null, panel: innerWidth >= 1080 ? load('mph:bkpanel', '') : '', jump: null, q: '', gq: '', gcat: '', find: '', lastUndo: null };
const PK = id => 'book:' + id;
function prog(id) { const p = progress(PK(id), redraw); if (!p) return null; p.marks = p.marks || []; p.hls = p.hls || []; p.done = p.done || {}; p.quiz = p.quiz || {}; p.reflect = p.reflect || {}; p.check = p.check || {}; return p; }
const save = (id, p, now) => saveProgress(PK(id), p, now);
const gone = (p, id) => { p.gone = p.gone || {}; p.gone[id] = Date.now(); };

const isWeb = bk => bk && bk.kind === 'web';
const WK = id => 'ch_' + id;
const chapters = bk => isWeb(bk) ? bk.sections.length : bk.ch.length;
const doneCount = (bk, p) => Object.keys(p.done).filter(k => k.startsWith('ch')).length;
function sections(bk) {
  if (isWeb(bk)) return bk.sections.map((x, i) => ({ key: WK(x.id), id: x.id, t: x.t, kind: 'web', part: x.part || bk.title, n: x.n !== '' && x.n !== undefined ? +x.n : null, i }));
  const s = [];
  bk.front.forEach((f, i) => s.push({ key: 'f' + i, t: f.t, kind: 'front', part: 'Before you begin' }));
  bk.ch.forEach(c => s.push({ key: 'ch' + c.n, t: c.t, kind: 'ch', n: c.n, part: bk.parts[c.part] }));
  const has = k => bk[k] && bk[k].length;
  if (has('cases')) s.push({ key: 'cases', t: 'Case library', kind: 'cases', part: 'Toolkit' });
  if (has('sims')) s.push({ key: 'sims', t: 'Simulations', kind: 'sims', part: 'Toolkit' });
  if (has('ex')) s.push({ key: 'ex', t: 'Exercises', kind: 'ex', part: 'Toolkit' });
  if (has('fw')) s.push({ key: 'fw', t: 'Frameworks and tools', kind: 'fw', part: 'Toolkit' });
  if (has('skills')) s.push({ key: 'skills', t: 'Skills', kind: 'skills', part: 'Toolkit' });
  if (has('tpl')) s.push({ key: 'tpl', t: 'Templates', kind: 'tpl', part: 'Toolkit' });
  if (has('gl')) s.push({ key: 'gl', t: 'Glossary', kind: 'gl', part: 'Toolkit' });
  if (bk.mansenQ && bk.mansenQ.length) s.push({ key: 'mq', t: 'Mansen questions', kind: 'mq', part: 'Toolkit' });
  if (bk.levels && bk.levels.length) s.push({ key: 'lv', t: 'Development levels', kind: 'lv', part: 'Toolkit' });
  if (bk.completion && bk.completion.length) s.push({ key: 'done', t: 'Mastery checklist', kind: 'cmp', part: 'Toolkit' });
  (bk.previews || []).forEach((f, i) => s.push({ key: 'pv' + i, t: f.t, kind: 'pv', part: 'Coming next' }));
  return s;
}

const wait = () => `<div class="lx-wait">${icon('book', 22)}<span>Opening the book</span></div>`;
function getBook(id) {
  const idx = catalog(redraw); if (!idx) return [null, null];
  if (idx.__error) return [idx, { __error: 1 }];
  const meta = idx.books.find(b => b.id === id); if (!meta) return [null, { __error: 1 }];
  const bk = peek(meta.file, meta.v, redraw); if (bk && !bk.__error) bk.__v = meta.v;
  return [meta, bk];
}

export function bookView(parts) {
  const [id, sec] = parts; B.id = id;
  const [meta, bk] = getBook(id);
  if (!bk) return wait();
  if (bk.__error) return `<div class="panel"><p class="muted">This book could not be unlocked on this device. Check your connection and sign in, then reopen.</p></div>`;
  const p = prog(id); if (!p) return wait();
  const secs = sections(bk);
  if (!sec) return cover(id, meta, bk, p, secs);
  const i = secs.findIndex(s => s.key === sec); if (i < 0) return `<div class="bk-toprow">${backBtn(id, meta)}</div><p class="muted">This section is not in the book any more. Open the contents to continue.</p>`;
  const s = secs[i];
  const pct = Math.round(doneCount(bk, p) / chapters(bk) * 100);
  if (isWeb(bk)) return webView(id, meta, bk, p, secs, s, pct);
  const nav = `<div class="bk-bar">
      ${backBtn(id, meta, true)}
      <div class="bk-bt"><b>${esc(s.t)}</b><small>${esc(meta.title)} · ${pct}% read</small></div>
      <button class="iconbtn" data-act="bkMarkTop" aria-label="Bookmark this place" title="Bookmark this place (B)">${icon('bookmark', 17)}</button>
      <button class="iconbtn ${B.panel ? 'on' : ''}" data-act="bkPanel" aria-label="Contents, bookmarks and highlights" title="Contents, bookmarks and highlights">${icon('list', 17)}</button>
      ${i > 0 ? `<a class="iconbtn" href="#/book/${id}/${secs[i - 1].key}" aria-label="Previous" title="Previous">${icon('up', 16)}</a>` : ''}
      ${i < secs.length - 1 ? `<a class="iconbtn" href="#/book/${id}/${secs[i + 1].key}" aria-label="Next" title="Next">${icon('down', 16)}</a>` : ''}
    </div>`;
  const next = i < secs.length - 1 ? `<a class="bk-next" href="#/book/${id}/${secs[i + 1].key}"><span class="eyebrow">Next</span><b class="display">${esc(secs[i + 1].t)}</b>${icon('chev', 18)}</a>` : '';
  return `${nav}<div class="bk-wrap ${B.panel ? 'with-panel' : ''}"><article class="bk" data-sec="${s.key}">${renderSection(id, bk, s, p)}${next}</article>${B.panel ? `<aside class="bk-panel">${panel(id, bk, p, secs, s.key)}</aside>` : ''}</div>`;
}

// WEB BOOKS: the document keeps its own design and tools. One long page, MPH adds the reading tools.
function webView(id, meta, bk, p, secs, s, pct) {
  const route = id + '/' + s.key;
  if (B.route !== route) { B.route = route; B.cur = s.key; if (!B.jump) B.jump = { sec: s.key, b: -1 }; }
  const cur = secs.find(x => x.key === B.cur) || s;
  const nav = `<div class="bk-bar">
      ${backBtn(id, meta, true)}
      <div class="bk-bt"><b id="wbt">${esc(cur.t)}</b><small>${esc(meta.title)} · <span id="wbp">${pct}</span>% read</small></div>
      <button class="iconbtn" data-act="bkMarkTop" aria-label="Bookmark this place" title="Bookmark this place (B)">${icon('bookmark', 17)}</button>
      <button class="iconbtn ${B.panel ? 'on' : ''}" data-act="bkPanel" aria-label="Contents, bookmarks and highlights" title="Contents, bookmarks and highlights">${icon('list', 17)}</button>
      <button class="iconbtn" data-act="bkStep" data-d="-1" aria-label="Previous section" title="Previous section">${icon('up', 16)}</button>
      <button class="iconbtn" data-act="bkStep" data-d="1" aria-label="Next section" title="Next section">${icon('down', 16)}</button>
    </div>`;
  return `${nav}<div class="bk-wrap web ${B.panel ? 'with-panel' : ''}"><article class="bk wb-art" data-web="${id}" data-sec="${cur.key}"><div class="wbslot"></div></article>${B.panel ? `<aside class="bk-panel">${panel(id, bk, p, secs, cur.key)}</aside>` : ''}</div>`;
}
const WSEL = 'h1,h2,h3,h4,h5,p,li,dt,dd,blockquote,pre,figcaption,summary,table,.call';
function numberWeb(el, bk) {
  const hide = (bk.hide || []).join(',');
  let n = 0;
  el.querySelectorAll(WSEL).forEach(x => {
    if (hide && x.closest(hide)) return;
    const up = x.parentElement && x.parentElement.closest('[data-b]'); if (up && el.contains(up)) return;
    if ((x.textContent || '').trim().length < 2) return;
    const sec = x.closest(bk.secSel); if (!sec || !sec.id) return;
    x.dataset.b = n++; x.dataset.s = WK(sec.id);
  });
  // Text of every section as drawn, so search also finds what the document's tools display.
  try {
    const t = {}; el.querySelectorAll(bk.secSel).forEach(sec => { if (sec.id) t[sec.id] = strip(sec.textContent); });
    B.wtext[bk.id] = t; keep('mph:wbx:' + bk.id + '@' + bk.__v, t);
  } catch (e) {}
}
function webText(bk, s) {
  const t = B.wtext[bk.id] || (B.wtext[bk.id] = load('mph:wbx:' + bk.id + '@' + bk.__v, {}));
  const live = t[s.id] || ''; const own = (bk.sections[s.i] || {}).x || '';
  return live.length > own.length ? live : own;
}
function webStore() {
  return {
    get: () => { const p = prog(B.id); return (p && (p.ls = p.ls || {})) || {}; },
    set: (k, v) => { const p = prog(B.id); if (!p) return; p.ls = p.ls || {}; if (v === undefined) delete p.ls[k]; else p.ls[k] = v; save(B.id, p); }
  };
}
function webSecEl(art, key) { return art.querySelector('#' + CSS.escape(key.slice(3))); }


// A clear Back button: returns to where the book was opened, else the course page or Library.
function backTo(id, meta) { const f = (window.MPH_FROM || {})[id]; return f || (meta && meta.series ? '#/series/' + meta.series : '#/library'); }
function backBtn(id, meta, inBook) { const href = inBook && window.MPH_LAST === '#/book/' + id ? '#/book/' + id : backTo(id, meta); return `<a class="bk-back" href="${href}" aria-label="Back" title="Back">${icon('left', 16)}<span>Back</span></a>`; }
function cover(id, meta, bk, p, secs) {
  B.route = null;
  const chDone = doneCount(bk, p);
  const pct = Math.round(chDone / chapters(bk) * 100);
  const resume = p.pos && secs.find(s => s.key === p.pos.sec);
  const groups = [];
  secs.forEach(s => { let g = groups.find(x => x.part === s.part); if (!g) groups.push(g = { part: s.part, items: [] }); g.items.push(s); });
  return `<div class="bk-toprow">${backBtn(id, meta)}</div><section class="bk-cover">${meta.series ? `<a class="eyebrow" href="#/series/${meta.series}">${esc(meta.seriesTitle || '')} · Level ${meta.level} of ${meta.levels || 5} · ${esc(meta.levelName || '')}</a>` : `<span class="eyebrow">${isWeb(bk) ? 'Library' : 'Study book'}</span>`}<h1 class="display">${esc(meta.title)}</h1><p class="muted">${esc(meta.sub)}</p>
      <div class="bk-cprog"><span class="meter"><i style="width:${pct}%"></i></span><span class="num">${chDone} of ${chapters(bk)} ${isWeb(bk) ? 'sections' : 'chapters'} · ${pct}%</span></div>
      <div class="bk-cact">${resume ? `<button class="btn primary" data-act="bkResume">${icon('book', 15)}Continue: ${esc(resume.t)}</button>` : `<a class="btn primary" href="#/book/${id}/${secs[0].key}">${icon('book', 15)}Start reading</a>`}
      <span class="faint">${p.marks.length} bookmarks · ${p.hls.length} highlights</span></div></section>
    <div class="bk-search"><input class="field" id="bkq" value="${esc(B.q)}" placeholder="Search the whole book" autocomplete="off"></div>
    ${B.q.trim().length > 1 ? searchResults(id, bk, secs) : ''}
    ${p.marks.length || p.hls.length ? `<section class="panel bk-saved">${savedList(id, p, secs)}</section>` : ''}
    <div class="bk-toc">${groups.map(g => `<section><span class="eyebrow">${esc(g.part)}</span>${g.items.map(s => `<a href="#/book/${id}/${s.key}" class="${p.done[s.key] ? 'done' : ''}">${s.n ? `<span class="num">${String(s.n).padStart(2, '0')}</span>` : `<span class="num">${icon('chev', 13)}</span>`}<b>${esc(s.t)}</b>${p.done[s.key] ? icon('check', 15) : ''}</a>`).join('')}</section>`).join('')}</div>`;
}

function savedList(id, p, secs, cur) {
  const name = k => (secs.find(s => s.key === k) || {}).t || '';
  const marks = p.marks.slice().sort((a, b) => b.at - a.at).map(m => `<div class="bk-sv"><button data-act="bkGo" data-sec="${m.sec}" data-b="${m.b}">${icon('ribbon', 15)}<span><b>${esc(m.label)}</b><small>${esc(name(m.sec))}</small></span></button><input class="inline" data-chg="bkNote" data-k="marks" data-id="${m.id}" value="${esc(m.note || '')}" placeholder="Add a note"><button class="iconbtn" data-act="bkDel" data-k="marks" data-id="${m.id}" aria-label="Remove bookmark">${icon('trash', 14)}</button></div>`).join('');
  const hls = p.hls.slice().sort((a, b) => b.at - a.at).map(h => `<div class="bk-sv hl"><button data-act="bkGo" data-sec="${h.sec}" data-b="${h.b}"><span><b class="bk-quote">${esc(h.text)}</b><small>${esc(name(h.sec))}</small></span></button><input class="inline" data-chg="bkNote" data-k="hls" data-id="${h.id}" value="${esc(h.note || '')}" placeholder="Add a note"><button class="iconbtn" data-act="bkDel" data-k="hls" data-id="${h.id}" aria-label="Remove highlight">${icon('trash', 14)}</button></div>`).join('');
  return `${marks ? `<span class="eyebrow">Bookmarks</span>${marks}` : ''}${hls ? `<span class="eyebrow" style="margin-top:14px;display:block">Highlights</span>${hls}` : ''}`;
}

function panel(id, bk, p, secs, cur) {
  const tab = B.panel;
  const tabs = [['toc', 'Contents'], ['saved', `Saved ${p.marks.length + p.hls.length}`], ['find', 'Search']].map(([k, n]) => `<button class="${tab === k ? 'on' : ''}" data-act="bkTab" data-t="${k}">${n}</button>`).join('');
  let body = '';
  if (tab === 'toc') body = secs.map(s => `<a class="bk-pl ${s.key === cur ? 'on' : ''} ${p.done[s.key] ? 'done' : ''}" href="#/book/${id}/${s.key}">${s.n ? `<span class="num">${s.n}</span>` : '<span></span>'}${esc(s.t)}</a>`).join('');
  if (tab === 'saved') body = (p.marks.length || p.hls.length) ? savedList(id, p, secs, cur) : `<p class="empty">Tap the bookmark button at the top, or the ribbon beside any paragraph. Select text to highlight it.</p>`;
  if (tab === 'find') body = `<input class="field" id="bkq" value="${esc(B.q)}" placeholder="Search the book" autocomplete="off">${B.q.trim().length > 1 ? searchResults(id, bk, secs) : ''}`;
  return `<div class="bk-ptabs">${tabs}<button class="iconbtn" data-act="bkPanel" aria-label="Close">${icon('x', 15)}</button></div><div class="bk-plist">${body}</div>`;
}

let textIndex = null;
function searchResults(id, bk, secs) {
  const sig = id + ':' + Object.keys(B.wtext[id] || {}).length;
  if (!textIndex || textIndex.sig !== sig) textIndex = { sig, list: secs.map(s => ({ s, text: strip(sectionHtml(bk, s)) })) };
  const q = B.q.trim().toLowerCase(); const out = [];
  for (const { s, text } of textIndex.list) {
    const low = text.toLowerCase(); let at = low.indexOf(q), n = 0;
    while (at > -1 && n < 3) { out.push({ s, snip: text.slice(Math.max(0, at - 60), at + q.length + 80), at }); n++; at = low.indexOf(q, at + q.length); }
    if (out.length > 40) break;
  }
  if (!out.length) return `<p class="empty">No matches.</p>`;
  return `<div class="bk-results">${out.map(r => `<a href="#/book/${id}/${r.s.key}" data-act="bkFind" data-q="${esc(B.q.trim())}"><b>${esc(r.s.t)}</b><small>${esc(r.snip)}</small></a>`).join('')}</div>`;
}

// Raw html for a section (used for rendering and for search)
function sectionHtml(bk, s) {
  if (s.kind === 'web') return webText(bk, s);
  if (s.kind === 'front') return bk.front[+s.key.slice(1)].body;
  if (s.kind === 'pv') return bk.previews[+s.key.slice(2)].body;
  if (s.kind === 'ch') { const c = bk.ch.find(c => c.n === s.n); return [c.q, c.learn, c.understand, c.see, c.practice && (c.practice.skill + c.practice.task), c.decide && (c.decide.case + c.decide.ask), (c.take || []).join(' '), c.reflect].join(' '); }
  if (s.kind === 'gl') return bk.gl.map(g => `${g.t} ${g.s} ${g.p} ${g.e}`).join(' ');
  if (s.kind === 'cases') return bk.cases.map(c => `${c.t} ${c.bg} ${c.pr} ${c.de} ${c.mo}`).join(' ');
  if (s.kind === 'skills') return bk.skills.map(c => `${c.t} ${c.what} ${c.why} ${(c.steps || []).join(' ')}`).join(' ');
  if (s.kind === 'fw') return bk.fw.map(c => `${c.t} ${c.what} ${c.how} ${c.ex || ''}`).join(' ');
  if (s.kind === 'tpl') return bk.tpl.map(c => `${c.t} ${c.body}`).join(' ');
  if (s.kind === 'sims') return bk.sims.map(c => `${c.t} ${c.scn}`).join(' ');
  if (s.kind === 'ex') return bk.ex.map(c => `${c.t} ${c.q} ${c.a}`).join(' ');
  if (s.kind === 'mq') return bk.mansenQ.map(q => q.join(' ')).join(' ');
  if (s.kind === 'lv') return bk.levels.map(l => l.join(' ')).join(' ');
  if (s.kind === 'cmp') return bk.completion.join(' ');
  return '';
}

function renderSection(id, bk, s, p) {
  let hn = 0; const H = (k, t) => `<h2 class="bk-h"><span>${String(++hn).padStart(2, '0')}</span>${t}</h2>`;
  if (s.kind === 'front' || s.kind === 'pv') return `<div class="bk-k">${esc(s.part)}</div><h1 class="display bk-title">${esc(s.t)}</h1><div class="bk-body">${sectionHtml(bk, s)}</div>`;
  if (s.kind === 'ch') {
    const c = bk.ch.find(c => c.n === s.n); const qa = p.quiz[s.key] || {};
    const quiz = (c.quiz || []).map((q, qi) => { const a = qa[qi]; return `<div class="bk-quiz"><b>${qi + 1}. ${esc(q[0])}</b><div class="lx-opts">${q[1].map((o, oi) => `<button class="${a === undefined ? '' : oi === q[2] ? 'ok' : oi === a ? 'bad' : ''}" data-act="bkQuiz" data-sec="${s.key}" data-q="${qi}" data-o="${oi}" ${a !== undefined ? 'disabled' : ''}>${esc(o)}</button>`).join('')}</div>${a !== undefined && q[3] ? `<p class="bk-why">${esc(q[3])}</p>` : ''}</div>`; }).join('');
    return `<div class="bk-k">${esc(s.part)} · Chapter ${c.n}</div><h1 class="display bk-title">${esc(c.t)}</h1>
      <div class="bk-body">
      <p class="bk-q">${esc(c.q)}</p>
      ${c.learn ? `<section>${H('01', 'Learn')}${c.learn}</section>` : ''}
      ${c.understand ? `<section>${H('02', 'Understand')}${c.understand}</section>` : ''}
      ${c.see ? `<section>${H('03', 'See it in practice')}${c.see}</section>` : ''}
      ${c.practice ? `<section>${H('04', 'Practice')}<p><b>Skill</b> ${c.practice.skill}</p>${c.practice.task}${c.practice.ans ? `<details class="rv"><summary>Show model answer</summary><div>${c.practice.ans}</div></details>` : ''}</section>` : ''}
      ${c.decide ? `<section>${H('05', 'Decide')}${c.decide.case}<p><b>${c.decide.ask}</b></p>${c.decide.model ? `<details class="rv"><summary>Show a model answer</summary><div>${c.decide.model}</div></details>` : ''}</section>` : ''}
      ${quiz ? `<section>${H('06', 'Check your understanding')}${quiz}</section>` : ''}
      ${c.take && c.take.length ? `<section>${H('07', 'Take away')}<ul>${c.take.map(t => `<li>${t}</li>`).join('')}</ul></section>` : ''}
      ${c.reflect ? `<section>${H('08', 'Reflect')}<p>${c.reflect}</p><textarea class="field bk-ref" data-chg="bkReflect" data-sec="${s.key}" rows="4" placeholder="Write your answer. It is saved privately.">${esc(p.reflect[s.key] || '')}</textarea></section>` : ''}
      </div>`;
  }
  const list = (items, f) => items.map(f).join('');
  if (s.kind === 'gl') {
    const cats = [...new Set(bk.gl.map(g => g.a))];
    const q = B.gq.trim().toLowerCase();
    const items = bk.gl.filter(g => (!B.gcat || g.a === B.gcat) && (!q || (g.t + ' ' + g.s).toLowerCase().includes(q)));
    return `<div class="bk-k">Toolkit</div><h1 class="display bk-title">Glossary</h1><div class="bk-body"><p class="muted">${bk.gl.length} terms. Search, or filter by area.</p>
      <input class="field" id="bkgq" value="${esc(B.gq)}" placeholder="Find a term" autocomplete="off" style="margin:10px 0">
      <div class="bk-cats"><button class="${!B.gcat ? 'on' : ''}" data-act="bkCat" data-c="">All</button>${cats.map(c => `<button class="${B.gcat === c ? 'on' : ''}" data-act="bkCat" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div>
      ${list(items, g => `<details class="bk-term"><summary><b>${esc(g.t)}</b><small>${esc(g.s)}</small></summary><div>${g.p ? `<p><b>Precisely</b> ${esc(g.p)}</p>` : ''}${g.e ? `<p><b>Example</b> ${esc(g.e)}</p>` : ''}${g.r ? `<p><b>Related</b> ${esc(g.r)}</p>` : ''}${g.w ? `<p><b>Where you meet it</b> ${esc(g.w)}</p>` : ''}</div></details>`)}</div>`;
  }
  if (s.kind === 'cases') return `<div class="bk-k">Toolkit</div><h1 class="display bk-title">Case library</h1><div class="bk-body">${list(bk.cases, c => `<details class="bk-term"><summary><b>${esc(c.t)}</b><small>${esc(c.pr)}</small></summary><div>
      ${[['Background', c.bg], ['Problem', c.pr], ['Data', c.da], ['Stakeholders', c.st], ['Decision', c.de]].filter(x => x[1]).map(([k, v]) => `<p><b>${k}</b> ${esc(v)}</p>`).join('')}<ul>${(c.qs || []).map(q => `<li>${esc(q)}</li>`).join('')}</ul>
      <details class="rv"><summary>Show a model answer</summary><div><p>${esc(c.mo)}</p><p><b>Lesson</b> ${esc(c.le)}</p></div></details></div></details>`)}</div>`;
  if (s.kind === 'skills') return `<div class="bk-k">Toolkit</div><h1 class="display bk-title">Skills</h1><div class="bk-body">${list(bk.skills, c => `<details class="bk-term"><summary><b>${esc(c.t)}</b><small>${esc(c.what)}</small></summary><div>
      <p><b>Why it matters</b> ${esc(c.why)}</p><p><b>When to use it</b> ${esc(c.when)}</p><ol>${(c.steps || []).map(x => `<li>${esc(x)}</li>`).join('')}</ol><p><b>Example</b> ${esc(c.ex)}</p><p><b>Try it</b> ${esc(c.task)}</p><p><b>Common mistakes</b> ${esc(c.mist)}</p></div></details>`)}</div>`;
  if (s.kind === 'fw') return `<div class="bk-k">Toolkit</div><h1 class="display bk-title">Frameworks</h1><div class="bk-body">${list(bk.fw, c => `<details class="bk-term"><summary><b>${esc(c.t)}</b><small>${esc(c.what)}</small></summary><div>
      <p><b>Why</b> ${esc(c.why)}</p><p><b>When</b> ${esc(c.when)}</p><p><b>How</b> ${esc(c.how)}</p>${c.ex ? `<p><b>Example</b> ${esc(c.ex)}</p>` : ''}</div></details>`)}</div>`;
  if (s.kind === 'tpl') return `<div class="bk-k">Toolkit</div><h1 class="display bk-title">Templates</h1><div class="bk-body">${list(bk.tpl, (c, i) => `<details class="bk-term"><summary><b>${esc(c.t)}</b><small>Ready to copy</small></summary><div><pre class="bk-pre">${esc(c.body)}</pre><button class="btn sm" data-act="bkCopy" data-i="${i}">Copy</button></div></details>`)}</div>`;
  if (s.kind === 'sims') return `<div class="bk-k">Toolkit</div><h1 class="display bk-title">Simulations</h1><div class="bk-body">${list(bk.sims, (c, i) => { const ch = (p.check['sim' + i]); return `<div class="bk-sim"><b class="display">${esc(c.t)}</b><p>${esc(c.scn)}</p><div class="lx-opts">${c.opts.map((o, oi) => `<button class="${ch === undefined ? '' : oi === ch ? (o[2] === 'best' ? 'ok' : o[2] === 'weak' ? 'bad' : 'mid') : ''}" data-act="bkSim" data-i="${i}" data-o="${oi}">${esc(o[0])}</button>`).join('')}</div>${ch !== undefined ? `<p class="bk-why"><b>${esc(c.opts[ch][2] === 'best' ? 'Best choice' : c.opts[ch][2] === 'strong' ? 'Strong choice' : 'Weak choice')}</b> ${esc(c.opts[ch][1])}</p>` : ''}</div>`; })}</div>`;
  if (s.kind === 'ex') return `<div class="bk-k">Toolkit</div><h1 class="display bk-title">Exercises</h1><div class="bk-body"><p class="muted">Work each one out on paper or in a sheet first, then open the model answer and mark yourself honestly.</p>${list(bk.ex, (c, i) => { const m = p.check['ex' + i]; return `<div class="bk-sim"><span class="eyebrow">${esc(c.c || 'Exercise')} ${i + 1}</span><b class="display">${esc(c.t)}</b><div>${c.q}</div>
      <details class="rv"><summary>Show the model answer</summary><div>${c.a}</div></details>
      <div class="lx-opts bk-mark">${[['got', 'I got it'], ['part', 'Partly'], ['miss', 'Not yet']].map(([k, n]) => `<button class="${m === k ? (k === 'got' ? 'ok' : k === 'miss' ? 'bad' : 'mid') : ''}" data-act="bkExMark" data-i="${i}" data-k="${k}">${n}</button>`).join('')}</div></div>`; })}</div>`;
  if (s.kind === 'mq') return `<div class="bk-k">Toolkit</div><h1 class="display bk-title">Mansen questions</h1><div class="bk-body">${list(bk.mansenQ, q => `<details class="bk-term"><summary><b>${esc(q[0])}</b></summary><div><p>${esc(q[1] || '')}</p></div></details>`)}</div>`;
  if (s.kind === 'lv') return `<div class="bk-k">Toolkit</div><h1 class="display bk-title">Development levels</h1><div class="bk-body">${list(bk.levels, (l, i) => `<div class="bk-lv"><span class="num">${i + 1}</span><div><b>${esc(l[0])}</b><p>${esc(l[1])}</p><p class="muted">${esc(l[2] || '')}</p></div></div>`)}</div>`;
  if (s.kind === 'cmp') return `<div class="bk-k">Toolkit</div><h1 class="display bk-title">Mastery checklist</h1><div class="bk-body"><p class="muted">Tick each one when you can do it confidently.</p>${list(bk.completion, (c, i) => `<button class="bk-chk ${p.check['c' + i] ? 'on' : ''}" data-act="bkCheck" data-i="${i}"><span class="check ${p.check['c' + i] ? 'on' : ''}">${p.check['c' + i] ? icon('check', 13) : ''}</span>${esc(c)}</button>`)}</div>`;
  return '';
}

// After the section is on screen: number the blocks, draw ribbons and highlights, jump if asked.
let hover = null;
export function afterRender() {
  const art = document.querySelector('.bk[data-sec]'); if (!art || !B.id) return;
  const p = prog(B.id); if (!p) return;
  if (art.dataset.web) return webAfter(art, p);
  const sec = art.dataset.sec;
  const blocks = art.querySelectorAll('.bk-body > *:not(section), .bk-body > section > *, .bk-body > details, .bk-body > div');
  let n = 0; blocks.forEach(el => { if (!el.dataset.b) el.dataset.b = n++; });
  p.marks.filter(m => m.sec === sec).forEach(m => { const el = art.querySelector(`[data-b="${m.b}"]`); if (el) el.classList.add('bk-marked'); });
  paintHighlights(art, p, sec);
  if (B.jump && B.jump.sec === sec) {
    const el = art.querySelector(`[data-b="${B.jump.b}"]`);
    if (el) requestAnimationFrame(() => { el.scrollIntoView({ block: 'start' }); el.classList.add('bk-flash'); setTimeout(() => el.classList.remove('bk-flash'), 1600); clearTimeout(posT); posT = setTimeout(() => notePos(), 700); });
    if (B.jump.find) paintFind(art, B.jump.find);
    B.jump = null;
  }
}
function webAfter(art, p) {
  const [meta, bk] = getBook(B.id); if (!bk || bk.__error) return;
  const h = webHost(bk, webStore());
  const slot = art.querySelector('.wbslot'); if (slot) slot.replaceWith(h.el);
  const first = !h.started;
  startHost(h, bk);
  if (first) numberWeb(h.el, bk);
  h.el.querySelectorAll('.bk-marked').forEach(x => x.classList.remove('bk-marked'));
  p.marks.forEach(m => { const el = h.el.querySelector(`[data-b="${m.b}"]`); if (el) el.classList.add('bk-marked'); });
  paintHighlights(h.el, p, null);
  if (B.jump) {
    const j = B.jump; B.jump = null;
    const go = () => {
      const el = j.b >= 0 ? h.el.querySelector(`[data-b="${j.b}"]`) : webSecEl(h.el, j.sec);
      if (el) { el.scrollIntoView({ block: 'start' }); if (j.b >= 0) { el.classList.add('bk-flash'); setTimeout(() => el.classList.remove('bk-flash'), 1600); } }
      if (j.find) paintFind(webSecEl(h.el, j.sec) || h.el, j.find);
    };
    requestAnimationFrame(() => requestAnimationFrame(() => { go(); clearTimeout(posT); posT = setTimeout(() => notePos(), 700); }));
  }
}
function rangesIn(root, text, limit = 1) {
  const out = []; if (!text) return out;
  const nodes = []; let full = '';
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let t;
  while ((t = w.nextNode())) { nodes.push([t, full.length]); full += t.nodeValue; }
  const low = full.toLowerCase(); const q = text.toLowerCase(); let at = low.indexOf(q);
  const locate = pos => { for (let i = nodes.length - 1; i >= 0; i--) if (nodes[i][1] <= pos) return [nodes[i][0], pos - nodes[i][1]]; return null; };
  while (at > -1 && out.length < limit) {
    const a = locate(at), b = locate(at + q.length);
    if (a && b) { const r = document.createRange(); r.setStart(a[0], a[1]); r.setEnd(b[0], Math.min(b[1], b[0].nodeValue.length)); out.push(r); }
    at = low.indexOf(q, at + q.length);
  }
  return out;
}
function paintHighlights(art, p, sec) {
  const hasApi = window.CSS && CSS.highlights && window.Highlight;
  const rs = [];
  p.hls.filter(h => !sec || h.sec === sec).forEach(h => { const el = art.querySelector(`[data-b="${h.b}"]`) || art; rs.push(...rangesIn(el, h.text, 1)); });
  if (hasApi) { if (rs.length) CSS.highlights.set('bk-hl', new Highlight(...rs)); else CSS.highlights.delete('bk-hl'); }
  else rs.forEach(r => { try { const m = document.createElement('mark'); m.className = 'bk-mark'; r.surroundContents(m); } catch (e) {} });
}
function paintFind(art, q) {
  const rs = rangesIn(art.querySelector('.bk-body') || art, q, 50);
  if (window.CSS && CSS.highlights && window.Highlight && rs.length) CSS.highlights.set('bk-find', new Highlight(...rs));
  if (rs[0]) { const el = rs[0].startContainer.parentElement; el && el.scrollIntoView({ block: 'center' }); }
}

// The paragraph at the top of the reading area, found by looking at the screen itself
// (works for any layout: columns, tables, tabs).
function topBlock(art) {
  const r = art.getBoundingClientRect(); if (!r.width) return null;
  const xs = [0.5, 0.3, 0.7, 0.15].map(f => r.left + r.width * f);
  const bar = document.querySelector('.bk-bar'); const y0 = bar ? Math.max(100, bar.getBoundingClientRect().bottom + 6) : 136;
  for (let y = y0; y < innerHeight - 10; y += 16) for (const x of xs) {
    const e = document.elementFromPoint(x, y); const b = e && e.closest && e.closest('[data-b]');
    if (b && art.contains(b)) return b;
  }
  // something covers the page (the contents sheet on a phone): use the first paragraph below the bar
  for (const b of art.querySelectorAll('[data-b]')) { const q = b.getBoundingClientRect(); if (q.height && q.bottom > 136) return b; }
  return null;
}
// Reading position: the first paragraph at the top of the screen. Saved quietly.
let posT = null;
function notePos(now) {
    const art = document.querySelector('.bk[data-sec]'); if (!art || !B.id) return;
    const p = prog(B.id); if (!p) return;
    const cur = topBlock(art); if (!cur) return;
    const last = art.querySelector('.bk-next') || [...art.querySelectorAll('[data-b]')].pop();
    const sec = cur.dataset.s || art.dataset.sec;
    p.pos = { sec, b: +cur.dataset.b, at: Date.now() };
    if (art.dataset.web) { webScroll(art, p, sec); save(B.id, p, now); return; }
    const end = art.querySelector('.bk-next') || last;
    if (end && end.getBoundingClientRect().top < innerHeight && sec.startsWith('ch') && !p.done[sec]) { p.done[sec] = Date.now(); toast('Chapter complete'); }
    save(B.id, p, now);
}
window.addEventListener('scroll', () => {
  if (!document.querySelector('.bk[data-sec]') || !B.id) return;
  clearTimeout(posT); posT = setTimeout(() => notePos(), 500);
}, { passive: true });
// Leaving the app (closing it on the iPhone, switching away on the Mac) saves the place at once.
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { clearTimeout(posT); notePos(true); } });
window.addEventListener('pagehide', () => { clearTimeout(posT); notePos(true); });

function webScroll(art, p, sec) {
  const [meta, bk] = getBook(B.id); if (!bk || bk.__error) return;
  if (sec !== B.cur) { B.cur = sec; art.dataset.sec = sec; const s = bk.sections.find(x => WK(x.id) === sec); const t = document.getElementById('wbt'); if (s && t) t.textContent = s.t; }
  // a section counts as read once its end has been on screen
  let added = 0;
  art.querySelectorAll(bk.secSel).forEach(el => {
    if (!el.id) return; const k = WK(el.id); if (p.done[k]) return;
    const r = el.getBoundingClientRect(); if (r.height && r.bottom < innerHeight && r.bottom > -innerHeight * 3) { p.done[k] = Date.now(); added++; }
  });
  if (added) { const pe = document.getElementById('wbp'); if (pe) pe.textContent = Math.round(doneCount(bk, p) / chapters(bk) * 100); }
}

// Hover ribbon on desktop: bookmark any paragraph directly.
document.addEventListener('mouseover', e => {
  const el = e.target.closest && e.target.closest('.bk [data-b]'); const art = document.querySelector('.bk[data-sec]');
  if (el && hover && el === hover.target) return;
  if (!art) { if (hover) hover.hidden = true; return; }
  if (!el) return;
  if (!hover) { hover = document.createElement('button'); hover.className = 'bk-hover'; hover.setAttribute('aria-label', 'Bookmark this paragraph'); hover.innerHTML = icon('ribbon', 16); document.body.appendChild(hover); hover.addEventListener('click', () => { if (hover.target) toggleMark(hover.target); }); }
  const r = el.getBoundingClientRect(); const ar = art.getBoundingClientRect();
  const left = art.dataset.web ? Math.max(ar.left + 2, r.left - 38) : ar.left - 40;
  hover.style.top = (r.top + window.scrollY + 2) + 'px'; hover.style.left = left + 'px'; hover.target = el; hover.hidden = art.dataset.web ? r.left - ar.left < 30 : ar.left < 50;
});
window.addEventListener('hashchange', () => { if (hover) hover.hidden = true; });

function labelFor(el) {
  let h = el; while (h && !/^H[1-4]$/.test(h.tagName)) { h = h.previousElementSibling || (h.parentElement && h.parentElement.closest('section') ? h.parentElement.closest('section').querySelector('h2,h3') : null); if (h && /^H[1-4]$/.test(h.tagName)) break; if (!h) break; }
  const txt = strip(el.textContent).slice(0, 90);
  return txt || (h ? strip(h.textContent) : 'Bookmark');
}
function toggleMark(el) {
  const art = document.querySelector('.bk[data-sec]'); const p = prog(B.id); if (!art || !p) return;
  const sec = el.dataset.s || art.dataset.sec, b = +el.dataset.b;
  const ex = p.marks.find(m => m.sec === sec && m.b === b);
  if (ex) { p.marks = p.marks.filter(m => m !== ex); gone(p, ex.id); el.classList.remove('bk-marked'); save(B.id, p, true); B.lastUndo = { k: 'marks', item: ex }; toast('Bookmark removed', bookUndo); }
  else { const m = { id: uid('bm'), sec, b, label: labelFor(el), note: '', at: Date.now() }; p.marks.push(m); el.classList.add('bk-marked'); save(B.id, p, true); B.lastUndo = { k: 'marks', id: m.id }; toast('Bookmarked', bookUndo); }
  if (B.panel === 'saved') redraw();
}

// Highlight button appears when text is selected inside the book.
let selBtn = null, selT = null;
document.addEventListener('selectionchange', () => {
  clearTimeout(selT); selT = setTimeout(() => {
    const s = getSelection(); const txt = s ? String(s).trim() : '';
    const art = document.querySelector('.bk[data-sec]');
    const inside = art && s && s.rangeCount && art.contains(s.anchorNode);
    if (!txt || !inside || txt.length < 3) { if (selBtn) selBtn.hidden = true; return; }
    if (!selBtn) { selBtn = document.createElement('button'); selBtn.className = 'bk-selbtn'; selBtn.innerHTML = icon('highlight', 15) + 'Highlight'; document.body.appendChild(selBtn); selBtn.addEventListener('mousedown', e => e.preventDefault()); selBtn.addEventListener('click', addHighlight); }
    const r = s.getRangeAt(0).getBoundingClientRect();
    selBtn.style.top = Math.max(70, r.top + window.scrollY - 46) + 'px'; selBtn.style.left = Math.max(10, Math.min(innerWidth - 130, r.left + r.width / 2 - 60)) + 'px'; selBtn.hidden = false;
  }, 200);
});
function addHighlight() {
  const s = getSelection(); const art = document.querySelector('.bk[data-sec]'); const p = prog(B.id); if (!s || !art || !p) return;
  const txt = String(s).trim().slice(0, 600);
  let node = s.anchorNode; if (node && node.nodeType === 3) node = node.parentElement;
  const blk = node && node.closest('[data-b]');
  const h = { id: uid('hl'), sec: (blk && blk.dataset.s) || art.dataset.sec, b: blk ? +blk.dataset.b : 0, text: txt, note: '', at: Date.now() };
  p.hls.push(h); save(B.id, p, true); s.removeAllRanges(); if (selBtn) selBtn.hidden = true;
  B.lastUndo = { k: 'hls', id: h.id };
  paintHighlights(art, p, art.dataset.web ? null : art.dataset.sec); toast('Highlighted', bookUndo);
  if (B.panel === 'saved') redraw();
}

// Search boxes
let qT = null;
document.addEventListener('input', e => {
  if (e.target.id === 'bkq') { B.q = e.target.value; clearTimeout(qT); qT = setTimeout(() => { redraw(); setTimeout(() => { const i = document.getElementById('bkq'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 0); }, 250); }
  if (e.target.id === 'bkgq') { B.gq = e.target.value; clearTimeout(qT); qT = setTimeout(() => { redraw(); setTimeout(() => { const i = document.getElementById('bkgq'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 0); }, 200); }
});

export const BA = {
  bkStep(el) {
    const [meta, bk] = getBook(B.id); if (!bk || !isWeb(bk)) return;
    const secs = sections(bk); const i = Math.max(0, secs.findIndex(s => s.key === B.cur));
    const n = secs[Math.min(secs.length - 1, Math.max(0, i + +el.dataset.d))]; if (!n) return;
    const art = document.querySelector('.bk[data-sec]'); const t = art && webSecEl(art, n.key);
    if (t) t.scrollIntoView({ block: 'start' });
  },
  bkPanel() { B.panel = B.panel ? '' : 'toc'; keep('mph:bkpanel', B.panel); redraw(); },
  bkTab(el) { B.panel = el.dataset.t; keep('mph:bkpanel', B.panel); redraw(); },
  bkMarkTop() {
    const art = document.querySelector('.bk[data-sec]'); if (!art) return;
    const cur = topBlock(art);
    if (cur) toggleMark(cur);
  },
  bkResumeFrom(el, e) { e && e.preventDefault(); B.id = el.dataset.id; const p = prog(B.id); if (p && p.pos) { B.jump = { sec: p.pos.sec, b: p.pos.b }; location.hash = `#/book/${B.id}/${p.pos.sec}`; } else location.hash = `#/book/${B.id}`; },
  bkResume() { const p = prog(B.id); if (!p || !p.pos) return; B.jump = { sec: p.pos.sec, b: p.pos.b }; location.hash = `#/book/${B.id}/${p.pos.sec}`; },
  bkGo(el, e) { e && e.preventDefault(); B.jump = { sec: el.dataset.sec, b: +el.dataset.b }; const h = `#/book/${B.id}/${el.dataset.sec}`; if (location.hash === h) { redraw(); } else location.hash = h; if (innerWidth < 860) { B.panel = ''; keep('mph:bkpanel', ''); } },
  bkFind(el) { const sec = el.getAttribute('href').split('/').pop(); B.jump = { sec, b: -1, find: el.dataset.q }; },
  bkDel(el) { const p = prog(B.id); if (!p) return; const k = el.dataset.k; const item = p[k].find(x => x.id === el.dataset.id); p[k] = p[k].filter(x => x.id !== el.dataset.id); gone(p, el.dataset.id); save(B.id, p, true); B.lastUndo = { k, item }; toast(k === 'marks' ? 'Bookmark removed' : 'Highlight removed', bookUndo); redraw(); },
  bkQuiz(el) { const p = prog(B.id); if (!p) return; const sec = el.dataset.sec; p.quiz[sec] = p.quiz[sec] || {}; p.quiz[sec][+el.dataset.q] = +el.dataset.o; save(B.id, p, true); redraw(); },
  bkCat(el) { B.gcat = el.dataset.c; redraw(); },
  bkSim(el) { const p = prog(B.id); if (!p) return; p.check['sim' + el.dataset.i] = +el.dataset.o; save(B.id, p, true); redraw(); },
  bkExMark(el) { const p = prog(B.id); if (!p) return; p.check['ex' + el.dataset.i] = el.dataset.k; save(B.id, p, true); redraw(); },
  bkCheck(el) { const p = prog(B.id); if (!p) return; const k = 'c' + el.dataset.i; p.check[k] = !p.check[k]; save(B.id, p, true); redraw(); },
  async bkCopy(el) { const [meta, bk] = getBook(B.id); try { await navigator.clipboard.writeText(bk.tpl[+el.dataset.i].body); toast('Template copied'); } catch (e) { toast('Select the text to copy it'); } }
};
export const BC = {
  bkReflect(el) { const p = prog(B.id); if (!p) return; p.reflect[el.dataset.sec] = el.value; save(B.id, p); },
  bkNote(el) { const p = prog(B.id); if (!p) return; const x = p[el.dataset.k].find(x => x.id === el.dataset.id); if (x) { x.note = el.value.trim(); save(B.id, p); } }
};
// Undo for the last bookmark or highlight change, used by the toast's Undo button.
export function bookUndo() {
  const u = B.lastUndo; const p = B.id && prog(B.id); if (!u || !p) return false;
  if (u.item) { u.item.at = Date.now(); if (p.gone) delete p.gone[u.item.id]; p[u.k].push(u.item); } else { p[u.k] = p[u.k].filter(x => x.id !== u.id); gone(p, u.id); }
  save(B.id, p, true); B.lastUndo = null; redraw(); return true;
}
export const bookState = () => B;

// Keyboard on the Mac: B bookmarks the paragraph at the top, H highlights the selection, arrows move between sections.
document.addEventListener('keydown', e => {
  const art = document.querySelector('.bk[data-sec]'); if (!art || e.metaKey || e.ctrlKey || e.altKey) return;
  const a = document.activeElement; if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
  const k = e.key.toLowerCase();
  if (k === 'b') { e.preventDefault(); BA.bkMarkTop(); }
  else if (k === 'h' && String(getSelection()).trim().length > 2) { e.preventDefault(); addHighlight(); }
  else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    const btn = document.querySelector(`.bk-bar a[aria-label="${e.key === 'ArrowRight' ? 'Next' : 'Previous'}"]`);
    if (btn) { e.preventDefault(); location.hash = btn.getAttribute('href'); }
  }
});

// LIBRARY: every book as a cover. Opening one shows its contents, saved places and Continue.
const KIND = { study: 'Study book', web: 'Manual' };
export function libraryView(uploads) {
  const idx = catalog(redraw);
  const head = `<div class="phead"><div><span class="eyebrow">Growth</span><h1 class="display" style="margin-top:10px">Library</h1><p class="muted">Your books and manuals. Private to your login, open offline, and every bookmark follows you between Mac and iPhone.</p></div></div>`;
  if (!idx) return head + wait();
  if (idx.__error) return head + `<div class="panel"><p class="muted">Sign in online once to unlock your books.</p></div>`;
  const seriesTiles = (idx.series || []).map(sr => {
    const lv = sr.levels.filter(l => l.book && !l.locked);
    const st = lv.map(l => ({ l, p: progress('book:' + l.book, redraw) || {} }));
    const cur = st.slice().reverse().find(x => x.p.pos) || st[0];
    const meta = cur ? idx.books.find(b => b.id === cur.l.book) : null;
    const done = cur ? Object.keys(cur.p.done || {}).filter(k => k.startsWith('ch')).length : 0;
    const pct = meta ? Math.round(done / meta.chapters * 100) : 0;
    return `<a class="lb-book tone-${esc(sr.tone || 'green')}" href="#/series/${sr.id}">
      <span class="lb-cover"><span class="lb-n">${esc(sr.mark || '')}</span><span class="lb-k">${sr.levels.length} levels</span><b class="display ${Math.max(...sr.title.split(' ').map(w => w.length)) > 10 ? 'long' : ''}">${esc(sr.title)}</b><span class="lb-lv">${sr.levels.map(l => `<i class="${l.locked ? '' : 'on'} ${cur && cur.l.n === l.n ? 'cur' : ''}"></i>`).join('')}</span></span>
      <span class="lb-info"><small>${esc(sr.sub)}</small><span class="meter"><i style="width:${pct}%"></i></span>
      <span class="lb-st"><b>${cur && cur.p.pos ? 'Continue' : 'Start'}</b><span>Level ${cur ? cur.l.n : 1} ${esc(cur ? cur.l.name : '')} · ${pct}%</span></span></span></a>`;
  }).join('');
  const tiles = idx.books.filter(b => !b.series).map((b, i) => {
    const bp = progress('book:' + b.id, redraw) || {};
    const done = Object.keys(bp.done || {}).filter(k => k.startsWith('ch')).length;
    const pct = Math.round(done / b.chapters * 100);
    const saved = (bp.marks || []).length + (bp.hls || []).length;
    const kind = b.id === 'dahua' ? 'Proposal' : KIND[b.kind] || 'Book';
    return `<a class="lb-book tone-${esc(b.tone || 'green')}" href="#/book/${b.id}">
      <span class="lb-cover"><span class="lb-n">${String(i + 1).padStart(2, '0')}</span><span class="lb-k">${esc(kind)}</span><b class="display ${Math.max(...b.title.split(' ').map(w => w.length)) > 10 ? 'long' : ''}">${esc(b.title)}</b><i class="lb-mark"></i></span>
      <span class="lb-info"><small>${esc(b.sub)}</small><span class="meter"><i style="width:${pct}%"></i></span>
      <span class="lb-st"><b>${bp.pos ? 'Continue' : 'Start'}</b><span>${pct}% · ${done} of ${b.chapters}${saved ? ' · ' + saved + ' saved' : ''}</span></span></span></a>`;
  }).join('');
  return head + `${seriesTiles ? `<div class="ptitle" style="margin-top:6px"><i class="tick"></i><span class="eyebrow">Courses in five levels</span></div><div class="lb-shelf">${seriesTiles}</div><div class="ptitle" style="margin-top:44px"><i class="tick"></i><span class="eyebrow">Books and manuals</span></div>` : ''}<div class="lb-shelf">${tiles}</div>${uploads || ''}`;
}

// Home: books with where you left off, most recent first.
export function homeBooks() {
  const idx = catalog(redraw);
  if (!idx || idx.__error) return `<p class="empty">${idx ? 'Sign in online once to unlock your books.' : 'Opening your books'}</p>`;
  const rows = idx.books.map(b => ({ b, p: progress('book:' + b.id, redraw) || {} })).sort((x, y) => ((y.p.pos || {}).at || 0) - ((x.p.pos || {}).at || 0));
  return `<div class="continue-list">${rows.map(({ b, p }) => {
    const done = Object.keys(p.done || {}).filter(k => k.startsWith('ch')).length; const pct = Math.round(done / b.chapters * 100);
    return `<a class="doc" href="#/book/${b.id}" ${p.pos ? `data-act="bkResumeFrom" data-id="${b.id}"` : ''}><span class="bar"></span><span class="grow" style="min-width:0;flex:1"><span class="kind">${p.pos ? 'Continue' : 'Start'}</span><span class="dtitle" style="display:block">${esc(b.title)}</span></span><span class="faint" style="font-size:11px;white-space:nowrap">${pct}%</span></a>`;
  }).join('')}</div>`;
}


// SERIES: one subject in five levels. The page shows the scope and the journey, level by level.
export function seriesView(parts) {
  const [id] = parts; const idx = catalog(redraw);
  if (!idx) return wait(); if (idx.__error) return `<div class="panel"><p class="muted">Sign in online once to unlock your books.</p></div>`;
  const sr = (idx.series || []).find(x => x.id === id); if (!sr) return `<p class="muted">Not found.</p>`;
  const sc = sr.scope || {};
  const lv = sr.levels.map(l => {
    const meta = l.book && idx.books.find(b => b.id === l.book);
    const p = meta ? (progress('book:' + l.book, redraw) || {}) : {};
    const done = Object.keys(p.done || {}).filter(k => k.startsWith('ch')).length; const pct = meta ? Math.round(done / meta.chapters * 100) : 0;
    const open = meta && !l.locked;
    return `<section class="sr-lv ${open ? 'open' : 'locked'}">
      <div class="sr-n"><b class="display">${l.n}</b><span>Level</span></div>
      <div class="sr-b"><span class="eyebrow">${open ? (p.pos ? 'In progress' : 'Open') : 'Locked'}${l.hours ? ' · about ' + esc(l.hours) : ''}</span><h3 class="display">${esc(l.name)}</h3><p>${esc(l.about)}</p>
        ${(l.can || []).length ? `<ul class="sr-can">${l.can.map(c => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
        ${(l.topics || []).length ? `<p class="sr-tp">${l.topics.map(t => `<span>${esc(t)}</span>`).join('')}</p>` : ''}
        ${open ? `<div class="sr-go"><a class="btn primary" href="#/book/${l.book}" ${p.pos ? `data-act="bkResumeFrom" data-id="${l.book}"` : ''}>${icon('book', 15)}${p.pos ? 'Continue' : 'Start level ' + l.n}</a><a class="btn" href="#/book/${l.book}">Contents</a><span class="faint">${pct}% · ${done} of ${meta.chapters} chapters</span></div>` : `<div class="sr-go"><span class="faint">${icon('lock', 14)} ${esc(l.unlock || 'Opens when the level before is complete')}</span></div>`}
      </div></section>`;
  }).join('');
  return `<div class="bk-toprow"><a class="bk-back" href="#/library" aria-label="Back to Library">${icon('left', 16)}<span>Library</span></a></div><section class="sr-hero tone-${esc(sr.tone || 'green')}"><span class="eyebrow">Course in five levels</span><h1 class="display">${esc(sr.title)}</h1><p>${esc(sr.sub)}</p></section>
    <div class="sr-grid">
      <section class="panel sr-scope"><div class="ptitle"><i class="tick"></i><span class="eyebrow">Scope</span></div>
        ${sc.about ? `<p class="sr-lead">${esc(sc.about)}</p>` : ''}
        ${(sc.covers || []).length ? `<h4>What the five levels cover</h4><ul>${sc.covers.map(c => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
        ${(sc.not || []).length ? `<h4>What it does not cover</h4><ul class="faint">${sc.not.map(c => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
        ${sc.method ? `<h4>How each level works</h4><p>${esc(sc.method)}</p>` : ''}
        ${sc.standards ? `<h4>Aligned with</h4><p>${esc(sc.standards)}</p>` : ''}
      </section>
      <section class="sr-journey"><div class="ptitle"><i class="tick"></i><span class="eyebrow">The journey</span></div>${lv}</section>
    </div>`;
}
