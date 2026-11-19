// Runs the bundled worker against a fake Google/Firestore backend.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import worker from '../worker/worker.js';
import { encodeValue } from '../worker/src/google.js';

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const sa = { project_id: 'demo-proj', client_email: 'svc@demo-proj.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
const docs = {
  'feeds/TOKEN1234567890abcdef': { fid: 'fam1' },
  'families/fam1': { name: 'Rosa', tz: 'America/Los_Angeles', feedToken: 'TOKEN1234567890abcdef', members: [{ id: 'dad', name: 'Dad' }, { id: 'son', name: 'Ethan' }] },
};
const events = [{ id: 'e1', title: 'Practice', category: 'practice', date: '2026-11-03', start: '17:00', end: '18:30', memberIds: ['son'], repeat: { freq: 'weekly', days: [2, 4], interval: 1 }, reminders: [60] }];
const calls = [];
globalThis.fetch = async (url, init = {}) => {
  url = String(url); calls.push([init.method || 'GET', url]);
  if (url.startsWith('https://oauth2.googleapis.com/token')) {
    const jwt = new URLSearchParams(init.body).get('assertion');
    const [h, c, s] = jwt.split('.');
    assert.ok(crypto.verify('sha256', Buffer.from(h + '.' + c), publicKey, Buffer.from(s, 'base64url')), 'JWT signature');
    return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }));
  }
  const m = url.match(/documents\/(.+?)(\?|$)/);
  assert.equal(init.headers.authorization, 'Bearer tok');
  const path = m[1];
  const toDoc = (p, o) => ({ name: 'projects/demo-proj/databases/(default)/documents/' + p, fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, encodeValue(v)])) });
  if (path === 'families/fam1/events') return new Response(JSON.stringify({ documents: events.map((e) => toDoc('families/fam1/events/' + e.id, e)) }));
  if (path === 'families') return new Response(JSON.stringify({ documents: [toDoc('families/fam1', docs['families/fam1'])] }));
  if (path === 'families/fam1/push') return new Response(JSON.stringify({}));
  if (init.method === 'PATCH') return new Response('{}');
  if (docs[path]) return new Response(JSON.stringify(toDoc(path, docs[path])));
  return new Response('{}', { status: 404 });
};
const env = { FIREBASE_SERVICE_ACCOUNT: JSON.stringify(sa) };

test('ICS route', async () => {
  const r = await worker.fetch(new Request('https://w.example/ics/TOKEN1234567890abcdef.ics?m=son'), env);
  const t = await r.text();
  assert.equal(r.status, 200, t);
  assert.match(t, /RRULE:FREQ=WEEKLY;BYDAY=TU,TH/);
  assert.match(t, /X-WR-CALNAME:Family Hub · Ethan/);
});
test('unknown feed 404', async () => {
  const r = await worker.fetch(new Request('https://w.example/ics/NOPE1234567890abcdefgh.ics'), env);
  assert.equal(r.status, 404);
});
test('setup page generates keys and confirms Firebase', async () => {
  const r = await worker.fetch(new Request('https://w.example/setup'), env);
  const t = await r.text();
  assert.match(t, /VAPID_PRIVATE_JWK/);
  assert.match(t, /Connected to Firebase project <b>demo-proj/);
});
test('scheduled run with no subscriptions saves lastRun', async () => {
  let p; await worker.scheduled({}, env, { waitUntil: (x) => { p = x; } }); await p;
  assert.ok(calls.some(([m, u]) => m === 'PATCH' && u.includes('system/reminders')));
});
