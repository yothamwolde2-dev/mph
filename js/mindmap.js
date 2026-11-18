// MPH mind map (1.0). The map is a picture of Projects: the centre is the big goal, every topic is a branch,
// every item in a topic is a leaf. Editing the map edits Projects and editing Projects redraws the map,
// because both read and write the same tree (store.state.areas). Selecting a branch opens its panel,
// where you rename it, change its status, add items under it, or go deeper.
import { esc, icon, mkNode, locate, pathTo, leaves, areaProgress, progress } from './core.js?v=1.0.0';
import { store, mutate } from './store.js?v=1.0.0';
import { unlockData } from './content.js?v=1.0.0';

const S = () => store.state;
const redraw = () => window.dispatchEvent(new Event('mph:redraw'));
const toast = (t, undo) => window.dispatchEvent(new CustomEvent('mph:toast', { detail: { text: t, undo } }));
export const PAL = ['#39B44A', '#2F6BFF', '#D6457A', '#C98A12', '#0F9488', '#7B5CE0', '#E0603A', '#5B6B7C'];
const MM = { sel: 'goal' };
// Each branch keeps its chosen colour; branches without one take the palette colours nobody uses yet.
let CMAP = new Map();
function paint(areas) { CMAP = new Map(); const used = new Set(areas.map(a => a.c).filter(Boolean)); const free = PAL.filter(c => !used.has(c)); let j = 0;
  areas.forEach((a, i) => CMAP.set(a.id, a.c || (free.length ? free[j++ % free.length] : PAL[i % PAL.length]))); }
const colorOf = a => CMAP.get(a.id) || a.c || PAL[0];
const cut = (t, n) => { t = String(t || '').trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t; };
const GOAL0 = 'Set the one goal that every project serves';

