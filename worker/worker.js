// Family Hub worker: Apple Calendar feed + reminder notifications. Paste this whole file into your Cloudflare worker.

// worker/src/b64.js
function b64u(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64u(str) {
  const pad2 = "=".repeat((4 - str.length % 4) % 4);
  const b = atob((str + pad2).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}
function concat(...arrs) {
  const len = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const a of arrs) {
    out.set(a, o);
    o += a.length;
  }
  return out;
}

// worker/src/google.js
var cached = null;
function pemToDer(pem) {
  const b = atob(pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, ""));
  return Uint8Array.from(b, (c) => c.charCodeAt(0)).buffer;
}
function serviceAccount(env) {
  if (!env.FIREBASE_SERVICE_ACCOUNT) throw new Error("FIREBASE_SERVICE_ACCOUNT secret is not set");
  return JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
}
async function accessToken(env) {
  if (cached && cached.exp > Date.now() + 6e4) return cached.token;
  const sa = serviceAccount(env);
  const now = Math.floor(Date.now() / 1e3);
  const enc2 = new TextEncoder();
  const head = b64u(enc2.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const body = b64u(enc2.encode(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  })));
  const key = await crypto.subtle.importKey("pkcs8", pemToDer(sa.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc2.encode(`${head}.${body}`));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${head}.${body}.${b64u(new Uint8Array(sig))}`
  });
  if (!res.ok) throw new Error("Google auth failed: " + await res.text());
  const j = await res.json();
  cached = { token: j.access_token, exp: Date.now() + j.expires_in * 1e3 };
  return cached.token;
}
function decodeValue(v) {
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return Date.parse(v.timestampValue);
  if ("mapValue" in v) return decodeFields(v.mapValue.fields || {});
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(decodeValue);
  return null;
}
function decodeFields(f) {
  const o = {};
  for (const k in f) o[k] = decodeValue(f[k]);
  return o;
}
function encodeValue(v) {
  if (v === null || v === void 0) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encodeValue) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encodeValue(x)])) } };
}
var docId = (name) => name.split("/").pop();
function firestore(env) {
  const sa = serviceAccount(env);
  const base = `https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/(default)/documents`;
  const call = async (method, path, body) => {
    const res = await fetch(`${base}/${path}`, {
      method,
      headers: { authorization: `Bearer ${await accessToken(env)}`, "content-type": "application/json" },
      body: body ? JSON.stringify(body) : void 0
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Firestore ${method} ${path} failed: ${res.status} ${await res.text()}`);
    return res.json();
  };
  return {
    async get(path) {
      const d = await call("GET", path);
      return d ? { id: docId(d.name), ...decodeFields(d.fields || {}) } : null;
    },
    async list(path) {
      const out = [];
      let token = "";
      for (let i = 0; i < 50; i++) {
        const d = await call("GET", `${path}?pageSize=300${token ? "&pageToken=" + encodeURIComponent(token) : ""}`);
        if (!d) break;
        for (const doc of d.documents || []) out.push({ id: docId(doc.name), ...decodeFields(doc.fields || {}) });
        if (!d.nextPageToken) break;
        token = d.nextPageToken;
      }
      return out;
    },
    async patch(path, obj) {
      const mask = Object.keys(obj).map((k) => "updateMask.fieldPaths=" + encodeURIComponent(k)).join("&");
      return call("PATCH", `${path}?${mask}`, { fields: Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, encodeValue(v)])) });
    },
    async remove(path) {
      return call("DELETE", path);
    }
  };
}

