import { toMinutes } from './dates.js';
import { occurrences } from './recur.js';

const DRIVE = 30; // minutes a driver is tied up around drop-off / pick-up

// When is each person busy for this event? Attendees for the whole event,
// the drop-off driver around the start, the pick-up driver around the end.
function busy(ev) {
  const s = toMinutes(ev.start);
  if (s == null || ev.allDay) return [];
  let e = toMinutes(ev.end);
  if (e == null || e <= s) e = s + 60;
  const out = (ev.memberIds || []).map((p) => ({ p, a: s, b: e }));
  if (ev.driverTo) out.push({ p: ev.driverTo, a: s - DRIVE, b: s + 10 });
  if (ev.driverFrom) out.push({ p: ev.driverFrom, a: e - 10, b: e + DRIVE });
  return out;
}

// Given instances (possibly over several days), return Map(instanceKey -> [{other, people}])
export function findConflicts(instances) {
  const res = new Map();
  const items = instances.map((i) => ({ i, busy: busy(i.ev) })).filter((x) => x.busy.length);
  for (let x = 0; x < items.length; x++) {
    for (let y = x + 1; y < items.length; y++) {
      const A = items[x], B = items[y];
      if (A.i.date !== B.i.date) continue;
      if ((A.i.ev.movedFrom && A.i.ev.movedFrom.id === B.i.ev.id) || (B.i.ev.movedFrom && B.i.ev.movedFrom.id === A.i.ev.id)) continue;
      const people = new Set();
      for (const u of A.busy) for (const v of B.busy) if (u.p === v.p && u.a < v.b && v.a < u.b) people.add(u.p);
      if (!people.size) continue;
      const shared = [...people];
      (res.get(A.i.key) || res.set(A.i.key, []).get(A.i.key)).push({ other: B.i, people: shared });
      (res.get(B.i.key) || res.set(B.i.key, []).get(B.i.key)).push({ other: A.i, people: shared });
    }
  }
  return res;
}

// Check a draft event against existing events for its first few occurrences.
export function conflictsForDraft(draft, events, horizonEnd) {
  const out = [];
  const dates = occurrences(draft, draft.date, horizonEnd).slice(0, 12);
  for (const d of dates) {
    const others = [];
    for (const ev of events) {
      if (ev.id === draft.id) continue;
      if (occurrences(ev, d, d).length) others.push({ ev, date: d, key: ev.id + '@' + d });
    }
    const mine = { ev: draft, date: d, key: '__draft@' + d };
    const m = findConflicts([mine, ...others]).get(mine.key);
    if (m) out.push(...m.map((c) => ({ date: d, ...c })));
  }
  return out;
}
