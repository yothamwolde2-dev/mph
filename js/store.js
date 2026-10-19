// MPH store: login, workspace state, undo and redo, saving and syncing with Supabase.
import { uid, clone, DEFAULT_STATUSES, mkNode, mergeProg } from './core.js?v=0.9.0';

export const CONFIG = {
  url: 'https://ibudcfsqsxjgxmngwrhk.supabase.co',
  key: 'sb_publishable_26qRWYPGawMiYPUPBsI1NA_HS2MuWOv',
  bucket: 'mph-files',
  version: '0.9.0'
};

export const sb = window.supabase.createClient(CONFIG.url, CONFIG.key, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'mph-auth' }
});

export const BRAND_TEMPLATE = ['Logo', 'Slogan', 'Visual Identity', 'Brand Guideline', 'Website', 'Company Profile'];

export const WIDGETS = [
  { id: 'today', name: 'Today' },
  { id: 'calendar', name: 'Calendar' },
  { id: 'notes', name: 'Notes' },
  { id: 'goals', name: 'Big 3 for the week' },
  { id: 'projects', name: 'Projects pulse' },
  { id: 'continue', name: 'Continue reading' },
  { id: 'learning', name: 'Learning shelf' }
];

export const blankState = () => ({
  v: 1,
  profile: { name: '', motto: '' },
  theme: 'dark',
  home: { order: WIDGETS.map(w => w.id), hidden: [] },
  statuses: clone(DEFAULT_STATUSES),
  templates: [{ id: 'brand', name: 'Brand identity', items: BRAND_TEMPLATE.slice() }],
  areas: [],
  tasks: [],
  goals: {},
  mgoals: {},
  review: {},
  notes: [],
  reflections: {},
  cols: [],
  docs: [],
  imported: false
});

function normalize(d) {
  const b = blankState();
  const s = Object.assign(b, d || {});
  s.profile = Object.assign(b.profile, (d || {}).profile || {});
  s.home = Object.assign({ order: [], hidden: [] }, s.home);
  // Calendar and Notes arrive next to Today the first time (0.4)
  if (!s.home.v4) { s.home.order = s.home.order.filter(id => id !== 'calendar' && id !== 'notes'); const i = s.home.order.indexOf('today'); s.home.order.splice(i < 0 ? 0 : i + 1, 0, 'calendar', 'notes'); s.home.v4 = 1; }
  WIDGETS.forEach(w => { if (!s.home.order.includes(w.id)) s.home.order.push(w.id); });
  s.mgoals = s.mgoals || {}; s.review = s.review || {}; s.notes = s.notes || []; s.reminders = s.reminders || []; s.notify = Object.assign({ morning: '08:30', brief: true }, s.notify);
  s.tasks.forEach(t => { t.d = t.d || ''; t.wk = t.wk || ''; t.star = !!t.star; });
  s.home.order = s.home.order.filter(id => WIDGETS.some(w => w.id === id));
  if (!Array.isArray(s.statuses) || !s.statuses.length) s.statuses = clone(DEFAULT_STATUSES);
  const fixNode = n => { n.k = n.k || []; n.n = n.n || []; n.r = n.r || []; n.s = n.s || ''; n.due = n.due || ''; n.pr = n.pr || ''; n.k.forEach(fixNode); };
  s.areas.forEach(fixNode);
  return s;
}

// Reactive store
const listeners = new Set();
export const store = {
  user: null,
  state: blankState(),
  rev: 0,
  past: [],
  future: [],
  sync: 'idle', // idle | saving | offline | error
  ready: false
};
export const onChange = fn => listeners.add(fn);
export const emit = () => listeners.forEach(fn => fn());

const LKEY = () => 'mph:' + (store.user ? store.user.id : 'anon');
// Saving to the device is spread out so typing and tapping never wait on it.
let stateTimer = null, histTimer = null;
function writeState() { try { localStorage.setItem(LKEY() + ':state', JSON.stringify({ state: store.state, rev: store.rev, dirty: store.dirty || false })); } catch (e) {} }
function writeHist() { try { localStorage.setItem(LKEY() + ':hist', JSON.stringify({ past: store.past.slice(-25), future: store.future.slice(-25) })); } catch (e) {} }
function saveLocal(withHist = false) {
  clearTimeout(stateTimer); stateTimer = setTimeout(writeState, 150);
  if (withHist) { clearTimeout(histTimer); histTimer = setTimeout(writeHist, 2500); }
}
function flushLocal() { clearTimeout(stateTimer); clearTimeout(histTimer); if (store.user) { writeState(); writeHist(); } }
window.addEventListener('pagehide', flushLocal);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushLocal(); });

