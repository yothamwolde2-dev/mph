// MPH views. Each returns markup; app.js wires the actions.
import { esc, icon, today, addDays, relDay, fmtShort, fmtLong, isoWeek, weekKey, weekStart, weekRange, ago, kb, greeting, walk, pathTo, progress, areaProgress, statusCounts, leaves } from './core.js?v=0.3.0';
import { store, WIDGETS, CONFIG } from './store.js?v=0.3.0';
import { homeLearning } from './lang.js?v=0.3.0';
import { homeBooks } from './book.js?v=0.3.0';

export const NAV = [
  { group: 'Work', items: [
    { id: 'home', label: 'Home', ico: 'home' },
    { id: 'projects', label: 'Projects', ico: 'projects' },
    { id: 'tasks', label: 'Tasks', ico: 'tasks' },
    { id: 'week', label: 'Week', ico: 'week' }
  ] },
  { group: 'Growth', items: [
    { id: 'learning', label: 'Learning', ico: 'learning' },
    { id: 'library', label: 'Library', ico: 'library' }
  ] }
];
export const TABS = ['home', 'projects', 'tasks', 'learning', 'library'];
const LABEL = { lang: 'Learning', book: 'Learning', home: 'Home', projects: 'Projects', tasks: 'Tasks', week: 'Week', learning: 'Learning', library: 'Library', settings: 'Settings', read: 'Reader' };

const S = () => store.state;
const stOf = key => S().statuses.find(s => s.key === key) || S().statuses[0];

// Agenda: everything with a date, from inbox tasks and project items.
export function agenda() {
  const out = [];
  S().tasks.forEach(t => out.push({ kind: 'task', id: t.id, x: t.x, d: t.d, done: t.done, at: t.at }));
  walk(S().areas, (n, path) => {
    if (n.due) out.push({ kind: 'node', id: n.id, x: n.t, d: n.due, done: n.st === 'Done', path: path.map(p => p.t).join(' / ') });
    (n.r || []).forEach(r => out.push({ kind: 'rem', id: r.id, nid: n.id, x: r.x, d: r.d, done: !!r.done, path: [...path, n].map(p => p.t).join(' / ') }));
  });
  return out;
}

function agendaRow(a, opts = {}) {
  const t = today();
  const late = a.d && a.d < t && !a.done;
  const chip = a.kind === 'rem' ? `<span class="chip">Reminder</span>` : '';
  const dchip = a.d ? `<span class="chip ${late ? 'warn' : a.d === t ? 'today' : ''}">${late ? 'Overdue ' : ''}${esc(relDay(a.d))}</span>` : '';
  const meta = a.path ? esc(a.path) : a.kind === 'task' ? 'Task' : '';
  const titleAct = a.kind === 'task' ? '' : `data-act="openNode" data-id="${a.kind === 'rem' ? a.nid : a.id}"`;
  return `<div class="row ${a.done ? 'done' : ''}">
    <button class="check ${a.done ? 'on' : ''}" data-act="toggleAgenda" data-kind="${a.kind}" data-id="${a.id}" data-nid="${a.nid || ''}" aria-label="${a.done ? 'Mark not done' : 'Mark done'}">${a.done ? icon('check', 14) : ''}</button>
    <div class="grow" ${titleAct} style="${titleAct ? 'cursor:pointer' : ''}"><div class="title">${esc(a.x)}</div>${meta ? `<div class="meta">${meta}</div>` : ''}</div>
    ${chip}${opts.noDate ? '' : dchip}
    ${a.kind === 'task' && opts.del ? `<button class="iconbtn" style="width:30px;height:30px" data-act="delTask" data-id="${a.id}" aria-label="Delete task">${icon('minus', 16)}</button>` : ''}
  </div>`;
}

function figures() {
  const t = today();
  const ag = agenda();
  const due = ag.filter(a => !a.done && a.d && a.d <= t).length;
  const g = S().goals[weekKey()] || [];
  const areas = S().areas;
  const all = areas.flatMap(a => (a.k || []).flatMap(leaves));
  const pct = all.length ? Math.round(areas.reduce((s, a) => s + areaProgress(a, S().statuses) * (a.k || []).flatMap(leaves).length, 0) / all.length) : 0;
  return { due, goalsDone: g.filter(x => x.done).length, goals: g.length, pct };
}

