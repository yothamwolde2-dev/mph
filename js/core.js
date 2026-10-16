// MPH core helpers: ids, dates, escaping, icons, project tree logic.

let seq = 0;
export const uid = (p = 'x') => p + Date.now().toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2, 5);

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const clone = o => JSON.parse(JSON.stringify(o));

// Dates (local time, ISO yyyy-mm-dd keys)
export const pad = n => String(n).padStart(2, '0');
export const dkey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => dkey(new Date());
export const parseD = k => new Date(k + 'T00:00:00');
export const addDays = (k, n) => { const d = parseD(k); d.setDate(d.getDate() + n); return dkey(d); };
export const fmtShort = k => k ? parseD(k).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
export const fmtLong = (d = new Date()) => d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export function isoWeek(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return { year: t.getUTCFullYear(), week: Math.ceil(((t - y0) / 86400000 + 1) / 7) };
}
export const weekKey = (d = new Date()) => { const w = isoWeek(d); return `${w.year}-W${pad(w.week)}`; };
export function weekStart(d = new Date()) { const x = new Date(d); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); x.setHours(0, 0, 0, 0); return x; }
export function weekRange(ws) { const e = new Date(ws); e.setDate(e.getDate() + 6); const f = d => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); return `${f(ws)} to ${f(e)}`; }
export const relDay = k => { if (!k) return ''; const t = today(); if (k === t) return 'Today'; if (k === addDays(t, 1)) return 'Tomorrow'; if (k === addDays(t, -1)) return 'Yesterday'; return fmtShort(k); };
export const ago = ts => { if (!ts) return 'Not opened yet'; const m = Math.round((Date.now() - ts) / 60000); if (m < 1) return 'Just now'; if (m < 60) return m + ' min ago'; const h = Math.round(m / 60); if (h < 24) return h + ' h ago'; const d = Math.round(h / 24); return d === 1 ? 'Yesterday' : d + ' days ago'; };
export const kb = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
export const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

// Statuses (carried over from the Work Portfolio)
export const DEFAULT_STATUSES = [
  { key: 'Next', label: 'Next', color: '#8A8A8A', ink: '#000000', w: 0 },
  { key: 'In Progress', label: 'In Progress', color: '#2F6FB0', ink: '#FFFFFF', w: 0.4 },
  { key: 'Revision', label: 'Revision', color: '#B5432F', ink: '#FFFFFF', w: 0.5 },
  { key: 'Almost Done', label: 'Almost Done', color: '#1B6E27', ink: '#FFFFFF', w: 0.85 },
  { key: 'Done', label: 'Done', color: '#39B44A', ink: '#000000', w: 1 }
];

// Project tree. Node shape matches the Work Portfolio: {id,t,s,st,k,n,r} plus due, pr.
export const mkNode = (t, st = 'Next', s = '', k = []) => ({ id: uid('n'), t, s, st, k, n: [], r: [], due: '', pr: '' });

export function locate(arr, id, parent = null) {
  for (let i = 0; i < arr.length; i++) {
    if (arr[i].id === id) return { arr, i, node: arr[i], parent };
    const f = locate(arr[i].k || [], id, arr[i]);
    if (f) return f;
  }
  return null;
}
export function pathTo(arr, id, trail = []) {
  for (const n of arr) {
    if (n.id === id) return [...trail, n];
    const f = pathTo(n.k || [], id, [...trail, n]);
    if (f) return f;
  }
  return null;
}
export function walk(arr, fn, path = []) { arr.forEach(n => { fn(n, path); walk(n.k || [], fn, [...path, n]); }); }
export function leaves(n) { if (!n.k || !n.k.length) return [n]; return n.k.flatMap(leaves); }
export function progress(n, statuses) {
  const W = Object.fromEntries(statuses.map(s => [s.key, s.w]));
  const ls = (n.k && n.k.length) ? n.k.flatMap(leaves) : [n];
  if (!ls.length) return 0;
  return Math.round(ls.reduce((a, l) => a + (W[l.st] ?? 0), 0) / ls.length * 100);
}
export function areaProgress(area, statuses) {
  const ls = (area.k || []).flatMap(leaves);
  if (!ls.length) return 0;
  const W = Object.fromEntries(statuses.map(s => [s.key, s.w]));
  return Math.round(ls.reduce((a, l) => a + (W[l.st] ?? 0), 0) / ls.length * 100);
}
export function statusCounts(areas, statuses) {
  const c = Object.fromEntries(statuses.map(s => [s.key, 0]));
  areas.forEach(a => (a.k || []).flatMap(leaves).forEach(l => { if (l.st in c) c[l.st]++; }));
  return c;
}

// Icons (stroke icons drawn for MPH)
const P = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  projects: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  tasks: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3.5 6 1.5 1.5L7.5 5M3.5 12l1.5 1.5L7.5 11M3.5 18l1.5 1.5 2.5-2.5"/>',
  week: '<rect x="3" y="4.5" width="18" height="16" rx="1.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/><path d="m9 15 2 2 4-4"/>',
  learning: '<path d="M2 8.5 12 4l10 4.5L12 13z"/><path d="M6 10.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-5.5"/><path d="M22 8.5V14"/>',
  library: '<path d="M4 4h4v16H4zM10 4h4v16h-4z"/><path d="m16 5 3.8-1 2.2 15.6-3.8 1z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  chev: '<path d="m9 6 6 6-6 6"/>',
  left: '<path d="m15 6-6 6 6 6"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  dots: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff: '<path d="M3 3l18 18"/><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a9.8 9.8 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  reload: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  more: '<circle cx="12" cy="5" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="12" cy="19" r="1.3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  file: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  bookmark: '<path d="M6 3.5h12v17l-6-4.5-6 4.5z"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
  highlight: '<path d="m14 4 6 6-9 9H5v-6z"/><path d="M4 21h16"/>',
  textsm: '<path d="M5 18 9.5 7l4.5 11M6.6 14h5.8"/><path d="M17 15h4"/>',
  textlg: '<path d="M4 19 9.5 5 15 19M6 14.5h7"/><path d="M19 12v6M16 15h6"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'
};
export const icon = (n, s = 18) => `<svg class="ico" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || ''}</svg>`;
