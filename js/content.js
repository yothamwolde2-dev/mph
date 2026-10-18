// MPH private content: courses and books that Yotham sends to Claude.
// Files in /content are locked (AES-256-GCM). The key is read once from Yotham's private
// Supabase table after sign in, then kept on the device so everything opens offline.
import { sb, store, readDocState, saveDocState, CONFIG } from './store.js?v=0.7.0';

const mem = new Map();
let keyPromise = null;
const KK = () => 'mph:ck:' + (store.user ? store.user.id : '');

async function getKey() {
  if (keyPromise) return keyPromise;
  keyPromise = (async () => {
    let b64 = null;
    try { b64 = localStorage.getItem(KK()); } catch (e) {}
    if (!b64) {
      const { data, error } = await sb.from('mph_keys').select('content_key').maybeSingle();
      if (error || !data) throw new Error('nokey');
      b64 = data.content_key;
      try { localStorage.setItem(KK(), b64); } catch (e) {}
    }
    const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
  })();
  keyPromise.catch(() => { keyPromise = null; });
  return keyPromise;
}

async function unlock(name, v = 1) {
  const id = name + '@' + v;
  if (mem.has(id)) return mem.get(id);
  const p = (async () => {
    const res = await fetch(`content/${name}.bin?v=${v}`);
    if (!res.ok) throw new Error('missing');
    const buf = new Uint8Array(await res.arrayBuffer());
    const key = await getKey();
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12) }, key, buf.slice(12));
    const text = await new Response(new Blob([plain]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
    return JSON.parse(text);
  })();
  mem.set(id, p);
  p.catch(() => mem.delete(id));
  return p;
}

// Synchronous access for rendering: returns the data if loaded, otherwise starts loading and returns null.
const ready = new Map(), pending = new Set();
export function peek(name, v = 1, onReady) {
  const id = name + '@' + v;
  if (ready.has(id)) return ready.get(id);
  if (pending.has(id)) return null;
  pending.add(id);
  unlock(name, v).then(d => { ready.set(id, d); }).catch(e => { ready.set(id, { __error: e.message }); setTimeout(() => ready.delete(id), 4000); })
    .finally(() => { pending.delete(id); onReady && onReady(); });
  return null;
}
export const catalog = onReady => peek('index', CONFIG.version, onReady);

// After sign in, fetch everything once so it is all on the device for offline use.
export async function warmContent() {
  try {
    const idx = await unlock('index', CONFIG.version); ready.set('index@' + CONFIG.version, idx);
    const files = [];
    idx.languages.forEach(l => (l.levels || []).forEach(v => { if (v.file) files.push([v.file, v.v]); }));
    idx.books.forEach(b => files.push([b.file, b.v]));
    for (const [f, v] of files) { try { ready.set(f + '@' + v, await unlock(f, v)); } catch (e) {} }
  } catch (e) {}
}

// Progress for courses and books, kept on the device and synced through Supabase.
const prog = new Map();
const progTimers = {};
export function progress(key, onReady) {
  if (prog.has(key)) return prog.get(key);
  prog.set(key, null);
  readDocState(key).then(d => { prog.set(key, d && typeof d === 'object' ? d : {}); onReady && onReady(); });
  return null;
}
// Bring in what other devices saved: when the app comes back to the front, and when a book or course opens.
const busy = () => { const a = document.activeElement; return a && /^(TEXTAREA|INPUT)$/.test(a.tagName) && a.value; };
let lastRefresh = 0;
export async function refreshProgress(keys) {
  if (!store.user || !navigator.onLine) return;
  const list = (keys || [...prog.keys()]).filter(k => prog.get(k) && !progTimers[k]);
  let changed = false;
  for (const k of list) {
    const before = JSON.stringify(prog.get(k));
    const d = await readDocState(k);
    if (d && JSON.stringify(d) !== before) {
      // Keep the same object so screens holding it stay current.
      const cur = prog.get(k); Object.keys(cur).forEach(x => delete cur[x]); Object.assign(cur, d); changed = true;
    }
  }
  lastRefresh = Date.now();
  if (changed && !busy()) window.dispatchEvent(new Event('mph:redraw'));
}
window.addEventListener('mph:docstate', e => {
  const { id, data } = e.detail; const cur = prog.get(id); if (!cur) return;
  Object.keys(cur).forEach(x => delete cur[x]); Object.assign(cur, data);
  if (!busy()) window.dispatchEvent(new Event('mph:redraw'));
});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshProgress(); });
window.addEventListener('hashchange', () => { if (/^#\/(book|lang)\//.test(location.hash) && Date.now() - lastRefresh > 4000) refreshProgress(); });
setInterval(() => { if (document.visibilityState === 'visible') refreshProgress(); }, 90000);

export function saveProgress(key, data, now) {
  prog.set(key, data);
  clearTimeout(progTimers[key]);
  const go = () => saveDocState(key, data);
  if (now) { delete progTimers[key]; go(); } else progTimers[key] = setTimeout(() => { delete progTimers[key]; go(); }, 800);
}