// src/lib/dates.js
var pad = (n) => String(n).padStart(2, "0");
function parseDate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}
function fmtDate(dt) {
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}
function addDays(s, n) {
  const d = parseDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return fmtDate(d);
}
function daysInMonth(y, m0) {
  return new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
}
function weekday(s) {
  return parseDate(s).getUTCDay();
}
function diffDays(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / 864e5);
}
function startOfWeek(s) {
  return addDays(s, -weekday(s));
}
function partsIn(date, tz) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`, seconds: Number(p.second) };
}
function tzOffset(ms, tz) {
  const p = partsIn(new Date(ms), tz);
  const [y, m, d] = p.date.split("-").map(Number);
  const [hh, mm] = p.time.split(":").map(Number);
  const asUtc = Date.UTC(y, m - 1, d, hh, mm, p.seconds);
  return asUtc - Math.floor(ms / 1e3) * 1e3;
}
function localToUtc(dateStr, timeStr, tz) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = (timeStr || "00:00").split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let off = tzOffset(guess, tz);
  let ts = guess - off;
  const off2 = tzOffset(ts, tz);
  if (off2 !== off) ts = guess - off2;
  return ts;
}
function toMinutes(t) {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function fmtTime(t) {
  if (!t) return "";
  let [h, m] = t.split(":").map(Number);
  const ap = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return m ? `${h}:${pad(m)}${ap}` : `${h}${ap}`;
}

// src/lib/constants.js
var CATEGORIES = [
  { id: "practice", label: "Practice", emoji: "\u26BD", kind: "event" },
  { id: "game", label: "Game", emoji: "\u{1F3C6}", kind: "event" },
  { id: "appointment", label: "Appointment", emoji: "\u{1FA7A}", kind: "event" },
  { id: "school", label: "School", emoji: "\u{1F3EB}", kind: "event" },
  { id: "birthday", label: "Birthday", emoji: "\u{1F382}", kind: "event" },
  { id: "other", label: "Other", emoji: "\u{1F4CC}", kind: "event" },
  { id: "workout", label: "Workout", emoji: "\u{1F4AA}", kind: "plan" },
  { id: "work", label: "Work time", emoji: "\u{1F4BC}", kind: "plan" },
  { id: "family", label: "Family time", emoji: "\u2764\uFE0F", kind: "plan" },
  { id: "personal", label: "Me time", emoji: "\u{1F4DA}", kind: "plan" }
];
var CAT = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
var REMINDER_OPTIONS = [
  { min: 0, label: "At start" },
  { min: 15, label: "15 min before" },
  { min: 30, label: "30 min before" },
  { min: 60, label: "1 hour before" },
  { min: 120, label: "2 hours before" },
  { min: 1440, label: "1 day before" },
  { min: 2880, label: "2 days before" },
  { min: 10080, label: "1 week before" }
];
var REMINDER_LABEL = Object.fromEntries(REMINDER_OPTIONS.map((r) => [r.min, r.label]));
var ALL_DAY_REMINDER_TIME = "08:00";

// worker/src/ics.js
var DAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
function esc(s) {
  return String(s || "").replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}
function fold(line) {
  const enc2 = new TextEncoder();
  if (enc2.encode(line).length <= 75) return line;
  const out = [];
  let cur = "", len = 0, limit = 75;
  for (const ch of line) {
    const n = enc2.encode(ch).length;
    if (len + n > limit) {
      out.push(cur);
      cur = " ";
      len = 1;
      limit = 75;
    }
    cur += ch;
    len += n;
  }
  out.push(cur);
  return out.join("\r\n");
}
var ymd = (d) => d.replace(/-/g, "");
var local = (d, t) => `${ymd(d)}T${t.replace(":", "")}00`;
function utcStamp(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}
var US_ZONES = {
  "America/Los_Angeles": ["PST", "-0800", "PDT", "-0700"],
  "America/Denver": ["MST", "-0700", "MDT", "-0600"],
  "America/Chicago": ["CST", "-0600", "CDT", "-0500"],
  "America/New_York": ["EST", "-0500", "EDT", "-0400"]
};
function vtimezone(tz) {
  if (tz === "America/Phoenix") {
    return ["BEGIN:VTIMEZONE", `TZID:${tz}`, "BEGIN:STANDARD", "DTSTART:19700101T000000", "TZOFFSETFROM:-0700", "TZOFFSETTO:-0700", "TZNAME:MST", "END:STANDARD", "END:VTIMEZONE"];
  }
  const z = US_ZONES[tz];
  if (!z) return [];
  const [sn, so, dn, dof] = z;
  return [
    "BEGIN:VTIMEZONE",
    `TZID:${tz}`,
    "BEGIN:DAYLIGHT",
    "DTSTART:20070311T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
    `TZOFFSETFROM:${so}`,
    `TZOFFSETTO:${dof}`,
    `TZNAME:${dn}`,
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "DTSTART:20071104T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
    `TZOFFSETFROM:${dof}`,
    `TZOFFSETTO:${so}`,
    `TZNAME:${sn}`,
    "END:STANDARD",
    "END:VTIMEZONE"
  ];
}
function involves(ev, memberId) {
  return !ev.memberIds || ev.memberIds.length === 0 || ev.memberIds.includes(memberId) || ev.driverTo === memberId || ev.driverFrom === memberId;
}
function buildIcs({ family, events, memberId, checkins = [] }) {
  const moved = {};
  for (const c of checkins) if (c.state === "moved") (moved[c.eventId] ||= []).push(c.date);
  const tz = family.tz || "America/Los_Angeles";
  const members = family.members || [];
  const name = (id) => (members.find((m) => m.id === id) || {}).name;
  const who = memberId && members.find((m) => m.id === memberId);
  const calName = who ? `Family Hub \xB7 ${who.name}` : `Family Hub${family.name ? " \xB7 " + family.name : ""}`;
  const now = utcStamp(Date.now());
  const L = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Family Hub//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(calName)}`,
    `X-WR-TIMEZONE:${tz}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT15M",
    "X-PUBLISHED-TTL:PT15M",
    ...vtimezone(tz)
  ];
  for (const ev of events) {
    if (memberId && !involves(ev, memberId)) continue;
    if (!ev.date || !ev.title) continue;
    const recurs = ev.repeat && ev.repeat.freq && ev.repeat.freq !== "none";
    if (!recurs && moved[ev.id]) continue;
    const cat = CAT[ev.category] || CAT.other;
    const people = (ev.memberIds || []).map(name).filter(Boolean);
    const allDay = ev.allDay || !ev.start;
    const summary = `${cat.emoji} ${ev.title}${people.length && people.length < members.length && ev.category !== "birthday" ? " (" + people.join(", ") + ")" : ""}`;
    const desc = [];
    if (people.length) desc.push(`Who: ${people.join(", ")}`);
    if (ev.driverTo) desc.push(`Drop-off: ${name(ev.driverTo)}`);
    if (ev.driverFrom) desc.push(`Pick-up: ${name(ev.driverFrom)}`);
    if (ev.bring) desc.push(`Bring: ${ev.bring}`);
    if (ev.notes) desc.push("", ev.notes);
    L.push("BEGIN:VEVENT", `UID:${ev.id}@familyhub`, `DTSTAMP:${ev.updatedAt || ev.createdAt ? utcStamp(ev.updatedAt || ev.createdAt) : now}`);
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
    if (r.freq && r.freq !== "none") {
      const parts = [`FREQ=${r.freq.toUpperCase()}`];
      if ((r.interval || 1) > 1) parts.push(`INTERVAL=${r.interval}`);
      if (r.freq === "weekly" && r.days && r.days.length) parts.push(`BYDAY=${r.days.slice().sort().map((d) => DAY_CODES[d]).join(",")}`);
      if (r.until) parts.push(`UNTIL=${allDay ? ymd(r.until) : utcStamp(localToUtc(r.until, "23:59", tz))}`);
      L.push(`RRULE:${parts.join(";")}`);
      for (const x of [...ev.exceptions || [], ...moved[ev.id] || []]) {
        L.push(allDay ? `EXDATE;VALUE=DATE:${ymd(x)}` : `EXDATE;TZID=${tz}:${local(x, ev.start)}`);
      }
    }
    L.push(`SUMMARY:${esc(summary)}`);
    if (ev.location) L.push(`LOCATION:${esc(ev.location)}`);
    if (desc.length) L.push(`DESCRIPTION:${esc(desc.join("\n"))}`);
    L.push(`CATEGORIES:${esc(cat.label)}`, "END:VEVENT");
  }
  L.push("END:VCALENDAR");
  return L.map(fold).join("\r\n") + "\r\n";
}

// worker/src/webpush.js
var enc = new TextEncoder();
async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8));
}
async function encryptPayload(p256dhB64, authB64, plaintext, opts = {}) {
  const uaPublic = unb64u(p256dhB64);
  const authSecret = unb64u(authB64);
  const as = opts.asKeyPair || await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", as.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, as.privateKey, 256));
  const keyInfo = concat(enc.encode("WebPush: info\0"), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, shared, keyInfo, 32);
  const salt = opts.salt || crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const data = concat(typeof plaintext === "string" ? enc.encode(plaintext) : plaintext, new Uint8Array([2]));
  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aes, data));
  const header = new Uint8Array(16 + 4 + 1 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, ct);
}
async function vapidHeader(endpoint, env) {
  const aud = new URL(endpoint).origin;
  const jwk = JSON.parse(env.VAPID_PRIVATE_JWK);
  const key = await crypto.subtle.importKey("jwk", { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const head = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64u(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1e3) + 12 * 3600, sub: env.VAPID_SUBJECT || "mailto:family@example.com" })));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${head}.${claims}`)));
  return `vapid t=${head}.${claims}.${b64u(sig)}, k=${env.VAPID_PUBLIC_KEY}`;
}
var ALLOWED_HOSTS = /(^|\.)(push\.apple\.com|fcm\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com)$/;
function isPushEndpoint(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && ALLOWED_HOSTS.test(u.hostname);
  } catch {
    return false;
  }
}
async function sendPush(env, sub, message) {
  if (!isPushEndpoint(sub.endpoint)) return { ok: false, status: 0, gone: true };
  const body = await encryptPayload(sub.p256dh, sub.auth, JSON.stringify(message));
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      authorization: await vapidHeader(sub.endpoint, env),
      "content-encoding": "aes128gcm",
      "content-type": "application/octet-stream",
      ttl: "86400",
      urgency: "high",
      ...message.tag ? { topic: message.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) } : {}
    },
    body
  });
  return { ok: res.ok, status: res.status, gone: res.status === 404 || res.status === 410, text: res.ok ? "" : await res.text() };
}
async function generateVapidKeys() {
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
  const pub = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
  return { publicKey: b64u(pub), privateJwk: JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d }) };
}

