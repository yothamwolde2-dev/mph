// MPH study books. Rendered natively (no iframe) so bookmarks, resume and highlights are exact.
import { esc, icon, uid } from './core.js?v=0.2.0';
import { catalog, peek, progress, saveProgress } from './content.js?v=0.2.0';

const redraw = () => window.dispatchEvent(new Event('mph:redraw'));
const toast = (t, undo) => window.dispatchEvent(new CustomEvent('mph:toast', { detail: { text: t, undo } }));
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
const keep = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const strip = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

const B = { id: null, panel: innerWidth >= 1080 ? load('mph:bkpanel', '') : '', jump: null, q: '', gq: '', gcat: '', find: '', lastUndo: null };
const PK = id => 'book:' + id;
function prog(id) { const p = progress(PK(id), redraw); if (!p) return null; p.marks = p.marks || []; p.hls = p.hls || []; p.done = p.done || {}; p.quiz = p.quiz || {}; p.reflect = p.reflect || {}; p.check = p.check || {}; return p; }
const save = (id, p, now) => saveProgress(PK(id), p, now);

function sections(bk) {
  const s = [];
  bk.front.forEach((f, i) => s.push({ key: 'f' + i, t: f.t, kind: 'front', part: 'Before you begin' }));
  bk.ch.forEach(c => s.push({ key: 'ch' + c.n, t: c.t, kind: 'ch', n: c.n, part: bk.parts[c.part] }));
  s.push({ key: 'gl', t: 'Glossary', kind: 'gl', part: 'Toolkit' });
  s.push({ key: 'fw', t: 'Frameworks', kind: 'fw', part: 'Toolkit' });
  s.push({ key: 'skills', t: 'Skills', kind: 'skills', part: 'Toolkit' });
  s.push({ key: 'cases', t: 'Case library', kind: 'cases', part: 'Toolkit' });
  s.push({ key: 'sims', t: 'Simulations', kind: 'sims', part: 'Toolkit' });
  s.push({ key: 'tpl', t: 'Templates', kind: 'tpl', part: 'Toolkit' });
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
  return [meta, peek(meta.file, meta.v, redraw)];
}

export function bookView(parts) {
  const [id, sec] = parts; B.id = id;
  const [meta, bk] = getBook(id);
  if (!bk) return wait();
  if (bk.__error) return `<div class="panel"><p class="muted">This book could not be unlocked on this device. Check your connection and sign in, then reopen.</p></div>`;
  const p = prog(id); if (!p) return wait();
  const secs = sections(bk);
  if (!sec) return cover(id, meta, bk, p, secs);
  const i = secs.findIndex(s => s.key === sec); if (i < 0) return `<p class="muted">Section not found.</p>`;
  const s = secs[i];
  const chDone = Object.keys(p.done).filter(k => k.startsWith('ch')).length;
  const pct = Math.round(chDone / bk.ch.length * 100);
  const nav = `<div class="bk-bar">
      <a class="iconbtn" href="#/book/${id}" aria-label="Contents" title="Contents">${icon('left', 16)}</a>
      <div class="bk-bt"><b>${esc(s.t)}</b><small>${esc(meta.title)} · ${pct}% read</small></div>
      <button class="iconbtn" data-act="bkMarkTop" aria-label="Bookmark this place" title="Bookmark this place">${icon('bookmark', 17)}</button>
      <button class="iconbtn ${B.panel ? 'on' : ''}" data-act="bkPanel" aria-label="Contents, bookmarks and highlights" title="Contents, bookmarks and highlights">${icon('list', 17)}</button>
      ${i > 0 ? `<a class="iconbtn" href="#/book/${id}/${secs[i - 1].key}" aria-label="Previous" title="Previous">${icon('up', 16)}</a>` : ''}
      ${i < secs.length - 1 ? `<a class="iconbtn" href="#/book/${id}/${secs[i + 1].key}" aria-label="Next" title="Next">${icon('down', 16)}</a>` : ''}
    </div>`;
  const next = i < secs.length - 1 ? `<a class="bk-next" href="#/book/${id}/${secs[i + 1].key}"><span class="eyebrow">Next</span><b class="display">${esc(secs[i + 1].t)}</b>${icon('chev', 18)}</a>` : '';
  return `${nav}<div class="bk-wrap ${B.panel ? 'with-panel' : ''}"><article class="bk" data-sec="${s.key}">${renderSection(id, bk, s, p)}${next}</article>${B.panel ? `<aside class="bk-panel">${panel(id, bk, p, secs, s.key)}</aside>` : ''}</div>`;
}

