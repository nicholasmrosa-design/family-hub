// Minimal Firestore REST client using a Google service account (no npm packages needed).
import { b64u } from './b64.js';

let cached = null;

function pemToDer(pem) {
  const b = atob(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''));
  return Uint8Array.from(b, (c) => c.charCodeAt(0)).buffer;
}

export function serviceAccount(env) {
  if (!env.FIREBASE_SERVICE_ACCOUNT) throw new Error('FIREBASE_SERVICE_ACCOUNT secret is not set');
  return JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
}

async function accessToken(env) {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const sa = serviceAccount(env);
  const now = Math.floor(Date.now() / 1000);
  const enc = new TextEncoder();
  const head = b64u(enc.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const body = b64u(enc.encode(JSON.stringify({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  })));
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(sa.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(`${head}.${body}`));
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${head}.${body}.${b64u(new Uint8Array(sig))}`,
  });
  if (!res.ok) throw new Error('Google auth failed: ' + (await res.text()));
  const j = await res.json();
  cached = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return cached.token;
}

function decodeValue(v) {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return Date.parse(v.timestampValue);
  if ('mapValue' in v) return decodeFields(v.mapValue.fields || {});
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decodeValue);
  return null;
}
function decodeFields(f) {
  const o = {};
  for (const k in f) o[k] = decodeValue(f[k]);
  return o;
}
function encodeValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encodeValue) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encodeValue(x)])) } };
}
const docId = (name) => name.split('/').pop();

export function firestore(env) {
  const sa = serviceAccount(env);
  const base = `https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/(default)/documents`;
  const call = async (method, path, body) => {
    const res = await fetch(`${base}/${path}`, {
      method,
      headers: { authorization: `Bearer ${await accessToken(env)}`, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Firestore ${method} ${path} failed: ${res.status} ${await res.text()}`);
    return res.json();
  };
  return {
    async get(path) {
      const d = await call('GET', path);
      return d ? { id: docId(d.name), ...decodeFields(d.fields || {}) } : null;
    },
    async list(path) {
      const out = [];
      let token = '';
      for (let i = 0; i < 50; i++) {
        const d = await call('GET', `${path}?pageSize=300${token ? '&pageToken=' + encodeURIComponent(token) : ''}`);
        if (!d) break;
        for (const doc of d.documents || []) out.push({ id: docId(doc.name), ...decodeFields(doc.fields || {}) });
        if (!d.nextPageToken) break;
        token = d.nextPageToken;
      }
      return out;
    },
    async patch(path, obj) {
      const mask = Object.keys(obj).map((k) => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&');
      return call('PATCH', `${path}?${mask}`, { fields: Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, encodeValue(v)])) });
    },
    async remove(path) {
      return call('DELETE', path);
    },
  };
}

export { decodeFields, encodeValue };