// HOME
export function home(ui) {
  const st = S(); const f = figures(); const name = st.profile.name.trim();
  const w = isoWeek();
  const custom = ui.customize;
  const hello = `${greeting()}${name ? ', ' + name : ''}`;
  const heroText = custom
    ? `<div style="display:flex;flex-direction:column;gap:10px;max-width:560px;margin-top:16px">
        <input class="field" style="background:rgba(0,0,0,.4);color:#fff" data-chg="profileName" value="${esc(st.profile.name)}" placeholder="Your name for the greeting">
        <input class="field" style="background:rgba(0,0,0,.4);color:#fff" data-chg="profileMotto" value="${esc(st.profile.motto)}" placeholder="A line under the greeting, your role or focus">
      </div>`
    : `<h1 class="display">${esc(hello)}</h1>${st.profile.motto ? `<p class="motto">${esc(st.profile.motto)}</p>` : ''}`;

  const hero = `<section class="hero">
    <div class="corner"><button class="btn sm" data-act="customize">${icon(custom ? 'check' : 'sliders', 15)}${custom ? 'Done' : 'Customize'}</button></div>
    <div><div class="date">${esc(fmtLong())} · Week ${w.week}</div>${heroText}</div>
    <div class="bottom">
      <div class="figures">
        <div class="fig"><b class="num">${f.due}</b><span>Due today</span></div>
        <div class="fig"><b class="num">${f.goalsDone}/${f.goals}</b><span>Week goals</span></div>
        <div class="fig"><b class="num">${f.pct}%</b><span>Projects</span></div>
      </div>
      <div class="quick"><input data-k="quick" data-enter="quickAdd" placeholder="Add a task for today" aria-label="Add a task for today"><button class="btn" data-act="quickAdd">Add</button></div>
    </div>
  </section>`;

  const order = st.home.order.filter(id => custom || !st.home.hidden.includes(id));
  const widgets = order.map((id, i) => {
    const hidden = st.home.hidden.includes(id);
    const ctl = custom ? `<div class="custom-bar">
      <button class="iconbtn" style="width:30px;height:30px" data-act="wMove" data-id="${id}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move up">${icon('up', 15)}</button>
      <button class="iconbtn" style="width:30px;height:30px" data-act="wMove" data-id="${id}" data-d="1" ${i === order.length - 1 ? 'disabled' : ''} aria-label="Move down">${icon('down', 15)}</button>
      <button class="iconbtn" style="width:30px;height:30px" data-act="wToggle" data-id="${id}" aria-label="${hidden ? 'Show' : 'Hide'}">${icon(hidden ? 'eyeoff' : 'eye', 15)}</button>
    </div>` : '';
    const body = W[id] ? W[id]() : '';
    return `<section class="panel w-${id}" style="${hidden ? 'opacity:.35' : ''}">${ctl}${body}</section>`;
  }).join('');
  return `${hero}<div class="grid">${widgets}</div>`;
}

const ptitle = (label, link, href) => `<div class="ptitle"><i class="tick"></i><span class="eyebrow">${label}</span><span class="sp"></span>${link ? `<a class="link" href="${href}">${link}</a>` : ''}</div>`;

const W = {
  today() {
    const t = today();
    const items = agenda().filter(a => a.d && (a.d === t || (a.d < t && !a.done)))
      .sort((a, b) => (a.done - b.done) || a.d.localeCompare(b.d));
    return ptitle('Today', 'All tasks', '#/tasks') + (items.length ? items.slice(0, 7).map(a => agendaRow(a)).join('') : `<p class="empty">Nothing due today. Add a task above, or set due dates on your project items.</p>`);
  },
  goals() {
    const k = weekKey(); const g = S().goals[k] || [];
    const done = g.filter(x => x.done).length; const pct = g.length ? Math.round(done / g.length * 100) : 0;
    return ptitle('Weekly goals', 'Open week', '#/week') + `
      <div class="goal-week"><b class="num">${done}/${g.length}</b><span class="faint" style="font-size:12px">${esc(weekRange(weekStart()))}</span></div>
      <div class="meter" style="margin-bottom:12px"><i style="width:${pct}%"></i></div>
      ${g.map(x => `<div class="row ${x.done ? 'done' : ''}"><button class="check ${x.done ? 'on' : ''}" data-act="goalToggle" data-w="${k}" data-id="${x.id}" aria-label="Toggle goal">${x.done ? icon('check', 14) : ''}</button><div class="grow"><div class="title">${esc(x.x)}</div></div></div>`).join('') || `<p class="empty">Set what this week must deliver.</p>`}
      <div class="addline"><input class="field" data-k="goal-home" data-enter="goalAdd" data-w="${k}" placeholder="Add a goal for this week"><button class="btn" data-act="goalAdd" data-w="${k}">Add</button></div>`;
  },
  projects() {
    const sts = S().statuses; const c = statusCounts(S().areas, sts); const total = Object.values(c).reduce((a, b) => a + b, 0);
    const bar = total ? sts.map(s => c[s.key] ? `<i style="width:${c[s.key] / total * 100}%;background:${s.color}" title="${esc(s.label)}"></i>` : '').join('') : `<i style="width:100%;background:var(--control)"></i>`;
    const areas = S().areas.slice(0, 6).map(a => { const p = areaProgress(a, sts); return `<a class="area-line" href="#/projects" data-act="focusArea" data-id="${a.id}"><span class="title">${esc(a.t)}</span><span class="meter"><i style="width:${p}%"></i></span><span class="pct num">${p}%</span></a>`; }).join('');
    return ptitle('Projects pulse', 'Open projects', '#/projects') + `<div class="statusbar">${bar}</div>
      <div class="legend">${sts.map(s => `<span><i class="dot" style="background:${s.color}"></i>${esc(s.label)}<em>${c[s.key]}</em></span>`).join('')}</div>
      ${areas || `<p class="empty">No projects yet.</p>`}`;
  },
  continue() {
    return ptitle('Continue reading', 'Library', '#/library') + homeBooks();
  },
  learning() {
    return ptitle('Learning', 'Open learning', '#/learning') + homeLearning();
  }
};