// geometry
const W = 1260, CX = 630, CY = 630, RC = 100, RINGS = [212, 262, 312], R2 = 418;
const rad = a => a * Math.PI / 180;
const pt = (a, r) => [CX + r * Math.cos(rad(a)), CY + r * Math.sin(rad(a))];
const f = p => p[0].toFixed(1) + ' ' + p[1].toFixed(1);
function curve(a0, r0, a1, r1, tw) {
  const d = r1 - r0;
  return `M${f(pt(a0, r0))} C${f(pt(a0 + tw, r0 + d * .5))} ${f(pt(a1 - tw, r1 - d * .35))} ${f(pt(a1, r1))}`;
}
function wrap(text, max, lines) {
  const words = String(text).split(/\s+/); const out = []; let cur = '';
  for (const w of words) { if ((cur + ' ' + w).trim().length > max && cur) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
  if (cur) out.push(cur);
  if (out.length > lines) { out.length = lines; out[lines - 1] = cut(out[lines - 1] + ' …', max); }
  return out;
}

function svg() {
  const st = S(); const areas = st.areas; const sts = st.statuses; paint(areas);
  const stc = k => (sts.find(s => s.key === k) || {}).color;
  const selPath = MM.sel === 'goal' ? [] : (pathTo(areas, MM.sel) || []);
  const selTop = selPath[0] ? selPath[0].id : null;
  const wts = areas.map(a => Math.max(2, (a.k || []).length)); const total = wts.reduce((x, y) => x + y, 0) || 1;
  let ang = -90 - (360 * wts[0] / total) / 2;
  let s = '';
  const geo = areas.map((a, i) => { const span = 360 * wts[i] / total; const g = { a0: ang, span, am: ang + span / 2 }; ang += span; return g; });
  // branch pills: each tries three rings and takes the first place where it touches no other pill
  const placed = [];
  const box = (g, r) => { const c = pt(g.am, r); return { x1: c[0] - g.w / 2 - 8, x2: c[0] + g.w / 2 + 8, y1: c[1] - 31, y2: c[1] + 31 }; };
  const over = (a, b) => Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1)) * Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
  geo.forEach((g, i) => { g.label = cut(areas[i].t, 15); g.w = Math.round(g.label.length * 11.4 + 44);
    let best = null; for (const r of RINGS) { const bx = box(g, r); const o = placed.reduce((x, p) => x + over(bx, p), 0); if (!best || o < best.o) best = { r, o, bx }; if (!o) break; }
    g.r = best.r; placed.push(best.bx); });
  // the coloured ring around the goal
  areas.forEach((a, i) => { const g = geo[i]; const gap = Math.min(1.6, g.span / 6); const p1 = pt(g.a0 + gap, RC + 16), p2 = pt(g.a0 + g.span - gap, RC + 16);
    s += `<path class="mm-ring ${selTop && selTop !== a.id ? 'dim' : ''}" d="M${f(p1)} A${RC + 16} ${RC + 16} 0 ${g.span - 2 * gap > 180 ? 1 : 0} 1 ${f(p2)}" stroke="${colorOf(a, i)}" stroke-width="7" fill="none" stroke-linecap="round"/>`; });
  areas.forEach((a, i) => {
    const g = geo[i]; const c = colorOf(a, i); const kids = a.k || [];
    const p = pt(g.am, g.r); const label = g.label; const w = g.w;
    let paths = `<path d="${curve(g.am, RC + 26, g.am, g.r - 22, 8)}" stroke="${c}" stroke-width="4.5" fill="none" stroke-linecap="round"/>`;
    let nodes = '';
    kids.forEach((n, j) => {
      const a2 = g.a0 + g.span * (j + .5) / kids.length; const q = pt(a2, R2);
      const right = Math.cos(rad(a2)) >= 0; const rot = right ? a2 : a2 + 180;
      const lp = pt(a2, R2 + 19); const on = MM.sel === n.id || selPath.some(x => x.id === n.id);
      const done = n.st === 'Done'; const sc = stc(n.st);
      const more = (n.k || []).length;
      paths += `<path d="${curve(g.am, g.r + 22, a2, R2 - 10, 0)}" stroke="${c}" stroke-width="2.2" fill="none" stroke-linecap="round" opacity=".7"/>`;
      nodes += `<g class="mm-l2 ${on ? 'on' : ''} ${done ? 'done' : ''}" tabindex="0" role="button" data-act="mmSel" data-id="${n.id}" aria-label="${esc(a.t + ', ' + n.t)}" style="--c:${c}">
        <circle cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="18" fill="transparent"/>
        <circle class="dot" cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="10"/>
        ${sc && n.st !== 'Next' ? `<circle cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="4" fill="${sc}"/>` : ''}
        <text transform="translate(${f(lp)}) rotate(${rot.toFixed(1)})" text-anchor="${right ? 'start' : 'end'}" dy="7">${esc(cut(n.t, 15))}${more ? `<tspan class="mm-n" dx="6">${more}</tspan>` : ''}</text></g>`;
    });
    s += `<g class="mm-dept ${selTop && selTop !== a.id ? 'dim' : ''}" style="--c:${c}">${paths}
      <g class="mm-l1 ${MM.sel === a.id ? 'on' : ''}" tabindex="0" role="button" data-act="mmSel" data-id="${a.id}" aria-label="${esc(a.t)}">
        <rect class="shape" x="${(p[0] - w / 2).toFixed(1)}" y="${(p[1] - 26).toFixed(1)}" width="${w}" height="52" rx="26" fill="${c}"/>
        <text x="${p[0].toFixed(1)}" y="${(p[1] + 7).toFixed(1)}">${esc(label)}</text></g>${nodes}</g>`;
  });
  const lines = wrap(st.mapGoal || GOAL0, 12, 4); const y0 = CY - (lines.length - 1) * 13;
  s += `<g class="mm-core ${MM.sel === 'goal' ? 'on' : ''}" tabindex="0" role="button" data-act="mmSel" data-id="goal" aria-label="The big goal">
    <circle class="glow" cx="${CX}" cy="${CY}" r="${RC + 4}"/><circle class="shape" cx="${CX}" cy="${CY}" r="${RC}"/>
    ${lines.map((l, i) => `<text x="${CX}" y="${y0 + i * 26 + 7}">${esc(l)}</text>`).join('')}</g>`;
  return `<svg class="mm-svg" viewBox="0 0 ${W} ${W}" role="group" aria-label="Mind map of your projects">${s}</svg>`;
}

