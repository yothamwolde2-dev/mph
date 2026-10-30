// MPH notifications: reminders that ring on the phone and the Mac.
// Two paths, so a reminder is never missed:
// 1. Push: the reminders server (Supabase function mph-remind, every minute) sends to every device that
//    turned notifications on, even when MPH is closed. On iPhone this needs MPH opened from the Home Screen icon.
// 2. In app: while MPH is open, a short timer rings anything due, with a sound and a banner.
import { store, sb, CONFIG } from './store.js?v=0.9.8';
import { due } from './remind.js?v=0.9.8';

export const VAPID_PUBLIC = 'BIm4Dt6X2lFm3I1Od1NM0JjMEqaxuwoQdimJPZ6AmiMVQjJ8_NTGmGQnSxUl7kWNOaT0rE4FeidduCEdPAVP5rg';
export const TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Addis_Ababa'; } catch (e) { return 'Africa/Addis_Ababa'; } })();
const toast = (t) => window.dispatchEvent(new CustomEvent('mph:toast', { detail: { text: t } }));
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const b64 = s => { const p = '='.repeat((4 - s.length % 4) % 4); const r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(r, c => c.charCodeAt(0)); };

// What this device can do, for Settings and the Plan page.
export const N = { state: 'unknown', note: '' };
export async function checkPush() {
  if (window.MPH_STANDALONE) { N.state = 'unsupported'; N.note = 'The offline copy cannot receive notifications. Use the MPH app.'; return N; }
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    N.state = 'unsupported';
    N.note = isIOS() && !standalone() ? 'On iPhone, add MPH to the Home Screen (Share, Add to Home Screen) and open it from there. Then turn notifications on here. Needs iOS 16.4 or later.' : 'This browser cannot show notifications. Use Safari or Chrome, or the Home Screen app on iPhone.';
    return N;
  }
  if (Notification.permission === 'denied') { N.state = 'blocked'; N.note = isIOS() ? 'Notifications are blocked. Allow them in the iPhone Settings, Notifications, MPH.' : 'Notifications are blocked for MPH in this browser. Allow them in the site settings, then try again.'; return N; }
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    N.state = sub && Notification.permission === 'granted' ? 'on' : 'off';
    N.note = N.state === 'on' ? 'Reminders reach this device even when MPH is closed.' : 'Turn on to get reminders on this device, even when MPH is closed.';
    if (sub && N.state === 'on') saveSub(sub);
  } catch (e) { N.state = 'off'; N.note = 'Turn on to get reminders on this device.'; }
  return N;
}
let saved = '';
async function saveSub(sub) {
  if (!store.user) return;
  const j = sub.toJSON(); if (!j.keys) return;
  const sig = j.endpoint + TZ; if (saved === sig) return; saved = sig;
  const device = isIOS() ? 'iPhone' : /Mac/.test(navigator.userAgent) ? 'Mac' : 'Browser';
  await sb.from('mph_push').upsert({ endpoint: j.endpoint, user_id: store.user.id, p256dh: j.keys.p256dh, auth: j.keys.auth, tz: TZ, device });
}
export async function pushOn() {
  await checkPush();
  if (N.state === 'unsupported') { toast(N.note); return false; }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') { await checkPush(); toast('Notifications were not allowed'); return false; }
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(VAPID_PUBLIC) });
    saved = ''; await saveSub(sub);
    await checkPush();
    toast('Notifications are on for this device');
    return true;
  } catch (e) { toast('Could not turn on notifications here. ' + (e.message || '')); return false; }
}
export async function pushOff() {
  try {
    const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription();
    if (sub) { await sb.from('mph_push').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe(); }
  } catch (e) {}
  saved = ''; await checkPush(); toast('Notifications are off for this device');
}
// Ask the server to send a test to every device of this account.
export async function pushTest() {
  const { data } = await sb.auth.getSession();
  const token = data && data.session && data.session.access_token;
  try {
    const r = await fetch(CONFIG.url + '/functions/v1/mph-remind', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token, apikey: CONFIG.key }, body: JSON.stringify({ test: true }) });
    const j = await r.json();
    toast(j.sent ? `Test sent to ${j.sent} ${j.sent === 1 ? 'device' : 'devices'}. It arrives in a few seconds.` : 'No device has notifications on yet');
  } catch (e) { ringLocal({ title: 'MPH reminders are on', body: 'This is how your reminders will arrive.', key: 'mph-test' }); }
}

// IN APP: ring what is due while MPH is open. Remembers what already rang on this device.
const RK = () => 'mph:rang:' + (store.user ? store.user.id : '');
let timer = null;
function rangSet() { try { return JSON.parse(localStorage.getItem(RK())) || {}; } catch (e) { return {}; } }
function ringLocal(it) {
  window.dispatchEvent(new CustomEvent('mph:ring', { detail: it }));
  // If push is on, the server's notification arrives too; the same tag makes the system show it once.
  if ('Notification' in window && Notification.permission === 'granted' && navigator.serviceWorker && N.state !== 'on') {
    navigator.serviceWorker.ready.then(reg => reg.showNotification(it.title, { body: it.body || '', tag: it.key, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { url: './#/plan' } })).catch(() => {});
  }
}
export function tick() {
  if (!store.user || !store.ready) return;
  // look back ten minutes every time; what already rang is remembered, so nothing rings twice
  const now = Date.now(); const from = now - 10 * 60000;
  const items = due(store.state, from, now, TZ); if (!items.length) return;
  const seen = rangSet(); let changed = false;
  for (const it of items) { if (seen[it.key]) continue; seen[it.key] = now; changed = true; ringLocal(it); }
  if (changed) { const cut = now - 40 * 864e5; Object.keys(seen).forEach(k => { if (seen[k] < cut) delete seen[k]; }); try { localStorage.setItem(RK(), JSON.stringify(seen)); } catch (e) {} }
}
export function startNotify() {
  if (timer) return;
  timer = setInterval(tick, 20000); setTimeout(tick, 1500);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') tick(); });
  checkPush().then(() => window.dispatchEvent(new Event('mph:redraw')));
}