// src/lib/recur.js
var MAX_OCCURRENCES = 2e3;
function occurrences(ev, from, to) {
  const r = ev.repeat || { freq: "none" };
  const start = ev.date;
  const ex = new Set(ev.exceptions || []);
  const until = r.until && r.until < to ? r.until : to;
  const out = [];
  const push = (d) => {
    if (d >= from && d <= until && d >= start && !ex.has(d)) out.push(d);
  };
  const interval = Math.max(1, Number(r.interval) || 1);
  if (!r.freq || r.freq === "none") {
    push(start);
    return out;
  }
  if (start > until) return out;
  if (r.freq === "daily") {
    let k = from > start ? Math.ceil(diffDays(start, from) / interval) : 0;
    for (let i = 0; i < MAX_OCCURRENCES; i++, k++) {
      const d = addDays(start, k * interval);
      if (d > until) break;
      push(d);
    }
  } else if (r.freq === "weekly") {
    const days = (r.days && r.days.length ? r.days : [weekday(start)]).slice().sort();
    const week0 = startOfWeek(start);
    let w = from > start ? Math.floor(diffDays(week0, startOfWeek(from)) / 7) : 0;
    w = Math.floor(w / interval) * interval;
    for (let i = 0; i < MAX_OCCURRENCES; i++, w += interval) {
      const ws = addDays(week0, w * 7);
      if (ws > until) break;
      for (const dd of days) push(addDays(ws, dd));
    }
  } else if (r.freq === "monthly") {
    const s = parseDate(start);
    const dom = s.getUTCDate();
    let y = s.getUTCFullYear(), m = s.getUTCMonth();
    if (from > start) {
      const f = parseDate(from);
      const months = (f.getUTCFullYear() - y) * 12 + f.getUTCMonth() - m;
      const k = Math.max(0, Math.floor(months / interval) * interval);
      m += k;
      y += Math.floor(m / 12);
      m %= 12;
    }
    for (let i = 0; i < MAX_OCCURRENCES; i++) {
      if (dom <= daysInMonth(y, m)) {
        const d = fmtDate(new Date(Date.UTC(y, m, dom, 12)));
        if (d > until) break;
        push(d);
      } else if (fmtDate(new Date(Date.UTC(y, m, 1, 12))) > until) break;
      m += interval;
      y += Math.floor(m / 12);
      m %= 12;
    }
  } else if (r.freq === "yearly") {
    const s = parseDate(start);
    const mo = s.getUTCMonth(), dom = s.getUTCDate();
    let y = s.getUTCFullYear();
    if (from > start) {
      const fy = parseDate(from).getUTCFullYear() - 1;
      if (fy > y) y += Math.floor((fy - y) / interval) * interval;
    }
    for (let i = 0; i < MAX_OCCURRENCES; i++, y += interval) {
      const day = Math.min(dom, daysInMonth(y, mo));
      const d = fmtDate(new Date(Date.UTC(y, mo, day, 12)));
      if (d > until) break;
      push(d);
    }
  }
  return out;
}

