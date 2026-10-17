// MPH web books: a document that keeps its own design and interactive tools, running inside MPH.
// The document's markup lives in one element (the host) that MPH keeps alive while you move around,
// so its tools never lose their state. Its script runs in a small sandbox:
//   document queries stay inside the book, its storage is saved with your book progress (synced),
//   links inside the book scroll the book instead of changing the MPH page,
//   timers, animations and key presses pause while the book is not on screen.

const hosts = new Map();

export function webHost(bk, store) {
  let h = hosts.get(bk.id);
  if (h && h.v === bk.__v) return h;
  if (h) { h.el.remove(); hosts.delete(bk.id); }
  if (!document.getElementById('wbcss-' + bk.id)) {
    const st = document.createElement('style'); st.id = 'wbcss-' + bk.id; st.textContent = bk.css; document.head.appendChild(st);
  }
  const el = document.createElement('div');
  el.className = 'wbhost wb-' + bk.id;
  Object.entries(bk.bodyAttrs || {}).forEach(([k, v]) => { if (k !== 'class') el.setAttribute(k, v); });
  el.innerHTML = bk.html;
  h = { el, v: bk.__v, started: false, store, rafq: [] };
  hosts.set(bk.id, h);
  return h;
}

// Called once the host is in the page (scripts measure the layout, so they start only then).
export function startHost(h, bk) {
  if (h.started) { const q = h.rafq.splice(0); q.forEach(f => requestAnimationFrame(f)); return; }
  h.started = true;
  const el = h.el, live = () => el.isConnected;
  const wrapped = new WeakMap();
  const gate = fn => { if (typeof fn !== 'function') return fn; if (!wrapped.has(fn)) wrapped.set(fn, function (e) { if (live()) return fn.call(this, e); }); return wrapped.get(fn); };
  const scoped = sel => { try { return el.querySelector(sel); } catch (e) { return null; } };
  const storage = {
    getItem: k => { const v = h.store.get()[k]; return v === undefined ? null : String(v); },
    setItem: (k, v) => { h.store.set(k, String(v)); },
    removeItem: k => h.store.set(k, undefined),
    clear: () => {}, key: () => null, get length() { return 0; }
  };
  const loc = { hash: '', href: location.href, pathname: location.pathname, search: '', assign() {}, replace() {}, reload() {} };
  const hist = { pushState() {}, replaceState() {}, back() {}, length: 1, state: null };
  const raf = f => { if (live()) return requestAnimationFrame(f); h.rafq.push(f); return 0; };
  const timers = {
    setInterval: (f, t, ...a) => setInterval(() => { if (live()) (typeof f === 'function' ? f(...a) : 0); }, t),
    setTimeout: (f, t, ...a) => setTimeout(f, t, ...a),
    clearInterval: id => clearInterval(id), clearTimeout: id => clearTimeout(id),
    requestAnimationFrame: raf, cancelAnimationFrame: id => cancelAnimationFrame(id)
  };
  const docOwn = {
    querySelector: s => scoped(s),
    querySelectorAll: s => { try { return el.querySelectorAll(s); } catch (e) { return document.querySelectorAll('#__none'); } },
    getElementById: id => el.querySelector('#' + CSS.escape(id)),
    getElementsByClassName: c => el.getElementsByClassName(c),
    getElementsByTagName: t => el.getElementsByTagName(t),
    addEventListener: (t, f, o) => document.addEventListener(t, gate(f), o),
    removeEventListener: (t, f, o) => document.removeEventListener(t, gate(f), o),
    get body() { return el; }, get documentElement() { return el; },
    get hidden() { return document.hidden || !live(); },
    get visibilityState() { return live() ? document.visibilityState : 'hidden'; }
  };
  const doc = new Proxy(docOwn, {
    get(t, k) { if (k in t) return t[k]; const v = document[k]; return typeof v === 'function' ? v.bind(document) : v; },
    set(t, k, v) { if (k === 'title') return true; document[k] = v; return true; }
  });
  const bag = {};
  const winOwn = {
    document: doc, localStorage: storage, sessionStorage: storage, location: loc, history: hist,
    addEventListener: (t, f, o) => window.addEventListener(t, gate(f), o),
    removeEventListener: (t, f, o) => window.removeEventListener(t, gate(f), o),
    scrollTo: (...a) => window.scrollTo(...a), scroll: (...a) => window.scrollTo(...a), ...timers
  };
  const win = new Proxy(bag, {
    get(t, k) { if (k in winOwn) return winOwn[k]; if (k in t) return t[k]; const v = window[k]; return typeof v === 'function' && !/^[A-Z]/.test(String(k)) ? v.bind(window) : v; },
    set(t, k, v) { t[k] = v; return true; },
    has() { return true; }
  });
  winOwn.window = win; winOwn.self = win; winOwn.globalThis = win;
  const names = new Set(Object.keys(winOwn));
  const scope = new Proxy({}, {
    has: (t, k) => typeof k === 'string' && (names.has(k) || k in bag),
    get: (t, k) => { if (k === Symbol.unscopables) return undefined; return names.has(k) ? winOwn[k] : bag[k]; },
    set: (t, k, v) => { bag[k] = v; return true; }
  });
  // Links to a place inside the book scroll there instead of changing the MPH page.
  el.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href^="#"]'); if (!a || !el.contains(a)) return;
    e.preventDefault();
    const id = a.getAttribute('href').slice(1); if (!id) return;
    const t = el.querySelector('#' + CSS.escape(id));
    if (t) setTimeout(() => t.scrollIntoView({ block: 'start', behavior: 'smooth' }), 0);
  }, true);
  try {
    // eslint-disable-next-line no-new-func
    new Function('__scope', 'with(__scope){' + bk.js + '\n}')(scope);
  } catch (err) { console.warn('MPH web book script', bk.id, err); }
}

export const hostFor = id => hosts.get(id);
