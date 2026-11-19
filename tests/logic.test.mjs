import test from 'node:test';
import assert from 'node:assert/strict';
import { occurrences, expand } from '../src/lib/recur.js';
import { localToUtc, addDays, partsIn } from '../src/lib/dates.js';
import { findConflicts, conflictsForDraft } from '../src/lib/conflicts.js';
import { buildIcs } from '../worker/src/ics.js';
import { dueReminders, messageFor, targetsFor } from '../worker/src/reminders.js';
import { encryptPayload, generateVapidKeys, vapidHeader } from '../worker/src/webpush.js';
import { b64u, unb64u } from '../worker/src/b64.js';
import ece from 'http_ece';
import crypto from 'node:crypto';

test('weekly Tue/Thu practice', () => {
  const ev = { date: '2026-11-03', repeat: { freq: 'weekly', days: [2, 4], interval: 1 } };
  assert.deepEqual(occurrences(ev, '2026-11-16', '2026-11-22'), ['2026-11-17', '2026-11-19']);
  assert.deepEqual(occurrences(ev, '2026-11-01', '2026-11-06'), ['2026-11-03', '2026-11-05']);
});
test('weekly every 2 weeks stays aligned', () => {
  const ev = { date: '2026-11-02', repeat: { freq: 'weekly', days: [1], interval: 2 } };
  assert.deepEqual(occurrences(ev, '2026-11-01', '2026-12-01'), ['2026-11-02', '2026-11-16', '2026-11-30']);
  assert.deepEqual(occurrences(ev, '2026-11-20', '2026-12-20'), ['2026-11-30', '2026-12-14']);
});
test('until and exceptions', () => {
  const ev = { date: '2026-11-03', repeat: { freq: 'weekly', days: [2], until: '2026-11-24' }, exceptions: ['2026-11-17'] };
  assert.deepEqual(occurrences(ev, '2026-11-01', '2026-12-31'), ['2026-11-03', '2026-11-10', '2026-11-24']);
});
test('daily, monthly, yearly incl leap day', () => {
  assert.deepEqual(occurrences({ date: '2026-11-28', repeat: { freq: 'daily', interval: 2 } }, '2026-12-01', '2026-12-05'), ['2026-12-02', '2026-12-04']);
  assert.deepEqual(occurrences({ date: '2026-01-31', repeat: { freq: 'monthly' } }, '2026-01-01', '2026-05-31'), ['2026-01-31', '2026-03-31', '2026-05-31']);
  assert.deepEqual(occurrences({ date: '2024-02-29', repeat: { freq: 'yearly' } }, '2026-01-01', '2028-12-31'), ['2026-02-28', '2027-02-28', '2028-02-29']);
  assert.deepEqual(occurrences({ date: '1980-05-04', repeat: { freq: 'yearly' } }, '2026-11-19', '2027-06-01'), ['2027-05-04']);
});
test('timezone conversion across DST', () => {
  // Nov 1 2026 is DST end in LA. 5pm Nov 2 PST = 01:00Z Nov 3
  assert.equal(new Date(localToUtc('2026-11-02', '17:00', 'America/Los_Angeles')).toISOString(), '2026-11-03T01:00:00.000Z');
  assert.equal(new Date(localToUtc('2026-07-02', '17:00', 'America/Los_Angeles')).toISOString(), '2026-07-03T00:00:00.000Z');
});
test('conflict detection with drivers', () => {
  const a = { id: 'a', date: '2026-11-19', start: '17:00', end: '18:30', memberIds: ['son'], driverTo: 'mom' };
  const b = { id: 'b', date: '2026-11-19', start: '16:45', end: '17:30', memberIds: ['mom'] };
  const d = { id: 'd', date: '2026-11-19', start: '17:30', end: '18:15', memberIds: ['mom'] }; // mom free while son is at practice
  const c = { id: 'c', date: '2026-11-19', start: '19:00', end: '20:00', memberIds: ['mom'] };
  const m = findConflicts(expand([a, b, c, d], '2026-11-19', '2026-11-19'));
  assert.equal(m.get('a@2026-11-19').length, 1);
  assert.ok(!m.get('c@2026-11-19'));
  assert.ok(!(m.get('d@2026-11-19') || []).some((x) => x.other.ev.id === 'a'));
  assert.equal(conflictsForDraft({ ...c, start: '17:00', end: '18:00' }, [a, b], '2026-12-01').length, 2);
});
test('ICS feed', () => {
  const family = { tz: 'America/Los_Angeles', name: 'Rosa', members: [{ id: 'dad', name: 'Dad' }, { id: 'son', name: 'Ethan' }] };
  const events = [
    { id: 'e1', title: 'Practice, varsity; gym', category: 'practice', date: '2026-11-03', start: '17:00', end: '18:30', memberIds: ['son'], driverTo: 'dad', location: '123 Main St, Fresno',
      repeat: { freq: 'weekly', days: [2, 4], interval: 1, until: '2027-02-28' }, exceptions: ['2026-11-26'], notes: 'Line one\nLine two that is quite long so that the description definitely has to be folded across more than one line in the output ✓' },
    { id: 'e2', title: "Mom's birthday", category: 'birthday', allDay: true, date: '2026-11-28', memberIds: [], repeat: { freq: 'yearly' } },
    { id: 'e3', title: 'Work', category: 'work', date: '2026-11-20', start: '09:00', end: '12:00', memberIds: ['dad'] },
  ];
  const ics = buildIcs({ family, events });
  assert.match(ics, /RRULE:FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20270301T075900Z/);
  assert.match(ics, /EXDATE;TZID=America\/Los_Angeles:20261126T170000/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261128/);
  assert.match(ics, /SUMMARY:⚽ Practice\\, varsity\\\; gym \(Ethan\)/);
  for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, 'line too long: ' + line);
  const sonOnly = buildIcs({ family, events, memberId: 'son' });
  assert.ok(sonOnly.includes('UID:e1@') && sonOnly.includes('UID:e2@') && !sonOnly.includes('UID:e3@'));
  console.log(ics.split('\r\n').slice(0, 40).join('\n'));
});
test('reminders fire once in window', () => {
  const family = { tz: 'America/Los_Angeles', members: [{ id: 'dad', name: 'Dad' }, { id: 'son', name: 'Ethan' }, { id: 'mom', name: 'Mom' }] };
  const ev = { id: 'p', title: 'Practice', category: 'practice', date: '2026-11-03', start: '17:00', end: '18:30', memberIds: ['son'], driverTo: 'mom', reminders: [60, 1440],
    repeat: { freq: 'weekly', days: [2, 4] } };
  const bday = { id: 'b', title: "Grandma's birthday", category: 'birthday', allDay: true, date: '2020-11-26', repeat: { freq: 'yearly' }, reminders: [10080] };
  const at = localToUtc('2026-11-19', '16:00', 'America/Los_Angeles');
  let due = dueReminders({ family, events: [ev, bday], fromMs: at - 5 * 60000, toMs: at });
  assert.deepEqual(due.map((d) => [d.ev.id, d.date, d.minutes]), [['p', '2026-11-19', 60]]);
  const msg = messageFor(due[0], family, '2026-11-19');
  assert.match(msg.body, /Starts in 1 hour · 5pm/);
  assert.match(msg.body, /Mom drops off/);
  const subs = [{ id: 1, memberId: 'son' }, { id: 2, memberId: 'mom' }, { id: 3, memberId: 'dad' }];
  assert.deepEqual(targetsFor(ev, subs).map((s) => s.id), [1, 2]);
  // 1 week before Grandma's birthday at 8am
  const at2 = localToUtc('2026-11-19', '08:00', 'America/Los_Angeles');
  due = dueReminders({ family, events: [ev, bday], fromMs: at2 - 60000, toMs: at2 });
  assert.deepEqual(due.map((d) => [d.ev.id, d.date]), [['b', '2026-11-26']]);
  assert.equal(targetsFor(bday, subs).length, 3);
  assert.match(messageFor(due[0], family, '2026-11-19').body, /in 7 days/);
});
test('web push encryption decrypts with reference implementation', async () => {
  const ua = crypto.createECDH('prime256v1'); ua.generateKeys();
  const auth = crypto.randomBytes(16);
  const body = await encryptPayload(b64u(ua.getPublicKey()), b64u(auth), JSON.stringify({ title: 'Hi', body: 'There 🎉' }));
  const plain = ece.decrypt(Buffer.from(body), { version: 'aes128gcm', privateKey: ua, authSecret: auth });
  assert.equal(JSON.parse(plain.toString()).body, 'There 🎉');
});
test('VAPID JWT verifies', async () => {
  const k = await generateVapidKeys();
  const env = { VAPID_PUBLIC_KEY: k.publicKey, VAPID_PRIVATE_JWK: k.privateJwk, VAPID_SUBJECT: 'mailto:x@y.z' };
  const h = await vapidHeader('https://web.push.apple.com/abc', env);
  const [, jwt, kk] = h.match(/^vapid t=([^,]+), k=(.+)$/);
  const [hd, cl, sig] = jwt.split('.');
  const pub = await crypto.webcrypto.subtle.importKey('raw', unb64u(kk), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  assert.ok(await crypto.webcrypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, unb64u(sig), new TextEncoder().encode(hd + '.' + cl)));
  assert.equal(JSON.parse(Buffer.from(cl, 'base64url')).aud, 'https://web.push.apple.com');
});