// src/lib/routines.js
function isFlex(r) {
  return r.freq === "weekly" && !(r.days && r.days.length) || r.freq === "monthly" && !r.monthDay;
}
function asEvent(r) {
  const start = r.startDate || "2024-01-01";
  if (r.freq === "daily") return { date: start, repeat: { freq: "daily", interval: 1 } };
  if (r.freq === "weekly") return { date: start, repeat: { freq: "weekly", interval: 1, days: r.days } };
  const s = parseDate(start);
  let y = s.getUTCFullYear(), m = s.getUTCMonth();
  if (s.getUTCDate() > Math.min(r.monthDay, daysInMonth(y, m))) {
    m++;
    if (m > 11) {
      m = 0;
      y++;
    }
  }
  return { date: `${y}-${pad(m + 1)}-${pad(Math.min(r.monthDay, daysInMonth(y, m)))}`, repeat: { freq: "monthly", interval: 1 } };
}
var monthEnd = (d) => {
  const p = parseDate(d);
  return fmtDate(new Date(Date.UTC(p.getUTCFullYear(), p.getUTCMonth(), daysInMonth(p.getUTCFullYear(), p.getUTCMonth()), 12)));
};
function routineSlots(r, from, to) {
  if (r.paused) return [];
  const start = r.startDate || "2024-01-01";
  if (!isFlex(r)) {
    if (r.freq === "monthly") {
      const out2 = [];
      const s = parseDate(from > start ? from : start);
      let y = s.getUTCFullYear(), m = s.getUTCMonth();
      for (let i = 0; i < 40; i++) {
        const d = `${y}-${pad(m + 1)}-${pad(Math.min(r.monthDay, daysInMonth(y, m)))}`;
        if (d > to) break;
        if (d >= from && d >= start) out2.push({ key: d, date: d, flex: false });
        m++;
        if (m > 11) {
          m = 0;
          y++;
        }
      }
      return out2;
    }
    return occurrences(asEvent(r), from, to).map((d) => ({ key: d, date: d, flex: false }));
  }
  const out = [];
  if (r.freq === "weekly") {
    for (let ws = startOfWeek(from); ws <= to; ws = addDays(ws, 7)) {
      if (addDays(ws, 6) < start) continue;
      out.push({ key: "W" + ws, start: ws, date: addDays(ws, 6), flex: true });
    }
  } else {
    let d = from.slice(0, 8) + "01";
    for (let i = 0; i < 40 && d <= to; i++) {
      if (monthEnd(d) >= start) out.push({ key: "M" + d.slice(0, 7), start: d, date: monthEnd(d), flex: true });
      d = addDays(monthEnd(d), 1);
    }
  }
  return out;
}
function slotAssignees(r, slot) {
  const a = r.assignees || [];
  if (!r.rotate || a.length < 2) return a;
  const start = r.startDate || "2024-01-01";
  let n;
  if (slot.flex) {
    n = r.freq === "weekly" ? Math.round(diffDays(startOfWeek(start), slot.start) / 7) : (Number(slot.start.slice(0, 4)) - Number(start.slice(0, 4))) * 12 + Number(slot.start.slice(5, 7)) - Number(start.slice(5, 7));
  } else {
    n = routineSlots(r, start, slot.date).length - 1;
  }
  return [a[(n % a.length + a.length) % a.length]];
}
var doneId = (r, slot) => `${r.id}_${slot.key}`;
function slotFromKey(key) {
  if (key[0] === "W") return { key, start: key.slice(1), date: addDays(key.slice(1), 6), flex: true };
  if (key[0] === "M") {
    const d = key.slice(1) + "-01";
    return { key, start: d, date: monthEnd(d), flex: true };
  }
  return { key, date: key, flex: false };
}

