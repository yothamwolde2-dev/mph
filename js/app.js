// MPH app: routing, rendering, actions, upload and the HTML reader.
import { esc, icon, uid, today, locate, mkNode, kb, clone } from './core.js';
import { store, sb, onChange, mutate, touch, undo, redo, startSession, endSession, importPortfolio, uploadDoc, readDoc, readDocState, saveDocState, CONFIG } from './store.js';
import * as V from './views.js';

const $app = document.getElementById('app');
const $layer = document.getElementById('layer');
const $toasts = document.getElementById('toasts');

const ui = {
  open: load('mph:open', {}), drawer: null, customize: false, weekOffset: 0, allOpen: false,
  menu: null, modal: null, authMode: 'signin', authMsg: '', authErr: false, focus: load('mph:focus', false)
};
function load(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } }
function keep(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

const route = () => (location.hash.replace(/^#\/?/, '') || 'home');

// RENDER
let readerId = null, frame = null;
function render() {
  document.documentElement.dataset.theme = store.state.theme || 'dark';
  if (!store.user) { readerId = null; $app.innerHTML = V.login(ui.authMode, ui.authMsg, ui.authErr); $layer.innerHTML = ''; return; }
  const r = route();
  if (r.startsWith('read/')) { mountReader(r.slice(5)); renderLayer(); return; }
  readerId = null; frame = null;
  const base = r.split('/')[0];
  const inner = base === 'projects' ? V.projects(ui) : base === 'tasks' ? V.tasks(ui) : base === 'week' ? V.week(ui)
    : base === 'learning' ? V.shelf('learning', ui) : base === 'library' ? V.shelf('library', ui) : base === 'settings' ? V.settings(ui) : V.home(ui);
  const a = document.activeElement; const fk = a && a.dataset ? a.dataset.k : null;
  const sy = window.scrollY;
  $app.innerHTML = V.shell(r, inner);
  window.scrollTo(0, sy);
  renderLayer();
  const want = ui.wantFocus || fk;
  if (want) { const el = document.querySelector(`[data-k="${CSS.escape(want)}"]`); if (el) { el.focus(); if (ui.wantFocus && el.select) el.select(); } }
  ui.wantFocus = null;
}
function renderLayer() {
  let h = '';
  if (ui.drawer) h += V.drawer(ui.drawer);
  if (ui.modal) h += modal();
  if (ui.menu) h += menu();
  $layer.innerHTML = h;
  if (ui.drawer) { const t = $layer.querySelector('textarea.big'); if (t) { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; } }
}
onChange(render);
window.addEventListener('hashchange', () => { ui.menu = null; ui.drawer = null; render(); window.scrollTo(0, 0); });

// TOASTS
function toast(text, withUndo) {
  const el = document.createElement('div'); el.className = 'toast';
  el.innerHTML = `<span>${esc(text)}</span>${withUndo ? '<button>Undo</button>' : ''}`;
  if (withUndo) el.querySelector('button').onclick = () => { undo(); el.remove(); };
  while ($toasts.children.length > 2) $toasts.firstChild.remove();
  $toasts.appendChild(el); setTimeout(() => el.remove(), withUndo ? 6000 : 3500);
}
window.addEventListener('mph:toast', e => toast(e.detail.text));

// HELPERS
const S = () => store.state;
const find = id => locate(S().areas, id);
const near = (el, sel) => (el.closest('.addline, .two, .body, .panel') || document).querySelector(sel);
const nodeIn = (s, id) => locate(s.areas, id);

// ACTIONS
const A = {
  undo() { if (undo()) toast('Undone'); },
  redo() { if (redo()) toast('Redone'); },
  customize() { ui.customize = !ui.customize; render(); },
  wMove(el) { const id = el.dataset.id, d = +el.dataset.d; mutate(s => { const o = s.home.order, i = o.indexOf(id), j = i + d; if (j < 0 || j >= o.length) return; [o[i], o[j]] = [o[j], o[i]]; }); },
  wToggle(el) { const id = el.dataset.id; mutate(s => { const h = s.home.hidden; const i = h.indexOf(id); i >= 0 ? h.splice(i, 1) : h.push(id); }); },
  quickAdd(el) { const inp = document.querySelector('[data-k="quick"]'); const x = inp.value.trim(); if (!x) return; ui.wantFocus = 'quick'; mutate(s => s.tasks.push({ id: uid('t'), x, d: today(), done: false, at: Date.now() })); toast('Added to today'); },
  addTask() { const x = document.getElementById('task-x').value.trim(); const d = document.getElementById('task-d').value; if (!x) return; ui.taskDate = d; ui.wantFocus = 'task-x'; mutate(s => s.tasks.push({ id: uid('t'), x, d, done: false, at: Date.now() })); },
  delTask(el) { mutate(s => { s.tasks = s.tasks.filter(t => t.id !== el.dataset.id); }); toast('Task deleted', true); },
  toggleAgenda(el) {
    const { kind, id, nid } = el.dataset;
    mutate(s => {
      if (kind === 'task') { const t = s.tasks.find(t => t.id === id); if (t) { t.done = !t.done; t.at = Date.now(); } }
      else if (kind === 'node') { const f = nodeIn(s, id); if (f) { const n = f.node; if (n.st === 'Done') n.st = n.prev || 'In Progress'; else { n.prev = n.st; n.st = 'Done'; } } }
      else if (kind === 'rem') { const f = nodeIn(s, nid); if (f) { const r = f.node.r.find(r => r.id === id); if (r) r.done = !r.done; } }
    });
  },
  goalAdd(el) { const w = el.dataset.w; const inp = el.tagName === 'INPUT' ? el : near(el, 'input'); const x = inp.value.trim(); if (!x) return; ui.wantFocus = inp.dataset.k; mutate(s => { (s.goals[w] = s.goals[w] || []).push({ id: uid('g'), x, done: false }); }); },
  goalToggle(el) { mutate(s => { const g = (s.goals[el.dataset.w] || []).find(g => g.id === el.dataset.id); if (g) g.done = !g.done; }); },
  goalDel(el) { mutate(s => { s.goals[el.dataset.w] = (s.goals[el.dataset.w] || []).filter(g => g.id !== el.dataset.id); }); toast('Goal removed', true); },
  goalMove(el) { mutate(s => { const a = s.goals[el.dataset.w] || []; const i = a.findIndex(g => g.id === el.dataset.id), j = i + (+el.dataset.d); if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; }); },
  weekNav(el) { const d = +el.dataset.d; ui.weekOffset = d === 0 ? 0 : ui.weekOffset + d; render(); },
  focusArea(el, e) { e.preventDefault(); ui.open[el.dataset.id] = true; keep('mph:open', ui.open); location.hash = '#/projects'; setTimeout(() => { const t = document.getElementById('a-' + el.dataset.id); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 60); },
  toggle(el, e) { if (e.target.closest('[data-stop]')) return; const id = el.dataset.id; ui.open[id] = !ui.open[id]; keep('mph:open', ui.open); render(); },
  expandAll() { ui.allOpen = !ui.allOpen; const set = (arr) => arr.forEach(n => { if (n.k && n.k.length) { ui.open[n.id] = ui.allOpen; set(n.k); } }); S().areas.forEach(a => { ui.open[a.id] = ui.allOpen; set(a.k || []); }); keep('mph:open', ui.open); render(); },
  addArea() { const n = mkNode('New topic', ''); mutate(s => s.areas.push(n)); ui.open[n.id] = true; keep('mph:open', ui.open); setTimeout(() => { const el = document.querySelector(`#a-${n.id} input`); if (el) { el.focus(); el.select(); el.scrollIntoView({ block: 'center' }); } }, 30); },
  addChild(el) { const pid = el.dataset.id; const n = mkNode('New item', 'Next'); mutate(s => { const f = nodeIn(s, pid); if (f) f.node.k.push(n); }); ui.open[pid] = true; keep('mph:open', ui.open); ui.drawer = n.id; render(); focusDrawerTitle(); },
  addFromTemplate(el) {
    const t = S().templates.find(t => t.id === el.dataset.t); if (!t) return;
    const n = mkNode('New company', 'Next', '', t.items.map(x => mkNode(x, 'Next')));
    mutate(s => { const f = nodeIn(s, el.dataset.id); if (f) f.node.k.push(n); });
    ui.open[el.dataset.id] = true; keep('mph:open', ui.open); ui.drawer = n.id; render(); focusDrawerTitle();
  },
  addSub(el) { const inp = el.tagName === 'INPUT' ? el : near(el, 'input'); const x = inp.value.trim(); if (!x) return; ui.wantFocus = inp.dataset.k; mutate(s => { const f = nodeIn(s, el.dataset.id); if (f) f.node.k.push(mkNode(x, 'Next')); }); ui.open[el.dataset.id] = true; keep('mph:open', ui.open); },
  delNode(el) {
    const f = find(el.dataset.id); if (!f) return; const name = f.node.t;
    mutate(s => { const g = nodeIn(s, el.dataset.id); if (g) g.arr.splice(g.i, 1); });
    if (ui.drawer && !find(ui.drawer)) { ui.drawer = null; render(); }
    ui.menu = null; toast(`Deleted ${name}`, true);
  },
  openNode(el) { ui.drawer = el.dataset.id; renderLayer(); },
  closeDrawer() { ui.drawer = null; renderLayer(); },
  setStatus(el) { mutate(s => { const f = nodeIn(s, el.dataset.id); if (f) f.node.st = el.dataset.st; }); },
  addNote(el) { const t = document.getElementById('note-' + el.dataset.id); const x = t.value.trim(); if (!x) return; mutate(s => { const f = nodeIn(s, el.dataset.id); if (f) f.node.n.push({ id: uid('o'), x, ts: Date.now() }); }); },
  delNote(el) { mutate(s => { const f = nodeIn(s, el.dataset.id); if (f) f.node.n = f.node.n.filter(o => o.id !== el.dataset.o); }); toast('Note deleted', true); },
  addRem(el) { const id = el.dataset.id; const x = document.getElementById('rem-x-' + id).value.trim(); const d = document.getElementById('rem-d-' + id).value; if (!x || !d) return; mutate(s => { const f = nodeIn(s, id); if (f) f.node.r.push({ id: uid('r'), x, d }); }); },
  delRem(el) { mutate(s => { const f = nodeIn(s, el.dataset.id); if (f) f.node.r = f.node.r.filter(o => o.id !== el.dataset.o); }); toast('Reminder deleted', true); },
  areaMenu(el, e) { openMenu('area', el.dataset.id, e); },
  menuDo(el) {
    const { act, id } = el.dataset; const m = ui.menu; ui.menu = null;
    if (act === 'aAdd') return A.addChild({ dataset: { id } });
    if (act === 'aUp' || act === 'aDown') { mutate(s => { const i = s.areas.findIndex(a => a.id === id), j = i + (act === 'aUp' ? -1 : 1); if (j < 0 || j >= s.areas.length) return; [s.areas[i], s.areas[j]] = [s.areas[j], s.areas[i]]; }); return; }
    if (act === 'aDel') return A.delNode({ dataset: { id } });
    if (act === 'aOpen') { ui.drawer = id; return renderLayer(); }
    if (act === 'dOpen') { location.hash = '#/read/' + id; return; }
    if (act === 'dRename') { const d = S().docs.find(d => d.id === id); ui.modal = { type: 'rename', id, value: d.title }; return renderLayer(); }
    if (act === 'dMove') { const d = S().docs.find(d => d.id === id); ui.modal = { type: 'move', id, section: d.section, col: d.col }; return renderLayer(); }
    if (act === 'dDel') { const d = S().docs.find(d => d.id === id); mutate(s => { s.docs = s.docs.filter(x => x.id !== id); }); toast(`Removed ${d.title}`, true); return; }
    if (act === 'cUpload') { const c = S().cols.find(c => c.id === id); return pickFiles(c.section, c.id); }
    if (act === 'cUp' || act === 'cDown') { mutate(s => { const c = s.cols.find(c => c.id === id); const same = s.cols.filter(x => x.section === c.section); const i = same.indexOf(c), j = i + (act === 'cUp' ? -1 : 1); if (j < 0 || j >= same.length) return; const a = s.cols.indexOf(same[i]), b = s.cols.indexOf(same[j]); [s.cols[a], s.cols[b]] = [s.cols[b], s.cols[a]]; }); return; }
    if (act === 'cDel') { const c = S().cols.find(c => c.id === id); mutate(s => { s.cols = s.cols.filter(x => x.id !== id); s.docs.forEach(d => { if (d.col === id) d.col = ''; }); }); toast(`Removed ${c.name}. Its documents moved to Unsorted`, true); return; }
    renderLayer();
  },
  closeMenu() { ui.menu = null; renderLayer(); },
  async importPortfolio() { const n = await importPortfolio(); toast(n ? `Brought in ${n} topics from your Work Portfolio` : 'Everything from your Work Portfolio is already here'); },
  exportBackup() {
    const b = new Blob([JSON.stringify({ app: 'MPH', version: CONFIG.version, at: new Date().toISOString(), state: S() }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `mph-backup-${today()}.json`; document.body.appendChild(a); a.click(); a.remove();
  },
  theme(el) { mutate(s => { s.theme = el.dataset.v; }); },
  async signOut() { await sb.auth.signOut(); },
  authMode(el) { ui.authMode = el.dataset.v; ui.authMsg = ''; ui.authErr = false; render(); },
  upload(el) { pickFiles(el.dataset.s, el.dataset.c || ''); },
  addCol(el) { ui.modal = { type: 'newCol', section: el.dataset.s, name: '' }; renderLayer(); setTimeout(() => { const i = $layer.querySelector('[data-m="name"]'); if (i) i.focus(); }, 30); },
  colMenu(el, e) { openMenu('col', el.dataset.id, e); },
  openDoc(el, e) { if (e && e.target.closest('[data-stop]')) return; location.hash = '#/read/' + el.dataset.id; },
  docMenu(el, e) { openMenu('doc', el.dataset.id, e); },
  modalClose() { ui.modal = null; renderLayer(); },
  async uploadGo() {
    const m = ui.modal; if (!m || m.busy) return;
    const titles = [...$layer.querySelectorAll('[data-m="title"]')].map(i => i.value.trim());
    const section = $layer.querySelector('[data-m="section"]').value;
    let col = $layer.querySelector('[data-m="col"]').value;
    const newName = ($layer.querySelector('[data-m="newcol"]') || {}).value;
    m.busy = true; m.msg = 'Uploading'; renderLayer();
    try {
      let newCol = null;
      if (col === '__new') { const nm = (newName || '').trim() || 'New collection'; newCol = { id: uid('c'), section, name: nm }; col = newCol.id; }
      const made = [];
      for (let i = 0; i < m.files.length; i++) {
        m.msg = `Uploading ${i + 1} of ${m.files.length}`; renderLayer();
        made.push(await uploadDoc(m.files[i], { title: titles[i] || niceName(m.files[i].name), section, col }));
      }
      mutate(s => { if (newCol) s.cols.push(newCol); made.forEach(d => s.docs.push(d)); });
      ui.modal = null; renderLayer();
      toast(made.length === 1 ? `${made[0].title} is ready to read` : `${made.length} documents uploaded`);
      if (route() !== section) location.hash = '#/' + section;
    } catch (err) { m.busy = false; m.msg = 'Upload failed. Check your connection and try again.'; renderLayer(); }
  },
  renameGo() { const v = $layer.querySelector('[data-m="value"]').value.trim(); const id = ui.modal.id; ui.modal = null; if (v) mutate(s => { const d = s.docs.find(d => d.id === id); if (d) d.title = v; }); else renderLayer(); },
  moveGo() {
    const id = ui.modal.id; const section = $layer.querySelector('[data-m="section"]').value; let col = $layer.querySelector('[data-m="col"]').value; const nn = ($layer.querySelector('[data-m="newcol"]') || {}).value;
    ui.modal = null;
    mutate(s => { if (col === '__new') { const c = { id: uid('c'), section, name: (nn || '').trim() || 'New collection' }; s.cols.push(c); col = c.id; } const d = s.docs.find(d => d.id === id); if (d) { d.section = section; d.col = col; } });
  },
  newColGo() { const v = $layer.querySelector('[data-m="name"]').value.trim(); const section = ui.modal.section; ui.modal = null; if (v) mutate(s => s.cols.push({ id: uid('c'), section, name: v })); else renderLayer(); },
  readerBack() { const d = S().docs.find(d => d.id === readerId); if (history.length > 1 && document.referrer !== '' || history.state) history.back(); else location.hash = '#/' + (d ? d.section : 'library'); },
  readerHome() { const d = S().docs.find(d => d.id === readerId); location.hash = '#/' + (d ? d.section : 'library'); },
  readerReload() { const id = readerId; readerId = null; mountReader(id); },
  readerFocus() { ui.focus = !ui.focus; keep('mph:focus', ui.focus); const r = document.querySelector('.reader'); if (r) r.classList.toggle('focus', ui.focus); }
};

// change handlers
const C = {
  profileName(el) { mutate(s => { s.profile.name = el.value.trim(); }, 'pname'); },
  profileMotto(el) { mutate(s => { s.profile.motto = el.value.trim(); }, 'pmotto'); },
  rename(el) { const v = el.value.trim(); if (!v) { render(); return; } mutate(s => { const f = nodeIn(s, el.dataset.id); if (f) f.node.t = v; }, 'rn' + el.dataset.id); },
  desc(el) { mutate(s => { const f = nodeIn(s, el.dataset.id); if (f) f.node.s = el.value.trim(); }, 'ds' + el.dataset.id); },
  status(el) { mutate(s => { const f = nodeIn(s, el.dataset.id); if (f) f.node.st = el.value; }); },
  due(el) { mutate(s => { const f = nodeIn(s, el.dataset.id); if (f) f.node.due = el.value; }); },
  prio(el) { mutate(s => { const f = nodeIn(s, el.dataset.id); if (f) f.node.pr = el.value; }); },
  goalEdit(el) { const v = el.value.trim(); mutate(s => { const g = (s.goals[el.dataset.w] || []).find(g => g.id === el.dataset.id); if (g && v) g.x = v; }); },
  reflect(el) { mutate(s => { s.reflections[el.dataset.w] = el.value; }, 'rf' + el.dataset.w); },
  statusLabel(el) { const v = el.value.trim(); if (!v) return render(); mutate(s => { const st = s.statuses.find(x => x.key === el.dataset.k2); if (st) st.label = v; }); },
  template(el) { const items = el.value.split('\n').map(x => x.trim()).filter(Boolean); mutate(s => { const t = s.templates.find(t => t.id === el.dataset.id); if (t) t.items = items; }); },
  colName(el) { const v = el.value.trim(); if (!v) return render(); mutate(s => { const c = s.cols.find(c => c.id === el.dataset.id); if (c) c.name = v; }); },
  restore(el) {
    const f = el.files && el.files[0]; if (!f) return;
    f.text().then(t => { try { const d = JSON.parse(t); const st = d.state || d; if (!st.areas) throw 0; mutate(s => { Object.keys(s).forEach(k => delete s[k]); Object.assign(s, st); }); toast('Backup restored. Undo is available', true); } catch (e) { toast('That file is not an MPH backup'); } });
  }
};

// MENUS AND MODALS
function openMenu(type, id, e) { e.stopPropagation(); const r = e.target.closest('button').getBoundingClientRect(); ui.menu = { type, id, x: Math.min(r.right - 190, innerWidth - 200), y: r.bottom + 6 }; renderLayer(); }
function menu() {
  const m = ui.menu; const b = (act, label) => `<button data-act="menuDo" data-act2="${act}" data-id="${m.id}">${label}</button>`;
  let items = '';
  if (m.type === 'area') items = b('aOpen', 'Details and notes') + b('aAdd', 'Add item') + b('aUp', 'Move up') + b('aDown', 'Move down') + '<div class="sep"></div>' + b('aDel', 'Delete topic');
  if (m.type === 'doc') items = b('dOpen', 'Open') + b('dRename', 'Rename') + b('dMove', 'Move') + '<div class="sep"></div>' + b('dDel', 'Remove');
  if (m.type === 'col') items = b('cUpload', 'Upload here') + b('cUp', 'Move up') + b('cDown', 'Move down') + '<div class="sep"></div>' + b('cDel', 'Remove collection');
  const top = Math.min(m.y, innerHeight - 220);
  return `<div style="position:fixed;inset:0;z-index:49" data-act="closeMenu"></div><div class="menu-pop" style="left:${Math.max(8, m.x)}px;top:${top}px">${items}</div>`;
}
function colOptions(section, sel, allowNew = true) {
  const cols = S().cols.filter(c => c.section === section);
  const fresh = allowNew && !cols.length && !sel;
  return cols.map(c => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('') + `<option value="" ${!sel && !fresh ? 'selected' : ''}>Unsorted</option>` + (allowNew ? `<option value="__new" ${fresh ? 'selected' : ''}>New collection</option>` : '');
}
function modal() {
  const m = ui.modal;
  const wrap = (title, body, foot) => `<div class="scrim" data-act="modalClose"></div><div class="modal" role="dialog" aria-label="${esc(title)}"><h2 class="display">${esc(title)}</h2>${body}<div class="foot">${foot}</div></div>`;
  const placeFields = (section, col) => `<div class="two"><label><span class="label">Section</span><select class="field" data-m="section">${['learning', 'library'].map(s => `<option value="${s}" ${s === section ? 'selected' : ''}>${s === 'learning' ? 'Learning' : 'Library'}</option>`).join('')}</select></label>
    <label><span class="label">Collection</span><select class="field" data-m="col">${colOptions(section, col)}</select></label></div>
    <div data-newcol ${colOptions(section, col).includes('__new" selected') ? '' : 'hidden'}><span class="label">New collection name</span><input class="field" data-m="newcol" placeholder="For example Chinese, German, Coffee export"></div>`;
  if (m.type === 'upload') {
    return wrap(m.files.length > 1 ? `Upload ${m.files.length} documents` : 'Upload document', `<p class="muted">Name each document and choose where it lives.</p><div class="stack">
      <div class="filelist">${m.files.map(f => `<div class="fileitem">${icon('file', 18)}<input class="field" data-m="title" value="${esc(niceName(f.name))}"><small>${kb(f.size)}</small></div>`).join('')}</div>
      ${placeFields(m.section, m.col)}${m.msg ? `<p class="muted" style="font-size:13px">${esc(m.msg)}</p>` : ''}</div>`,
      `<button class="btn ghost" data-act="modalClose">Cancel</button><button class="btn primary" data-act="uploadGo" ${m.busy ? 'disabled' : ''}>${icon('upload', 15)}${m.busy ? 'Uploading' : 'Upload'}</button>`);
  }
  if (m.type === 'rename') return wrap('Rename', `<div class="stack"><input class="field" data-m="value" data-enter="renameGo" value="${esc(m.value)}"></div>`, `<button class="btn ghost" data-act="modalClose">Cancel</button><button class="btn primary" data-act="renameGo">Save</button>`);
  if (m.type === 'move') return wrap('Move document', `<div class="stack">${placeFields(m.section, m.col)}</div>`, `<button class="btn ghost" data-act="modalClose">Cancel</button><button class="btn primary" data-act="moveGo">Move</button>`);
  if (m.type === 'newCol') return wrap(m.section === 'learning' ? 'New course' : 'New collection', `<div class="stack"><input class="field" data-m="name" data-enter="newColGo" placeholder="${m.section === 'learning' ? 'For example German, Afaan Oromo, Prompting' : 'For example Tools, Brand references'}"></div>`, `<button class="btn ghost" data-act="modalClose">Cancel</button><button class="btn primary" data-act="newColGo">Create</button>`);
  return '';
}
// keep the collection list in step with the chosen section, and show the new collection field
document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset && el.dataset.m === 'section') { const c = $layer.querySelector('[data-m="col"]'); if (c) c.innerHTML = colOptions(el.value, ''); }
  if (el.dataset && (el.dataset.m === 'col' || el.dataset.m === 'section')) { const c = $layer.querySelector('[data-m="col"]'); const box = $layer.querySelector('[data-newcol]'); if (box) box.hidden = !(c && c.value === '__new'); }
}, true);

// FILE PICKING AND DROPPING
const niceName = n => n.replace(/\.html?$/i, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, c => c.toUpperCase());
function pickFiles(section, col) {
  const i = document.createElement('input'); i.type = 'file'; i.accept = '.html,.htm,text/html'; i.multiple = true;
  i.onchange = () => openUpload([...i.files], section, col); i.click();
}
function openUpload(files, section, col) {
  files = files.filter(f => /\.html?$/i.test(f.name) || f.type === 'text/html');
  if (!files.length) { toast('Choose HTML files (.html)'); return; }
  ui.modal = { type: 'upload', files, section: section || 'library', col: col || '', busy: false, msg: '' }; renderLayer();
}
document.addEventListener('dragover', e => { const z = e.target.closest && e.target.closest('[data-drop]'); if (z) { e.preventDefault(); z.classList.add('dropping'); } });
document.addEventListener('dragleave', e => { const z = e.target.closest && e.target.closest('[data-drop]'); if (z) z.classList.remove('dropping'); });
document.addEventListener('drop', e => { const z = e.target.closest && e.target.closest('[data-drop]'); if (!z) return; e.preventDefault(); z.classList.remove('dropping'); openUpload([...e.dataTransfer.files], z.dataset.drop, ''); });

// READER: opens an uploaded HTML document inside a sandbox. Its saved progress (localStorage) is kept per document and synced.
function shim(id, data) {
  const D = JSON.stringify(data || {}).replace(/</g, '\\u003c');
  return `<script>(function(){var D=${D},I=${JSON.stringify(id)},T;var H=Object.prototype.hasOwnProperty;
function send(){clearTimeout(T);T=setTimeout(function(){try{parent.postMessage({mph:'ls',id:I,data:D},'*')}catch(e){}},300)}
function make(st,p){var api={getItem:function(k){k=String(k);return H.call(st,k)?st[k]:null},setItem:function(k,v){st[String(k)]=String(v);if(p)send()},removeItem:function(k){delete st[String(k)];if(p)send()},clear:function(){Object.keys(st).forEach(function(k){delete st[k]});if(p)send()},key:function(i){var k=Object.keys(st);return i<k.length?k[i]:null}};
return new Proxy(api,{get:function(t,k){if(k==='length')return Object.keys(st).length;if(k in t)return t[k];return typeof k==='string'?api.getItem(k):undefined},set:function(t,k,v){api.setItem(k,v);return true},deleteProperty:function(t,k){api.removeItem(k);return true},has:function(t,k){return k in t||H.call(st,k)},ownKeys:function(){return Object.keys(st)},getOwnPropertyDescriptor:function(t,k){if(H.call(st,k))return{value:st[k],writable:true,enumerable:true,configurable:true}}})}
var L=make(D,true),S=make({},false);
try{Object.defineProperty(window,'localStorage',{configurable:true,get:function(){return L}})}catch(e){}
try{Object.defineProperty(window,'sessionStorage',{configurable:true,get:function(){return S}})}catch(e){}
})();<\/script>`;
}
function inject(html, id, data) {
  const s = shim(id, data);
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, m => m + s);
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, m => m + '<head>' + s + '</head>');
  return s + html;
}
window.addEventListener('message', e => {
  if (!frame || e.source !== frame.contentWindow) return;
  const d = e.data; if (d && d.mph === 'ls' && d.id === readerId) saveDocState(d.id, d.data);
});
async function mountReader(id) {
  if (readerId === id && document.querySelector('.reader')) return;
  readerId = id; frame = null;
  const doc = S().docs.find(d => d.id === id);
  $app.innerHTML = V.shell('read', '');
  const el = document.createElement('section'); el.className = 'reader' + (ui.focus ? ' focus' : '');
  el.innerHTML = `<header><button class="iconbtn" data-act="readerHome" aria-label="Back">${icon('left', 18)}</button><div class="rt"><b>${esc(doc ? doc.title : 'Document')}</b><small>${esc(doc ? (doc.section === 'learning' ? 'Learning' : 'Library') + ' · ' + V.colName(doc.col) : '')}</small></div>
    <button class="iconbtn" data-act="readerReload" aria-label="Reload">${icon('reload', 17)}</button><button class="iconbtn" data-act="readerFocus" aria-label="Focus mode">${icon('expand', 17)}</button></header><div class="loading">${doc ? 'Opening' : 'This document was removed'}</div>`;
  $app.appendChild(el);
  if (!doc) return;
  touch(s => { const d = s.docs.find(d => d.id === id); if (d) d.opened = Date.now(); });
  try {
    const [html, st] = await Promise.all([readDoc(doc), readDocState(id)]);
    if (readerId !== id) return;
    const f = document.createElement('iframe');
    f.setAttribute('sandbox', 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads');
    f.setAttribute('title', doc.title);
    f.srcdoc = inject(html, id, st);
    el.querySelector('.loading').replaceWith(f); frame = f;
  } catch (err) { const l = el.querySelector('.loading'); if (l) l.textContent = 'Could not open. Check your connection and reload.'; }
}
function focusDrawerTitle() { setTimeout(() => { const t = $layer.querySelector('textarea.big'); if (t) { t.focus(); t.select(); } }, 40); }

// EVENTS
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  let act = el.dataset.act;
  if (act === 'menuDo') { el.dataset.act2 && (el.dataset.actName = el.dataset.act2); return A.menuDo({ dataset: { act: el.dataset.act2, id: el.dataset.id } }); }
  if (el.dataset.stop !== undefined && el.tagName !== 'BUTTON') return;
  if (e.target.closest('[data-stop]') && e.target.closest('[data-stop]') !== el && act === 'toggle') return;
  if (e.target.closest('input, select, textarea') && el.tagName !== 'INPUT' && act !== 'closeDrawer') { if (act === 'toggle' || act === 'openDoc') return; }
  if (A[act]) { if (el.tagName === 'A' && act !== 'focusArea') e.preventDefault(); A[act](el, e); }
});
document.addEventListener('change', e => { const el = e.target.closest('[data-chg]'); if (el && C[el.dataset.chg]) C[el.dataset.chg](el); });
document.addEventListener('keydown', e => {
  const el = e.target;
  if (e.key === 'Enter' && el.dataset && el.dataset.enter && !e.shiftKey) { e.preventDefault(); A[el.dataset.enter] && A[el.dataset.enter](el); return; }
  if (e.key === 'Enter' && el.classList && el.classList.contains('doc')) { A.openDoc(el); return; }
  if (e.key === 'Enter' && el.matches && el.matches('textarea.big')) { e.preventDefault(); el.blur(); return; }
  if (e.key === 'Escape') { if (ui.menu) ui.menu = null; else if (ui.modal) ui.modal = null; else if (ui.drawer) ui.drawer = null; else if (ui.customize) { ui.customize = false; render(); } renderLayer(); return; }
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
  if ((e.metaKey || e.ctrlKey) && !typing) {
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); A.undo(); }
    else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); A.redo(); }
  }
});
document.addEventListener('input', e => { if (e.target.matches('textarea.big')) { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; } });
document.addEventListener('submit', async e => {
  const f = e.target; if (f.dataset.form !== 'auth') return; e.preventDefault();
  const email = f.email.value.trim(), password = f.password.value;
  ui.authMsg = ui.authMode === 'create' ? 'Creating your account' : 'Signing in'; ui.authErr = false; const m = f.querySelector('.msg'); if (m) { m.textContent = ui.authMsg; m.classList.remove('err'); }
  try {
    if (ui.authMode === 'create') {
      const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
      if (error) throw error;
      if (!data.session) { ui.authMode = 'signin'; ui.authMsg = 'Account created. Open the confirmation email we just sent, then sign in here.'; ui.authErr = false; render(); }
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
  } catch (err) { ui.authMsg = /confirm/i.test(err.message) ? 'Please confirm your email first, using the link we sent.' : /invalid/i.test(err.message) ? 'Email or password is not right.' : err.message; ui.authErr = true; render(); }
});

// BOOT
sb.auth.onAuthStateChange((ev, session) => {
  if (session && session.user && (!store.user || store.user.id !== session.user.id)) { ui.authMsg = ''; startSession(session.user); }
  if (ev === 'SIGNED_OUT') { endSession(); render(); }
});
(async () => {
  const { data } = await sb.auth.getSession();
  if (data.session) await startSession(data.session.user); else render();
})();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