import { routineSlots, slotAssignees, choreBoard, doneId } from '../src/lib/routines.js';
import { dueChoreReminders } from '../worker/src/reminders.js';

test('chore slots: daily, weekly days, weekly flex, monthly day + flex', () => {
  const daily = { id: 'd', freq: 'daily', startDate: '2026-11-01' };
  assert.deepEqual(routineSlots(daily, '2026-11-18', '2026-11-19').map((s) => s.key), ['2026-11-18', '2026-11-19']);
  const trash = { id: 't', freq: 'weekly', days: [1, 4], startDate: '2026-11-01' };
  assert.deepEqual(routineSlots(trash, '2026-11-15', '2026-11-21').map((s) => s.key), ['2026-11-16', '2026-11-19']);
  const vac = { id: 'v', freq: 'weekly', days: [], startDate: '2026-11-01' };
  assert.deepEqual(routineSlots(vac, '2026-11-19', '2026-11-19'), [{ key: 'W2026-11-15', start: '2026-11-15', date: '2026-11-21', flex: true }]);
  const fridge = { id: 'f', freq: 'monthly', monthDay: 31, startDate: '2026-10-05' };
  assert.deepEqual(routineSlots(fridge, '2026-11-01', '2027-01-31').map((s) => s.key), ['2026-11-30', '2026-12-31', '2027-01-31']);
  const filter = { id: 'a', freq: 'monthly', monthDay: null, startDate: '2026-10-05' };
  assert.deepEqual(routineSlots(filter, '2026-11-19', '2026-11-30').map((s) => [s.key, s.date]), [['M2026-11', '2026-11-30']]);
});
test('chore rotation takes turns', () => {
  const r = { id: 'u', freq: 'daily', startDate: '2026-11-17', assignees: ['son', 'mom', 'dad'], rotate: true };
  const who = (d) => slotAssignees(r, routineSlots(r, d, d)[0])[0];
  assert.deepEqual(['2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'].map(who), ['son', 'mom', 'dad', 'son']);
  const mow = { id: 'm', freq: 'weekly', days: [], startDate: '2026-11-01', assignees: ['dad', 'son'], rotate: true };
  const w = (d) => slotAssignees(mow, routineSlots(mow, d, d)[0])[0];
  assert.deepEqual([w('2026-11-03'), w('2026-11-10'), w('2026-11-19')], ['dad', 'son', 'dad']);
});
test('chore board groups and done state', () => {
  const r1 = { id: 'b', title: 'Make bed', freq: 'daily', startDate: '2026-11-01' };
  const r2 = { id: 't', title: 'Trash', freq: 'weekly', days: [1], startDate: '2026-11-01' };
  const r3 = { id: 'v', title: 'Vacuum', freq: 'weekly', days: [], startDate: '2026-11-01' };
  const done = { [doneId(r1, { key: '2026-11-19' })]: { state: 'done', by: 'son' } };
  const b = choreBoard([r1, r2, r3], done, '2026-11-19');
  const g = Object.fromEntries(b.map((x) => [x.r.id + ':' + x.group, !!x.done]));
  assert.deepEqual(g, { 'b:today': true, 'b:overdue': false, 't:overdue': false, 'v:week': false });
});
test('chore reminders fire at time unless done', () => {
  const family = { tz: 'America/Los_Angeles', members: [] };
  const r = { id: 'dog', title: 'Feed dog', freq: 'daily', time: '18:00', remind: true, startDate: '2026-11-01', assignees: ['son'] };
  const at = localToUtc('2026-11-19', '18:00', 'America/Los_Angeles');
  assert.equal(dueChoreReminders({ family, routines: [r], fromMs: at - 300000, toMs: at }).length, 1);
  assert.equal(dueChoreReminders({ family, routines: [r], done: [{ id: 'dog_2026-11-19' }], fromMs: at - 300000, toMs: at }).length, 0);
});
test('event reminders skip moved occurrences; ICS hides moved one', () => {
  const family = { tz: 'America/Los_Angeles', members: [{ id: 'dad', name: 'Dad' }] };
  const ev = { id: 'w', title: 'Workout', category: 'workout', date: '2026-11-02', start: '06:00', end: '07:00', memberIds: ['dad'], reminders: [0], repeat: { freq: 'weekly', days: [1, 3, 5] } };
  const at = localToUtc('2026-11-20', '06:00', 'America/Los_Angeles');
  const checkins = [{ eventId: 'w', date: '2026-11-20', state: 'moved', movedTo: { date: '2026-11-21', start: '09:00' } }];
  assert.equal(dueReminders({ family, events: [ev], fromMs: at - 1000, toMs: at }).length, 1);
  assert.equal(dueReminders({ family, events: [ev], checkins, fromMs: at - 1000, toMs: at }).length, 0);
  assert.match(buildIcs({ family, events: [ev], checkins }), /EXDATE;TZID=America\/Los_Angeles:20261120T060000/);
});

