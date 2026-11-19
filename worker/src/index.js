import { firestore, serviceAccount } from './google.js';
import { buildIcs } from './ics.js';
import { sendPush, generateVapidKeys, isPushEndpoint } from './webpush.js';
import { dueReminders, messageFor, targetsFor, dueChoreReminders, choreMessage } from './reminders.js';
import { partsIn } from '../../src/lib/dates.js';

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, GET, OPTIONS', 'access-control-allow-headers': 'content-type' };
const html = (body) => new Response(`<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><title>Family Hub worker</title><body style="font:16px/1.5 -apple-system,system-ui,sans-serif;max-width:720px;margin:30px auto;padding:0 16px">${body}</body>`, { headers: { 'content-type': 'text/html; charset=utf-8' } });
const escHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

    try {
      if (url.pathname === '/' || url.pathname === '/setup') return setupPage(env, url.origin);

      const ics = url.pathname.match(/^\/ics\/([A-Za-z0-9]{16,64})(\.ics)?$/);
      if (ics && req.method === 'GET') {
        const db = firestore(env);
        const feed = await db.get(`feeds/${ics[1]}`);
        if (!feed) return new Response('Calendar link not found. Make a new one in Family Hub › More.', { status: 404 });
        const family = await db.get(`families/${feed.fid}`);
        if (!family || family.feedToken !== ics[1]) return new Response('This calendar link was replaced. Subscribe again from Family Hub › More.', { status: 410 });
        const [events, checkins] = await Promise.all([db.list(`families/${feed.fid}/events`), db.list(`families/${feed.fid}/checkins`)]);
        const body = buildIcs({ family, events, checkins, memberId: url.searchParams.get('m') || null });
        return new Response(body, { headers: { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'max-age=300' } });
      }

      if (url.pathname === '/test' && req.method === 'POST') {
        const sub = await req.json();
        if (!sub || !isPushEndpoint(sub.endpoint) || !sub.p256dh || !sub.auth) return new Response('Bad subscription', { status: 400, headers: cors });
        const r = await sendPush(env, sub, { title: '🔔 Family Hub', body: 'Reminders are working on this phone!', tag: 'test' });
        return new Response(r.ok ? 'sent' : `push service said ${r.status}: ${r.text}`, { status: r.ok ? 200 : 502, headers: cors });
      }

      return new Response('Not found', { status: 404 });
    } catch (e) {
      console.error(e);
      return new Response('Error: ' + e.message, { status: 500, headers: cors });
    }
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runReminders(env));
  },
};

export async function runReminders(env) {
  const db = firestore(env);
  const now = Date.now();
  const state = await db.get('system/reminders');
  let from = state && state.lastRun ? state.lastRun : now - 5 * 60_000;
  if (now - from > 60 * 60_000) from = now - 60 * 60_000; // never send a flood of old reminders
  let sent = 0;

  const families = await db.list('families');
  for (const family of families) {
    const subs = await db.list(`families/${family.id}/push`);
    if (!subs.length) continue;
    const [events, checkins, routines, done] = await Promise.all([
      db.list(`families/${family.id}/events`), db.list(`families/${family.id}/checkins`),
      db.list(`families/${family.id}/routines`), db.list(`families/${family.id}/routineDone`),
    ]);
    const due = dueReminders({ family, events, checkins, fromMs: from, toMs: now });
    const choreDue = dueChoreReminders({ family, routines, done, fromMs: from, toMs: now });
    const today = partsIn(new Date(now), family.tz || 'America/Los_Angeles').date;
    const dead = new Set();
    await Promise.all(due.map(async (d) => {
      const msg = messageFor(d, family, today);
      await Promise.all(targetsFor(d.ev, subs).map(async (s) => {
        if (dead.has(s.id)) return;
        const r = await sendPush(env, s, msg).catch((e) => ({ ok: false, error: e }));
        if (r.ok) sent++;
        else if (r.gone) dead.add(s.id);
        else console.warn('push failed', r.status, r.text || r.error);
      }));
    }));
    await Promise.all(choreDue.map(async (d) => {
      const msg = choreMessage(d, family);
      const targets = d.who.length ? subs.filter((s) => d.who.includes(s.memberId)) : subs;
      await Promise.all(targets.map(async (s) => {
        if (dead.has(s.id)) return;
        const r = await sendPush(env, s, msg).catch((e) => ({ ok: false, error: e }));
        if (r.ok) sent++;
        else if (r.gone) dead.add(s.id);
      }));
    }));
    for (const id of dead) await db.remove(`families/${family.id}/push/${id}`).catch(() => {});
  }
  await db.patch('system/reminders', { lastRun: now });
  return sent;
}

async function setupPage(env, origin) {
  const rows = [];
  let ok = true;
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_JWK) {
    ok = false;
    const k = await generateVapidKeys();
    rows.push(`<h2>1. Add these two secrets to your worker</h2>
      <p>In Cloudflare: your worker › <b>Settings</b> › <b>Variables and Secrets</b> › <b>Add</b>, type <b>Secret</b>. These were just generated for you. Copy them now (they change each time you reload this page until saved).</p>
      <p><b>VAPID_PUBLIC_KEY</b><br><textarea rows=2 style="width:100%" readonly>${k.publicKey}</textarea></p>
      <p><b>VAPID_PRIVATE_JWK</b><br><textarea rows=3 style="width:100%" readonly>${escHtml(k.privateJwk)}</textarea></p>`);
  } else {
    rows.push(`<p>✅ Reminder keys are set.</p><p>Paste this into <b>config.js</b> as <code>vapidPublicKey</code>:</p><textarea rows=2 style="width:100%" readonly>${env.VAPID_PUBLIC_KEY}</textarea>`);
  }
  try {
    const sa = serviceAccount(env);
    await firestore(env).get('system/reminders');
    rows.push(`<p>✅ Connected to Firebase project <b>${escHtml(sa.project_id)}</b>.</p>`);
  } catch (e) {
    ok = false;
    rows.push(`<p>❌ Firebase connection: ${escHtml(e.message)}</p><p>Add the <b>FIREBASE_SERVICE_ACCOUNT</b> secret (the whole JSON key file from Firebase › Project settings › Service accounts).</p>`);
  }
  if (!env.VAPID_SUBJECT) rows.push('<p>ℹ️ Optional: add a <b>VAPID_SUBJECT</b> variable like <code>mailto:you@example.com</code>.</p>');
  rows.push(`<p>Worker URL for <b>config.js</b> (<code>workerUrl</code>): <code>${escHtml(origin)}</code></p>`);
  return html(`<h1>${ok ? '✅' : '🛠️'} Family Hub worker</h1>${rows.join('')}`);
}
