// MPH reminders: when each reminder rings, in any time zone.
// Shared by the app (js) and the notification server (supabase/functions/mph-remind), so both always agree.
// No imports: this file is copied as it is into the server function.
//
// A reminder: { id, x (text), at (first time, ms), rep ('' | 'daily' | 'weekdays' | 'weekly' | 'monthly'), done, t (task id) }
// Project reminders (date only, on a project item) ring at the morning time on their day.

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const fmts = {};
export function parts(ms, tz) {
  const f = fmts[tz] || (fmts[tz] = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' }));
  const o = {}; for (const p of f.formatToParts(new Date(ms))) o[p.type] = p.value;
  return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, wd: WD.indexOf(o.weekday) };
}
// The moment a wall clock time happens in a time zone.
export function fromLocal(y, m, d, h, mi, tz) {
  const want = Date.UTC(y, m - 1, d, h, mi); let t = want;
  for (let i = 0; i < 3; i++) { const p = parts(t, tz); const diff = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi) - want; if (!diff) break; t -= diff; }
  return t;
}
export const dayKey = (ms, tz) => { const p = parts(ms, tz); return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`; };
function rule(rep, p0, day) {
  if (rep === 'daily') return true;
  if (rep === 'weekdays') return day.wd >= 1 && day.wd <= 5;
  if (rep === 'weekly') return day.wd === p0.wd;
  if (rep === 'monthly') { const last = new Date(Date.UTC(day.y, day.m, 0)).getUTCDate(); return day.d === Math.min(p0.d, last); }
  return false;
}
// Every time reminder r rings after a and up to b (ms).
export function occurrences(r, a, b, tz, cap = 60) {
  const out = []; if (!r || !r.at) return out;
  if (!r.rep) { if (!r.done && r.at > a && r.at <= b) out.push(r.at); return out; }
  if (r.done) return out;
  const p0 = parts(r.at, tz);
  let cur = parts(Math.max(r.at, a) - 36e5 * 24, tz);
  let y = cur.y, m = cur.m, d = cur.d;
  for (let i = 0; i < 800 && out.length < cap; i++) {
    const t = fromLocal(y, m, d, p0.h, p0.mi, tz);
    if (t > b) break;
    const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    if (t >= r.at && t > a && rule(r.rep, p0, { y, m, d, wd })) out.push(t);
    const nx = new Date(Date.UTC(y, m - 1, d + 1)); y = nx.getUTCFullYear(); m = nx.getUTCMonth() + 1; d = nx.getUTCDate();
  }
  return out;
}
export const nextTime = (r, from, tz) => occurrences(r, from - 1, from + 400 * 864e5, tz, 1)[0] || 0;
export const REPEATS = [['', 'Once'], ['daily', 'Every day'], ['weekdays', 'Every weekday'], ['weekly', 'Every week'], ['monthly', 'Every month']];

// Everything that should ring between a and b for one workspace: reminders and project reminders.
// Returns [{ key, at, title, body, url }].
export function due(state, a, b, tz) {
  const out = [];
  const morning = ((state.notify || {}).morning || '08:30').split(':').map(Number);
  for (const r of state.reminders || []) {
    for (const at of occurrences(r, a, b, tz, 5)) out.push({ key: `r:${r.id}@${at}`, at, title: r.x, body: r.rep ? 'Reminder · ' + (REPEATS.find(x => x[0] === r.rep) || ['', ''])[1] : 'Reminder', url: './#/plan' });
  }
  const walk = (nodes, path) => (nodes || []).forEach(n => {
    for (const r of n.r || []) {
      if (r.done || !r.d) continue;
      const [y, m, d] = r.d.split('-').map(Number); const at = fromLocal(y, m, d, morning[0], morning[1] || 0, tz);
      if (at > a && at <= b) out.push({ key: `p:${r.id}@${r.d}`, at, title: r.x, body: [...path, n].map(p => p.t).slice(-2).join(' · '), url: './#/plan' });
    }
    walk(n.k, [...path, n]);
  });
  walk(state.areas, []);
  if ((state.notify || {}).brief) {
    for (let k = 0; k < 2; k++) {
      const day = dayKey(b - k * 864e5, tz); const [y, m, d] = day.split('-').map(Number);
      const at = fromLocal(y, m, d, morning[0], morning[1] || 0, tz);
      if (at > a && at <= b) {
        const tasks = (state.tasks || []).filter(t => t.d === day && !t.done);
        const top = tasks.filter(t => t.star).map(t => t.x);
        const n = tasks.length;
        out.push({ key: `b:${day}`, at, title: n ? `Today: ${n} ${n === 1 ? 'task' : 'tasks'}` : 'Today is clear', body: top.length ? 'Top: ' + top.slice(0, 3).join(', ') : n ? tasks.slice(0, 3).map(t => t.x).join(', ') : 'Plan the one thing that matters most.', url: './#/plan' });
      }
    }
  }
  return out;
}