// Sync status changes only touch the small indicator, never the whole screen.
function setSync(v) { if (store.sync === v) return; store.sync = v; window.dispatchEvent(new CustomEvent('mph:sync')); }
function loadLocal() {
  try {
    const s = JSON.parse(localStorage.getItem(LKEY() + ':state') || 'null');
    const h = JSON.parse(localStorage.getItem(LKEY() + ':hist') || 'null');
    return { s, h };
  } catch (e) { return {}; }
}

// Mutations. Every change goes through mutate so it can be undone.
let lastKey = null, lastAt = 0;
export function mutate(fn, key) {
  const now = Date.now();
  const coalesce = key && key === lastKey && now - lastAt < 1500;
  if (!coalesce) { store.past.push(clone(store.state)); if (store.past.length > 60) store.past.shift(); }
  lastKey = key; lastAt = now;
  store.future = [];
  const next = clone(store.state);
  fn(next);
  store.state = next;
  afterChange();
}
export function undo() {
  if (!store.past.length) return false;
  store.future.push(clone(store.state));
  store.state = store.past.pop(); lastKey = null;
  afterChange(); return true;
}
export function redo() {
  if (!store.future.length) return false;
  store.past.push(clone(store.state));
  store.state = store.future.pop(); lastKey = null;
  afterChange(); return true;
}
// Quiet change that is not added to undo history (for example "last opened").
export function touch(fn) { fn(store.state); store.dirty = true; saveLocal(); schedulePush(); }
function afterChange() {
  store.dirty = true;
  saveLocal(true);
  schedulePush();
  emit();
}

// Sync with Supabase. One row per person, guarded by a revision number so two devices never silently overwrite each other.
let pushTimer = null;
function schedulePush() { clearTimeout(pushTimer); pushTimer = setTimeout(push, 900); }
let pushing = false;
export async function push() {
  if (!store.user || pushing) return;
  if (!store.dirty) return;
  pushing = true; setSync('saving');
  try {
    const { data, error } = await sb.from('mph_state')
      .update({ data: store.state, rev: store.rev + 1, updated_at: new Date().toISOString() })
      .eq('user_id', store.user.id).eq('rev', store.rev).select('rev');
    if (error) throw error;
    if (!data || !data.length) {
      // Another device saved first. Load the latest so nothing is overwritten.
      try { localStorage.setItem(LKEY() + ':backup', JSON.stringify({ at: Date.now(), state: store.state })); } catch (e) {}
      const before = JSON.stringify(store.state);
      await pull(true);
      if (JSON.stringify(store.state) !== before) window.dispatchEvent(new CustomEvent('mph:toast', { detail: { text: 'Updated with changes from your other device' } }));
    } else {
      store.rev = data[0].rev; store.dirty = false; setSync('idle'); saveLocal();
      snapshot();
    }
  } catch (e) {
    setSync(navigator.onLine ? 'error' : 'offline');
  } finally { pushing = false; if (store.dirty && store.sync === 'idle') schedulePush(); }
}

// Daily copies of the workspace, kept in the database next to reading progress (doc_id snap:YYYY-MM-DD).
// One per day, the latest 30 days are kept, so a bad change can be rolled back from any device.
const SNAP_KEEP = 30;
const dayKey = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
let snapBusy = false;
export async function snapshot(force = false) {
  if (!store.user || snapBusy) return false;
  const k = LKEY() + ':snap', day = dayKey();
  try { if (!force && localStorage.getItem(k) === day) return false; } catch (e) {}
  snapBusy = true;
  try {
    const { error } = await sb.from('mph_doc_state').upsert({ user_id: store.user.id, doc_id: 'snap:' + day, data: { at: new Date().toISOString(), rev: store.rev, version: CONFIG.version, state: store.state }, updated_at: new Date().toISOString() });
    if (error) throw error;
    try { localStorage.setItem(k, day); } catch (e) {}
    const list = await listSnapshots();
    const old = list.slice(SNAP_KEEP).map(s => s.doc_id);
    if (old.length) await sb.from('mph_doc_state').delete().eq('user_id', store.user.id).in('doc_id', old);
    return true;
  } catch (e) { return false; } finally { snapBusy = false; }
}
export async function listSnapshots() {
  if (!store.user) return [];
  const { data, error } = await sb.from('mph_doc_state').select('doc_id,updated_at').eq('user_id', store.user.id).like('doc_id', 'snap:%').order('doc_id', { ascending: false });
  return error ? [] : (data || []);
}
export async function readSnapshot(docId) {
  const { data, error } = await sb.from('mph_doc_state').select('data').eq('user_id', store.user.id).eq('doc_id', docId).maybeSingle();
  if (error || !data) return null;
  return data.data;
}

