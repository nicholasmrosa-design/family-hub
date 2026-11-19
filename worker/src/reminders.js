import { occurrences } from '../../src/lib/recur.js';
import { localToUtc, partsIn, addDays, fmtTime, diffDays } from '../../src/lib/dates.js';
import { CAT, ALL_DAY_REMINDER_TIME } from '../../src/lib/constants.js';
import { routineSlots, slotAssignees, isFlex, doneId, slotFromKey } from '../../src/lib/routines.js';

// Work out which reminders should fire in the window (fromMs, toMs].
export function dueReminders({ family, events, fromMs, toMs, checkins = [] }) {
  const skip = new Set(checkins.map((c) => `${c.eventId}@${c.date}`));
  const tz = family.tz || 'America/Los_Angeles';
  const startDate = addDays(partsIn(new Date(fromMs), tz).date, -1);
  const endDate = addDays(partsIn(new Date(toMs), tz).date, 8); // longest reminder is 1 week
  const out = [];
  for (const ev of events) {
    const rems = (ev.reminders || []).map(Number).filter((n) => n >= 0);
    if (!rems.length || !ev.date) continue;
    for (const date of occurrences(ev, startDate, endDate)) {
      if (skip.has(`${ev.id}@${date}`)) continue; // moved, missed or already done
      const allDay = ev.allDay || !ev.start;
      const startMs = localToUtc(date, allDay ? ALL_DAY_REMINDER_TIME : ev.start, tz);
      for (const r of rems) {
        // For all-day events, "1 day before" means 8am the day before.
        const fire = startMs - r * 60000;
        if (fire > fromMs && fire <= toMs) out.push({ ev, date, minutes: r, fireMs: fire });
      }
    }
  }
  return out;
}

export function messageFor({ ev, date, minutes }, family, todayStr) {
  const members = family.members || [];
  const name = (id) => (members.find((m) => m.id === id) || {}).name;
  const cat = CAT[ev.category] || CAT.other;
  const allDay = ev.allDay || !ev.start;
  const days = diffDays(todayStr, date);
  const when = days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
  let body;
  if (ev.category === 'birthday') body = days === 0 ? 'Today! Don’t forget to wish them happy birthday 🎉' : `Coming up ${when}`;
  else if (allDay) body = `All day ${when}`;
  else if (minutes === 0) body = `Starting now · ${fmtTime(ev.start)}`;
  else if (minutes < 1440) body = `Starts in ${minutes < 60 ? minutes + ' min' : minutes / 60 + (minutes === 60 ? ' hour' : ' hours')} · ${fmtTime(ev.start)}`;
  else body = `${when[0].toUpperCase() + when.slice(1)} at ${fmtTime(ev.start)}`;
  const extra = [];
  const people = (ev.memberIds || []).map(name).filter(Boolean);
  if (people.length && people.length < members.length) extra.push(people.join(', '));
  if (ev.driverTo || ev.driverFrom) {
    const to = name(ev.driverTo), from = name(ev.driverFrom);
    extra.push(to && from && to === from ? `🚗 ${to} driving` : [to && `🚗 ${to} drops off`, from && `${from} picks up`].filter(Boolean).join(', '));
  }
  if (ev.location) extra.push(`📍 ${ev.location}`);
  if (ev.bring) extra.push(`🎒 ${ev.bring}`);
  return {
    title: `${cat.emoji} ${ev.title}`,
    body: [body, ...extra].join('\n'),
    tag: `${ev.id}-${date}-${minutes}`,
  };
}

// Which push subscriptions should get this reminder.
export function targetsFor(ev, subs) {
  const involved = new Set([...(ev.memberIds || []), ev.driverTo, ev.driverFrom].filter(Boolean));
  if (ev.remindAll || !(ev.memberIds || []).length) return subs;
  return subs.filter((s) => involved.has(s.memberId));
}

// Chores with a time and "remind" turned on.
export function dueChoreReminders({ family, routines, done = [], fromMs, toMs }) {
  const tz = family.tz || 'America/Los_Angeles';
  const doneIds = new Set(done.map((d) => d.id));
  const from = addDays(partsIn(new Date(fromMs), tz).date, -1);
  const to = addDays(partsIn(new Date(toMs), tz).date, 1);
  const out = [];
  for (const r of routines) {
    if (!r.remind || !r.time || r.paused || isFlex(r)) continue;
    for (const slot of routineSlots(r, from, to)) {
      const fire = localToUtc(slot.date, r.time, tz);
      if (fire > fromMs && fire <= toMs && !doneIds.has(doneId(r, slot))) out.push({ r, slot, who: slotAssignees(r, slot) });
    }
  }
  // Chores moved to a new day/time remind at the new time.
  const byId = Object.fromEntries(routines.map((r) => [r.id, r]));
  for (const d of done) {
    const r = byId[d.routineId];
    if (!r || !r.remind || r.paused || d.state !== 'moved' || !d.movedTo) continue;
    const time = d.movedTo.time || r.time;
    if (!time) continue;
    const fire = localToUtc(d.movedTo.date, time, tz);
    if (fire > fromMs && fire <= toMs) {
      const slot = slotFromKey(d.key);
      out.push({ r: { ...r, time }, slot, who: slotAssignees(r, slot) });
    }
  }
  return out;
}

export function choreMessage({ r, slot, who }, family) {
  const names = who.map((id) => ((family.members || []).find((m) => m.id === id) || {}).name).filter(Boolean);
  return {
    title: `🧹 ${r.title}`,
    body: `${names.length === 1 && r.rotate ? names[0] + '’s turn · ' : names.length ? names.join(', ') + ' · ' : ''}${fmtTime(r.time)}. Tap to check it off when it’s done.`,
    tag: `chore-${r.id}-${slot.key}`,
  };
}