test('moved and missed chores', () => {
  const r = { id: 't', title: 'Trash', freq: 'weekly', days: [4], time: '19:00', remind: true, startDate: '2026-11-01', assignees: ['son'] };
  const moved = { 't_2026-11-19': { routineId: 't', key: '2026-11-19', state: 'moved', movedTo: { date: '2026-11-20', time: '08:00' } } };
  let b = choreBoard([r], moved, '2026-11-19');
  assert.deepEqual(b.map((x) => [x.group, x.moved]), [['today', 'from']]);
  b = choreBoard([r], moved, '2026-11-20');
  assert.deepEqual(b.map((x) => [x.group, x.moved, x.slot.key]), [['today', 'to', '2026-11-19']]);
  b = choreBoard([r], moved, '2026-11-21');
  assert.deepEqual(b.map((x) => [x.group, x.moved]), [['overdue', 'to']]);
  const doneAfter = { 't_2026-11-19': { ...moved['t_2026-11-19'], state: 'done' } };
  assert.equal(choreBoard([r], doneAfter, '2026-11-21').length, 0);
  assert.ok(choreBoard([r], doneAfter, '2026-11-20')[0].done);
  const missed = { 't_2026-11-16': { routineId: 't', key: '2026-11-16', state: 'missed' } };
  const r2 = { ...r, days: [1] };
  assert.equal(choreBoard([r2], missed, '2026-11-19').length, 0); // missed = dealt with, not overdue
  const family = { tz: 'America/Los_Angeles', members: [] };
  const at = localToUtc('2026-11-20', '08:00', 'America/Los_Angeles');
  const due = dueChoreReminders({ family, routines: [r], done: [{ id: 't_2026-11-19', ...moved['t_2026-11-19'] }], fromMs: at - 1000, toMs: at });
  assert.equal(due.length, 1);
  const at2 = localToUtc('2026-11-19', '19:00', 'America/Los_Angeles');
  assert.equal(dueChoreReminders({ family, routines: [r], done: [{ id: 't_2026-11-19', ...moved['t_2026-11-19'] }], fromMs: at2 - 1000, toMs: at2 }).length, 0);
});