export async function pull(force = false) {
  if (!store.user) return;
  const { data, error } = await sb.from('mph_state').select('data,rev').eq('user_id', store.user.id).maybeSingle();
  if (error) { setSync(navigator.onLine ? 'error' : 'offline'); return; }
  if (!data) {
    // First time on this account: create the workspace.
    const first = store.dirty ? store.state : blankState();
    const ins = await sb.from('mph_state').insert({ user_id: store.user.id, data: first, rev: 1 }).select('rev').single();
    if (!ins.error) { store.state = normalize(first); store.rev = 1; store.dirty = false; setSync('idle'); saveLocal(); emit(); }
    return 'created';
  }
  let changed = false;
  if (force || data.rev > store.rev) {
    changed = true;
    if (store.dirty && !force && JSON.stringify(normalize(data.data)) !== JSON.stringify(store.state)) {
      try { localStorage.setItem(LKEY() + ':backup', JSON.stringify({ at: Date.now(), state: store.state })); } catch (e) {}
      window.dispatchEvent(new CustomEvent('mph:toast', { detail: { text: 'Updated with changes from your other device' } }));
    }
    store.state = normalize(data.data); store.rev = data.rev; store.dirty = false;
  } else if (data.rev < store.rev) {
    store.rev = data.rev; store.dirty = true;
  }
  setSync('idle'); if (changed) { saveLocal(); emit(); }
  if (store.dirty) schedulePush();
}

let started = false, listening = false;
export async function startSession(user) {
  if (store.user && store.user.id === user.id && started) return;
  started = true;
  store.user = user;
  const { s, h } = loadLocal();
  if (s && s.state) { store.state = normalize(s.state); store.rev = s.rev || 0; store.dirty = !!s.dirty; }
  else { store.state = blankState(); store.rev = 0; store.dirty = false; }
  if (h) { store.past = h.past || []; store.future = h.future || []; }
  store.ready = true; emit();
  const res = await pull();
  if (res === 'created' && !store.state.imported) {
    const n = await importPortfolio();
    if (n) window.dispatchEvent(new CustomEvent('mph:toast', { detail: { text: `Brought in ${n} topics from your Work Portfolio` } }));
  }
  setTimeout(() => { flushDocStates(); prefetchDocs(); snapshot(); }, 2500);
  if (listening) return;
  listening = true;
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && store.user) pull(); });
  window.addEventListener('online', () => { if (!store.user) return; if (store.dirty) push(); else pull(); flushDocStates(); prefetchDocs(); });
  setInterval(() => { if (store.user && document.visibilityState === 'visible' && !store.dirty) pull(); }, 60000);
}

export function endSession() {
  started = false;
  store.user = null; store.state = blankState(); store.rev = 0; store.past = []; store.future = []; store.ready = false;
}

// Import from the existing Work Portfolio row (read only; the portfolio itself is left untouched).
export async function importPortfolio() {
  try {
    const { data, error } = await sb.from('portfolio').select('data').eq('id', 'main').maybeSingle();
    if (error || !data || !data.data || !data.data.branches) return 0;
    const p = data.data;
    const have = new Set(store.state.areas.map(a => a.id));
    const fresh = p.branches.filter(b => !have.has(b.id));
    mutate(s => {
      fresh.forEach(b => s.areas.push(clone(b)));
      if (!s.profile.motto && p.core) s.profile.motto = p.core.t || '';
      const tids = new Set(s.tasks.map(t => t.id));
      ((p.plan && p.plan.r) || []).forEach(r => { if (!tids.has(r.id)) s.tasks.push({ id: r.id, x: r.x, d: r.d || '', done: !!r.done, at: Date.now() }); });
      s.imported = true;
      const fixNode = n => { n.k = n.k || []; n.n = n.n || []; n.r = n.r || []; n.due = n.due || ''; n.pr = n.pr || ''; n.k.forEach(fixNode); };
      s.areas.forEach(fixNode);
    });
    return fresh.length;
  } catch (e) { return 0; }
}