export const colName = id => { const c = S().cols.find(c => c.id === id); return c ? c.name : 'Unsorted'; };

// PROJECTS
export function projects(ui) {
  const st = S(); const sts = st.statuses; const c = statusCounts(st.areas, sts);
  const total = Object.values(c).reduce((a, b) => a + b, 0);
  const done = c['Done'] || 0;
  const bar = total ? sts.map(s => c[s.key] ? `<i style="width:${c[s.key] / total * 100}%;background:${s.color}"></i>` : '').join('') : '';
  const areas = st.areas.map((a, i) => area(a, i, ui)).join('');
  return `<div class="phead"><div><span class="eyebrow">Work</span><h1 class="display" style="margin-top:10px">Projects</h1><p class="muted">${st.areas.length} topics · ${total} items · ${done} done</p></div>
    <div class="acts"><button class="btn" data-act="expandAll">${ui.allOpen ? 'Collapse all' : 'Expand all'}</button><button class="btn primary" data-act="addArea">${icon('plus', 15)}Topic</button></div></div>
    ${total ? `<div class="statusbar">${bar}</div>` : ''}
    <div class="legend">${sts.map(s => `<span><i class="dot" style="background:${s.color}"></i>${esc(s.label)}<em>${c[s.key]}</em></span>`).join('')}</div>
    ${areas || `<div class="drop"><h3 class="display">Start your first topic</h3><p class="muted">Topics hold projects, projects hold deliverables, deliverables hold tasks.</p><div style="margin-top:18px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><button class="btn primary" data-act="addArea">${icon('plus', 15)}Topic</button><button class="btn" data-act="importPortfolio">Bring in Work Portfolio</button></div></div>`}`;
}

function area(a, i, ui) {
  const sts = S().statuses; const p = areaProgress(a, sts); const open = !!ui.open[a.id];
  const ls = (a.k || []).flatMap(leaves); const dn = ls.filter(l => l.st === 'Done').length;
  return `<section class="area" id="a-${a.id}">
    <div class="area-head" data-act="toggle" data-id="${a.id}">
      <span class="n">${String(i + 1).padStart(2, '0')}</span>
      <div class="t"><input class="inline" data-chg="rename" data-id="${a.id}" data-stop value="${esc(a.t)}" aria-label="Topic name"><div class="sub">${(a.k || []).length} ${(a.k || []).length === 1 ? 'item' : 'items'} · ${dn} of ${ls.length} done</div></div>
      <span class="prog"><span class="meter"><i style="width:${p}%"></i></span></span><span class="pct num">${p}%</span>
      <button class="iconbtn" data-act="areaMenu" data-id="${a.id}" data-stop aria-label="Topic options">${icon('dots', 16)}</button>
      <span class="iconbtn" style="background:${open ? 'var(--ink)' : 'var(--control)'};color:${open ? 'var(--bg)' : 'var(--ink)'}">${icon(open ? 'minus' : 'plus', 16)}</span>
    </div>
    ${open ? `<div class="area-body">${(a.k || []).map(n => node(n, 0, ui)).join('')}
      <div style="display:flex;gap:6px;flex-wrap:wrap" class="addchild"><button class="btn sm ghost" data-act="addChild" data-id="${a.id}">${icon('plus', 14)}Add item</button>${S().templates.map(t => `<button class="btn sm ghost" data-act="addFromTemplate" data-id="${a.id}" data-t="${t.id}">${icon('plus', 14)}From ${esc(t.name)} template</button>`).join('')}</div></div>` : ''}
  </section>`;
}