function cover(id, meta, bk, p, secs) {
  const chDone = Object.keys(p.done).filter(k => k.startsWith('ch')).length;
  const pct = Math.round(chDone / bk.ch.length * 100);
  const resume = p.pos && secs.find(s => s.key === p.pos.sec);
  const groups = [];
  secs.forEach(s => { let g = groups.find(x => x.part === s.part); if (!g) groups.push(g = { part: s.part, items: [] }); g.items.push(s); });
  return `<section class="bk-cover"><span class="eyebrow">Study book</span><h1 class="display">${esc(meta.title)}</h1><p class="muted">${esc(meta.sub)}</p>
      <div class="bk-cprog"><span class="meter"><i style="width:${pct}%"></i></span><span class="num">${chDone} of ${bk.ch.length} chapters · ${pct}%</span></div>
      <div class="bk-cact">${resume ? `<button class="btn primary" data-act="bkResume">${icon('book', 15)}Continue: ${esc(resume.t)}</button>` : `<a class="btn primary" href="#/book/${id}/${secs[0].key}">${icon('book', 15)}Start reading</a>`}
      <span class="faint">${p.marks.length} bookmarks · ${p.hls.length} highlights</span></div></section>
    <div class="bk-search"><input class="field" id="bkq" value="${esc(B.q)}" placeholder="Search the whole book" autocomplete="off"></div>
    ${B.q.trim().length > 1 ? searchResults(id, bk, secs) : ''}
    ${p.marks.length || p.hls.length ? `<section class="panel bk-saved">${savedList(id, p, secs)}</section>` : ''}
    <div class="bk-toc">${groups.map(g => `<section><span class="eyebrow">${esc(g.part)}</span>${g.items.map(s => `<a href="#/book/${id}/${s.key}" class="${p.done[s.key] ? 'done' : ''}">${s.n ? `<span class="num">${String(s.n).padStart(2, '0')}</span>` : `<span class="num">${icon('chev', 13)}</span>`}<b>${esc(s.t)}</b>${p.done[s.key] ? icon('check', 15) : ''}</a>`).join('')}</section>`).join('')}</div>`;
}

function savedList(id, p, secs, cur) {
  const name = k => (secs.find(s => s.key === k) || {}).t || '';
  const marks = p.marks.slice().sort((a, b) => b.at - a.at).map(m => `<div class="bk-sv"><button data-act="bkGo" data-sec="${m.sec}" data-b="${m.b}">${icon('ribbon', 15)}<span><b>${esc(m.label)}</b><small>${esc(name(m.sec))}</small></span></button><input class="inline" data-chg="bkNote" data-k="marks" data-id="${m.id}" value="${esc(m.note || '')}" placeholder="Add a note"><button class="iconbtn" data-act="bkDel" data-k="marks" data-id="${m.id}" aria-label="Remove bookmark">${icon('minus', 14)}</button></div>`).join('');
  const hls = p.hls.slice().sort((a, b) => b.at - a.at).map(h => `<div class="bk-sv hl"><button data-act="bkGo" data-sec="${h.sec}" data-b="${h.b}"><span><b class="bk-quote">${esc(h.text)}</b><small>${esc(name(h.sec))}</small></span></button><input class="inline" data-chg="bkNote" data-k="hls" data-id="${h.id}" value="${esc(h.note || '')}" placeholder="Add a note"><button class="iconbtn" data-act="bkDel" data-k="hls" data-id="${h.id}" aria-label="Remove highlight">${icon('minus', 14)}</button></div>`).join('');
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
  if (!textIndex) textIndex = secs.map(s => ({ s, text: strip(sectionHtml(bk, s)) }));
  const q = B.q.trim().toLowerCase(); const out = [];
  for (const { s, text } of textIndex) {
    const low = text.toLowerCase(); let at = low.indexOf(q), n = 0;
    while (at > -1 && n < 3) { out.push({ s, snip: text.slice(Math.max(0, at - 60), at + q.length + 80), at }); n++; at = low.indexOf(q, at + q.length); }
    if (out.length > 40) break;
  }
  if (!out.length) return `<p class="empty">No matches.</p>`;
  return `<div class="bk-results">${out.map(r => `<a href="#/book/${id}/${r.s.key}" data-act="bkFind" data-q="${esc(B.q.trim())}"><b>${esc(r.s.t)}</b><small>${esc(r.snip)}</small></a>`).join('')}</div>`;
}