// Library files (HTML documents) live in private storage under the person's own folder.
const fileCache = new Map();
export async function uploadDoc(file, meta) {
  const id = uid('d');
  const path = `${store.user.id}/${id}.html`;
  const body = await file.arrayBuffer();
  const { error } = await sb.storage.from(CONFIG.bucket).upload(path, body, { contentType: 'text/html;charset=utf-8', upsert: true });
  if (error) throw error;
  const made = { id, path, title: meta.title, section: meta.section, col: meta.col, size: file.size, added: Date.now(), opened: 0 };
  try { await rememberDoc(made, new TextDecoder().decode(body)); } catch (e) {}
  return made;
}
// Uploaded documents never change, so each one is downloaded once and kept on the device.
const DOC_CACHE = 'mph-docs-v1';
const docKey = doc => new Request(location.origin + '/__mph_doc/' + doc.id);
export async function readDoc(doc) {
  if (fileCache.has(doc.id)) return fileCache.get(doc.id);
  try { if (window.caches) { const hit = await (await caches.open(DOC_CACHE)).match(docKey(doc)); if (hit) { const t = await hit.text(); fileCache.set(doc.id, t); return t; } } } catch (e) {}
  const { data, error } = await sb.storage.from(CONFIG.bucket).download(doc.path);
  if (error) throw error;
  const text = await data.text();
  fileCache.set(doc.id, text);
  try { if (window.caches) (await caches.open(DOC_CACHE)).put(docKey(doc), new Response(text, { headers: { 'content-type': 'text/plain;charset=utf-8' } })); } catch (e) {}
  return text;
}
export async function rememberDoc(doc, text) { fileCache.set(doc.id, text); try { if (window.caches) (await caches.open(DOC_CACHE)).put(docKey(doc), new Response(text, { headers: { 'content-type': 'text/plain;charset=utf-8' } })); } catch (e) {} }
// Each document's own saved data (its progress) is kept on the device too, so it opens offline
// and anything saved offline is sent when the connection returns.
const DS = id => 'mph:ds:' + (store.user ? store.user.id : '') + ':' + id;
function localDS(id) { try { return JSON.parse(localStorage.getItem(DS(id)) || 'null'); } catch (e) { return null; } }
function keepDS(id, data, pending) { try { localStorage.setItem(DS(id), JSON.stringify({ data, pending, at: Date.now() })); } catch (e) {} }
export async function readDocState(id) {
  const mine = localDS(id);
  try {
    const { data, error } = await sb.from('mph_doc_state').select('data').eq('doc_id', id).maybeSingle();
    if (error) throw error;
    const remote = (data && data.data) || null;
    if (!mine) { keepDS(id, remote || {}, false); return remote || {}; }
    // Changes waiting on this device win their conflicts, otherwise the cloud copy is newer.
    const d = mine.pending ? mergeProg(mine.data, remote) : mergeProg(remote, mine.data);
    keepDS(id, d, !!mine.pending);
    if (mine.pending) saveDocState(id, d);
    return d;
  } catch (e) { return mine ? mine.data : {}; }
}
const stateTimers = {};
export function saveDocState(id, obj) {
  keepDS(id, obj, true);
  clearTimeout(stateTimers[id]);
  stateTimers[id] = setTimeout(async () => {
    try {
      // Read the cloud copy first and merge, so a save here never wipes what another device added.
      const { data: cur } = await sb.from('mph_doc_state').select('data').eq('doc_id', id).maybeSingle();
      const local = localDS(id); const mineNow = local ? local.data : obj;
      const merged = cur && cur.data ? mergeProg(mineNow, cur.data) : mineNow;
      const { error } = await sb.from('mph_doc_state').upsert({ user_id: store.user.id, doc_id: id, data: merged, updated_at: new Date().toISOString() });
      if (!error) {
        const after = localDS(id);
        // Only clear the waiting flag if nothing new was written while saving.
        if (!after || after.at <= (local ? local.at : 0) || JSON.stringify(after.data) === JSON.stringify(mineNow)) keepDS(id, merged, false);
        if (JSON.stringify(merged) !== JSON.stringify(mineNow)) window.dispatchEvent(new CustomEvent('mph:docstate', { detail: { id, data: merged } }));
      }
    } catch (e) {}
  }, 600);
}
function flushDocStates() {
  if (!store.user) return;
  const pre = 'mph:ds:' + store.user.id + ':';
  Object.keys(localStorage).filter(k => k.startsWith(pre)).forEach(k => {
    try { const v = JSON.parse(localStorage.getItem(k)); if (v && v.pending) saveDocState(k.slice(pre.length), v.data); } catch (e) {}
  });
}
// Download every document once in the background so the whole library is ready offline.
let prefetching = false;
export async function prefetchDocs() {
  if (prefetching || !store.user || !navigator.onLine) return; prefetching = true;
  try { for (const d of store.state.docs.slice()) { try { await readDoc(d); } catch (e) {} } } finally { prefetching = false; }
}

export const newNode = mkNode;