function node(n, depth, ui) {
  const s = stOf(n.st); const has = n.k && n.k.length; const open = !!ui.open[n.id];
  const ls = has ? n.k.flatMap(leaves) : []; const p = has ? progress(n, S().statuses) : 0;
  const metaBits = [];
  if (has) metaBits.push(`${ls.filter(l => l.st === 'Done').length} of ${ls.length} done`);
  if (n.s) metaBits.push(esc(n.s));
  if (n.due) metaBits.push('Due ' + esc(relDay(n.due)));
  if (n.n && n.n.length) metaBits.push(n.n.length + (n.n.length === 1 ? ' note' : ' notes'));
  const opts = S().statuses.map(o => `<option value="${esc(o.key)}" ${o.key === n.st ? 'selected' : ''}>${esc(o.label)}</option>`).join('');
  return `<div class="node" style="padding-left:${8 + depth * 22}px">
      ${has ? `<button class="tw ${open ? 'open' : ''}" data-act="toggle" data-id="${n.id}" aria-label="${open ? 'Collapse' : 'Expand'}">${icon('chev', 15)}</button>` : `<span class="tw"></span>`}
      <i class="dot" style="background:${s.color}"></i>
      <div class="nt" data-act="openNode" data-id="${n.id}"><b>${esc(n.t)}</b>${metaBits.length ? `<small>${metaBits.join(' · ')}</small>` : ''}</div>
      ${has ? `<span class="meter mini"><i style="width:${p}%"></i></span><span class="mini-pct num">${p}%</span>` : ''}
      <select class="stsel" data-chg="status" data-id="${n.id}" style="background:${s.color};color:${s.ink}" aria-label="Status">${opts}</select>
      <span class="acts"><button class="iconbtn" style="width:30px;height:30px" data-act="addChild" data-id="${n.id}" aria-label="Add sub item">${icon('plus', 15)}</button><button class="iconbtn" style="width:30px;height:30px" data-act="delNode" data-id="${n.id}" aria-label="Delete">${icon('minus', 15)}</button></span>
    </div>${has && open ? n.k.map(c => node(c, depth + 1, ui)).join('') : ''}`;
}