// Raw html for a section (used for rendering and for search)
function sectionHtml(bk, s) {
  if (s.kind === 'front') return bk.front[+s.key.slice(1)].body;
  if (s.kind === 'pv') return bk.previews[+s.key.slice(2)].body;
  if (s.kind === 'ch') { const c = bk.ch.find(c => c.n === s.n); return [c.q, c.learn, c.understand, c.see, c.practice && (c.practice.skill + c.practice.task), c.decide && (c.decide.case + c.decide.ask), (c.take || []).join(' '), c.reflect].join(' '); }
  if (s.kind === 'gl') return bk.gl.map(g => `${g.t} ${g.s} ${g.p} ${g.e}`).join(' ');
  if (s.kind === 'cases') return bk.cases.map(c => `${c.t} ${c.bg} ${c.pr} ${c.de} ${c.mo}`).join(' ');
  if (s.kind === 'skills') return bk.skills.map(c => `${c.t} ${c.what} ${c.why} ${(c.steps || []).join(' ')}`).join(' ');
  if (s.kind === 'fw') return bk.fw.map(c => `${c.t} ${c.what} ${c.how} ${c.ex || ''}`).join(' ');
  if (s.kind === 'tpl') return bk.tpl.map(c => `${c.t} ${c.body}`).join(' ');
  if (s.kind === 'sims') return bk.sims.map(c => `${c.t} ${c.scn}`).join(' ');
  if (s.kind === 'mq') return bk.mansenQ.map(q => q.join(' ')).join(' ');
  if (s.kind === 'lv') return bk.levels.map(l => l.join(' ')).join(' ');
  if (s.kind === 'cmp') return bk.completion.join(' ');
  return '';
}

