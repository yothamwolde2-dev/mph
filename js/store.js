// MPH store: login, workspace state, undo and redo, saving and syncing with Supabase.
import { uid, clone, DEFAULT_STATUSES, mkNode } from './core.js?v=0.1.1';

export const CONFIG = {
  url: 'https://ibudcfsqsxjgxmngwrhk.supabase.co',
  key: 'sb_publishable_26qRWYPGawMiYPUPBsI1NA_HS2MuWOv',
  bucket: 'mph-files',
  version: '0.1.1'
};

export const sb = window.supabase.createClient(CONFIG.url, CONFIG.key, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'mph-auth' }
});

export const BRAND_TEMPLATE = ['Logo', 'Slogan', 'Visual Identity', 'Brand Guideline', 'Website', 'Company Profile'];

export const WIDGETS = [
  { id: 'today', name: 'Today' },
  { id: 'goals', name: 'Weekly goals' },
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
  WIDGETS.forEach(w => { if (!s.home.order.includes(w.id)) s.home.order.push(w.id); });
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
function saveLocal() {
  try {
    localStorage.setItem(LKEY() + ':state', JSON.stringify({ state: store.state, rev: store.rev, dirty: store.dirty || false }));
    localStorage.setItem(LKEY() + ':hist', JSON.stringify({ past: store.past.slice(-25), future: store.future.slice(-25) }));
  } catch (e) { /* storage full or blocked: history just stays in memory */ }
}
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
  saveLocal();
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
  pushing = true; store.sync = 'saving'; emit();
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
      store.rev = data[0].rev; store.dirty = false; store.sync = 'idle'; saveLocal();
    }
  } catch (e) {
    store.sync = navigator.onLine ? 'error' : 'offline';
  } finally { pushing = false; emit(); if (store.dirty && store.sync === 'idle') schedulePush(); }
}

export async function pull(force = false) {
  if (!store.user) return;
  const { data, error } = await sb.from('mph_state').select('data,rev').eq('user_id', store.user.id).maybeSingle();
  if (error) { store.sync = navigator.onLine ? 'error' : 'offline'; emit(); return; }
  if (!data) {
    // First time on this account: create the workspace.
    const first = store.dirty ? store.state : blankState();
    const ins = await sb.from('mph_state').insert({ user_id: store.user.id, data: first, rev: 1 }).select('rev').single();
    if (!ins.error) { store.state = normalize(first); store.rev = 1; store.dirty = false; store.sync = 'idle'; saveLocal(); emit(); }
    return 'created';
  }
  const was = store.sync; let changed = false;
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
  store.sync = 'idle'; saveLocal();
  if (changed || was !== 'idle') emit();
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
  if (listening) return;
  listening = true;
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && store.user) pull(); });
  window.addEventListener('online', () => { if (!store.user) return; if (store.dirty) push(); else pull(); });
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
  return { id, path, title: meta.title, section: meta.section, col: meta.col, size: file.size, added: Date.now(), opened: 0 };
}
export async function readDoc(doc) {
  if (fileCache.has(doc.id)) return fileCache.get(doc.id);
  const { data, error } = await sb.storage.from(CONFIG.bucket).download(doc.path);
  if (error) throw error;
  const text = await data.text();
  fileCache.set(doc.id, text);
  return text;
}
export async function readDocState(id) {
  const { data } = await sb.from('mph_doc_state').select('data').eq('doc_id', id).maybeSingle();
  return (data && data.data) || {};
}
const stateTimers = {};
export function saveDocState(id, obj) {
  clearTimeout(stateTimers[id]);
  stateTimers[id] = setTimeout(() => {
    sb.from('mph_doc_state').upsert({ user_id: store.user.id, doc_id: id, data: obj, updated_at: new Date().toISOString() }).then(() => {});
  }, 600);
}

export const newNode = mkNode;