function panel() {
  const st = S(); const sts = st.statuses; paint(st.areas);
  if (MM.sel !== 'goal' && !locate(st.areas, MM.sel)) MM.sel = 'goal';
  if (MM.sel === 'goal') {
    return `<span class="mm-chip">The big goal</span>
      <textarea class="field mm-goal" rows="3" data-chg="mmGoal" placeholder="${GOAL0}" aria-label="The big goal">${esc(st.mapGoal || '')}</textarea>
      <h4>Branches <em>${st.areas.length}</em></h4>
      <div class="mm-list">${st.areas.map((a, i) => { const p = areaProgress(a, sts); return `<button class="mm-item" data-act="mmSel" data-id="${a.id}" style="--c:${colorOf(a, i)}"><i></i><span><b>${esc(a.t)}</b><small>${(a.k || []).length} items · ${p}% done</small></span>${icon('chev', 14)}</button>`; }).join('') || `<p class="empty">No branches yet. Add your first one below.</p>`}</div>
      <div class="mm-add"><input class="field" data-k="mm-topic" data-enter="mmAddTopic" placeholder="Add a branch (a new project topic)"><button class="btn" data-act="mmAddTopic" aria-label="Add branch">${icon('plus', 15)}</button></div>
      ${st.mapSeed ? '' : `<button class="mm-seed" data-act="mmSeed">${icon('map', 18)}<span><b>Bring in your plan map</b><small>Branding studio, Smart City, Arada Mall, Company tools and Learning, with their workstreams and work packages, added to Projects</small></span></button>`}`;
  }
  const path = pathTo(st.areas, MM.sel); const n = path[path.length - 1]; const top = path[0];
  const ti = st.areas.indexOf(top); const c = colorOf(top, ti); const isTop = path.length === 1;
  const kids = n.k || []; const p = isTop ? areaProgress(n, sts) : kids.length ? progress(n, sts) : null;
  const crumbs = [`<button data-act="mmSel" data-id="goal">Goal</button>`].concat(path.slice(0, -1).map(x => `<button data-act="mmSel" data-id="${x.id}">${esc(cut(x.t, 18))}</button>`)).join('<span>/</span>');
  return `<div class="mm-crumbs">${crumbs}</div>
    <div class="mm-head" style="--c:${c}"><i></i><span class="mm-chip">${isTop ? 'Branch' : 'Item'}${p !== null ? ' · ' + p + '% done' : ''}</span></div>
    <textarea class="mm-title" rows="2" data-chg="rename" data-id="${n.id}" aria-label="Name">${esc(n.t)}</textarea>
    <textarea class="field mm-desc" rows="2" data-chg="desc" data-id="${n.id}" placeholder="A line about what this is for" aria-label="Description">${esc(n.s || '')}</textarea>
    ${isTop ? `<h4>Colour</h4><div class="mm-sw">${PAL.map(x => `<button class="${x === c ? 'on' : ''}" style="--c:${x}" data-act="mmColor" data-id="${n.id}" data-c="${x}" aria-label="Colour ${x}"></button>`).join('')}</div>`
      : `<h4>Status</h4><div class="mm-st">${sts.map(s => `<button class="${n.st === s.key ? 'on' : ''}" style="--c:${s.color}" data-act="setStatus" data-id="${n.id}" data-st="${esc(s.key)}"><i></i>${esc(s.label)}</button>`).join('')}</div>`}
    <h4>${isTop ? 'Items' : 'Under it'} <em>${kids.length}</em></h4>
    <div class="mm-list">${kids.map(k => { const sc = (sts.find(s => s.key === k.st) || {}).color || 'var(--ink-3)'; const m = (k.k || []).length; return `<button class="mm-item sm" data-act="mmSel" data-id="${k.id}" style="--c:${sc}"><i></i><span><b>${esc(k.t)}</b>${m ? `<small>${m} under it</small>` : ''}</span>${icon('chev', 14)}</button>`; }).join('')}</div>
    <div class="mm-add"><input class="field" data-k="mm-add-${n.id}" data-enter="mmAdd" data-id="${n.id}" placeholder="Add under ${esc(cut(n.t, 20))}"><button class="btn" data-act="mmAdd" data-id="${n.id}" aria-label="Add">${icon('plus', 15)}</button></div>
    <div class="mm-acts"><button class="btn" data-act="openNode" data-id="${n.id}">${icon('projects', 15)}Open in Projects</button><button class="iconbtn" data-act="mmDel" data-id="${n.id}" aria-label="Delete ${esc(n.t)}" title="Delete">${icon('trash', 16)}</button></div>`;
}