function renderSection(id, bk, s, p) {
  const H = (k, t) => `<h2 class="bk-h"><span>${k}</span>${t}</h2>`;
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
      ${list(items, g => `<details class="bk-term"><summary><b>${esc(g.t)}</b><small>${esc(g.s)}</small></summary><div><p><b>Precisely</b> ${esc(g.p)}</p><p><b>Example</b> ${esc(g.e)}</p><p><b>Related</b> ${esc(g.r)}</p><p><b>Where you meet it</b> ${esc(g.w)}</p></div></details>`)}</div>`;
  }
  if (s.kind === 'cases') return `<div class="bk-k">Toolkit</div><h1 class="display bk-title">Case library</h1><div class="bk-body">${list(bk.cases, c => `<details class="bk-term"><summary><b>${esc(c.t)}</b><small>${esc(c.pr)}</small></summary><div>
      <p><b>Background</b> ${esc(c.bg)}</p><p><b>Problem</b> ${esc(c.pr)}</p><p><b>Data</b> ${esc(c.da)}</p><p><b>Stakeholders</b> ${esc(c.st)}</p><p><b>Decision</b> ${esc(c.de)}</p><ul>${(c.qs || []).map(q => `<li>${esc(q)}</li>`).join('')}</ul>
      <details class="rv"><summary>Show a model answer</summary><div><p>${esc(c.mo)}</p><p><b>Lesson</b> ${esc(c.le)}</p></div></details></div></details>`)}</div>`;
  if (s.kind === 'skills') return `<div class="bk-k">Toolkit</div><h1 class="display bk-title">Skills</h1><div class="bk-body">${list(bk.skills, c => `<details class="bk-term"><summary><b>${esc(c.t)}</b><small>${esc(c.what)}</small></summary><div>
      <p><b>Why it matters</b> ${esc(c.why)}</p><p><b>When to use it</b> ${esc(c.when)}</p><ol>${(c.steps || []).map(x => `<li>${esc(x)}</li>`).join('')}</ol><p><b>Example</b> ${esc(c.ex)}</p><p><b>Try it</b> ${esc(c.task)}</p><p><b>Common mistakes</b> ${esc(c.mist)}</p></div></details>`)}</div>`;
  if (s.kind === 'fw') return `<div class="bk-k">Toolkit</div><h1 class="display bk-title">Frameworks</h1><div class="bk-body">${list(bk.fw, c => `<details class="bk-term"><summary><b>${esc(c.t)}</b><small>${esc(c.what)}</small></summary><div>
      <p><b>Why</b> ${esc(c.why)}</p><p><b>When</b> ${esc(c.when)}</p><p><b>How</b> ${esc(c.how)}</p>${c.ex ? `<p><b>Example</b> ${esc(c.ex)}</p>` : ''}</div></details>`)}</div>`;
  if (s.kind === 'tpl') return `<div class="bk-k">Toolkit</div><h1 class="display bk-title">Templates</h1><div class="bk-body">${list(bk.tpl, (c, i) => `<details class="bk-term"><summary><b>${esc(c.t)}</b><small>Ready to copy</small></summary><div><pre class="bk-pre">${esc(c.body)}</pre><button class="btn sm" data-act="bkCopy" data-i="${i}">Copy</button></div></details>`)}</div>`;
  if (s.kind === 'sims') return `<div class="bk-k">Toolkit</div><h1 class="display bk-title">Simulations</h1><div class="bk-body">${list(bk.sims, (c, i) => { const ch = (p.check['sim' + i]); return `<div class="bk-sim"><b class="display">${esc(c.t)}</b><p>${esc(c.scn)}</p><div class="lx-opts">${c.opts.map((o, oi) => `<button class="${ch === undefined ? '' : oi === ch ? (o[2] === 'best' ? 'ok' : o[2] === 'weak' ? 'bad' : 'mid') : ''}" data-act="bkSim" data-i="${i}" data-o="${oi}">${esc(o[0])}</button>`).join('')}</div>${ch !== undefined ? `<p class="bk-why"><b>${esc(c.opts[ch][2] === 'best' ? 'Best choice' : c.opts[ch][2] === 'strong' ? 'Strong choice' : 'Weak choice')}</b> ${esc(c.opts[ch][1])}</p>` : ''}</div>`; })}</div>`;
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
  const sec = art.dataset.sec;
  const blocks = art.querySelectorAll('.bk-body > *:not(section), .bk-body > section > *, .bk-body > details, .bk-body > div');
  let n = 0; blocks.forEach(el => { if (!el.dataset.b) el.dataset.b = n++; });
  p.marks.filter(m => m.sec === sec).forEach(m => { const el = art.querySelector(`[data-b="${m.b}"]`); if (el) el.classList.add('bk-marked'); });
  paintHighlights(art, p, sec);
  if (B.jump && B.jump.sec === sec) {
    const el = art.querySelector(`[data-b="${B.jump.b}"]`);
    if (el) requestAnimationFrame(() => { el.scrollIntoView({ block: 'start' }); el.classList.add('bk-flash'); setTimeout(() => el.classList.remove('bk-flash'), 1600); });
    if (B.jump.find) paintFind(art, B.jump.find);
    B.jump = null;
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
  p.hls.filter(h => h.sec === sec).forEach(h => { const el = art.querySelector(`[data-b="${h.b}"]`) || art; rs.push(...rangesIn(el, h.text, 1)); });
  if (hasApi) { if (rs.length) CSS.highlights.set('bk-hl', new Highlight(...rs)); else CSS.highlights.delete('bk-hl'); }
  else rs.forEach(r => { try { const m = document.createElement('mark'); m.className = 'bk-mark'; r.surroundContents(m); } catch (e) {} });
}
function paintFind(art, q) {
  const rs = rangesIn(art.querySelector('.bk-body') || art, q, 50);
  if (window.CSS && CSS.highlights && window.Highlight && rs.length) CSS.highlights.set('bk-find', new Highlight(...rs));
  if (rs[0]) { const el = rs[0].startContainer.parentElement; el && el.scrollIntoView({ block: 'center' }); }
}

// Reading position: the first paragraph at the top of the screen. Saved quietly.
let posT = null;
window.addEventListener('scroll', () => {
  const art = document.querySelector('.bk[data-sec]'); if (!art || !B.id) return;
  clearTimeout(posT); posT = setTimeout(() => {
    const p = prog(B.id); if (!p) return;
    const sec = art.dataset.sec; const top = 130;
    const els = art.querySelectorAll('[data-b]'); let cur = null, last = null;
    for (const el of els) { const r = el.getBoundingClientRect(); last = el; if (r.bottom > top) { cur = el; break; } }
    if (!cur) return;
    p.pos = { sec, b: +cur.dataset.b, at: Date.now() };
    const end = art.querySelector('.bk-next') || last;
    if (end && end.getBoundingClientRect().top < innerHeight && sec.startsWith('ch') && !p.done[sec]) { p.done[sec] = Date.now(); toast('Chapter complete'); }
    save(B.id, p);
  }, 500);
}, { passive: true });

// Hover ribbon on desktop: bookmark any paragraph directly.
document.addEventListener('mouseover', e => {
  const el = e.target.closest && e.target.closest('.bk [data-b]'); const art = document.querySelector('.bk[data-sec]');
  if (!art) { if (hover) hover.hidden = true; return; }
  if (!el) return;
  if (!hover) { hover = document.createElement('button'); hover.className = 'bk-hover'; hover.setAttribute('aria-label', 'Bookmark this paragraph'); hover.innerHTML = icon('ribbon', 16); document.body.appendChild(hover); hover.addEventListener('click', () => { if (hover.target) toggleMark(hover.target); }); }
  const r = el.getBoundingClientRect(); const ar = art.getBoundingClientRect();
  hover.style.top = (r.top + window.scrollY + 2) + 'px'; hover.style.left = (ar.left - 40) + 'px'; hover.target = el; hover.hidden = ar.left < 50;
});
window.addEventListener('hashchange', () => { if (hover) hover.hidden = true; });

function labelFor(el) {
  let h = el; while (h && !/^H[1-4]$/.test(h.tagName)) { h = h.previousElementSibling || (h.parentElement && h.parentElement.closest('section') ? h.parentElement.closest('section').querySelector('h2,h3') : null); if (h && /^H[1-4]$/.test(h.tagName)) break; if (!h) break; }
  const txt = strip(el.textContent).slice(0, 90);
  return txt || (h ? strip(h.textContent) : 'Bookmark');
}
function toggleMark(el) {
  const art = document.querySelector('.bk[data-sec]'); const p = prog(B.id); if (!art || !p) return;
  const sec = art.dataset.sec, b = +el.dataset.b;
  const ex = p.marks.find(m => m.sec === sec && m.b === b);
  if (ex) { p.marks = p.marks.filter(m => m !== ex); el.classList.remove('bk-marked'); save(B.id, p, true); B.lastUndo = { k: 'marks', item: ex }; toast('Bookmark removed', bookUndo); }
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
  const h = { id: uid('hl'), sec: art.dataset.sec, b: blk ? +blk.dataset.b : 0, text: txt, note: '', at: Date.now() };
  p.hls.push(h); save(B.id, p, true); s.removeAllRanges(); selBtn.hidden = true;
  B.lastUndo = { k: 'hls', id: h.id };
  paintHighlights(art, p, art.dataset.sec); toast('Highlighted', bookUndo);
  if (B.panel === 'saved') redraw();
}

// Search boxes
let qT = null;
document.addEventListener('input', e => {
  if (e.target.id === 'bkq') { B.q = e.target.value; clearTimeout(qT); qT = setTimeout(() => { redraw(); setTimeout(() => { const i = document.getElementById('bkq'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 0); }, 250); }
  if (e.target.id === 'bkgq') { B.gq = e.target.value; clearTimeout(qT); qT = setTimeout(() => { redraw(); setTimeout(() => { const i = document.getElementById('bkgq'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 0); }, 200); }
});

export const BA = {
  bkPanel() { B.panel = B.panel ? '' : 'toc'; keep('mph:bkpanel', B.panel); redraw(); },
  bkTab(el) { B.panel = el.dataset.t; keep('mph:bkpanel', B.panel); redraw(); },
  bkMarkTop() {
    const art = document.querySelector('.bk[data-sec]'); if (!art) return;
    let cur = null; for (const el of art.querySelectorAll('[data-b]')) { if (el.getBoundingClientRect().bottom > 130) { cur = el; break; } }
    if (cur) toggleMark(cur);
  },
  bkResumeFrom(el, e) { e && e.preventDefault(); B.id = el.dataset.id; const p = prog(B.id); if (p && p.pos) { B.jump = { sec: p.pos.sec, b: p.pos.b }; location.hash = `#/book/${B.id}/${p.pos.sec}`; } else location.hash = `#/book/${B.id}`; },
  bkResume() { const p = prog(B.id); if (!p || !p.pos) return; B.jump = { sec: p.pos.sec, b: p.pos.b }; location.hash = `#/book/${B.id}/${p.pos.sec}`; },
  bkGo(el, e) { e && e.preventDefault(); B.jump = { sec: el.dataset.sec, b: +el.dataset.b }; const h = `#/book/${B.id}/${el.dataset.sec}`; if (location.hash === h) { redraw(); } else location.hash = h; if (innerWidth < 860) { B.panel = ''; keep('mph:bkpanel', ''); } },
  bkFind(el) { const sec = el.getAttribute('href').split('/').pop(); B.jump = { sec, b: -1, find: el.dataset.q }; },
  bkDel(el) { const p = prog(B.id); if (!p) return; const k = el.dataset.k; const item = p[k].find(x => x.id === el.dataset.id); p[k] = p[k].filter(x => x.id !== el.dataset.id); save(B.id, p, true); B.lastUndo = { k, item }; toast(k === 'marks' ? 'Bookmark removed' : 'Highlight removed', bookUndo); redraw(); },
  bkQuiz(el) { const p = prog(B.id); if (!p) return; const sec = el.dataset.sec; p.quiz[sec] = p.quiz[sec] || {}; p.quiz[sec][+el.dataset.q] = +el.dataset.o; save(B.id, p, true); redraw(); },
  bkCat(el) { B.gcat = el.dataset.c; redraw(); },
  bkSim(el) { const p = prog(B.id); if (!p) return; p.check['sim' + el.dataset.i] = +el.dataset.o; save(B.id, p, true); redraw(); },
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
  if (u.item) p[u.k].push(u.item); else p[u.k] = p[u.k].filter(x => x.id !== u.id);
  save(B.id, p, true); B.lastUndo = null; redraw(); return true;
}
export const bookState = () => B;
