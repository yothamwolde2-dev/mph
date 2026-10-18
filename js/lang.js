// MPH Languages: Chinese (HSK 2, HSK 3; HSK 4 and 5 locked), German (A1), Afaan Oromo (level 1).
// Each language says in the catalog how its screens are labelled (ui) and which device voice reads it (voice).
// Flashcards with spaced repetition, dialogs with audio, listening drills, grammar, words.
import { esc, icon } from './core.js?v=0.6.0';
import { catalog, peek, progress, saveProgress } from './content.js?v=0.6.0';

const redraw = () => window.dispatchEvent(new Event('mph:redraw'));
const toast = (t, undo) => window.dispatchEvent(new CustomEvent('mph:toast', { detail: { text: t, undo } }));
const DAY = () => Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = (a, n, not) => shuffle(a.filter(x => x !== not)).slice(0, n);
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
const keep = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

// UI preferences for the language screens (per device)
const P = Object.assign({ py: true, en: true, hz: true, speed: 0.85, newPerDay: 15, mode: 'read' }, load('mph:langui', {}));
const saveP = () => keep('mph:langui', P);

// SPEECH. Uses the Chinese voices built into the device (works offline on Apple devices).
let voices = [];
function loadVoices() { try { voices = speechSynthesis.getVoices(); } catch (e) { voices = []; } }
if ('speechSynthesis' in window) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
function voicesFor(lang) {
  const want = lang.replace('_', '-').toLowerCase(); const base = want.split('-')[0];
  const norm = v => (v.lang || '').replace('_', '-').toLowerCase();
  const vs = voices.filter(v => norm(v).startsWith(base));
  const exact = vs.filter(v => norm(v) === want || (base === 'zh' && /cmn/.test(norm(v))));
  const local = (exact.length ? exact : vs);
  // voices stored on the device first: they work offline and sound better
  return local.filter(v => v.localService).concat(local.filter(v => !v.localService));
}
const VOICE = () => (L.lang && L.lang.voice) || 'zh-CN';
const UI = () => Object.assign({ script: '汉字', roman: 'Pinyin', recall: 'Say or write it in Chinese', hear: 'Choose the characters you hear', search: 'Search characters, pinyin or English', latin: false }, (L.lang && L.lang.ui) || {});
let warned = false;
let playing = null;
export function stopSpeech() { try { speechSynthesis.cancel(); } catch (e) {} playing = null; document.querySelectorAll('.speaking').forEach(e => e.classList.remove('speaking')); }
function say(text, opts = {}) {
  return new Promise(res => {
    if (!('speechSynthesis' in window)) { toast('This device has no speech voice'); return res(); }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = opts.lang || VOICE();
    const vs = voicesFor(u.lang);
    if (!vs.length && voices.length) {
      if (!warned) { warned = true; toast(UI().novoice || 'No voice for this language on this device yet. Add one in the device settings under Spoken Content.'); }
      if (UI().novoice) return res();
    }
    if (vs.length) u.voice = vs[(opts.voice || 0) % vs.length];
    u.rate = opts.rate || P.speed;
    if (opts.pitch) u.pitch = opts.pitch;
    u.onend = u.onerror = () => res();
    speechSynthesis.speak(u);
  });
}
async function playLines(lines, from = 0, token) {
  stopSpeech(); const me = token || {}; playing = me;
  const speakers = [...new Set(lines.map(l => l.s || 'A'))];
  for (let i = from; i < lines.length; i++) {
    if (playing !== me) return;
    document.querySelectorAll('.speaking').forEach(e => e.classList.remove('speaking'));
    const row = document.querySelector(`[data-line="${i}"]`); if (row) { row.classList.add('speaking'); row.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    const si = speakers.indexOf(lines[i].s || 'A');
    await say(lines[i].h, { voice: si, pitch: voicesFor(VOICE()).length > 1 ? 1 : [1, 0.85, 1.15][si % 3] });
    if (playing !== me) return;
    await new Promise(r => setTimeout(r, 350));
  }
  if (playing === me) { playing = null; document.querySelectorAll('.speaking').forEach(e => e.classList.remove('speaking')); redraw(); }
}

// SPACED REPETITION
function rate(card, g) {
  const c = Object.assign({ n: 0, iv: 0, ef: 2.5, due: 0, lapse: 0 }, card || {});
  const today = DAY();
  if (g === 0) { c.n = 0; c.iv = 0; c.lapse++; c.ef = Math.max(1.3, c.ef - 0.2); c.due = today; }
  else {
    let iv = c.n === 0 ? 1 : c.n === 1 ? 3 : Math.round(Math.max(1, c.iv) * c.ef);
    if (g === 1) { iv = Math.max(1, Math.round((c.iv || 1) * 1.2)); c.ef = Math.max(1.3, c.ef - 0.15); }
    if (g === 3) { iv = Math.round(iv * 1.3) + 1; c.ef += 0.15; }
    c.iv = iv; c.n++; c.due = today + iv;
  }
  c.seen = Date.now();
  return c;
}
const preview = (card, g) => { if (g === 0) return 'In a few cards'; const c = rate(card, g); return c.iv === 1 ? '1 day' : c.iv < 30 ? c.iv + ' days' : Math.round(c.iv / 30) + ' mo'; };

// STATE
const L = { lang: null, level: null, tab: 'cards', sess: null, dlg: null, drill: null, gram: null, q: '', reveal: {}, exa: {} };
const PK = lang => 'lang:' + lang;
function prog(lang) { const p = progress(PK(lang), redraw); if (!p) return null; p.cards = p.cards || {}; p.dlg = p.dlg || {}; p.days = p.days || {}; p.drills = p.drills || {}; p.ex = p.ex || {}; return p; }
function save(lang, p, now) { saveProgress(PK(lang), p, now); }
function bumpDay(p, n = 1) { const k = new Date().toISOString().slice(0, 10); p.days[k] = (p.days[k] || 0) + n; }
function streak(p) { let s = 0; const d = new Date(); for (;;) { const k = d.toISOString().slice(0, 10); if (p.days[k]) { s++; d.setDate(d.getDate() - 1); } else break; } return s; }

function levelData(lv) { if (!lv || lv.locked) return null; const d = peek(lv.file, lv.v, redraw); return d && !d.__error ? d : d; }
function stats(lang, lvId, data, p) {
  const today = DAY(); let learned = 0, due = 0, mastered = 0;
  data.words.forEach(w => { const c = p.cards[w.id + '|' + 'read']; if (c && c.n) { learned++; if (c.due <= today) due++; if (c.iv >= 21) mastered++; } });
  const dl = data.dialogs.filter(d => p.dlg[d.id]).length;
  return { learned, due, mastered, total: data.words.length, dialogs: dl };
}

// VIEWS
const loading = t => `<div class="lx-wait">${icon('learning', 22)}<span>${t || 'Opening'}</span></div>`;
const err = () => `<div class="panel"><p class="muted">This content could not be unlocked on this device. Check your connection and that you are signed in, then reopen.</p></div>`;

export function learningHub(extra) {
  const idx = catalog(redraw);
  if (!idx) return loading();
  if (idx.__error) return err();
  const langs = idx.languages.map(l => {
    const p = !l.locked ? prog(l.id) : null;
    const lv = (l.levels || []).filter(v => !v.locked);
    const sub = l.locked ? 'Coming soon' : lv.map(v => v.name).join(' · ');
    let meta = '';
    if (p) { const s = streak(p); meta = s ? `${s} day streak` : 'Start today'; }
    return `<a class="lx-tile ${l.locked ? 'locked' : ''}" ${l.locked ? `data-act="lxLocked" data-n="${esc(l.name)}" href="#/learning"` : `href="#/lang/${l.id}"`}>
      <span class="lx-native">${esc(l.native)}</span>
      <span><b class="display">${esc(l.name)}</b><small>${esc(sub)}</small></span>
      <span class="lx-meta">${l.locked ? icon('lock', 15) : esc(meta)}</span></a>`;
  }).join('');
  return `<div class="phead"><div><span class="eyebrow">Growth</span><h1 class="display" style="margin-top:10px">Learning</h1><p class="muted">Languages, subjects and courses. Everything opens instantly and works offline. Books live in the Library.</p></div></div>
    <section class="lx-sec"><div class="ptitle"><i class="tick"></i><span class="eyebrow">Languages</span></div><div class="lx-tiles">${langs}</div></section>
${extra || ''}`;
}

export function langView(parts) {
  const [langId, lvId, tab, sub] = parts;
  const idx = catalog(redraw); if (!idx) return loading(); if (idx.__error) return err();
  const lang = idx.languages.find(l => l.id === langId); if (!lang || lang.locked) return `<div class="panel"><p class="muted">This language is not open yet.</p></div>`;
  const lvls = lang.levels;
  const lastLv = load('mph:lv:' + langId, null);
  const lv = lvls.find(v => v.id === lvId && !v.locked) || lvls.find(v => v.id === lastLv && !v.locked) || lvls.filter(v => !v.locked).slice(-1)[0];
  keep('mph:lv:' + langId, lv.id);
  L.lang = lang; L.level = lv;
  const t = tab || 'cards';
  const p = prog(langId); const data = levelData(lv);
  const chips = lvls.map(v => v.locked ? `<button class="lx-chip locked" data-act="lxLockedLevel" data-n="${esc(v.name)}">${icon('lock', 13)}${esc(v.name)}</button>`
    : `<a class="lx-chip ${v.id === lv.id ? 'on' : ''}" href="#/lang/${langId}/${v.id}/${t}">${esc(v.name)}</a>`).join('');
  const hasEx = data && !data.__error && data.exercises && data.exercises.length;
  const noaudio = lang.ui && lang.ui.noaudio;
  const tabs = [['cards', 'Flashcards'], ['dialogs', (data && data.passages && data.passages.length && lang.ui && lang.ui.reading) ? 'Dialogs and reading' : 'Dialogs'], ...(noaudio ? [] : [['listen', 'Listening']]), ['grammar', 'Grammar'], ...(hasEx ? [['practice', 'Exercises']] : []), ['words', 'Words']]
    .map(([id, n]) => `<a class="lx-tab ${t === id ? 'on' : ''}" href="#/lang/${langId}/${lv.id}/${id}">${n}</a>`).join('');
  let body = loading('Unlocking ' + lv.name);
  if (data && data.__error) body = err();
  else if (data && p) {
    const s = stats(langId, lv.id, data, p);
    const head = `<div class="lx-stats"><div><b class="num">${s.learned}</b><span>of ${s.total} words started</span></div><div><b class="num">${s.due}</b><span>due today</span></div><div><b class="num">${s.mastered}</b><span>mastered</span></div><div><b class="num">${s.dialogs}/${data.dialogs.length}</b><span>dialogs done</span></div><div><b class="num">${streak(p)}</b><span>day streak</span></div></div>`;
    body = (t === 'cards' && !L.sess ? head : '') + (t === 'cards' ? cardsView(langId, lv, data, p)
      : t === 'dialogs' ? (sub !== undefined ? dialogView(langId, lv, data, p, +sub) : dialogList(langId, lv, data, p))
      : t === 'listen' ? listenView(langId, lv, data, p, sub)
      : t === 'grammar' ? (sub !== undefined ? grammarPoint(langId, lv, data, +sub) : grammarList(langId, lv, data))
      : t === 'practice' ? (sub !== undefined ? exerciseSet(langId, lv, data, p, +sub) : exerciseList(langId, lv, data, p))
      : wordsView(langId, lv, data, p));
  }
  return `<div class="lang-${esc(langId)} ${UI().latin ? 'latin' : ''}"><div class="lx-head"><div><a class="eyebrow" href="#/learning">Learning</a><h1 class="display">${esc(lang.name)} <span class="lx-n">${esc(lang.native)}</span></h1></div><div class="lx-chips">${chips}</div></div>
    <nav class="lx-tabs">${tabs}</nav>${lang.note ? `<p class="lx-note faint">${esc(lang.note)}</p>` : ''}<div class="lx-body">${body}</div></div>`;
}

// FLASHCARDS
function buildSession(lang, lv, data, p, deck, mode) {
  const today = DAY();
  const items = deck === 'grammar' ? data.grammar.map(g => ({ kind: 'g', id: g.id + '|g', g })) : data.words.map(w => ({ kind: 'w', id: w.id + '|' + mode, w }));
  const due = shuffle(items.filter(i => p.cards[i.id] && p.cards[i.id].due <= today));
  const k = new Date().toISOString().slice(0, 10) + ':' + lv.id + ':' + deck + mode;
  const introduced = (p.newToday && p.newToday[k]) || 0;
  const fresh = items.filter(i => !p.cards[i.id]).slice(0, Math.max(0, (deck === 'grammar' ? 5 : P.newPerDay) - introduced));
  const queue = [];
  let a = 0, b = 0; while (a < due.length || b < fresh.length) { if (a < due.length) queue.push(due[a++]); if (a < due.length) queue.push(due[a++]); if (b < fresh.length) queue.push(fresh[b++]); }
  return { deck, mode, queue, i: 0, flipped: false, done: 0, again: 0, key: k, lv: lv.id };
}
function cardsView(langId, lv, data, p) {
  const s = L.sess && L.sess.lv === lv.id ? L.sess : null;
  if (!s) {
    const today = DAY();
    const modes = [['read', 'Read', UI().latin ? 'Word to meaning' : 'Character to meaning'], ['listen', 'Listen', 'Sound to meaning'], ['recall', 'Recall', UI().latin ? 'Meaning to word' : 'Meaning to character']].filter(m => !(UI().noaudio && m[0] === 'listen'));
    const dueOf = m => data.words.filter(w => { const c = p.cards[w.id + '|' + m]; return c && c.due <= today; }).length;
    const newOf = m => data.words.filter(w => !p.cards[w.id + '|' + m]).length;
    const gDue = data.grammar.filter(g => { const c = p.cards[g.id + '|g']; return c && c.due <= today; }).length;
    return `<div class="lx-decks">${modes.map(([m, n, d]) => `<button class="lx-deck ${P.mode === m ? 'on' : ''}" data-act="lxStart" data-deck="words" data-mode="${m}">
        <span class="eyebrow">Vocabulary</span><b class="display">${n}</b><small>${d}</small><span class="lx-dn"><em>${dueOf(m)}</em> due · <em>${Math.min(newOf(m), P.newPerDay)}</em> new</span></button>`).join('')}
      <button class="lx-deck" data-act="lxStart" data-deck="grammar" data-mode="g"><span class="eyebrow">Grammar</span><b class="display">Patterns</b><small>${data.grammar.length} points with examples</small><span class="lx-dn"><em>${gDue}</em> due · <em>${data.grammar.filter(g => !p.cards[g.id + '|g']).length}</em> unseen</span></button></div>
      <div class="lx-set"><span class="faint">New words per day</span>${[10, 15, 20, 30].map(n => `<button class="lx-mini ${P.newPerDay === n ? 'on' : ''}" data-act="lxNew" data-n="${n}">${n}</button>`).join('')}</div>`;
  }
  if (s.i >= s.queue.length) {
    return `<div class="lx-card done"><span class="eyebrow">Session complete</span><b class="display">${s.done} cards</b><p class="muted">${s.again ? s.again + ' to see again soon. ' : ''}Come back tomorrow for the next review.</p>
      <div style="display:flex;gap:8px;justify-content:center;margin-top:18px"><button class="btn" data-act="lxEnd">Back to decks</button><button class="btn primary" data-act="lxStart" data-deck="${s.deck}" data-mode="${s.mode}">Continue</button></div></div>`;
  }
  const it = s.queue[s.i]; const card = p.cards[it.id];
  const counter = `<div class="lx-prog"><span class="meter"><i style="width:${Math.round(s.i / s.queue.length * 100)}%"></i></span><span class="faint num">${s.i + 1} / ${s.queue.length}</span><button class="iconbtn" data-act="lxEnd" aria-label="End session">${icon('x', 16)}</button></div>`;
  let front, back;
  if (it.kind === 'g') {
    const g = it.g;
    front = `<span class="eyebrow">Grammar</span><b class="lx-pat">${esc(g.p)}</b><small class="muted">${esc(g.t)}</small><span class="lx-hint">What does this pattern mean, and how do you use it?</span>`;
    back = `<b class="lx-pat sm">${esc(g.p)}</b><p class="lx-mean">${esc(g.m)}</p><p class="muted lx-exp">${esc(g.h)}</p>${g.x ? `<p class="lx-x">${esc(g.x)}</p>` : ''}
      ${g.ex.map((e, i) => `<button class="lx-ex" data-act="lxSay" data-t="${esc(e.h)}">${icon('sound', 15)}<span><b>${esc(e.h)}</b><small>${esc(e.p)}</small><small>${esc(e.e)}</small></span></button>`).join('')}`;
  } else {
    const w = it.w;
    if (s.mode === 'listen') front = `<button class="lx-play" data-act="lxSay" data-t="${esc(w.h)}" aria-label="Play">${icon('sound', 34)}</button><span class="lx-hint">Listen, then say what it means</span>`;
    else if (s.mode === 'recall') front = `<span class="eyebrow">${esc(w.pos)}</span><b class="lx-en">${esc(w.m)}</b><span class="lx-hint">${esc(UI().recall)}</span>`;
    else front = `<b class="lx-hz">${esc(w.h)}</b><span class="lx-hint">What does it mean?</span>`;
    back = `<b class="lx-hz">${esc(w.h)}</b><span class="lx-py">${esc(w.p)}</span><span class="lx-mean">${esc(w.m)}</span><span class="faint" style="font-size:12px">${esc(w.pos)}</span>
      <button class="lx-ex" data-act="lxSay" data-t="${esc(w.ex.h)}">${icon('sound', 15)}<span><b>${esc(w.ex.h)}</b><small>${esc(w.ex.p)}</small><small>${esc(w.ex.e)}</small></span></button>`;
  }
  const btns = s.flipped ? `<div class="lx-rate">${[['Again', 0], ['Hard', 1], ['Good', 2], ['Easy', 3]].map(([n, g]) => `<button data-act="lxRate" data-g="${g}" class="r${g}"><b>${n}</b><small>${preview(card, g)}</small></button>`).join('')}</div>`
    : `<button class="btn primary lx-flip" data-act="lxFlip">Show answer</button>`;
  return `${counter}<div class="lx-card ${s.flipped ? 'flipped' : ''}" ${s.flipped ? '' : 'data-act="lxFlip"'}>
      ${s.flipped ? `<div class="lx-back">${back}</div>` : `<div class="lx-front">${front}</div>`}</div>${btns}
    <p class="faint lx-keys">Space to show the answer · 1 Again · 2 Hard · 3 Good · 4 Easy</p>`;
}

// DIALOGS
function dialogList(langId, lv, data, p) {
  const all = [...data.dialogs.map((d, i) => ({ d, i, kind: 'Dialog' })), ...(data.passages || []).map((d, i) => ({ d, i: 'p' + i, kind: 'Listening passage' }))];
  return `<div class="lx-list">${all.map(({ d, i, kind }) => { const r = p.dlg[d.id]; return `<a class="lx-row" href="#/lang/${langId}/${lv.id}/dialogs/${i}">
    <span class="lx-zh">${esc(d.t)}</span><span class="grow"><b>${esc(d.te)}</b><small>${kind} · ${d.lines.length} lines · ${d.q.length} questions</small></span>
    <span class="lx-score">${r ? `${icon('check', 14)}${r.score}/${r.of}` : ''}</span></a>`; }).join('')}</div>`;
}
function getDialog(data, sub) { return String(sub).startsWith('p') ? (data.passages || [])[+String(sub).slice(1)] : data.dialogs[+sub]; }
function dialogView(langId, lv, data, p, idx) {
  const sub = location.hash.split('/').pop();
  const d = getDialog(data, sub); if (!d) return `<p class="muted">Not found.</p>`;
  const hide = L.reveal[d.id] === false;
  const ans = (L.answers && L.answers[d.id]) || {};
  const lines = d.lines.map((l, i) => `<button class="lx-line" data-line="${i}" data-act="lxLine" data-i="${i}">
      ${l.s ? `<span class="lx-spk s${'ABC'.indexOf(l.s)}">${esc(l.s)}</span>` : ''}
      <span class="grow">${hide ? `<span class="lx-hidden">${icon('sound', 14)} Line ${i + 1}</span>` : `${P.hz ? `<b>${esc(l.h)}</b>` : ''}${P.py && UI().roman && l.p ? `<small class="py">${esc(l.p)}</small>` : ''}${P.en ? `<small>${esc(l.e)}</small>` : ''}`}</span></button>`).join('');
  const qs = d.q.map((q, qi) => { const a = ans[qi]; return `<div class="lx-q"><b>${qi + 1}. ${esc(q.qe)}</b><button class="lx-qzh" data-act="lxSay" data-t="${esc(q.qh)}">${icon('sound', 13)}${esc(q.qh)}</button>
      <div class="lx-opts">${q.o.map((o, oi) => `<button class="${a === undefined ? '' : oi === q.a ? 'ok' : oi === a ? 'bad' : ''}" data-act="lxAns" data-d="${d.id}" data-q="${qi}" data-o="${oi}" ${a !== undefined ? 'disabled' : ''}>${esc(o)}</button>`).join('')}</div></div>`; }).join('');
  const done = d.q.length && Object.keys(ans).length === d.q.length;
  const score = d.q.filter((q, qi) => ans[qi] === q.a).length;
  return `<div class="lx-dhead"><a class="iconbtn" href="#/lang/${langId}/${lv.id}/dialogs" aria-label="Back">${icon('left', 16)}</a><div class="grow"><b class="display">${esc(d.te)}</b><small class="lx-zh">${esc(d.t)}</small></div></div>
    <div class="lx-ctrl">
      ${UI().noaudio ? '' : `<button class="btn primary" data-act="lxPlayAll">${icon(playing ? 'pause' : 'play', 15)}${playing ? 'Stop' : 'Play all'}</button>
      <span class="seg">${[0.7, 0.85, 1].map(r => `<button class="${P.speed === r ? 'on' : ''}" data-act="lxSpeed" data-r="${r}">${r === 1 ? 'Normal' : r === 0.85 ? 'Steady' : 'Slow'}</button>`).join('')}</span>`}
      <span class="seg">${UI().noaudio ? '' : `<button class="${hide ? 'on' : ''}" data-act="lxHide" data-d="${d.id}">Listen only</button>`}<button class="${P.hz ? 'on' : ''}" data-act="lxTog" data-k="hz">${esc(UI().script)}</button>${UI().roman ? `<button class="${P.py ? 'on' : ''}" data-act="lxTog" data-k="py">${esc(UI().roman)}</button>` : ''}<button class="${P.en ? 'on' : ''}" data-act="lxTog" data-k="en">English</button></span>
    </div>
    <div class="lx-lines">${lines}</div>
    ${d.q.length ? `<div class="lx-qs"><div class="ptitle"><i class="tick"></i><span class="eyebrow">Questions</span>${done ? `<span class="sp"></span><b class="num">${score} / ${d.q.length}</b>` : ''}</div>${qs}
      ${done ? `<div style="margin-top:12px;display:flex;gap:8px"><button class="btn" data-act="lxRetry" data-d="${d.id}">Try again</button></div>` : ''}</div>` : ''}`;
}

// LISTENING DRILLS
const DRILLS = [
  ['word', 'Hear the word', null],
  ['meaning', 'Hear the sentence', 'Choose what the sentence means'],
  ['dialog', 'Dialog challenge', 'Listen to a whole dialog without text, then answer'],
  ['passage', 'Listening passages', 'Longer talks and announcements']
];
function sentencesOf(data) {
  const s = [];
  data.dialogs.forEach(d => d.lines.forEach(l => s.push(l)));
  (data.passages || []).forEach(d => d.lines.forEach(l => s.push(l)));
  data.words.forEach(w => s.push(w.ex));
  (data.sentences || []).forEach(x => s.push(x));
  return s.filter(x => x && x.h && x.e);
}
function makeDrill(kind, data) {
  if (kind === 'word') return { kind, i: 0, score: 0, items: pick(data.words, 10).map(w => ({ say: w.h, ans: w, opts: shuffle([w, ...pick(data.words, 3, w)]) })) };
  if (kind === 'meaning') { const all = sentencesOf(data); return { kind, i: 0, score: 0, items: pick(all, 10).map(s => ({ say: s.h, ans: s, opts: shuffle([s, ...pick(all, 3, s)]) })) }; }
  return null;
}
function listenView(langId, lv, data, p, sub) {
  const dr = L.drill && L.drill.lv === lv.id ? L.drill : null;
  if (!dr) {
    return `<div class="lx-decks">${DRILLS.map(([k, n, d]) => { const best = p.drills[lv.id + ':' + k]; return `<button class="lx-deck" data-act="lxDrill" data-k="${k}">
      <span class="eyebrow">Listening</span><b class="display">${n}</b><small>${d || esc(UI().hear)}</small><span class="lx-dn">${best ? `Best <em>${best}</em>` : 'Not tried yet'}</span></button>`; }).join('')}</div>`;
  }
  if (dr.kind === 'dialog' || dr.kind === 'passage') {
    const list = dr.kind === 'dialog' ? data.dialogs : (data.passages || []);
    return `<div class="lx-dhead"><button class="iconbtn" data-act="lxDrillEnd" aria-label="Back">${icon('left', 16)}</button><div class="grow"><b class="display">${dr.kind === 'dialog' ? 'Dialog challenge' : 'Listening passages'}</b><small class="faint">Text starts hidden. Play, answer, then reveal.</small></div></div>
      <div class="lx-list">${list.map((d, i) => { const r = p.dlg[d.id]; return `<a class="lx-row" data-act="lxChallenge" data-href="#/lang/${langId}/${lv.id}/dialogs/${dr.kind === 'dialog' ? i : 'p' + i}" data-d="${d.id}" href="#/lang/${langId}/${lv.id}/dialogs/${dr.kind === 'dialog' ? i : 'p' + i}"><span class="lx-zh">${esc(d.t)}</span><span class="grow"><b>${esc(d.te)}</b><small>${d.lines.length} lines</small></span><span class="lx-score">${r ? `${r.score}/${r.of}` : ''}</span></a>`; }).join('')}</div>`;
  }
  if (dr.i >= dr.items.length) {
    return `<div class="lx-card done"><span class="eyebrow">Drill complete</span><b class="display">${dr.score} / ${dr.items.length}</b><p class="muted">${dr.score >= 8 ? 'Excellent listening.' : 'Words you missed go back into your Listen flashcards.'}</p>
      <div style="display:flex;gap:8px;justify-content:center;margin-top:18px"><button class="btn" data-act="lxDrillEnd">Back</button><button class="btn primary" data-act="lxDrill" data-k="${dr.kind}">Again</button></div></div>`;
  }
  const it = dr.items[dr.i]; const chosen = dr.chosen;
  const opt = (o, oi) => { const cls = chosen === undefined ? '' : o === it.ans ? 'ok' : oi === chosen ? 'bad' : ''; return `<button class="${cls}" data-act="lxPick" data-o="${oi}" ${chosen !== undefined ? 'disabled' : ''}>${dr.kind === 'word' ? `<b class="lx-ohz">${esc(o.h)}</b>${chosen !== undefined ? `<small>${esc(o.p)} · ${esc(o.m)}</small>` : ''}` : esc(o.e)}</button>`; };
  return `<div class="lx-prog"><span class="meter"><i style="width:${Math.round(dr.i / dr.items.length * 100)}%"></i></span><span class="faint num">${dr.i + 1} / ${dr.items.length}</span><button class="iconbtn" data-act="lxDrillEnd" aria-label="End">${icon('x', 16)}</button></div>
    <div class="lx-card"><div class="lx-front"><button class="lx-play" data-act="lxSay" data-t="${esc(it.say)}" aria-label="Play">${icon('sound', 34)}</button>
      <div style="display:flex;gap:8px;justify-content:center"><button class="btn sm" data-act="lxSay" data-t="${esc(it.say)}" data-slow="1">Slow</button></div>
      ${chosen !== undefined ? `<div class="lx-reveal"><b>${esc(it.ans.h)}</b><small>${esc(it.ans.p)}</small><small>${esc(it.ans.e || it.ans.m)}</small></div>` : ''}</div></div>
    <div class="lx-opts big">${it.opts.map(opt).join('')}</div>
    ${chosen !== undefined ? `<div style="display:flex;justify-content:center;margin-top:14px"><button class="btn primary" data-act="lxNext">Next</button></div>` : ''}`;
}

// GRAMMAR
function grammarList(langId, lv, data) {
  return `<div class="lx-list">${data.grammar.map((g, i) => `<a class="lx-row" href="#/lang/${langId}/${lv.id}/grammar/${i}"><span class="lx-gp">${esc(g.p)}</span><span class="grow"><b>${esc(g.t)}</b><small>${esc(g.m)}</small></span>${icon('chev', 15)}</a>`).join('')}</div>
    <div style="margin-top:14px"><button class="btn primary" data-act="lxStart" data-deck="grammar" data-mode="g">Practise grammar cards</button></div>`;
}
function grammarPoint(langId, lv, data, i) {
  const g = data.grammar[i]; if (!g) return '';
  return `<div class="lx-dhead"><a class="iconbtn" href="#/lang/${langId}/${lv.id}/grammar" aria-label="Back">${icon('left', 16)}</a><div class="grow"><b class="display">${esc(g.t)}</b></div>
      ${i > 0 ? `<a class="iconbtn" href="#/lang/${langId}/${lv.id}/grammar/${i - 1}" aria-label="Previous">${icon('up', 15)}</a>` : ''}${i < data.grammar.length - 1 ? `<a class="iconbtn" href="#/lang/${langId}/${lv.id}/grammar/${i + 1}" aria-label="Next">${icon('down', 15)}</a>` : ''}</div>
    <div class="panel lx-gram"><b class="lx-pat">${esc(g.p)}</b><p class="lx-mean">${esc(g.m)}</p><p>${esc(g.h)}</p>${g.x ? `<p class="lx-x"><b>Common mistake</b> ${esc(g.x)}</p>` : ''}
      <div class="lx-exs">${g.ex.map(e => `<button class="lx-ex" data-act="lxSay" data-t="${esc(e.h)}">${icon('sound', 15)}<span><b>${esc(e.h)}</b><small>${esc(e.p)}</small><small>${esc(e.e)}</small></span></button>`).join('')}</div></div>`;
}

// EXERCISES: choose the right form, or type it. Explanations after every answer.
const hash = t => { let h = 7; for (const c of String(t)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
const norm = s => String(s).trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.!?]$/, '');
function exerciseList(langId, lv, data, p) {
  return `<div class="lx-list">${data.exercises.map((x, i) => { const r = p.ex[x.id]; return `<a class="lx-row" href="#/lang/${langId}/${lv.id}/practice/${i}">
    <span class="lx-gp">${String(i + 1).padStart(2, '0')}</span><span class="grow"><b>${esc(x.t)}</b><small>${x.items.length} questions${x.g ? ' · ' + esc(x.g) : ''}</small></span>
    <span class="lx-score">${r ? `${r.score >= r.of * 0.8 ? icon('check', 14) : ''}${r.score}/${r.of}` : ''}</span></a>`; }).join('')}</div>`;
}
function exerciseSet(langId, lv, data, p, i) {
  const x = data.exercises[i]; if (!x) return '';
  const A = L.exa[x.id] = L.exa[x.id] || {};
  const items = x.items.map((q, qi) => {
    const a = A[qi]; const answered = a !== undefined;
    const ok = answered && (q.o ? a === q.a : (Array.isArray(q.a) ? q.a : [q.a]).some(v => norm(v) === norm(a)));
    const order = q.o ? q.o.map((o, oi) => oi).sort((x, y) => hash(q.q + x) - hash(q.q + y)) : [];
    const body = q.o ? `<div class="lx-opts">${order.map(oi => [q.o[oi], oi]).map(([o, oi]) => `<button class="${!answered ? '' : oi === q.a ? 'ok' : oi === a ? 'bad' : ''}" data-act="lxEx" data-x="${x.id}" data-q="${qi}" data-o="${oi}" ${answered ? 'disabled' : ''}>${esc(o)}</button>`).join('')}</div>`
      : `<div class="addline lx-type"><input class="field ${answered ? (ok ? 'ok' : 'bad') : ''}" data-k="ex-${x.id}-${qi}" data-enter="lxExType" data-x="${x.id}" data-q="${qi}" value="${esc(answered ? a : '')}" ${answered ? 'disabled' : ''} placeholder="Type your answer" autocomplete="off" autocapitalize="off" spellcheck="false">${answered ? '' : `<button class="btn" data-act="lxExType" data-x="${x.id}" data-q="${qi}">Check</button>`}</div>`;
    const fb = answered ? `<p class="bk-why"><b>${ok ? 'Right.' : 'Answer: ' + esc(q.o ? q.o[q.a] : (Array.isArray(q.a) ? q.a[0] : q.a))}</b> ${esc(q.e || '')}${q.h ? ` <button class="lx-qzh" data-act="lxSay" data-t="${esc(q.h)}">${icon('sound', 13)}${esc(q.h)}</button>` : ''}</p>` : '';
    return `<div class="lx-q"><b>${qi + 1}. ${esc(q.q)}</b>${q.qe ? `<small class="faint" style="display:block;margin-top:4px">${esc(q.qe)}</small>` : ''}${body}${fb}</div>`;
  }).join('');
  const n = Object.keys(A).length; const done = n === x.items.length;
  const score = x.items.filter((q, qi) => A[qi] !== undefined && (q.o ? A[qi] === q.a : (Array.isArray(q.a) ? q.a : [q.a]).some(v => norm(v) === norm(A[qi])))).length;
  return `<div class="lx-dhead"><a class="iconbtn" href="#/lang/${langId}/${lv.id}/practice" aria-label="Back">${icon('left', 16)}</a><div class="grow"><b class="display">${esc(x.t)}</b>${x.g ? `<small class="faint">${esc(x.g)}</small>` : ''}</div>
      ${i < data.exercises.length - 1 ? `<a class="btn sm" href="#/lang/${langId}/${lv.id}/practice/${i + 1}">Next set</a>` : ''}</div>
    ${x.intro ? `<p class="muted" style="margin:0 0 14px">${esc(x.intro)}</p>` : ''}
    <div class="lx-qs">${items}${done ? `<div class="lx-exdone"><b class="display">${score} / ${x.items.length}</b><span class="muted">${score === x.items.length ? 'Perfect.' : score >= x.items.length * 0.8 ? 'Strong. Review the ones you missed.' : 'Read the grammar point again, then retry.'}</span><button class="btn" data-act="lxExRetry" data-x="${x.id}">Try again</button></div>` : ''}</div>`;
}

// WORDS
function wordsView(langId, lv, data, p) {
  const q = (L.q || '').trim().toLowerCase();
  const today = DAY();
  const list = data.words.filter(w => !q || w.h.toLowerCase().includes(q) || w.p.toLowerCase().replace(/[^a-z ]/g, '').includes(q.replace(/[^a-z ]/g, '')) || w.p.toLowerCase().includes(q) || w.m.toLowerCase().includes(q));
  const st = w => { const c = p.cards[w.id + '|read']; return !c ? ['new', 'New'] : c.iv >= 21 ? ['known', 'Mastered'] : c.due <= today ? ['due', 'Due'] : ['learn', 'Learning']; };
  return `<div class="addline" style="margin:0 0 14px"><input class="field" id="lxq" value="${esc(L.q)}" placeholder="${esc(UI().search)}" autocomplete="off"></div>
    <div class="lx-words">${list.map(w => { const [c, n] = st(w); return `<button class="lx-word" data-act="lxSay" data-t="${esc(w.h)}"><b>${esc(w.h)}</b><span class="grow"><small class="py">${esc(w.p)}</small><small>${esc(w.m)}</small></span><span class="lx-st ${c}">${n}</span></button>`; }).join('')}</div>`;
}

// ACTIONS
const Lx = () => L.lang && L.level ? [L.lang.id, L.level, levelData(L.level), prog(L.lang.id)] : [];
export const LA = {
  lxLocked(el, e) { e && e.preventDefault(); toast(`${el.dataset.n} opens when you send me the material`); },
  lxLockedLevel(el) { toast(`${el.dataset.n} is locked until you finish the current levels`); },
  lxNew(el) { P.newPerDay = +el.dataset.n; saveP(); redraw(); },
  lxStart(el) {
    const [lang, lv, data, p] = Lx(); if (!data || !p) return;
    const mode = el.dataset.mode; if (mode !== 'g') { P.mode = mode; saveP(); }
    L.sess = buildSession(lang, lv, data, p, el.dataset.deck, mode);
    if (!L.sess.queue.length) { L.sess = null; toast('Nothing due right now. Well done.'); return; }
    if (!location.hash.endsWith('/cards')) location.hash = `#/lang/${lang}/${lv.id}/cards`;
    redraw(); autoplay();
  },
  lxEnd() { L.sess = null; stopSpeech(); redraw(); },
  lxFlip() { if (!L.sess || L.sess.flipped) return; L.sess.flipped = true; redraw(); const it = L.sess.queue[L.sess.i]; if (it && it.kind === 'w' && L.sess.mode !== 'listen') say(it.w.h); },
  lxRate(el) {
    const [lang, lv, data, p] = Lx(); const s = L.sess; if (!s || !p) return;
    const g = +el.dataset.g; const it = s.queue[s.i];
    const wasNew = !p.cards[it.id];
    p.cards[it.id] = rate(p.cards[it.id], g);
    if (wasNew) { p.newToday = p.newToday || {}; p.newToday[s.key] = (p.newToday[s.key] || 0) + 1; }
    if (g === 0) { s.again++; s.queue.splice(Math.min(s.queue.length, s.i + 4), 0, it); }
    s.done++; bumpDay(p); save(lang, p);
    s.i++; s.flipped = false; stopSpeech(); redraw(); autoplay();
  },
  lxSay(el, e) { if (e) e.stopPropagation(); stopSpeech(); say(el.dataset.t, el.dataset.slow ? { rate: 0.6 } : {}); },
  lxLine(el) { const [lang, lv, data] = Lx(); if (!data) return; const d = getDialog(data, location.hash.split('/').pop()); if (d) { const i = +el.dataset.i; stopSpeech(); playLines(d.lines.slice(i, i + 1).map(l => l), 0); const row = el; row.classList.add('speaking'); } },
  lxPlayAll() { if (playing) { stopSpeech(); redraw(); return; } const [lang, lv, data] = Lx(); if (!data) return; const d = getDialog(data, location.hash.split('/').pop()); if (d) { playLines(d.lines, 0, {}); redraw(); } },
  lxSpeed(el) { P.speed = +el.dataset.r; saveP(); redraw(); },
  lxTog(el) { P[el.dataset.k] = !P[el.dataset.k]; saveP(); redraw(); },
  lxHide(el) { L.reveal[el.dataset.d] = L.reveal[el.dataset.d] === false ? true : false; redraw(); },
  lxAns(el) {
    const [lang, lv, data, p] = Lx(); if (!data || !p) return;
    const id = el.dataset.d; L.answers = L.answers || {}; L.answers[id] = L.answers[id] || {};
    L.answers[id][+el.dataset.q] = +el.dataset.o;
    const d = [...data.dialogs, ...(data.passages || [])].find(x => x.id === id);
    if (d && Object.keys(L.answers[id]).length === d.q.length) {
      const score = d.q.filter((q, qi) => L.answers[id][qi] === q.a).length;
      p.dlg[id] = { score, of: d.q.length, at: Date.now() }; bumpDay(p); save(lang, p, true);
      L.reveal[id] = true;
    }
    redraw();
  },
  lxRetry(el) { if (L.answers) delete L.answers[el.dataset.d]; L.reveal[el.dataset.d] = false; redraw(); },
  lxChallenge(el) { L.reveal[el.dataset.d] = false; if (L.answers) delete L.answers[el.dataset.d]; },
  lxDrill(el) {
    const [lang, lv, data] = Lx(); if (!data) return; const k = el.dataset.k;
    if (k === 'dialog' || k === 'passage') { L.drill = { kind: k, lv: lv.id }; redraw(); return; }
    L.drill = Object.assign(makeDrill(k, data), { lv: lv.id }); redraw(); setTimeout(() => say(L.drill.items[0].say), 250);
  },
  lxDrillEnd() { L.drill = null; stopSpeech(); redraw(); },
  lxPick(el) {
    const [lang, lv, data, p] = Lx(); const dr = L.drill; if (!dr || dr.chosen !== undefined) return;
    const it = dr.items[dr.i]; dr.chosen = +el.dataset.o;
    const right = it.opts[dr.chosen] === it.ans; if (right) dr.score++;
    if (!right && dr.kind === 'word' && p) { const id = it.ans.id + '|listen'; p.cards[id] = Object.assign(p.cards[id] || { n: 0, iv: 0, ef: 2.5 }, { due: DAY() }); }
    if (dr.i === dr.items.length - 1 && p) { const k = lv.id + ':' + dr.kind; const prev = parseInt(p.drills[k] || '0', 10) || 0; p.drills[k] = Math.max(prev, dr.score) + '/' + dr.items.length; bumpDay(p); save(lang, p, true); }
    redraw();
  },
  lxEx(el) { exAnswer(el.dataset.x, +el.dataset.q, +el.dataset.o); },
  lxExType(el) { const inp = el.tagName === 'INPUT' ? el : document.querySelector(`[data-k="ex-${el.dataset.x}-${el.dataset.q}"]`); if (!inp || !inp.value.trim()) return; exAnswer(el.dataset.x, +el.dataset.q, inp.value.trim()); },
  lxExRetry(el) { L.exa[el.dataset.x] = {}; redraw(); },
  lxNext() { const dr = L.drill; if (!dr) return; dr.i++; dr.chosen = undefined; redraw(); if (dr.i < dr.items.length) setTimeout(() => say(dr.items[dr.i].say), 200); }
};
function exAnswer(xid, qi, a) {
  const [lang, lv, data, p] = Lx(); if (!data || !p) return;
  const x = data.exercises.find(e => e.id === xid); if (!x) return;
  const A = L.exa[xid] = L.exa[xid] || {}; if (A[qi] !== undefined) return; A[qi] = a;
  const q = x.items[qi]; if (q.h && (q.o ? a === q.a : true)) say(q.h);
  if (Object.keys(A).length === x.items.length) {
    const score = x.items.filter((q, i) => q.o ? A[i] === q.a : (Array.isArray(q.a) ? q.a : [q.a]).some(v => norm(v) === norm(A[i]))).length;
    const prev = p.ex[xid]; if (!prev || score >= prev.score) p.ex[xid] = { score, of: x.items.length, at: Date.now() };
    bumpDay(p); save(lang, p, true);
  }
  redraw();
}
function autoplay() { const s = L.sess; if (!s) return; const it = s.queue[s.i]; if (it && it.kind === 'w' && s.mode === 'listen') setTimeout(() => say(it.w.h), 250); }

// search box and keyboard shortcuts for flashcards
let qT = null;
document.addEventListener('input', e => { if (e.target.id === 'lxq') { L.q = e.target.value; clearTimeout(qT); qT = setTimeout(() => { redraw(); setTimeout(() => { const i = document.getElementById('lxq'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 0); }, 200); } });
document.addEventListener('keydown', e => {
  if (!L.sess || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || !location.hash.includes('/cards')) return;
  if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!L.sess.flipped) LA.lxFlip(); }
  else if (L.sess.flipped && '1234'.includes(e.key)) { e.preventDefault(); LA.lxRate({ dataset: { g: String(+e.key - 1) } }); }
});
window.addEventListener('hashchange', () => { stopSpeech(); });

// Home screen shelf: languages with today's due cards, and books with where you left off.
export function homeLearning() {
  const idx = catalog(redraw);
  if (!idx || idx.__error) return `<p class="empty">${idx ? 'Sign in online once to unlock your courses.' : 'Opening your courses'}</p>`;
  const today = DAY();
  const tiles = [];
  idx.languages.filter(l => !l.locked).forEach(l => {
    const p = prog(l.id); let due = 0;
    (l.levels || []).filter(v => !v.locked).forEach(v => { const d = peek(v.file, v.v, redraw); if (d && !d.__error && p) d.words.forEach(w => { const c = p.cards[w.id + '|read']; if (c && c.due <= today) due++; }); });
    tiles.push(`<a class="doc" href="#/lang/${l.id}"><span class="bar"></span><div><span class="kind">Language</span><span class="dtitle">${esc(l.name)} ${esc(l.native)}</span></div><span class="dmeta"><span>${due ? due + ' cards due' : 'Practise today'}</span><span>${p ? streak(p) + ' day streak' : ''}</span></span></a>`);
  });
  return `<div class="docs">${tiles.join('')}</div>`;
}