export function drawer(id) {
  const trail = pathTo(S().areas, id); if (!trail) return '';
  const n = trail[trail.length - 1]; const isArea = trail.length === 1;
  const sts = S().statuses;
  return `<div class="scrim" data-act="closeDrawer"></div>
  <aside class="drawer" role="dialog" aria-label="Item details">
    <header><span class="path">${esc(trail.slice(0, -1).map(t => t.t).join(' / ') || 'Topic')}</span><button class="iconbtn" data-act="closeDrawer" aria-label="Close">${icon('x', 16)}</button></header>
    <div class="body">
      <div><textarea class="inline big" rows="2" style="resize:none;overflow:hidden" data-chg="rename" data-id="${n.id}" aria-label="Name">${esc(n.t)}</textarea>
      <input class="inline muted" style="margin-top:6px" data-chg="desc" data-id="${n.id}" value="${esc(n.s)}" placeholder="Add a short description"></div>
      ${isArea ? '' : `<div><span class="label">Status</span><div class="stgrid">${sts.map(s => `<button class="stbtn ${s.key === n.st ? 'on' : ''}" style="${s.key === n.st ? `background:${s.color};color:${s.ink}` : ''}" data-act="setStatus" data-id="${n.id}" data-st="${esc(s.key)}"><i class="dot" style="background:${s.key === n.st ? s.ink : s.color}"></i>${esc(s.label)}</button>`).join('')}</div></div>
      <div class="two"><label><span class="label">Due date</span><input type="date" class="field" data-chg="due" data-id="${n.id}" value="${esc(n.due)}"></label>
      <label><span class="label">Priority</span><select class="field" data-chg="prio" data-id="${n.id}">${['', 'Low', 'Medium', 'High'].map(p => `<option value="${p}" ${p === n.pr ? 'selected' : ''}>${p || 'None'}</option>`).join('')}</select></label></div>`}
      <div><span class="label">Sub items</span>
        ${(n.k || []).map(c => { const cs = stOf(c.st); return `<div class="row"><i class="dot" style="background:${cs.color}"></i><div class="grow" data-act="openNode" data-id="${c.id}" style="cursor:pointer"><div class="title">${esc(c.t)}</div></div><span class="chip">${esc(cs.label)}</span></div>`; }).join('') || `<p class="empty">None yet.</p>`}
        <div class="addline"><input class="field" data-k="sub-${n.id}" data-enter="addSub" data-id="${n.id}" placeholder="Add a sub item"><button class="btn" data-act="addSub" data-id="${n.id}">Add</button></div>
      </div>
      <div><span class="label">Notes</span>
        <div style="display:flex;flex-direction:column;gap:8px">${(n.n || []).map(o => `<div class="note">${esc(o.x)}<small>${new Date(o.ts).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small><button class="x" data-act="delNote" data-id="${n.id}" data-o="${o.id}" aria-label="Delete note">${icon('x', 14)}</button></div>`).join('')}</div>
        <textarea class="field" style="margin-top:10px" rows="2" data-k="note-${n.id}" id="note-${n.id}" placeholder="Write a note"></textarea>
        <div style="margin-top:8px"><button class="btn" data-act="addNote" data-id="${n.id}">Add note</button></div>
      </div>
      <div><span class="label">Reminders</span>
        ${(n.r || []).map(r => `<div class="row"><span class="chip">${esc(fmtShort(r.d))}</span><div class="grow"><div class="title">${esc(r.x)}</div></div><button class="iconbtn" style="width:30px;height:30px" data-act="delRem" data-id="${n.id}" data-o="${r.id}" aria-label="Delete reminder">${icon('minus', 15)}</button></div>`).join('') || `<p class="empty">No reminders.</p>`}
        <div class="two" style="margin-top:10px"><input class="field" id="rem-x-${n.id}" placeholder="Reminder"><input type="date" class="field" id="rem-d-${n.id}" value="${today()}"></div>
        <div style="margin-top:8px"><button class="btn" data-act="addRem" data-id="${n.id}">Add reminder</button></div>
      </div>
      <div><button class="btn danger" data-act="delNode" data-id="${n.id}">${icon('minus', 15)}Delete ${isArea ? 'topic' : 'item'}</button></div>
    </div>
  </aside>`;
}

// TASKS
export function tasks(ui) {
  const t = today(); const ag = agenda();
  const open = ag.filter(a => !a.done);
  const groups = [
    ['Overdue', open.filter(a => a.d && a.d < t)],
    ['Today', open.filter(a => a.d === t)],
    ['Upcoming', open.filter(a => a.d && a.d > t).sort((a, b) => a.d.localeCompare(b.d))],
    ['Anytime', open.filter(a => !a.d)]
  ];
  const doneList = ag.filter(a => a.done && a.kind === 'task').sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 12);
  return `<div class="phead"><div><span class="eyebrow">Work</span><h1 class="display" style="margin-top:10px">Tasks</h1><p class="muted">${open.length} open · tasks you add here and every dated item from your projects.</p></div>
    <div class="acts"><a class="btn" href="#/week">${icon('week', 15)}This week</a></div></div>
    <div class="panel" style="margin-bottom:14px"><div class="addline" style="margin:0;flex-wrap:wrap"><input class="field" style="flex:1 1 260px" data-k="task-x" id="task-x" data-enter="addTask" placeholder="What needs doing"><input type="date" class="field" style="width:170px" id="task-d" value="${esc(ui.taskDate ?? t)}"><button class="btn primary" data-act="addTask">${icon('plus', 15)}Add task</button></div></div>
    <div class="cols2"><div>${groups.map(([name, list]) => list.length ? `<section class="panel sect" style="margin-bottom:14px">${ptitle(name + ' · ' + list.length)}${list.map(a => agendaRow(a, { del: true, noDate: name === 'Today' })).join('')}</section>` : '').join('') || `<section class="panel"><p class="empty">All clear. Nothing open.</p></section>`}</div>
    <div><section class="panel">${ptitle('Completed')}${doneList.map(a => agendaRow(a, { del: true })).join('') || `<p class="empty">Completed tasks collect here.</p>`}</section></div></div>`;
}