// worker/src/reminders.js
function dueReminders({ family, events, fromMs, toMs, checkins = [] }) {
  const skip = new Set(checkins.map((c) => `${c.eventId}@${c.date}`));
  const tz = family.tz || "America/Los_Angeles";
  const startDate = addDays(partsIn(new Date(fromMs), tz).date, -1);
  const endDate = addDays(partsIn(new Date(toMs), tz).date, 8);
  const out = [];
  for (const ev of events) {
    const rems = (ev.reminders || []).map(Number).filter((n) => n >= 0);
    if (!rems.length || !ev.date) continue;
    for (const date of occurrences(ev, startDate, endDate)) {
      if (skip.has(`${ev.id}@${date}`)) continue;
      const allDay = ev.allDay || !ev.start;
      const startMs = localToUtc(date, allDay ? ALL_DAY_REMINDER_TIME : ev.start, tz);
      for (const r of rems) {
        const fire = startMs - r * 6e4;
        if (fire > fromMs && fire <= toMs) out.push({ ev, date, minutes: r, fireMs: fire });
      }
    }
  }
  return out;
}
function messageFor({ ev, date, minutes }, family, todayStr) {
  const members = family.members || [];
  const name = (id) => (members.find((m) => m.id === id) || {}).name;
  const cat = CAT[ev.category] || CAT.other;
  const allDay = ev.allDay || !ev.start;
  const days = diffDays(todayStr, date);
  const when = days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
  let body;
  if (ev.category === "birthday") body = days === 0 ? "Today! Don\u2019t forget to wish them happy birthday \u{1F389}" : `Coming up ${when}`;
  else if (allDay) body = `All day ${when}`;
  else if (minutes === 0) body = `Starting now \xB7 ${fmtTime(ev.start)}`;
  else if (minutes < 1440) body = `Starts in ${minutes < 60 ? minutes + " min" : minutes / 60 + (minutes === 60 ? " hour" : " hours")} \xB7 ${fmtTime(ev.start)}`;
  else body = `${when[0].toUpperCase() + when.slice(1)} at ${fmtTime(ev.start)}`;
  const extra = [];
  const people = (ev.memberIds || []).map(name).filter(Boolean);
  if (people.length && people.length < members.length) extra.push(people.join(", "));
  if (ev.driverTo || ev.driverFrom) {
    const to = name(ev.driverTo), from = name(ev.driverFrom);
    extra.push(to && from && to === from ? `\u{1F697} ${to} driving` : [to && `\u{1F697} ${to} drops off`, from && `${from} picks up`].filter(Boolean).join(", "));
  }
  if (ev.location) extra.push(`\u{1F4CD} ${ev.location}`);
  if (ev.bring) extra.push(`\u{1F392} ${ev.bring}`);
  return {
    title: `${cat.emoji} ${ev.title}`,
    body: [body, ...extra].join("\n"),
    tag: `${ev.id}-${date}-${minutes}`
  };
}
function targetsFor(ev, subs) {
  const involved = new Set([...ev.memberIds || [], ev.driverTo, ev.driverFrom].filter(Boolean));
  if (ev.remindAll || !(ev.memberIds || []).length) return subs;
  return subs.filter((s) => involved.has(s.memberId));
}
function dueChoreReminders({ family, routines, done = [], fromMs, toMs }) {
  const tz = family.tz || "America/Los_Angeles";
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
  const byId = Object.fromEntries(routines.map((r) => [r.id, r]));
  for (const d of done) {
    const r = byId[d.routineId];
    if (!r || !r.remind || r.paused || d.state !== "moved" || !d.movedTo) continue;
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
function choreMessage({ r, slot, who }, family) {
  const names = who.map((id) => ((family.members || []).find((m) => m.id === id) || {}).name).filter(Boolean);
  return {
    title: `\u{1F9F9} ${r.title}`,
    body: `${names.length === 1 && r.rotate ? names[0] + "\u2019s turn \xB7 " : names.length ? names.join(", ") + " \xB7 " : ""}${fmtTime(r.time)}. Tap to check it off when it\u2019s done.`,
    tag: `chore-${r.id}-${slot.key}`
  };
}

// worker/src/index.js
var cors = { "access-control-allow-origin": "*", "access-control-allow-methods": "POST, GET, OPTIONS", "access-control-allow-headers": "content-type" };
var html = (body) => new Response(`<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><title>Family Hub worker</title><body style="font:16px/1.5 -apple-system,system-ui,sans-serif;max-width:720px;margin:30px auto;padding:0 16px">${body}</body>`, { headers: { "content-type": "text/html; charset=utf-8" } });
var escHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
var index_default = {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    try {
      if (url.pathname === "/" || url.pathname === "/setup") return setupPage(env, url.origin);
      const ics = url.pathname.match(/^\/ics\/([A-Za-z0-9]{16,64})(\.ics)?$/);
      if (ics && req.method === "GET") {
        const db = firestore(env);
        const feed = await db.get(`feeds/${ics[1]}`);
        if (!feed) return new Response("Calendar link not found. Make a new one in Family Hub \u203A More.", { status: 404 });
        const family = await db.get(`families/${feed.fid}`);
        if (!family || family.feedToken !== ics[1]) return new Response("This calendar link was replaced. Subscribe again from Family Hub \u203A More.", { status: 410 });
        const [events, checkins] = await Promise.all([db.list(`families/${feed.fid}/events`), db.list(`families/${feed.fid}/checkins`)]);
        const body = buildIcs({ family, events, checkins, memberId: url.searchParams.get("m") || null });
        return new Response(body, { headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "max-age=300" } });
      }
      if (url.pathname === "/test" && req.method === "POST") {
        const sub = await req.json();
        if (!sub || !isPushEndpoint(sub.endpoint) || !sub.p256dh || !sub.auth) return new Response("Bad subscription", { status: 400, headers: cors });
        const r = await sendPush(env, sub, { title: "\u{1F514} Family Hub", body: "Reminders are working on this phone!", tag: "test" });
        return new Response(r.ok ? "sent" : `push service said ${r.status}: ${r.text}`, { status: r.ok ? 200 : 502, headers: cors });
      }
      return new Response("Not found", { status: 404 });
    } catch (e) {
      console.error(e);
      return new Response("Error: " + e.message, { status: 500, headers: cors });
    }
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runReminders(env));
  }
};
async function runReminders(env) {
  const db = firestore(env);
  const now = Date.now();
  const state = await db.get("system/reminders");
  let from = state && state.lastRun ? state.lastRun : now - 5 * 6e4;
  if (now - from > 60 * 6e4) from = now - 60 * 6e4;
  let sent = 0;
  const families = await db.list("families");
  for (const family of families) {
    const subs = await db.list(`families/${family.id}/push`);
    if (!subs.length) continue;
    const [events, checkins, routines, done] = await Promise.all([
      db.list(`families/${family.id}/events`),
      db.list(`families/${family.id}/checkins`),
      db.list(`families/${family.id}/routines`),
      db.list(`families/${family.id}/routineDone`)
    ]);
    const due = dueReminders({ family, events, checkins, fromMs: from, toMs: now });
    const choreDue = dueChoreReminders({ family, routines, done, fromMs: from, toMs: now });
    const today = partsIn(new Date(now), family.tz || "America/Los_Angeles").date;
    const dead = /* @__PURE__ */ new Set();
    await Promise.all(due.map(async (d) => {
      const msg = messageFor(d, family, today);
      await Promise.all(targetsFor(d.ev, subs).map(async (s) => {
        if (dead.has(s.id)) return;
        const r = await sendPush(env, s, msg).catch((e) => ({ ok: false, error: e }));
        if (r.ok) sent++;
        else if (r.gone) dead.add(s.id);
        else console.warn("push failed", r.status, r.text || r.error);
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
    for (const id of dead) await db.remove(`families/${family.id}/push/${id}`).catch(() => {
    });
  }
  await db.patch("system/reminders", { lastRun: now });
  return sent;
}
async function setupPage(env, origin) {
  const rows = [];
  let ok = true;
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_JWK) {
    ok = false;
    const k = await generateVapidKeys();
    rows.push(`<h2>1. Add these two secrets to your worker</h2>
      <p>In Cloudflare: your worker \u203A <b>Settings</b> \u203A <b>Variables and Secrets</b> \u203A <b>Add</b>, type <b>Secret</b>. These were just generated for you. Copy them now (they change each time you reload this page until saved).</p>
      <p><b>VAPID_PUBLIC_KEY</b><br><textarea rows=2 style="width:100%" readonly>${k.publicKey}</textarea></p>
      <p><b>VAPID_PRIVATE_JWK</b><br><textarea rows=3 style="width:100%" readonly>${escHtml(k.privateJwk)}</textarea></p>`);
  } else {
    rows.push(`<p>\u2705 Reminder keys are set.</p><p>Paste this into <b>config.js</b> as <code>vapidPublicKey</code>:</p><textarea rows=2 style="width:100%" readonly>${env.VAPID_PUBLIC_KEY}</textarea>`);
  }
  try {
    const sa = serviceAccount(env);
    await firestore(env).get("system/reminders");
    rows.push(`<p>\u2705 Connected to Firebase project <b>${escHtml(sa.project_id)}</b>.</p>`);
  } catch (e) {
    ok = false;
    rows.push(`<p>\u274C Firebase connection: ${escHtml(e.message)}</p><p>Add the <b>FIREBASE_SERVICE_ACCOUNT</b> secret (the whole JSON key file from Firebase \u203A Project settings \u203A Service accounts).</p>`);
  }
  if (!env.VAPID_SUBJECT) rows.push("<p>\u2139\uFE0F Optional: add a <b>VAPID_SUBJECT</b> variable like <code>mailto:you@example.com</code>.</p>");
  rows.push(`<p>Worker URL for <b>config.js</b> (<code>workerUrl</code>): <code>${escHtml(origin)}</code></p>`);
  return html(`<h1>${ok ? "\u2705" : "\u{1F6E0}\uFE0F"} Family Hub worker</h1>${rows.join("")}`);
}
export {
  index_default as default,
  runReminders
};
