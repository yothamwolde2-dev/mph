// MPH Plan: month focus, the week's Big 3, a to do list for the week, every day's plan, and a weekly review.
// Built on a simple cascade: a few outcomes for the month, three goals that move them this week,
// and each day's short list with up to three top priorities. Everything you do not finish is easy to carry over.
import { esc, icon, uid, today, addDays, parseD, dkey, fmtShort, isoWeek, weekKey, weekStart, weekRange, relDay, walk, locate, pathTo } from './core.js?v=0.9.2';
import { store, mutate } from './store.js?v=0.9.2';
import { occurrences, nextTime, fromLocal, REPEATS } from './remind.js?v=0.9.2';
import { N, TZ, pushOn } from './notify.js?v=0.9.2';

const S = () => store.state;
const redraw = () => window.dispatchEvent(new Event('mph:redraw'));
const toast = (t, undo) => window.dispatchEvent(new CustomEvent('mph:toast', { detail: { text: t, undo } }));
const ptitle = (label, link, href) => `<div class="ptitle"><i class="tick"></i><span class="eyebrow">${label}</span><span class="sp"></span>${link ? `<a class="link" href="${href}">${link}</a>` : ''}</div>`;
const DAYN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// UI state for the Plan page and home widgets
export const PL = { off: 0, day: null, open: {}, cal: 0, drag: null };

// WEEK MATH
function weekOf(off) {
  const base = new Date(); base.setDate(base.getDate() + off * 7);
  const ws = weekStart(base); const start = dkey(ws);
  const days = [0, 1, 2, 3, 4, 5, 6].map(i => addDays(start, i));
  const mid = parseD(days[3]);
  return { wk: weekKey(base), start, end: days[6], days, iso: isoWeek(base), ws, mk: `${mid.getFullYear()}-${String(mid.getMonth() + 1).padStart(2, '0')}`, month: MONTHS[mid.getMonth()] };
}
export const weekOffsetFor = d => Math.round((weekStart(parseD(d)) - weekStart(new Date())) / (7 * 86400000));

// WHAT IS ON A DAY: your tasks, project reminders, and project items due
function nodeTitle(id) { const tr = pathTo(S().areas, id); return tr ? { t: tr[tr.length - 1].t, ctx: tr.slice(0, -1).map(n => n.t).slice(-2).join(' · ') } : null; }
export function dayItems(d) {
  const tasks = S().tasks.filter(t => t.d === d);
  const rems = [], dues = [];
  walk(S().areas, (n, path) => {
    if (n.due === d) dues.push({ id: n.id, x: n.t, done: n.st === 'Done', ctx: path.map(p => p.t).slice(-2).join(' · ') });
    (n.r || []).forEach(r => { if (r.d === d) rems.push({ id: r.id, nid: n.id, x: r.x, done: !!r.done, ctx: [...path, n].map(p => p.t).slice(-2).join(' · ') }); });
  });
  tasks.sort((a, b) => (a.done - b.done) || ((b.star ? 1 : 0) - (a.star ? 1 : 0)) || ((a.o ?? a.at) - (b.o ?? b.at)));
  return { tasks, rems, dues };
}
const weekList = w => S().tasks.filter(t => !t.d && (t.wk === w.wk || (!t.wk && PL.off === 0 && w.wk === weekKey())));
const lateTasks = () => { const t = today(); return S().tasks.filter(x => x.d && x.d < t && !x.done); };
export const openToday = () => { const t = today(); const it = dayItems(t); return it.tasks.filter(x => !x.done).length + it.rems.filter(x => !x.done).length + it.dues.filter(x => !x.done).length + lateTasks().length; };

// ROWS
function taskRow(t, opts = {}) {
  const link = t.src ? nodeTitle(t.src) : null;
  const meta = [link && link.ctx, opts.late && t.d ? 'From ' + relDay(t.d) : ''].filter(Boolean).join(' · ');
  return `<div class="pl-task ${t.done ? 'done' : ''} ${t.star ? 'star' : ''}" draggable="true" data-task="${t.id}">
    <button class="check ${t.done ? 'on' : ''}" data-act="plToggle" data-id="${t.id}" aria-label="${t.done ? 'Mark not done' : 'Mark done'}">${t.done ? icon('check', 13) : ''}</button>
    <div class="grow">${PL.edit === t.id ? `<input class="inline pl-x" data-k="edit-${t.id}" data-chg="plEdit" data-enter="plEditDone" data-id="${t.id}" value="${esc(t.x)}" aria-label="Task">` : `<span class="pl-t" data-act="plEditStart" data-id="${t.id}">${esc(t.x)}</span>`}${meta ? `<small>${esc(meta)}</small>` : ''}</div>
    <button class="pl-star ${t.star ? 'on' : ''}" data-act="plStar" data-id="${t.id}" aria-label="${t.star ? 'Remove from top priorities' : 'Make a top priority'}" title="Top priority">${icon('star', 14)}</button>
    <button class="iconbtn pl-more" data-act="plMenu" data-id="${t.id}" aria-label="Move or delete">${icon('dots', 15)}</button>
  </div>`;
}
const remRow = r => `<div class="pl-task rem ${r.done ? 'done' : ''}"><button class="check ${r.done ? 'on' : ''}" data-act="toggleAgenda" data-kind="rem" data-id="${r.id}" data-nid="${r.nid}" aria-label="Done">${r.done ? icon('check', 13) : ''}</button><div class="grow" data-act="openNode" data-id="${r.nid}"><span class="pl-t">${esc(r.x)}</span><small>${icon('bell', 11)} ${esc(r.ctx)}</small></div></div>`;
const dueRow = n => `<div class="pl-task due ${n.done ? 'done' : ''}"><button class="check ${n.done ? 'on' : ''}" data-act="toggleAgenda" data-kind="node" data-id="${n.id}" aria-label="Done">${n.done ? icon('check', 13) : ''}</button><div class="grow" data-act="openNode" data-id="${n.id}"><span class="pl-t">${esc(n.x)}</span><small>Due · ${esc(n.ctx)}</small></div></div>`;

