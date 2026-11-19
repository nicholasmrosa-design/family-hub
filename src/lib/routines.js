// Chores ("routines"): repeating household jobs with optional times, assignees and rotation.
// r = { title, freq: 'daily'|'weekly'|'monthly', days: [0..6] (weekly; empty = any day that week),
//       monthDay: 1..31 (monthly; null = any time that month), time: 'HH:MM'|null,
//       assignees: [memberId], rotate: bool, remind: bool, startDate: 'YYYY-MM-DD', area }
import { occurrences } from './recur.js';
import { addDays, startOfWeek, parseDate, fmtDate, daysInMonth, diffDays, pad } from './dates.js';

export function isFlex(r) {
  return (r.freq === 'weekly' && !(r.days && r.days.length)) || (r.freq === 'monthly' && !r.monthDay);
}

function asEvent(r) {
  const start = r.startDate || '2024-01-01';
  if (r.freq === 'daily') return { date: start, repeat: { freq: 'daily', interval: 1 } };
  if (r.freq === 'weekly') return { date: start, repeat: { freq: 'weekly', interval: 1, days: r.days } };
  // monthly on a fixed day: first such day on/after start
  const s = parseDate(start);
  let y = s.getUTCFullYear(), m = s.getUTCMonth();
  if (s.getUTCDate() > Math.min(r.monthDay, daysInMonth(y, m))) { m++; if (m > 11) { m = 0; y++; } }
  return { date: `${y}-${pad(m + 1)}-${pad(Math.min(r.monthDay, daysInMonth(y, m)))}`, repeat: { freq: 'monthly', interval: 1 } };
}

const monthEnd = (d) => { const p = parseDate(d); return fmtDate(new Date(Date.UTC(p.getUTCFullYear(), p.getUTCMonth(), daysInMonth(p.getUTCFullYear(), p.getUTCMonth()), 12))); };

// Slots = individual times a chore is due, within [from, to].
// Fixed-date slots: { key: date, date, flex: false }. Flexible: { key: 'W2026-11-15' | 'M2026-11', date: due-by date, start, flex: true }
export function routineSlots(r, from, to) {
  if (r.paused) return [];
  const start = r.startDate || '2024-01-01';
  if (!isFlex(r)) {
    if (r.freq === 'monthly') {
      const out = [];
      const s = parseDate(from > start ? from : start);
      let y = s.getUTCFullYear(), m = s.getUTCMonth();
      for (let i = 0; i < 40; i++) {
        const d = `${y}-${pad(m + 1)}-${pad(Math.min(r.monthDay, daysInMonth(y, m)))}`;
        if (d > to) break;
        if (d >= from && d >= start) out.push({ key: d, date: d, flex: false });
        m++; if (m > 11) { m = 0; y++; }
      }
      return out;
    }
    return occurrences(asEvent(r), from, to).map((d) => ({ key: d, date: d, flex: false }));
  }
  const out = [];
  if (r.freq === 'weekly') {
    for (let ws = startOfWeek(from); ws <= to; ws = addDays(ws, 7)) {
      if (addDays(ws, 6) < start) continue;
      out.push({ key: 'W' + ws, start: ws, date: addDays(ws, 6), flex: true });
    }
  } else {
    let d = from.slice(0, 8) + '01';
    for (let i = 0; i < 40 && d <= to; i++) {
      if (monthEnd(d) >= start) out.push({ key: 'M' + d.slice(0, 7), start: d, date: monthEnd(d), flex: true });
      d = addDays(monthEnd(d), 1);
    }
  }
  return out;
}