// WEEK
export function week(ui) {
  const base = new Date(); base.setDate(base.getDate() + (ui.weekOffset || 0) * 7);
  const k = weekKey(base); const ws = weekStart(base); const w = isoWeek(base);
  const g = S().goals[k] || []; const done = g.filter(x => x.done).length; const pct = g.length ? Math.round(done / g.length * 100) : 0;
  const start = ws.toISOString ? `${ws.getFullYear()}-${String(ws.getMonth() + 1).padStart(2, '0')}-${String(ws.getDate()).padStart(2, '0')}` : '';
  const end = addDays(start, 6);
  const due = agenda().filter(a => a.d && a.d >= start && a.d <= end).sort((a, b) => a.d.localeCompare(b.d));
  return `<div class="phead"><div><span class="eyebrow">Work</span><h1 class="display" style="margin-top:10px">Week ${w.week}</h1><p class="muted">${esc(weekRange(ws))} ${w.year}</p></div>
    <div class="acts weeknav"><button class="iconbtn" data-act="weekNav" data-d="-1" aria-label="Previous week">${icon('left', 16)}</button><button class="btn" data-act="weekNav" data-d="0">This week</button><button class="iconbtn" data-act="weekNav" data-d="1" aria-label="Next week">${icon('chev', 16)}</button></div></div>
    <div class="cols2">
      <section class="panel">${ptitle('Goals')}
        <div class="goal-week"><b class="num">${done}/${g.length}</b><span class="faint" style="font-size:12px">${pct}% achieved</span></div>
        <div class="meter" style="margin-bottom:12px"><i style="width:${pct}%"></i></div>
        ${g.map((x, i) => `<div class="row ${x.done ? 'done' : ''}"><button class="check ${x.done ? 'on' : ''}" data-act="goalToggle" data-w="${k}" data-id="${x.id}" aria-label="Toggle goal">${x.done ? icon('check', 14) : ''}</button><div class="grow"><input class="inline title" data-chg="goalEdit" data-w="${k}" data-id="${x.id}" value="${esc(x.x)}" aria-label="Goal"></div>
          <button class="iconbtn" style="width:30px;height:30px" data-act="goalMove" data-w="${k}" data-id="${x.id}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move up">${icon('up', 15)}</button>
          <button class="iconbtn" style="width:30px;height:30px" data-act="goalDel" data-w="${k}" data-id="${x.id}" aria-label="Delete goal">${icon('minus', 15)}</button></div>`).join('') || `<p class="empty">No goals set for this week yet.</p>`}
        <div class="addline"><input class="field" data-k="goal-week" data-enter="goalAdd" data-w="${k}" placeholder="Add a goal"><button class="btn" data-act="goalAdd" data-w="${k}">Add</button></div>
      </section>
      <div>
        <section class="panel" style="margin-bottom:14px">${ptitle('Due this week · ' + due.length)}${due.map(a => agendaRow(a)).join('') || `<p class="empty">Nothing dated this week.</p>`}</section>
        <section class="panel">${ptitle('Reflection')}<textarea class="field" rows="5" data-chg="reflect" data-w="${k}" placeholder="What moved forward, what is blocked, what comes next">${esc(S().reflections[k] || '')}</textarea></section>
      </div>
    </div>`;
}

// LEARNING and LIBRARY
export function shelf(section, ui, embedded) {
  const isL = section === 'learning';
  const cols = S().cols.filter(c => section === 'library' || c.section === section);
  const docs = S().docs.filter(d => section === 'library' || d.section === section);
  const groups = cols.map(c => ({ c, list: docs.filter(d => d.col === c.id) }));
  const loose = docs.filter(d => !cols.some(c => c.id === d.col));
  if (loose.length) groups.push({ c: { id: '', name: 'Unsorted' }, list: loose });
  const head = `<div class="phead"><div><span class="eyebrow">Growth</span><h1 class="display" style="margin-top:10px">${isL ? 'Learning' : 'Library'}</h1><p class="muted">${isL ? 'Courses and study tools. Every document keeps its progress across your Mac and iPhone.' : 'Your HTML tools, references and documents, readable right here.'}</p></div>
    <div class="acts"><button class="btn" data-act="addCol" data-s="${section}">${icon('plus', 15)}${isL ? 'Course' : 'Collection'}</button><button class="btn primary" data-act="upload" data-s="${section}">${icon('upload', 15)}Upload HTML</button></div></div>`;
  if (embedded) return `<section class="lx-sec" style="margin-top:44px"><div class="ptitle"><i class="tick"></i><span class="eyebrow">Your uploads</span></div>${shelfBody(section, groups, isL)}</section>`;
  if (!docs.length && !cols.length) {
    return head + `<div class="drop" data-drop="${section}"><h3 class="display">Bring your documents in</h3><p class="muted">Drop HTML files here, or choose them from your computer or phone.</p><div style="margin-top:18px"><button class="btn primary" data-act="upload" data-s="${section}">${icon('upload', 15)}Upload HTML</button></div></div>`;
  }
  return head + shelfBody(section, groups, isL);
}
function shelfBody(section, groups, isL) {
  return `<div data-drop="${section}">${groups.map(({ c, list }) => `<section class="col">
      <div class="colhead">${c.id ? `<input class="inline" data-chg="colName" data-id="${c.id}" value="${esc(c.name)}" aria-label="Collection name">` : `<span class="display" style="font-size:20px">Unsorted</span>`}<span class="count">${list.length}</span><span style="flex:1"></span>${c.id ? `<button class="iconbtn" data-act="colMenu" data-id="${c.id}" aria-label="Collection options">${icon('dots', 16)}</button>` : ''}</div>
      ${list.length ? `<div class="docs">${list.map(docTile).join('')}</div>` : `<div class="drop" style="padding:26px"><p class="muted" style="font-size:13px">Empty. Upload into this ${isL ? 'course' : 'collection'}.</p><div style="margin-top:12px"><button class="btn sm" data-act="upload" data-s="${section}" data-c="${c.id}">${icon('upload', 14)}Upload</button></div></div>`}
    </section>`).join('')}</div>`;
}
const docTile = d => `<div class="doc" role="button" tabindex="0" data-act="openDoc" data-id="${d.id}"><span class="bar"></span>
  <div><span class="kind">HTML · ${esc(kb(d.size || 0))}</span><span class="dtitle">${esc(d.title)}</span></div>
  <div><span class="dmeta"><span>${esc(ago(d.opened))}</span><span>${d.pct ? d.pct + '%' : ''}${(d.marks || []).length ? ' · ' + d.marks.length + ' saved' : ''}</span></span>${d.pct ? `<span class="meter"><i style="width:${d.pct}%"></i></span>` : ''}</div>
  <button class="iconbtn menu" style="width:30px;height:30px" data-act="docMenu" data-id="${d.id}" data-stop aria-label="Document options">${icon('dots', 15)}</button></div>`;

