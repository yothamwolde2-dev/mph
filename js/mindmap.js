// MPH mind map (1.0.1). The map is a picture of Projects: the centre circle opens into the topics, each topic opens
// into its items, and so on, like a work breakdown structure. Editing the map edits Projects and editing Projects redraws the map,
// because both read and write the same tree (store.state.areas). Selecting a branch opens its panel,
// where you rename it, change its status, add items under it, or go deeper.
import { esc, icon, mkNode, locate, pathTo, leaves, areaProgress, progress } from './core.js?v=1.0.1';
import { store, mutate } from './store.js?v=1.0.1';
import { unlockData } from './content.js?v=1.0.1';

const S = () => store.state;
const redraw = () => window.dispatchEvent(new Event('mph:redraw'));
const toast = (t, undo) => window.dispatchEvent(new CustomEvent('mph:toast', { detail: { text: t, undo } }));
export const PAL = ['#39B44A', '#2F6BFF', '#D6457A', '#C98A12', '#0F9488', '#7B5CE0', '#E0603A', '#5B6B7C'];
const MM = { sel: 'goal', open: new Set(), shown: new Set(), fresh: new Set(), root: null };
// Each branch keeps its chosen colour; branches without one take the palette colours nobody uses yet.
let CMAP = new Map();
function paint(areas) { CMAP = new Map(); const used = new Set(areas.map(a => a.c).filter(Boolean)); const free = PAL.filter(c => !used.has(c)); let j = 0;
  areas.forEach((a, i) => CMAP.set(a.id, a.c || (free.length ? free[j++ % free.length] : PAL[i % PAL.length]))); }
const colorOf = a => CMAP.get(a.id) || a.c || PAL[0];
const cut = (t, n) => { t = String(t || '').trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t; };
const GOAL0 = 'Set the one goal that every project serves';

// LAYOUT (1.0.1): a work breakdown tree that grows out of the centre circle, one level per click.
// Closed, the map is only the circle. Open it and the branches spread left and right; open a branch and its
// items appear further out, and so on to any depth. MM.open holds what is open (screen state, not data).
const RR = 62, GAP = 64, STEP = 236, ROW = 50;
const pillW = (t, d) => Math.min(d === 1 ? 210 : 200, Math.round(cut(t, d === 1 ? 18 : 22).length * (d === 1 ? 8.7 : 7.7) + (d === 1 ? 44 : 50)));
const kidsOf = n => (n.k || []);
const isOpen = id => MM.open.has(id);
function hOf(n) { const k = kidsOf(n); return isOpen(n.id) && k.length ? Math.max(ROW, k.reduce((x, c) => x + hOf(c), 0)) : ROW; }

