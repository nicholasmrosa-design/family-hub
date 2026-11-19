import { addDays, localToUtc, toMinutes, pad } from '../../src/lib/dates.js';
import { CAT } from '../../src/lib/constants.js';

const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

function esc(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

// Fold lines to 75 octets as required by RFC 5545 (UTF-8 aware).
function fold(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out = [];
  let cur = '', len = 0, limit = 75;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (len + n > limit) { out.push(cur); cur = ' '; len = 1; limit = 75; }
    cur += ch; len += n;
  }
  out.push(cur);
  return out.join('\r\n');
}

const ymd = (d) => d.replace(/-/g, '');
const local = (d, t) => `${ymd(d)}T${t.replace(':', '')}00`;
function utcStamp(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

const US_ZONES = {
  'America/Los_Angeles': ['PST', '-0800', 'PDT', '-0700'],
  'America/Denver': ['MST', '-0700', 'MDT', '-0600'],
  'America/Chicago': ['CST', '-0600', 'CDT', '-0500'],
  'America/New_York': ['EST', '-0500', 'EDT', '-0400'],
};
function vtimezone(tz) {
  if (tz === 'America/Phoenix') {
    return ['BEGIN:VTIMEZONE', `TZID:${tz}`, 'BEGIN:STANDARD', 'DTSTART:19700101T000000', 'TZOFFSETFROM:-0700', 'TZOFFSETTO:-0700', 'TZNAME:MST', 'END:STANDARD', 'END:VTIMEZONE'];
  }
  const z = US_ZONES[tz];
  if (!z) return [];
  const [sn, so, dn, dof] = z;
  return [
    'BEGIN:VTIMEZONE', `TZID:${tz}`,
    'BEGIN:DAYLIGHT', 'DTSTART:20070311T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU', `TZOFFSETFROM:${so}`, `TZOFFSETTO:${dof}`, `TZNAME:${dn}`, 'END:DAYLIGHT',
    'BEGIN:STANDARD', 'DTSTART:20071104T020000', 'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU', `TZOFFSETFROM:${dof}`, `TZOFFSETTO:${so}`, `TZNAME:${sn}`, 'END:STANDARD',
    'END:VTIMEZONE',
  ];
}

export function involves(ev, memberId) {
  return !ev.memberIds || ev.memberIds.length === 0 || ev.memberIds.includes(memberId) || ev.driverTo === memberId || ev.driverFrom === memberId;
}

export function buildIcs({ family, events, memberId, checkins = [] }) {
  const moved = {};
  for (const c of checkins) if (c.state === 'moved') (moved[c.eventId] ||= []).push(c.date);
  const tz = family.tz || 'America/Los_Angeles';
  const members = family.members || [];
  const name = (id) => (members.find((m) => m.id === id) || {}).name;
  const who = memberId && members.find((m) => m.id === memberId);
  const calName = who ? `Family Hub · ${who.name}` : `Family Hub${family.name ? ' · ' + family.name : ''}`;
  const now = utcStamp(Date.now());

  const L = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Family Hub//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(calName)}`, `X-WR-TIMEZONE:${tz}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT15M', 'X-PUBLISHED-TTL:PT15M',
    ...vtimezone(tz),
  ];

  for (const ev of events) {
    if (memberId && !involves(ev, memberId)) continue;
    if (!ev.date || !ev.title) continue;
    const recurs = ev.repeat && ev.repeat.freq && ev.repeat.freq !== 'none';
    if (!recurs && moved[ev.id]) continue; // shown at its new time instead
    const cat = CAT[ev.category] || CAT.other;
    const people = (ev.memberIds || []).map(name).filter(Boolean);
    const allDay = ev.allDay || !ev.start;
    const summary = `${cat.emoji} ${ev.title}${people.length && people.length < members.length && ev.category !== 'birthday' ? ' (' + people.join(', ') + ')' : ''}`;

    const desc = [];
    if (people.length) desc.push(`Who: ${people.join(', ')}`);
    if (ev.driverTo) desc.push(`Drop-off: ${name(ev.driverTo)}`);
    if (ev.driverFrom) desc.push(`Pick-up: ${name(ev.driverFrom)}`);
    if (ev.bring) desc.push(`Bring: ${ev.bring}`);
    if (ev.notes) desc.push('', ev.notes);

    L.push('BEGIN:VEVENT', `UID:${ev.id}@familyhub`, `DTSTAMP:${ev.updatedAt || ev.createdAt ? utcStamp(ev.updatedAt || ev.createdAt) : now}`);
    if (allDay) {
      L.push(`DTSTART;VALUE=DATE:${ymd(ev.date)}`, `DTEND;VALUE=DATE:${ymd(addDays(ev.date, 1))}`);
    } else {
      let end = ev.end;
      if (!end || toMinutes(end) <= toMinutes(ev.start)) {
        const m = Math.min(toMinutes(ev.start) + 60, 23 * 60 + 59);
        end = `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
      }
      L.push(`DTSTART;TZID=${tz}:${local(ev.date, ev.start)}`, `DTEND;TZID=${tz}:${local(ev.date, end)}`);
    }

    const r = ev.repeat || {};
    if (r.freq && r.freq !== 'none') {
      const parts = [`FREQ=${r.freq.toUpperCase()}`];
      if ((r.interval || 1) > 1) parts.push(`INTERVAL=${r.interval}`);
      if (r.freq === 'weekly' && r.days && r.days.length) parts.push(`BYDAY=${r.days.slice().sort().map((d) => DAY_CODES[d]).join(',')}`);
      if (r.until) parts.push(`UNTIL=${allDay ? ymd(r.until) : utcStamp(localToUtc(r.until, '23:59', tz))}`);
      L.push(`RRULE:${parts.join(';')}`);
      for (const x of [...(ev.exceptions || []), ...(moved[ev.id] || [])]) {
        L.push(allDay ? `EXDATE;VALUE=DATE:${ymd(x)}` : `EXDATE;TZID=${tz}:${local(x, ev.start)}`);
      }
    }
    L.push(`SUMMARY:${esc(summary)}`);
    if (ev.location) L.push(`LOCATION:${esc(ev.location)}`);
    if (desc.length) L.push(`DESCRIPTION:${esc(desc.join('\n'))}`);
    L.push(`CATEGORIES:${esc(cat.label)}`, 'END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.map(fold).join('\r\n') + '\r\n';
}
