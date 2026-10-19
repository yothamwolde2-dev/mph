// MPH reminders server: runs every minute (pg_cron), finds what should ring now in each person's
// workspace and sends it to every device that turned notifications on (Web Push).
// remind.js is a copy of js/remind.js, so the app and the server agree on every time.
// Deploy: copy js/remind.js next to this file, then deploy with verify_jwt off (the cron call has no login).
// A normal run is safe to call any number of times: each reminder is recorded in mph_push_sent before it is sent.
import webpush from "npm:web-push@3.6.7";
import { due } from "./remind.js";

const BASE = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC = "BIm4Dt6X2lFm3I1Od1NM0JjMEqaxuwoQdimJPZ6AmiMVQjJ8_NTGmGQnSxUl7kWNOaT0rE4FeidduCEdPAVP5rg";
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const rest = (path: string, init: RequestInit = {}) => fetch(`${BASE}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type" } });

let ready = false, PRIV = "";
async function setup() {
  if (ready) return;
  const r = await rest("rpc/mph_vapid_private", { method: "POST", body: "{}" });
  const priv = await r.json(); PRIV = priv;
  webpush.setVapidDetails("https://yothamwolde2-dev.github.io/mph/", VAPID_PUBLIC, priv);
  ready = true;
}
type Sub = { endpoint: string; user_id: string; p256dh: string; auth: string; tz: string };
async function send(sub: Sub, msg: Record<string, unknown>) {
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(msg), { TTL: 6 * 3600, urgency: "high" });
    await rest(`mph_push?endpoint=eq.${encodeURIComponent(sub.endpoint)}`, { method: "PATCH", body: JSON.stringify({ last_ok: new Date().toISOString() }) });
    return true;
  } catch (e) {
    const code = (e as { statusCode?: number }).statusCode;
    if (code === 404 || code === 410) await rest(`mph_push?endpoint=eq.${encodeURIComponent(sub.endpoint)}`, { method: "DELETE" });
    console.log("push failed", code, String((e as Error).message || e).slice(0, 200));
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({});
  await setup();
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch (_) { /* cron sends an empty body */ }

  // Server check (from SQL, with the signing key as proof): send a sample to the given devices and report.
  if (body.selftest && PRIV && req.headers.get("x-mph-self") === PRIV) {
    const subs: Sub[] = await (await rest(`mph_push?select=endpoint,user_id,p256dh,auth,tz&endpoint=like.${encodeURIComponent(String(body.selftest))}*`)).json();
    const out = [];
    for (const s of subs) {
      try { const r = await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ title: "Self test", body: "MPH server check" }), { TTL: 60 }); out.push({ status: r.statusCode, body: String(r.body).slice(0, 6000) }); }
      catch (e) { out.push({ error: String((e as Error).message || e).slice(0, 300), status: (e as { statusCode?: number }).statusCode }); }
    }
    return json({ devices: subs.length, out });
  }

  // "Send a test" from Settings: only for the signed in person.
  if (body.test) {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const u = await fetch(`${BASE}/auth/v1/user`, { headers: { apikey: KEY, Authorization: `Bearer ${token}` } });
    if (!u.ok) return json({ error: "sign in first" }, 401);
    const user = await u.json();
    const subs: Sub[] = await (await rest(`mph_push?select=endpoint,user_id,p256dh,auth,tz&user_id=eq.${user.id}`)).json();
    let sent = 0;
    for (const s of subs) if (await send(s, { title: "MPH reminders are on", body: "This is how your reminders will arrive.", tag: "mph-test", url: "./#/plan" })) sent++;
    return json({ devices: subs.length, sent });
  }

  // The minute run.
  const now = Date.now(), from = now - 15 * 60000;
  const subs: Sub[] = await (await rest("mph_push?select=endpoint,user_id,p256dh,auth,tz")).json();
  const byUser = new Map<string, Sub[]>();
  for (const s of subs) (byUser.get(s.user_id) || byUser.set(s.user_id, []).get(s.user_id)!).push(s);
  let rang = 0;
  for (const [uid, list] of byUser) {
    const rows = await (await rest(`mph_state?select=data&user_id=eq.${uid}`)).json();
    if (!rows.length) continue;
    const items = due(rows[0].data || {}, from, now, list[0].tz || "Africa/Addis_Ababa");
    if (!items.length) continue;
    // record first: only what this run inserts is sent, so two runs never double up
    const ins = await rest("mph_push_sent", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify(items.map((i) => ({ user_id: uid, key: i.key }))) });
    const fresh = new Set(((await ins.json()) || []).map((r: { key: string }) => r.key));
    for (const it of items) {
      if (!fresh.has(it.key)) continue;
      for (const s of list) await send(s, { title: it.title, body: it.body, tag: it.key, url: it.url, at: it.at });
      rang++;
    }
  }
  if (new Date().getUTCMinutes() === 0) await rest(`mph_push_sent?sent_at=lt.${new Date(now - 40 * 864e5).toISOString()}`, { method: "DELETE" });
  return json({ devices: subs.length, rang });
});