// Who does this slot? Rotating chores take turns; otherwise all assignees share it.
export function slotAssignees(r, slot) {
  const a = r.assignees || [];
  if (!r.rotate || a.length < 2) return a;
  const start = r.startDate || '2024-01-01';
  let n;
  if (slot.flex) {
    n = r.freq === 'weekly'
      ? Math.round(diffDays(startOfWeek(start), slot.start) / 7)
      : (Number(slot.start.slice(0, 4)) - Number(start.slice(0, 4))) * 12 + Number(slot.start.slice(5, 7)) - Number(start.slice(5, 7));
  } else {
    n = routineSlots(r, start, slot.date).length - 1;
  }
  return [a[((n % a.length) + a.length) % a.length]];
}

export const doneId = (r, slot) => `${r.id}_${slot.key}`;

export function describeRoutine(r) {
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  let s;
  if (r.freq === 'daily') s = 'Every day';
  else if (r.freq === 'weekly') s = r.days && r.days.length ? (r.days.length === 7 ? 'Every day' : 'Every ' + r.days.slice().sort().map((d) => names[d]).join(', ')) : 'Once a week';
  else s = r.monthDay ? `Monthly on the ${ordinal(r.monthDay)}` : 'Once a month';
  return s;
}
function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// Rebuild the original slot from a saved key ('2026-11-19', 'W2026-11-15' or 'M2026-11').
export function slotFromKey(key) {
  if (key[0] === 'W') return { key, start: key.slice(1), date: addDays(key.slice(1), 6), flex: true };
  if (key[0] === 'M') { const d = key.slice(1) + '-01'; return { key, start: d, date: monthEnd(d), flex: true }; }
  return { key, date: key, flex: false };
}

// Build the list a person sees: today's chores, this week's / month's flexible ones, recent ones not dealt with,
// and chores that were moved to today. Each row: { r, slot, group, status, done, who, moved: 'from'|'to'|null }
// status = the saved check-off doc ({state: 'done'|'missed'|'moved', by, movedTo: {date, time}}) or undefined.
export function choreBoard(routines, doneMap, today) {
  const ws = startOfWeek(today);
  const rows = [];
  const byId = Object.fromEntries(routines.map((r) => [r.id, r]));
  const push = (r, slot, group, status, moved) =>
    rows.push({ r, slot, group, status, moved, done: status && status.state === 'done' && moved !== 'from' ? status : null, who: slotAssignees(r, slot) });

  for (const r of routines) {
    if (r.paused) continue;
    for (const slot of routineSlots(r, addDays(today, -6), monthEnd(today))) {
      const status = doneMap[doneId(r, slot)];
      if (status && status.movedTo) {
        // Show the "moved to …" note in its original spot only when that spot is today / this period.
        if (slot.flex ? slot.start <= today && slot.date >= today : slot.date === today) {
          if (status.movedTo.date !== today) push(r, slot, slot.flex ? (r.freq === 'weekly' ? 'week' : 'month') : 'today', status, 'from');
        }
        continue;
      }
      let group = null;
      if (slot.flex) {
        if (slot.start <= today && slot.date >= today) group = r.freq === 'weekly' ? 'week' : 'month';
      } else if (slot.date === today) group = 'today';
      else if (slot.date < today && !status && (r.freq !== 'daily' ? slot.date >= ws : slot.date === addDays(today, -1))) group = 'overdue';
      if (!group) continue;
      push(r, slot, group, status, null);
    }
  }
  // Chores moved onto a day: show them on that day (or as overdue if the new day passed).
  for (const st of Object.values(doneMap)) {
    if (!st || !st.movedTo || !byId[st.routineId] || byId[st.routineId].paused) continue;
    const r = byId[st.routineId];
    const d = st.movedTo.date;
    let group = null;
    if (d === today) group = 'today';
    else if (d < today && d >= addDays(today, -6) && st.state === 'moved') group = 'overdue';
    if (group) push(r, slotFromKey(st.key), group, st, 'to');
  }
  const t = (x) => (x.moved === 'to' && x.status.movedTo.time) || x.r.time || '99';
  rows.sort((a, b) => (t(a) < t(b) ? -1 : t(a) > t(b) ? 1 : a.r.title.localeCompare(b.r.title)));
  return rows;
}
