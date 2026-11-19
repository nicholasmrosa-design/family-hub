export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function normalizePasscode(p) {
  return String(p || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

// The family id is derived from the passcode, so knowing the passcode is what grants access.
export async function familyIdFor(passcode) {
  return (await sha256Hex('familyhub|' + normalizePasscode(passcode))).slice(0, 40);
}

export async function pinHashFor(fid, pin) {
  return sha256Hex(fid + '|pin|' + String(pin).trim());
}

export function randomId(len = 20) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const b = crypto.getRandomValues(new Uint8Array(len));
  return [...b].map((x) => chars[x % chars.length]).join('');
}
