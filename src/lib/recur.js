// Recurrence expansion shared by the app and the Cloudflare worker.
// event.repeat = { freq: 'none'|'daily'|'weekly'|'monthly'|'yearly', interval: 1, days: [0..6], until: 'YYYY-MM-DD'|null }
import { addDays, diffDays, parseDate, fmtDate, weekday, daysInMonth, startOfWeek } from './dates.js';

const MAX_OCCURRENCES = 2000;

// Returns the list of occurrence dates (YYYY-MM-DD) of `ev` within [from, to] inclusive.
export function occurrences(ev, from, to) {
  const r = ev.repeat || { freq: 'none' };
  const start = ev.date;
  const ex = new Set(ev.exceptions || []);
  const until = r.until && r.until < to ? r.until : to;
  const out = [];
  const push = (d) => { if (d >= from && d <= until && d >= start && !ex.has(d)) out.push(d); };
  const interval = Math.max(1, Number(r.interval) || 1);

  if (!r.freq || r.freq === 'none') {
    push(start);
    return out;
  }
  if (start > until) return out;

  if (r.freq === 'daily') {
    let k = from > start ? Math.ceil(diffDays(start, from) / interval) : 0;
    for (let i = 0; i < MAX_OCCURRENCES; i++, k++) {
      const d = addDays(start, k * interval);
      if (d > until) break;
      push(d);
    }
  } else if (r.freq === 'weekly') {
    const days = (r.days && r.days.length ? r.days : [weekday(start)]).slice().sort();
    const week0 = startOfWeek(start);
    let w = from > start ? Math.floor(diffDays(week0, startOfWeek(from)) / 7) : 0;
    w = Math.floor(w / interval) * interval;
    for (let i = 0; i < MAX_OCCURRENCES; i++, w += interval) {
      const ws = addDays(week0, w * 7);
      if (ws > until) break;
      for (const dd of days) push(addDays(ws, dd));
    }
  } else if (r.freq === 'monthly') {
    const s = parseDate(start);
    const dom = s.getUTCDate();
    let y = s.getUTCFullYear(), m = s.getUTCMonth();
    if (from > start) {
      const f = parseDate(from);
      const months = (f.getUTCFullYear() - y) * 12 + f.getUTCMonth() - m;
      const k = Math.max(0, Math.floor(months / interval) * interval);
      m += k; y += Math.floor(m / 12); m %= 12;
    }
    for (let i = 0; i < MAX_OCCURRENCES; i++) {
      if (dom <= daysInMonth(y, m)) {
        const d = fmtDate(new Date(Date.UTC(y, m, dom, 12)));
        if (d > until) break;
        push(d);
      } else if (fmtDate(new Date(Date.UTC(y, m, 1, 12))) > until) break;
      m += interval; y += Math.floor(m / 12); m %= 12;
    }
  } else if (r.freq === 'yearly') {
    const s = parseDate(start);
    const mo = s.getUTCMonth(), dom = s.getUTCDate();
    let y = s.getUTCFullYear();
    if (from > start) {
      const fy = parseDate(from).getUTCFullYear() - 1;
      if (fy > y) y += Math.floor((fy - y) / interval) * interval;
    }
    for (let i = 0; i < MAX_OCCURRENCES; i++, y += interval) {
      const day = Math.min(dom, daysInMonth(y, mo)); // Feb 29 -> Feb 28 in non-leap years
      const d = fmtDate(new Date(Date.UTC(y, mo, day, 12)));
      if (d > until) break;
      push(d);
    }
  }
  return out;
}

// Expand a list of events into instances {ev, date} within [from, to], sorted.
export function expand(events, from, to) {
  const list = [];
  for (const ev of events) {
    for (const d of occurrences(ev, from, to)) list.push({ ev, date: d, key: ev.id + '@' + d });
  }
  list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : sortKey(a.ev) - sortKey(b.ev)));
  return list;
}

function sortKey(ev) {
  if (ev.allDay || !ev.start) return -1;
  const [h, m] = ev.start.split(':').map(Number);
  return h * 60 + m;
}

export function describeRepeat(r) {
  if (!r || !r.freq || r.freq === 'none') return 'Does not repeat';
  const every = (n, unit) => (n > 1 ? `Every ${n} ${unit}s` : `Every ${unit}`);
  const n = Number(r.interval) || 1;
  let s;
  if (r.freq === 'daily') s = every(n, 'day');
  else if (r.freq === 'weekly') {
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const days = (r.days || []).slice().sort().map((d) => names[d]).join(', ');
    s = every(n, 'week') + (days ? ` on ${days}` : '');
  } else if (r.freq === 'monthly') s = every(n, 'month');
  else s = every(n, 'year');
  if (r.until) s += ` until ${r.until}`;
  return s;
}