// REMINDERS: a time, a text, and how often. They ring on the phone and the Mac (see notify.js).
const hhmm = ms => { const d = new Date(ms); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
const dayOf = ms => dkey(new Date(ms));
const repName = r => (REPEATS.find(x => x[0] === (r.rep || '')) || REPEATS[0])[1];
export function remsOnDay(d) {
  const [y, m, dd] = d.split('-').map(Number); const a = fromLocal(y, m, dd, 0, 0, TZ) - 1, b = a + 864e5;
  const out = [];
  for (const r of S().reminders || []) {
    if (!r.rep) { if (r.at > a && r.at <= b) out.push({ r, at: r.at }); continue; }
    for (const at of occurrences(r, a, b, TZ, 3)) out.push({ r, at });
  }
  return out.sort((x, y) => x.at - y.at);
}
// Upcoming: one off reminders not done (overdue first), and the next time of each repeating one.
export function upcoming() {
  const now = Date.now(); const out = [];
  for (const r of S().reminders || []) {
    if (!r.rep) { if (!r.done) out.push({ r, at: r.at, late: r.at < now - 60000 }); continue; }
    if (r.done) continue;
    const at = nextTime(r, now, TZ); if (at) out.push({ r, at });
  }
  return out.sort((x, y) => x.at - y.at);
}
const whenLabel = at => { const d = dayOf(at); const t = today(); return d === t ? 'Today' : d === addDays(t, 1) ? 'Tomorrow' : d < t ? relDay(d) : (d <= addDays(t, 6) ? DAYN[(new Date(at).getDay() + 6) % 7] + ' ' + new Date(at).getDate() : fmtShort(d)); };
function remRowT({ r, at, late }, compact) {
  const link = r.t ? S().tasks.find(x => x.id === r.t) : null;
  const meta = [r.rep ? repName(r) : (late ? 'Missed' : ''), link && link.x !== r.x ? link.x : ''].filter(Boolean).join(' · ');
  return `<div class="rm-row ${late ? 'late' : ''} ${compact ? 'compact' : ''} ${r.done ? 'done' : ''}">
    <button class="rm-when" data-act="rmEdit" data-id="${r.id}" aria-label="Change reminder"><b class="num">${hhmm(at)}</b>${compact ? '' : `<small>${esc(whenLabel(at))}</small>`}</button>
    <div class="grow" data-act="rmEdit" data-id="${r.id}"><span class="rm-x">${esc(r.x)}</span><small>${icon('bell', 11)}${meta ? esc(meta) : 'Reminder'}</small></div>
    ${r.rep ? '' : `<button class="check ${r.done ? 'on' : ''}" data-act="rmDone" data-id="${r.id}" aria-label="${r.done ? 'Not done' : 'Done'}">${r.done ? icon('check', 13) : ''}</button>`}
  </div>`;
}
function remindersPanel() {
  const list = upcoming(); const t = today();
  const later = list.filter(x => dayOf(x.at) > addDays(t, 6));
  const soon = list.filter(x => dayOf(x.at) <= addDays(t, 6));
  const nchip = N.state === 'on' ? `<span class="rm-chip on">${icon('bell', 12)}On this device</span>`
    : N.state === 'unsupported' || N.state === 'blocked' ? `<a class="rm-chip" href="#/settings">${icon('bell', 12)}Set up alerts</a>`
    : `<button class="btn sm primary" data-act="rmPushOn">${icon('bell', 13)}Turn on notifications</button>`;
  const h = new Date(); h.setMinutes(0, 0, 0); h.setHours(h.getHours() + 1);
  return `<section class="panel pl-rems">
    <div class="ptitle"><i class="tick"></i><span class="eyebrow">Reminders · ${list.length}</span><span class="sp"></span>${nchip}</div>
    <div class="rm-list">${soon.map(x => remRowT(x)).join('') || `<p class="empty">Nothing to remind you of this week. Add one below, or open a task's menu and choose Remind me.</p>`}
      ${later.length ? `<details class="rm-later"><summary>${later.length} later</summary>${later.map(x => remRowT(x)).join('')}</details>` : ''}</div>
    <div class="rm-add">
      <input class="field rm-ax" data-k="rm-new" data-enter="rmAdd" placeholder="Remind me to">
      <input class="field rm-ad" type="date" data-k="rm-date" value="${t}" aria-label="Day">
      <input class="field rm-at" type="time" data-k="rm-time" value="${hhmm(h)}" aria-label="Time">
      <select class="field rm-ar" data-k="rm-rep" aria-label="Repeat">${REPEATS.map(([v, n]) => `<option value="${v}">${n}</option>`).join('')}</select>
      <button class="btn primary" data-act="rmAdd">Add</button>
    </div>
  </section>`;
}
export function reminderModal(m) {
  const r = m.id ? (S().reminders || []).find(x => x.id === m.id) : null;
  const at = r ? (r.rep ? r.at : r.at) : m.at; const d = new Date(at);
  const wrap = (title, body, foot) => `<div class="scrim" data-act="modalClose"></div><div class="modal" role="dialog" aria-label="${esc(title)}"><h2 class="display">${esc(title)}</h2>${body}<div class="foot">${foot}</div></div>`;
  return wrap(r ? 'Reminder' : 'Remind me', `<div class="stack">
      <label><span class="label">What</span><input class="field" data-m="rx" data-enter="rmSave" value="${esc(r ? r.x : m.x || '')}" placeholder="Call Ato Daniel about the samples"></label>
      <div class="two"><label><span class="label">Day</span><input class="field" type="date" data-m="rd" value="${dkey(d)}"></label><label><span class="label">Time</span><input class="field" type="time" data-m="rt" value="${hhmm(at)}"></label></div>
      <label><span class="label">Repeat</span><select class="field" data-m="rr">${REPEATS.map(([v, n]) => `<option value="${v}" ${(r ? r.rep || '' : '') === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <div class="rm-quick">${[['In 10 minutes', 10], ['In 1 hour', 60], ['Tonight 20:00', 'eve'], ['Tomorrow 09:00', 'tom']].map(([n, v]) => `<button class="btn sm" data-act="rmQuick" data-v="${v}">${n}</button>`).join('')}</div>
      ${N.state !== 'on' ? `<p class="faint" style="font-size:12px;margin:0">To be reminded when MPH is closed, turn on notifications in Settings on each device.</p>` : ''}
    </div>`, `${r ? `<button class="btn ghost" data-act="rmDel" data-id="${r.id}">${icon('trash', 14)}Delete</button><span style="flex:1"></span>` : ''}<button class="btn ghost" data-act="modalClose">Cancel</button><button class="btn primary" data-act="rmSave" data-id="${r ? r.id : ''}" data-t="${esc(m.t || (r && r.t) || '')}">Save</button>`);
}
const openRem = detail => window.dispatchEvent(new CustomEvent('mph:modal', { detail: Object.assign({ type: 'reminder' }, detail) }));
const atFrom = (d, t) => { const [y, m, dd] = d.split('-').map(Number); const [h, mi] = (t || '09:00').split(':').map(Number); return new Date(y, m - 1, dd, h, mi || 0).getTime(); };

// PLAN PAGE
export function planView() {
  const w = weekOf(PL.off); const t = today(); const st = S();
  const mg = (st.mgoals || {})[w.mk] || []; const g = st.goals[w.wk] || [];
  const mDone = mg.filter(x => x.done).length; const gDone = g.filter(x => x.done).length;
  const thisWeek = PL.off === 0;
  const head = `<div class="phead"><div><span class="eyebrow">Work</span><h1 class="display" style="margin-top:10px">Plan</h1><p class="muted">Week ${w.iso.week} · ${esc(weekRange(w.ws))} ${w.iso.year}</p></div>
    <div class="acts weeknav"><button class="iconbtn" data-act="plWeek" data-d="-1" aria-label="Previous week">${icon('left', 16)}</button><button class="btn ${thisWeek ? 'primary' : ''}" data-act="plWeek" data-d="0">This week</button><button class="iconbtn" data-act="plWeek" data-d="1" aria-label="Next week">${icon('chev', 16)}</button></div></div>`;

  const month = `<section class="pl-month">
    <div class="pl-mh"><span class="eyebrow">${esc(w.month)} focus</span><span class="pl-score"><b class="num">${mDone}</b>/${mg.length || 0}</span></div>
    <div class="pl-mgoals">${mg.map((x, i) => `<div class="pl-mg ${x.done ? 'done' : ''}"><span class="num">${i + 1}</span>${PL.edit === x.id ? `<input class="inline" data-k="edit-${x.id}" data-enter="plEditDone" data-chg="plMgEdit" data-m="${w.mk}" data-id="${x.id}" value="${esc(x.x)}" aria-label="Month goal">` : `<span class="pl-gt" data-act="plEditStart" data-id="${x.id}">${esc(x.x)}</span>`}<button class="check ${x.done ? 'on' : ''}" data-act="plMgToggle" data-m="${w.mk}" data-id="${x.id}" aria-label="Done">${x.done ? icon('check', 13) : ''}</button><button class="iconbtn" data-act="plMgDel" data-m="${w.mk}" data-id="${x.id}" aria-label="Remove">${icon('x', 13)}</button></div>`).join('')}
      ${mg.length < 5 ? `<div class="pl-mg add"><input class="inline" data-k="mg-${w.mk}" data-enter="plMgAdd" data-m="${w.mk}" placeholder="${mg.length ? 'Another outcome for the month' : 'What must be true by the end of the month'}"></div>` : ''}</div>
  </section>`;

  const big3 = `<section class="panel pl-big3">${ptitle(`Big 3 for the week · ${gDone}/${g.length}`)}
    ${g.map((x, i) => `<div class="pl-goal ${x.done ? 'done' : ''}"><span class="pl-n">${i + 1}</span><div class="grow">${PL.edit === x.id ? `<input class="inline" data-k="edit-${x.id}" data-enter="plEditDone" data-chg="goalEdit" data-w="${w.wk}" data-id="${x.id}" value="${esc(x.x)}" aria-label="Goal">` : `<span class="pl-gt" data-act="plEditStart" data-id="${x.id}">${esc(x.x)}</span>`}
        ${mg.length ? `<select class="pl-link" data-chg="plGoalLink" data-w="${w.wk}" data-id="${x.id}" aria-label="Supports month goal"><option value="">Supports a month goal</option>${mg.map((m, j) => `<option value="${m.id}" ${x.m === m.id ? 'selected' : ''}>Month goal ${j + 1}: ${esc(m.x)}</option>`).join('')}</select>` : ''}</div>
        <button class="check ${x.done ? 'on' : ''}" data-act="goalToggle" data-w="${w.wk}" data-id="${x.id}" aria-label="Done">${x.done ? icon('check', 13) : ''}</button>
        <button class="iconbtn" data-act="goalDel" data-w="${w.wk}" data-id="${x.id}" aria-label="Remove goal">${icon('x', 13)}</button></div>`).join('')}
    ${g.length < 3 ? `<div class="addline"><input class="field" data-k="goal-plan" data-enter="goalAdd" data-w="${w.wk}" placeholder="${g.length ? 'Next goal for this week' : 'The one result that would make this week a success'}"><button class="btn" data-act="goalAdd" data-w="${w.wk}">Add</button></div>` : `<p class="faint pl-hint">Three is the limit on purpose. Finish one before adding more.</p>`}
  </section>`;

  const wl = weekList(w);
  const wlist = `<section class="panel pl-wlist" data-dropweek="${w.wk}">${ptitle(`This week · to do · ${wl.filter(x => !x.done).length}`)}
    ${wl.map(x => taskRow(x)).join('') || `<p class="empty">Things to do some time this week. Drag them onto a day when you know when.</p>`}
    <div class="addline"><input class="field" data-k="wl-${w.wk}" data-enter="plAddWeek" data-w="${w.wk}" placeholder="Add to this week"><button class="btn" data-act="plAddWeek" data-w="${w.wk}">Add</button></div>
  </section>`;

  const late = thisWeek ? lateTasks() : [];
  const board = `<section class="pl-board">${w.days.map((d, i) => {
    const it = dayItems(d); const isT = d === t; const past = d < t;
    const open = it.tasks.filter(x => !x.done).length + it.rems.filter(x => !x.done).length + it.dues.filter(x => !x.done).length;
    const total = it.tasks.length + it.rems.length + it.dues.length;
    const collapsed = PL.open[d] === undefined ? (past && !isT) : !PL.open[d];
    const lateHere = isT ? late.filter(x => x.d !== t) : [];
    const sel = PL.day === d;
    return `<div class="pl-day ${isT ? 'today' : ''} ${past ? 'past' : ''} ${collapsed ? 'shut' : ''} ${sel ? 'sel' : ''}" data-dropday="${d}" id="day-${d}">
      <button class="pl-dh" data-act="plDay" data-d="${d}"><span class="pl-dn">${DAYN[i]}</span><b class="num">${parseD(d).getDate()}</b><span class="pl-dc">${isT ? 'Today' : total ? `${total - open}/${total}` : ''}</span></button>
      <div class="pl-db">
        ${lateHere.length ? `<div class="pl-late"><span>${lateHere.length} from earlier days</span><button class="btn sm" data-act="plCarry">Move to today</button></div>${lateHere.map(x => taskRow(x, { late: true })).join('')}` : ''}
        ${remsOnDay(d).map(x => remRowT(x, true)).join('')}${it.tasks.map(x => taskRow(x)).join('')}${it.rems.map(remRow).join('')}${it.dues.map(dueRow).join('')}
        <input class="field pl-add" data-k="day-${d}" data-enter="plAdd" data-d="${d}" placeholder="${isT ? 'Add to today' : 'Add'}">
      </div></div>`;
  }).join('')}</section>`;

  const rv = (st.review || {})[w.wk] || {}; const legacy = st.reflections[w.wk] || '';
  const allT = w.days.flatMap(d => dayItems(d).tasks).concat(wl);
  const tDone = allT.filter(x => x.done).length;
  const review = `<section class="panel pl-review">${ptitle('Weekly review')}
    <div class="pl-figs"><div><b class="num">${gDone}/${g.length}</b><span>Big 3 done</span></div><div><b class="num">${tDone}/${allT.length}</b><span>Tasks done</span></div><div><b class="num">${mDone}/${mg.length}</b><span>${esc(w.month)} goals</span></div></div>
    <div class="pl-qs">
      <label><span class="label">What went well</span><textarea class="field" rows="3" data-chg="plReview" data-w="${w.wk}" data-q="wins" placeholder="Wins, finished work, good decisions">${esc(rv.wins ?? legacy)}</textarea></label>
      <label><span class="label">What got in the way</span><textarea class="field" rows="3" data-chg="plReview" data-w="${w.wk}" data-q="stuck" placeholder="Blockers, distractions, what to change">${esc(rv.stuck || '')}</textarea></label>
      <label><span class="label">Focus for next week</span><textarea class="field" rows="3" data-chg="plReview" data-w="${w.wk}" data-q="next" placeholder="The first things to plan next week">${esc(rv.next || '')}</textarea></label>
    </div></section>`;

  return `${head}${month}<div class="pl-top">${big3}${wlist}</div>${remindersPanel()}${board}${review}`;
}

// HOME WIDGETS
export const HW = {
  today() {
    const t = today(); const it = dayItems(t); const late = lateTasks();
    const rows = remsOnDay(t).filter(x => !x.r.done).map(x => remRowT(x, true)).join('') + late.map(x => taskRow(x, { late: true })).join('') + it.tasks.map(x => taskRow(x)).join('') + it.rems.map(remRow).join('') + it.dues.map(dueRow).join('');
    const n = it.tasks.filter(x => !x.done).length + late.length;
    return ptitle(`Today · ${n} open`, 'Open plan', '#/plan') + `<div class="pl-list" data-dropday="${t}">${rows || `<p class="empty">A clear day. Add what matters most, then star up to three.</p>`}</div>
      <div class="addline"><input class="field" data-k="home-today" data-enter="plAdd" data-d="${t}" placeholder="Add a task for today"><button class="btn" data-act="plAdd" data-d="${t}">Add</button></div>`;
  },
  calendar() {
    const now = new Date(); const first = new Date(now.getFullYear(), now.getMonth() + PL.cal, 1);
    const y = first.getFullYear(), m = first.getMonth(); const t = today();
    const lead = (first.getDay() + 6) % 7; const daysIn = new Date(y, m + 1, 0).getDate();
    const busy = {};
    S().tasks.forEach(x => { if (x.d && !x.done) busy[x.d] = (busy[x.d] || 0) + 1; });
    walk(S().areas, n => { if (n.due && n.st !== 'Done') busy[n.due] = (busy[n.due] || 0) + 1; (n.r || []).forEach(r => { if (!r.done) busy[r.d] = (busy[r.d] || 0) + 1; }); });
    let cells = ''; for (let i = 0; i < lead; i++) cells += '<span></span>';
    for (let d = 1; d <= daysIn; d++) {
      const k = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells += `<button class="cal-d ${k === t ? 'today' : ''} ${k < t ? 'past' : ''}" data-act="plGoDay" data-d="${k}" aria-label="${esc(fmtShort(k))}${busy[k] ? ', ' + busy[k] + ' planned' : ''}"><span>${d}</span>${busy[k] ? `<i class="${busy[k] > 2 ? 'many' : ''}"></i>` : ''}</button>`;
    }
    return `<div class="ptitle"><i class="tick"></i><span class="eyebrow">${MONTHS[m]} ${y}</span><span class="sp"></span>
      <button class="iconbtn sm" data-act="plCal" data-d="-1" aria-label="Previous month">${icon('left', 14)}</button>${PL.cal ? `<button class="link" data-act="plCal" data-d="0">Today</button>` : ''}<button class="iconbtn sm" data-act="plCal" data-d="1" aria-label="Next month">${icon('chev', 14)}</button></div>
      <div class="cal"><div class="cal-h">${DAYN.map(d => `<span>${d.slice(0, 1)}</span>`).join('')}</div><div class="cal-g">${cells}</div></div>`;
  },
  notes() {
    const ns = S().notes || [];
    return ptitle('Notes') + `<div class="sticky-grid">${ns.map(n => `<div class="sticky c-${esc(n.c || 'green')}">
        <textarea data-chg="noteEdit" data-id="${n.id}" rows="5" aria-label="Note" placeholder="Write anything">${esc(n.x)}</textarea>
        <div class="sticky-a"><button data-act="noteColor" data-id="${n.id}" aria-label="Change colour"><i></i></button><button data-act="noteDel" data-id="${n.id}" aria-label="Delete note">${icon('x', 13)}</button></div></div>`).join('')}
      <button class="sticky add" data-act="noteAdd">${icon('plus', 18)}<span>New note</span></button></div>`;
  }
};

// MENU for a task: move it around the week, or delete it
export function taskMenu(id) {
  const tk = S().tasks.find(x => x.id === id); if (!tk) return '';
  const w = weekOf(PL.off); const t = today();
  const b = (to, label, on) => `<button data-act="plMove" data-id="${id}" data-to="${to}" class="${on ? 'on' : ''}">${label}</button>`;
  return `<span class="menu-k">Move to</span>
    ${b(t, 'Today', tk.d === t)}${b(addDays(t, 1), 'Tomorrow', tk.d === addDays(t, 1))}
    <div class="menu-days">${w.days.map((d, i) => `<button data-act="plMove" data-id="${id}" data-to="${d}" class="${tk.d === d ? 'on' : ''} ${d === t ? 'today' : ''}">${DAYN[i].slice(0, 2)}<b>${parseD(d).getDate()}</b></button>`).join('')}</div>
    ${b('week', 'This week, any day', !tk.d && (tk.wk || '') === w.wk)}${b('next', 'Next week')}
    <div class="sep"></div><button data-act="rmForTask" data-id="${id}">${icon('bell', 14)}Remind me</button>
    <div class="sep"></div><button data-act="plDel" data-id="${id}">${icon('trash', 14)}Delete task</button>`;
}
// MENU for a project item: add it to the plan
export function addTaskMenu(nid) {
  const t = today();
  return `<span class="menu-k">Add to tasks</span>
    <button data-act="plFromNode" data-id="${nid}" data-to="${t}">${icon('star', 14)}Today</button>
    <button data-act="plFromNode" data-id="${nid}" data-to="${addDays(t, 1)}">Tomorrow</button>
    <button data-act="plFromNode" data-id="${nid}" data-to="week">This week</button>`;
}
export const nodeInPlan = id => S().tasks.some(x => x.src === id && !x.done);

// ACTIONS
const close = () => window.dispatchEvent(new Event('mph:closemenu'));
const fresh = (x, extra) => Object.assign({ id: uid('t'), x, d: '', wk: '', done: false, star: false, at: Date.now() }, extra);
function addFrom(el, extra) {
  const inp = el.tagName === 'INPUT' ? el : (el.closest('.addline, .pl-db') || document).querySelector('input'); if (!inp) return;
  const x = inp.value.trim(); if (!x) return; inp.value = '';
  window.dispatchEvent(new CustomEvent('mph:focus', { detail: inp.dataset.k }));
  mutate(s => s.tasks.push(fresh(x, extra)));
}
function setDone(s, tk, done) {
  tk.done = done; tk.at = Date.now();
  if (tk.src) { const f = locate(s.areas, tk.src); if (f) { if (done && f.node.st !== 'Done') { tk.prevSt = f.node.st; f.node.st = 'Done'; } else if (!done && f.node.st === 'Done') f.node.st = tk.prevSt || 'In Progress'; } }
}
export const PA = {
  rmPushOn() { pushOn().then(redraw); },
  rmAdd(el) {
    const box = (el.closest && el.closest('.rm-add')) || document.querySelector('.rm-add'); if (!box) return;
    const x = box.querySelector('.rm-ax').value.trim(); if (!x) { box.querySelector('.rm-ax').focus(); return; }
    const at = atFrom(box.querySelector('.rm-ad').value || today(), box.querySelector('.rm-at').value);
    const rep = box.querySelector('.rm-ar').value;
    window.dispatchEvent(new CustomEvent('mph:focus', { detail: 'rm-new' }));
    mutate(s => { s.reminders = s.reminders || []; s.reminders.push({ id: uid('r'), x, at, rep, done: false, created: Date.now() }); });
    toast(`Reminder set for ${whenLabel(at).toLowerCase() === 'today' ? 'today' : whenLabel(at)} at ${hhmm(at)}`, true);
  },
  rmEdit(el) { openRem({ id: el.dataset.id }); },
  rmForTask(el) {
    close(); const tk = S().tasks.find(x => x.id === el.dataset.id); if (!tk) return;
    const d = tk.d && tk.d >= today() ? tk.d : today();
    const h = new Date(); h.setMinutes(0, 0, 0); h.setHours(h.getHours() + 1);
    openRem({ x: tk.x, t: tk.id, at: d === today() ? h.getTime() : atFrom(d, '09:00') });
  },
  rmQuick(el) {
    const v = el.dataset.v; const now = new Date(); let at;
    if (v === 'eve') { at = new Date(now); at.setHours(20, 0, 0, 0); if (at < now) at.setDate(at.getDate() + 1); }
    else if (v === 'tom') { at = new Date(now); at.setDate(at.getDate() + 1); at.setHours(9, 0, 0, 0); }
    else at = new Date(now.getTime() + (+v) * 60000);
    const q = k => document.querySelector(`[data-m="${k}"]`);
    if (q('rd')) q('rd').value = dkey(at); if (q('rt')) q('rt').value = hhmm(at.getTime());
  },
  rmSave(el) {
    const q = k => document.querySelector(`[data-m="${k}"]`);
    const x = (q('rx').value || '').trim(); if (!x) { q('rx').focus(); return; }
    const at = atFrom(q('rd').value || today(), q('rt').value); const rep = q('rr').value;
    const id = el.dataset.id; const t = el.dataset.t || '';
    window.dispatchEvent(new Event('mph:closemodal'));
    mutate(s => {
      s.reminders = s.reminders || [];
      const r = id && s.reminders.find(z => z.id === id);
      if (r) Object.assign(r, { x, at, rep, done: false });
      else s.reminders.push({ id: uid('r'), x, at, rep, done: false, t, created: Date.now() });
    });
    toast(`Reminder set for ${whenLabel(at)} at ${hhmm(at)}`, true);
  },
  rmDone(el) { mutate(s => { const r = (s.reminders || []).find(z => z.id === el.dataset.id); if (r) r.done = !r.done; }); },
  rmDel(el) { window.dispatchEvent(new Event('mph:closemodal')); mutate(s => { s.reminders = (s.reminders || []).filter(z => z.id !== el.dataset.id); }); toast('Reminder deleted', true); },
  rmSnooze(el) {
    const src = (S().reminders || []).find(z => z.id === el.dataset.id); const x = src ? src.x : el.dataset.x;
    mutate(s => { if (src && !src.rep) src.done = true; s.reminders.push({ id: uid('r'), x, at: Date.now() + 10 * 60000, rep: '', done: false, created: Date.now() }); });
    window.dispatchEvent(new Event('mph:unring')); toast('Snoozed for 10 minutes');
  },
  plEditStart(el) { PL.edit = el.dataset.id; window.dispatchEvent(new CustomEvent('mph:focus', { detail: 'edit-' + el.dataset.id })); redraw(); },
  plEditDone(el) { el.blur(); },
  plWeek(el) { const d = +el.dataset.d; PL.off = d === 0 ? 0 : PL.off + d; PL.day = null; redraw(); },
  plDay(el) { const d = el.dataset.d; const cur = PL.open[d] === undefined ? !(d < today()) : PL.open[d]; PL.open[d] = !cur; redraw(); },
  plGoDay(el) { const d = el.dataset.d; PL.off = weekOffsetFor(d); PL.day = d; PL.open[d] = true; location.hash = '#/plan'; setTimeout(() => { const c = document.getElementById('day-' + d); if (c) c.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 80); },
  plCal(el) { const d = +el.dataset.d; PL.cal = d === 0 ? 0 : PL.cal + d; redraw(); },
  plAdd(el) { addFrom(el, { d: el.dataset.d }); },
  plAddWeek(el) { addFrom(el, { wk: el.dataset.w }); },
  plToggle(el) { mutate(s => { const tk = s.tasks.find(x => x.id === el.dataset.id); if (tk) setDone(s, tk, !tk.done); }); },
  plStar(el) {
    const tk = S().tasks.find(x => x.id === el.dataset.id); if (!tk) return;
    if (!tk.star && tk.d) { const n = S().tasks.filter(x => x.d === tk.d && x.star && !x.done).length; if (n >= 3) toast('Three top priorities for a day is plenty. Finish one first.'); }
    mutate(s => { const t = s.tasks.find(x => x.id === el.dataset.id); if (t) t.star = !t.star; });
  },
  plMenu(el, e) { window.dispatchEvent(new CustomEvent('mph:menu', { detail: { type: 'task', id: el.dataset.id, e } })); },
  addToTask(el, e) { window.dispatchEvent(new CustomEvent('mph:menu', { detail: { type: 'addtask', id: el.dataset.id, e } })); },
  plMove(el) { move(el.dataset.id, el.dataset.to); close(); },
  plDel(el) { mutate(s => { s.tasks = s.tasks.filter(x => x.id !== el.dataset.id); }); close(); toast('Task deleted', true); },
  plCarry() { const t = today(); mutate(s => s.tasks.forEach(x => { if (x.d && x.d < t && !x.done) x.d = t; })); toast('Moved to today', true); },
  plFromNode(el) {
    const id = el.dataset.id; const to = el.dataset.to; const f = locate(S().areas, id); if (!f) return;
    if (S().tasks.some(x => x.src === id && !x.done)) { close(); toast('Already in your plan. Moved it.'); const tk = S().tasks.find(x => x.src === id && !x.done); move(tk.id, to); return; }
    mutate(s => s.tasks.push(fresh(f.node.t, to === 'week' ? { wk: weekKey(), src: id } : { d: to, src: id })));
    close(); toast(to === 'week' ? 'Added to this week' : to === today() ? 'Added to today' : 'Added to tomorrow', true);
  },
  plMgAdd(el) { const x = el.value.trim(); if (!x) return; window.dispatchEvent(new CustomEvent('mph:focus', { detail: el.dataset.k })); mutate(s => { s.mgoals = s.mgoals || {}; (s.mgoals[el.dataset.m] = s.mgoals[el.dataset.m] || []).push({ id: uid('m'), x, done: false }); }); },
  plMgToggle(el) { mutate(s => { const g = ((s.mgoals || {})[el.dataset.m] || []).find(x => x.id === el.dataset.id); if (g) g.done = !g.done; }); },
  plMgDel(el) { mutate(s => { s.mgoals[el.dataset.m] = (s.mgoals[el.dataset.m] || []).filter(x => x.id !== el.dataset.id); }); toast('Month goal removed', true); },
  noteAdd() { const n = { id: uid('s'), x: '', c: ['green', 'white', 'grey', 'black'][(S().notes || []).length % 4], at: Date.now() }; mutate(s => { s.notes = s.notes || []; s.notes.unshift(n); }); setTimeout(() => { const t = document.querySelector(`[data-chg="noteEdit"][data-id="${n.id}"]`); if (t) t.focus(); }, 60); },
  noteColor(el) { const order = ['green', 'white', 'grey', 'black', 'deep']; mutate(s => { const n = (s.notes || []).find(x => x.id === el.dataset.id); if (n) n.c = order[(order.indexOf(n.c) + 1) % order.length]; }); },
  noteDel(el) { mutate(s => { s.notes = (s.notes || []).filter(x => x.id !== el.dataset.id); }); toast('Note deleted', true); }
};
function move(id, to) {
  const w = weekOf(PL.off);
  mutate(s => {
    const tk = s.tasks.find(x => x.id === id); if (!tk) return;
    if (to === 'week') { tk.d = ''; tk.wk = w.wk; }
    else if (to === 'next') { tk.d = ''; tk.wk = weekOf(PL.off + 1).wk; }
    else { tk.d = to; tk.wk = ''; }
  });
}
export const PC = {
  plEdit(el) { PL.edit = null; const v = el.value.trim(); if (!v) return redraw(); mutate(s => { const t = s.tasks.find(x => x.id === el.dataset.id); if (t) t.x = v; }, 'te' + el.dataset.id); },
  plMgEdit(el) { PL.edit = null; const v = el.value.trim(); if (!v) return redraw(); mutate(s => { const g = ((s.mgoals || {})[el.dataset.m] || []).find(x => x.id === el.dataset.id); if (g) g.x = v; }); },
  plGoalLink(el) { mutate(s => { const g = (s.goals[el.dataset.w] || []).find(x => x.id === el.dataset.id); if (g) g.m = el.value; }); },
  plReview(el) { mutate(s => { s.review = s.review || {}; const r = s.review[el.dataset.w] = s.review[el.dataset.w] || {}; r[el.dataset.q] = el.value; }, 'rv' + el.dataset.w + el.dataset.q); },
  noteEdit(el) { mutate(s => { const n = (s.notes || []).find(x => x.id === el.dataset.id); if (n) { n.x = el.value; n.at = Date.now(); } }, 'nt' + el.dataset.id); }
};

// DRAG AND DROP on the Mac: drag a task onto a day or onto the week list
document.addEventListener('dragstart', e => { const r = e.target.closest && e.target.closest('[data-task]'); if (!r) return; PL.drag = r.dataset.task; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', r.dataset.task); } catch (x) {} r.classList.add('dragging'); });
document.addEventListener('dragend', e => { PL.drag = null; document.querySelectorAll('.dragging,.drop-on').forEach(x => x.classList.remove('dragging', 'drop-on')); });
document.addEventListener('dragover', e => { if (!PL.drag) return; const z = e.target.closest && e.target.closest('[data-dropday],[data-dropweek]'); if (!z) return; e.preventDefault(); document.querySelectorAll('.drop-on').forEach(x => x !== z && x.classList.remove('drop-on')); z.classList.add('drop-on'); });
document.addEventListener('drop', e => { if (!PL.drag) return; const z = e.target.closest && e.target.closest('[data-dropday],[data-dropweek]'); if (!z) return; e.preventDefault(); const id = PL.drag; PL.drag = null; move(id, z.dataset.dropday || 'week'); });
// Leaving a task's text without changing it closes the editor too.
document.addEventListener('focusout', e => { const k = e.target && e.target.dataset && e.target.dataset.k; if (k && k.startsWith('edit-')) setTimeout(() => { if (PL.edit) { PL.edit = null; redraw(); } }, 0); });