// SETTINGS
export function settings() {
  const st = S();
  const wrow = (w, i) => { const on = !st.home.hidden.includes(w.id); return `<div class="setrow"><div class="grow"><b style="font-size:13.5px">${esc(w.name)}</b></div>
    <button class="iconbtn" style="width:30px;height:30px" data-act="wMove" data-id="${w.id}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move up">${icon('up', 15)}</button>
    <button class="iconbtn" style="width:30px;height:30px" data-act="wMove" data-id="${w.id}" data-d="1" ${i === st.home.order.length - 1 ? 'disabled' : ''} aria-label="Move down">${icon('down', 15)}</button>
    <button class="switch ${on ? 'on' : ''}" data-act="wToggle" data-id="${w.id}" aria-label="${on ? 'Hide' : 'Show'} ${esc(w.name)}"></button></div>`; };
  return `<div class="phead"><div><span class="eyebrow">MPH</span><h1 class="display" style="margin-top:10px">Settings</h1></div></div>
  <div class="setgrid">
    <section class="panel">${ptitle('Profile')}
      <label><span class="label">Name for the greeting</span><input class="field" data-chg="profileName" value="${esc(st.profile.name)}" placeholder="Your name"></label>
      <label style="display:block;margin-top:14px"><span class="label">Line under the greeting</span><input class="field" data-chg="profileMotto" value="${esc(st.profile.motto)}" placeholder="Your role or focus"></label>
    </section>
    <section class="panel">${ptitle('Appearance')}
      <div class="setrow"><div class="grow"><b style="font-size:13.5px">Theme</b><div class="faint" style="font-size:12px">Black field or light grey field</div></div><div class="seg"><button class="${st.theme === 'dark' ? 'on' : ''}" data-act="theme" data-v="dark">Black</button><button class="${st.theme === 'light' ? 'on' : ''}" data-act="theme" data-v="light">Light</button></div></div>
    </section>
    <section class="panel">${ptitle('Home layout')}${st.home.order.map(id => WIDGETS.find(w => w.id === id)).filter(Boolean).map(wrow).join('')}</section>
    <section class="panel">${ptitle('Statuses')}${st.statuses.map(s => `<div class="setrow"><i class="dot" style="background:${s.color};width:12px;height:12px"></i><div class="grow"><input class="inline" data-chg="statusLabel" data-k2="${esc(s.key)}" value="${esc(s.label)}" aria-label="Status name"></div></div>`).join('')}</section>
    <section class="panel">${ptitle('Templates')}${st.templates.map(t => `<label><span class="label">${esc(t.name)} · one item per line</span><textarea class="field" rows="6" data-chg="template" data-id="${t.id}">${esc(t.items.join('\n'))}</textarea></label>`).join('')}</section>
    <section class="panel">${ptitle('Data')}
      <div class="setrow"><div class="grow"><b style="font-size:13.5px">Work Portfolio</b><div class="faint" style="font-size:12px">Bring in topics from your portfolio that are not here yet</div></div><button class="btn sm" data-act="importPortfolio">Import</button></div>
      <div class="setrow"><div class="grow"><b style="font-size:13.5px">Backup</b><div class="faint" style="font-size:12px">Download everything as a file</div></div><button class="btn sm" data-act="exportBackup">Export</button></div>
      <div class="setrow"><div class="grow"><b style="font-size:13.5px">Restore</b><div class="faint" style="font-size:12px">Load a backup file (can be undone)</div></div><label class="btn sm">Restore<input type="file" accept=".json,application/json" data-chg="restore" hidden></label></div>
    </section>
    <section class="panel">${ptitle('Account')}
      <div class="setrow"><div class="grow"><b style="font-size:13.5px">${esc(store.user ? store.user.email : '')}</b><div class="faint" style="font-size:12px">Your data is private to this login</div></div><button class="btn sm" data-act="signOut">Sign out</button></div>
      <div class="setrow"><div class="grow faint" style="font-size:12px">MPH version ${CONFIG.version} · Foundation</div></div>
    </section>
  </div>`;
}