function svg() {
  const st = S(); const areas = st.areas; const sts = st.statuses; paint(areas);
  const stc = k => (sts.find(s => s.key === k) || {}).color || '#8A8A8A';
  const rootOpen = MM.open.has('root');
  const nodes = []; const links = [];
  if (rootOpen && areas.length) {
    // split the branches into a right and a left side of about equal height
    const hs = areas.map(hOf); const total = hs.reduce((x, y) => x + y, 0);
    let acc = 0; const right = [], left = [];
    areas.forEach((a, i) => { if (acc < total / 2 || !right.length) { right.push(a); acc += hs[i]; } else left.push(a); });
    const place = (list, dir) => {
      const H = list.reduce((x, a) => x + hOf(a), 0); let y = -H / 2;
      const walk = (n, depth, top, c, parent) => {
        const h = hOf(n); const cy = top + h / 2; const w = pillW(n.t, depth);
        const x0 = dir > 0 ? RR + GAP + (depth - 1) * STEP : -(RR + GAP + (depth - 1) * STEP) - w;
        const node = { n, depth, c, dir, x: x0, y: cy, w, h: depth === 1 ? 42 : 36 };
        nodes.push(node);
        if (parent) links.push({ a: parent, b: node, c });
        else links.push({ a: null, b: node, c });
        if (isOpen(n.id)) { let t = top; kidsOf(n).forEach(k => { walk(k, depth + 1, t, c, node); t += hOf(k); }); }
      };
      list.forEach(a => { walk(a, 1, y, colorOf(a), null); y += hOf(a); });
    };
    place(right, 1); place(left, -1);
  }
  // bounds
  let minX = -RR - 30, maxX = RR + 30, minY = -RR - 40, maxY = RR + 60;
  nodes.forEach(o => { minX = Math.min(minX, o.x - 40); maxX = Math.max(maxX, o.x + o.w + 40); minY = Math.min(minY, o.y - 30); maxY = Math.max(maxY, o.y + 30); });
  const PAD = 30; const W = Math.ceil(maxX - minX + PAD * 2), H = Math.ceil(maxY - minY + PAD * 2);
  const ox = PAD - minX, oy = PAD - minY; MM.root = { x: ox, y: oy, W, H };
  const X = v => (v + ox).toFixed(1), Y = v => (v + oy).toFixed(1);
  const selPath = MM.sel === 'goal' ? [] : (pathTo(areas, MM.sel) || []).map(x => x.id);
  MM.fresh = new Set(nodes.filter(o => !MM.shown.has(o.n.id)).map(o => o.n.id));
  let s = '';
  links.forEach(({ a, b, c }) => {
    let x1, y1; const x2 = b.dir > 0 ? b.x : b.x + b.w, y2 = b.y;
    if (!a) { const ang = Math.atan2(b.y, b.dir * (RR + GAP)); x1 = b.dir * RR * Math.cos(Math.abs(ang)) * 0.98; y1 = RR * Math.sin(ang) * 0.98; }
    else { x1 = a.dir > 0 ? a.x + a.w : a.x; y1 = a.y; }
    const m = (x1 + x2) / 2; const on = selPath.includes(b.n.id);
    s += `<path class="mm-link ${MM.fresh.has(b.n.id) ? 'in' : ''} ${on ? 'on' : ''}" d="M${X(x1)} ${Y(y1)} C${X(m)} ${Y(y1)} ${X(m)} ${Y(y2)} ${X(x2)} ${Y(y2)}" stroke="${c}" stroke-width="${b.depth === 1 ? 3.2 : 2}" fill="none" stroke-linecap="round"/>`;
  });
  nodes.forEach(o => {
    const { n, depth, c, dir } = o; const k = kidsOf(n).length; const open = isOpen(n.id);
    const sel = MM.sel === n.id; const done = n.st === 'Done';
    const lx = o.x, ty = o.y - o.h / 2; const label = cut(n.t, depth === 1 ? 18 : 22);
    const badgeX = dir > 0 ? lx + o.w + 15 : lx - 15;
    const badge = k ? `<g class="mm-badge ${open ? 'open' : ''}"><circle cx="${X(badgeX)}" cy="${Y(o.y)}" r="11"/><text x="${X(badgeX)}" y="${Y(o.y + 4)}">${open ? '' : k}</text></g>` : '';
    const body = depth === 1
      ? `<rect class="shape" x="${X(lx)}" y="${Y(ty)}" width="${o.w}" height="${o.h}" rx="${o.h / 2}" fill="${c}"/><text class="t1" x="${X(lx + o.w / 2)}" y="${Y(o.y + 5)}">${esc(label)}</text>`
      : `<rect class="shape" x="${X(lx)}" y="${Y(ty)}" width="${o.w}" height="${o.h}" rx="${o.h / 2}"/><circle cx="${X(lx + 17)}" cy="${Y(o.y)}" r="4.5" fill="${stc(n.st)}"/><text class="t2" x="${X(lx + 30)}" y="${Y(o.y + 4.6)}">${esc(label)}</text>`;
    s += `<g class="mm-node d${Math.min(depth, 3)} ${sel ? 'on' : ''} ${done ? 'done' : ''} ${MM.fresh.has(n.id) ? 'in' : ''}" style="--c:${c};--dx:${dir * -14}px" tabindex="0" role="button" data-act="mmSel" data-id="${n.id}" aria-expanded="${k ? open : ''}" aria-label="${esc(n.t)}${k ? ', ' + k + ' under it' : ''}">${body}${badge}</g>`;
  });
  s += `<g class="mm-core ${MM.sel === 'goal' ? 'on' : ''} ${rootOpen ? 'open' : 'shut'}" tabindex="0" role="button" data-act="mmSel" data-id="goal" aria-expanded="${rootOpen}" aria-label="Mind map, ${areas.length} branches">
    <circle class="pulse" cx="${ox}" cy="${oy}" r="${RR + 6}"/><circle class="glow" cx="${ox}" cy="${oy}" r="${RR + 5}"/><circle class="shape" cx="${ox}" cy="${oy}" r="${RR}"/>
    <text class="c1" x="${ox}" y="${oy + 2}">Mind map</text><text class="c2" x="${ox}" y="${oy + 22}">${rootOpen ? areas.length + ' branches' : 'Tap to open'}</text></g>`;
  MM.shown = new Set(nodes.map(o => o.n.id));
  return `<svg class="mm-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="group" aria-label="Mind map of your projects">${s}</svg>`;
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
    <div class="ptitle"><span class="h2">Mind map</span><span class="faint mm-sub">${n} branches · ${items} items · the same tree as Projects</span><span class="sp"></span>${MM.open.size ? `<button class="link" data-act="mmFold">Close all</button>` : ''}<button class="link" data-act="mmAll">Open all</button></div>
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
  mmSel(el) {
    const id = el.dataset.id;
    if (id === 'goal') { if (MM.sel === 'goal' && MM.open.has('root')) MM.open.delete('root'); else MM.open.add('root'); MM.sel = 'goal'; redraw(); return; }
    const path = pathTo(S().areas, id); if (!path) return; const n = path[path.length - 1];
    MM.open.add('root'); path.slice(0, -1).forEach(x => MM.open.add(x.id));
    if ((n.k || []).length) {
      if (MM.sel === id && MM.open.has(id)) MM.open.delete(id);
      else { const sibs = path.length > 1 ? path[path.length - 2].k : S().areas; sibs.forEach(x => { if (x.id !== id) MM.open.delete(x.id); }); MM.open.add(id); }
    }
    MM.sel = id; MM.focus = id; redraw();
  },
  mmAll() { MM.open.add('root'); const w = a => a.forEach(n => { if ((n.k || []).length) { MM.open.add(n.id); w(n.k); } }); w(S().areas); redraw(); },
  mmFold() { MM.open = new Set(); MM.sel = 'goal'; SX = null; SY = null; redraw(); },
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
document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.mm-svg [data-act="mmSel"]')) { e.preventDefault(); MA.mmSel(e.target); } });

// After each render: keep the circle in view the first time, then keep where you scrolled while you open and edit.
let SX = null, SY = null;
export function mmAfter() {
  const c = document.querySelector('.mm-canvas'); if (!c || !MM.root) return;
  if (SX === null) { c.scrollLeft = Math.max(0, MM.root.x - c.clientWidth / 2); c.scrollTop = Math.max(0, MM.root.y - c.clientHeight / 2); }
  else { c.scrollLeft = SX; c.scrollTop = SY; }
  // glide to what was just opened, so the new level is in view
  if (MM.focus) { const el = c.querySelector(`.mm-node[data-id="${MM.focus}"]`); MM.focus = null;
    if (el) { const r = el.getBoundingClientRect(), cr = c.getBoundingClientRect(); const right = el.style.getPropertyValue('--dx').trim().startsWith('-');
      const L = r.left - cr.left, R = r.right - cr.left; let dx = 0; const narrow = c.clientWidth < 640; const kids = el.getAttribute('aria-expanded') === 'true';
      if (right) dx = narrow && kids ? R - 90 : R + 300 > c.clientWidth || L < 0 ? L - 40 : 0;
      else dx = narrow && kids ? L - c.clientWidth + 90 : L - 300 < 0 || R > c.clientWidth ? R - c.clientWidth + 40 : 0;
      const dy = r.top + r.height / 2 - cr.top - c.clientHeight / 2;
      c.scrollTo({ left: c.scrollLeft + dx, top: c.scrollTop + dy, behavior: 'smooth' }); } }
  c.addEventListener('scroll', () => { SX = c.scrollLeft; SY = c.scrollTop; }, { passive: true });
}