// The Home card
export function mindmapCard() {
  const n = S().areas.length; const items = S().areas.reduce((x, a) => x + (a.k || []).flatMap(leaves).length, 0);
  return `<section class="panel mm" aria-label="Mind map">
    <div class="ptitle"><span class="h2">Mind map</span><span class="faint mm-sub">${n} branches · ${items} items · the same tree as Projects</span><span class="sp"></span><a class="link" href="#/projects">Open projects</a></div>
    <div class="mm-wrap"><div class="mm-canvas">${svg()}</div><aside class="mm-panel">${panel()}</aside></div></section>`;
}

// Plan map: the five departments of the Mansen plan map, kept locked in content/planmap.bin.
// A department joins the existing topic that starts with the same word (Smart City, Branding), otherwise it becomes a new topic.
// Workstreams become items, work packages go under them. Nothing that already exists by name is added twice.
async function seed() {
  let pm;
  try { pm = await unlockData('planmap', 1); } catch (e) { toast('The plan map could not be opened. Check your connection and try again.'); return; }
  const first = t => String(t).toLowerCase().trim().split(/\s+/)[0];
  const same = (a, b) => String(a).toLowerCase().trim() === String(b).toLowerCase().trim();
  let added = 0;
  mutate(s => {
    if (!s.mapGoal) s.mapGoal = pm.goal;
    pm.depts.forEach(d => {
      let a = s.areas.find(x => same(x.t, d.name)) || s.areas.find(x => first(x.t) === first(d.name));
      if (!a) { a = mkNode(d.name, ''); a.s = d.objective; s.areas.push(a); added++; }
      if (!a.c) a.c = d.color;
      d.streams.forEach(w => {
        let n = (a.k || []).find(x => same(x.t, w.name));
        if (!n) { n = mkNode(w.name, 'Next', w.outcome); a.k.push(n); added++; }
        w.wps.forEach(x => { if (!n.k.some(y => same(y.t, x))) { n.k.push(mkNode(x, 'Next')); added++; } });
      });
    });
    s.mapSeed = Date.now();
  });
  toast(`Plan map added: ${added} new branches and items, also in Projects`, true);
}

export const MA = {
  mmSel(el) { MM.sel = el.dataset.id; redraw(); },
  mmAddTopic(el) {
    const inp = el.tagName === 'INPUT' ? el : document.querySelector('[data-k="mm-topic"]'); const x = inp.value.trim(); if (!x) return;
    const n = mkNode(x, ''); window.dispatchEvent(new CustomEvent('mph:focus', { detail: 'mm-topic' }));
    mutate(s => { n.c = PAL[s.areas.length % PAL.length]; s.areas.push(n); }); toast(`Added ${x} to Projects`);
  },
  mmAdd(el) {
    const id = el.dataset.id; const inp = el.tagName === 'INPUT' ? el : document.querySelector(`[data-k="mm-add-${id}"]`); const x = inp.value.trim(); if (!x) return;
    window.dispatchEvent(new CustomEvent('mph:focus', { detail: 'mm-add-' + id }));
    mutate(s => { const f = locate(s.areas, id); if (f) { f.node.k = f.node.k || []; f.node.k.push(mkNode(x, 'Next')); } });
  },
  mmColor(el) { mutate(s => { const f = locate(s.areas, el.dataset.id); if (f) f.node.c = el.dataset.c; }); },
  mmDel(el) {
    const id = el.dataset.id; const path = pathTo(S().areas, id); if (!path) return; const name = path[path.length - 1].t;
    MM.sel = path.length > 1 ? path[path.length - 2].id : 'goal';
    mutate(s => { const f = locate(s.areas, id); if (f) f.arr.splice(f.i, 1); }); toast(`Deleted ${name}`, true);
  },
  mmSeed() { seed(); }
};
export const MC = {
  mmGoal(el) { mutate(s => { s.mapGoal = el.value.trim(); }, 'mmgoal'); }
};
// keyboard: Enter or Space on a node selects it
document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.mm-svg [data-act="mmSel"]')) { e.preventDefault(); MM.sel = e.target.dataset.id; redraw(); } });

// After each render: open the map centred on phones, and keep where you scrolled it while you edit.
let SX = null;
export function mmAfter() {
  const c = document.querySelector('.mm-canvas'); if (!c) return;
  const max = c.scrollWidth - c.clientWidth; if (max <= 0) return;
  c.scrollLeft = SX === null ? max / 2 : Math.min(SX, max);
  c.addEventListener('scroll', () => { SX = c.scrollLeft; }, { passive: true });
}