// LOGIN
export function login(mode, msg, err) {
  const create = mode === 'create';
  return `<div class="login"><div class="art"><div class="brand" style="padding:0"><b>MPH</b><i></i><span>My Personal Hub</span></div>
    <div><h1 class="display">Raise<br>the bar.</h1><p>Projects, tasks, weekly goals, learning and your documents, in one place on your Mac and iPhone.</p></div><span class="eyebrow" style="color:rgba(255,255,255,.4)">Private workspace</span></div>
    <form data-form="auth" autocomplete="on">
      <span class="eyebrow" style="color:rgba(255,255,255,.5)">${create ? 'Create your account' : 'Welcome back'}</span>
      <h2 class="display" style="font-size:38px;margin-bottom:10px">${create ? 'Create account' : 'Sign in'}</h2>
      <input class="field" type="email" name="email" placeholder="Email" required autocomplete="email">
      <input class="field" type="password" name="password" placeholder="Password" required minlength="6" autocomplete="${create ? 'new-password' : 'current-password'}">
      <button class="btn primary" type="submit" style="height:46px">${create ? 'Create account' : 'Sign in'}</button>
      <p class="msg ${err ? 'err' : ''}">${esc(msg || '')}</p>
      <p class="swap">${create ? 'Already have an account?' : 'First time here?'} <button type="button" data-act="authMode" data-v="${create ? 'signin' : 'create'}">${create ? 'Sign in' : 'Create account'}</button></p>
    </form></div>`;
}

export function syncLabel() {
  const v = store.sync;
  return { cls: v === 'saving' ? 'saving' : (v === 'offline' || v === 'error') ? 'off' : '', txt: v === 'saving' ? 'Saving' : v === 'offline' ? 'Offline, saved on this device' : v === 'error' ? 'Not synced, will retry' : 'Synced' };
}
export function shell(route, inner) {
  const st = S(); const r0 = route.split('/')[0]; const r = r0 === 'lang' ? 'learning' : r0 === 'book' ? 'library' : r0;
  const { cls: syncCls, txt: syncTxt } = syncLabel();
  const counts = { tasks: agenda().filter(a => !a.done && a.d && a.d <= today()).length, learning: st.docs.filter(d => d.section === 'learning').length, library: st.docs.filter(d => d.section === 'library').length };
  return `<div class="shell">
    <aside class="side"><div class="brand"><b>MPH</b><i></i></div>
      ${NAV.map(g => `<div class="navgroup"><span class="eyebrow">${g.group}</span>${g.items.map(it => `<a class="navlink ${r === it.id || (r === 'read' && false) ? 'on' : ''}" href="#/${it.id}">${icon(it.ico)}${it.label}${counts[it.id] ? `<span class="count">${counts[it.id]}</span>` : ''}</a>`).join('')}</div>`).join('')}
      <div class="side-foot"><a class="navlink ${r === 'settings' ? 'on' : ''}" href="#/settings" style="padding-left:0">${icon('settings')}Settings</a><span class="sync ${syncCls}"><i></i>${syncTxt}</span></div>
    </aside>
    <div class="main">
      <div class="topbar"><span class="mbrand"><b>MPH</b><i></i></span><span class="crumb">${esc(LABEL[r] || '')}</span><span class="sp"></span>
        <button class="iconbtn" data-act="undo" ${store.past.length ? '' : 'disabled'} aria-label="Undo" title="Undo (Cmd Z)">${icon('undo', 17)}</button>
        <button class="iconbtn" data-act="redo" ${store.future.length ? '' : 'disabled'} aria-label="Redo" title="Redo (Cmd Shift Z)">${icon('redo', 17)}</button>
        <a class="iconbtn mobile-only" href="#/week" aria-label="Week">${icon('week', 17)}</a>
        <a class="iconbtn mobile-only" href="#/settings" aria-label="Settings">${icon('settings', 17)}</a>
      </div>
      <main class="view" id="view">${inner}</main>
    </div>
    <nav class="tabs">${TABS.map(id => { const it = NAV.flatMap(g => g.items).find(i => i.id === id); return `<a class="${r === id ? 'on' : ''}" href="#/${id}">${icon(it.ico, 20)}${it.label}</a>`; }).join('')}</nav>
  </div>`;
}
