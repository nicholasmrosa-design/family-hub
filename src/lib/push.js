import { sha256Hex } from '../data/hash.js';

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}
export function isStandalone() {
  return !!(navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches));
}
export function isIOS() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function b64urlToBytes(s) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const b = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

export async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

export async function enablePush({ vapidPublicKey, store, fid, memberId }) {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notifications were not allowed. You can turn them on in iPhone Settings › Notifications › Family Hub.');
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64urlToBytes(vapidPublicKey) });
  const j = sub.toJSON();
  const id = (await sha256Hex(j.endpoint)).slice(0, 32);
  await store.set(fid, 'push', id, { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, memberId, uid: store.uid(), createdAt: Date.now() });
  return sub;
}

export async function disablePush({ store, fid }) {
  const sub = await currentSubscription();
  if (!sub) return;
  const id = (await sha256Hex(sub.endpoint)).slice(0, 32);
  try { await store.remove(fid, 'push', id); } catch {}
  await sub.unsubscribe();
}

export async function sendTest(workerUrl) {
  const sub = await currentSubscription();
  if (!sub) throw new Error('Reminders are not turned on for this phone yet.');
  const j = sub.toJSON();
  const r = await fetch(workerUrl.replace(/\/$/, '') + '/test', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }),
  });
  if (!r.ok) throw new Error('Test failed: ' + (await r.text()));
}
