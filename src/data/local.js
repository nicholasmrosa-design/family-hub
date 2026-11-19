// Demo store: same API as the Firebase store, saved in this browser only.
// Used when config.js has no Firebase settings, so the app can be tried right away.
import { familyIdFor, pinHashFor, randomId } from './hash.js';
import { seedDemo } from './seed.js';

const KEY = 'familyhub.demo.v1';

export function createLocalStore() {
  let db = load();
  const listeners = new Set();

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || { families: {} }; } catch { return { families: {} }; }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {}
    queueMicrotask(() => listeners.forEach((l) => l()));
  }
  try {
    window.addEventListener('storage', (e) => { if (e.key === KEY) { db = load(); listeners.forEach((l) => l()); } });
  } catch {}

  const F = (fid) => db.families[fid];
  const C = (fid, c) => ((F(fid).cols[c] ||= {}));
  function sub(fn) { listeners.add(fn); fn(); return () => listeners.delete(fn); }

  const ready = (async () => {
    const fid = await familyIdFor('demo');
    if (!db.families[fid]) {
      db.families[fid] = await seedDemo(fid);
      save();
    }
    return 'demo-user';
  })();

  return {
    mode: 'demo',
    ready,
    uid: () => 'demo-user',

    async findFamily(passcode) {
      await ready;
      const fid = await familyIdFor(passcode);
      return { fid, family: F(fid) ? { id: fid, ...F(fid).doc } : null };
    },
    async getFamily(fid) {
      await ready;
      return F(fid) ? { id: fid, ...F(fid).doc } : null;
    },
    async createFamily({ passcode, name, members, parentPin, tz }) {
      const fid = await familyIdFor(passcode);
      if (F(fid)) throw new Error('That passcode is already in use. Pick a different one.');
      db.families[fid] = { doc: { name, members, tz, createdAt: Date.now() }, pinHash: await pinHashFor(fid, parentPin), cols: {} };
      save();
      return fid;
    },
    async startSession({ fid, role, pin }) {
      if (role === 'parent' && (await pinHashFor(fid, pin)) !== F(fid).pinHash) throw new Error('Wrong parent PIN.');
    },
    async setParentPin(fid, pin) {
      F(fid).pinHash = await pinHashFor(fid, pin);
      save();
    },
    watchFamily(fid, cb) {
      return sub(() => cb(F(fid) ? { id: fid, ...F(fid).doc } : null));
    },
    async updateFamily(fid, patch) {
      Object.assign(F(fid).doc, patch);
      save();
    },
    watch(fid, c, cb) {
      return sub(() => cb(F(fid) ? Object.entries(C(fid, c)).map(([id, d]) => ({ id, ...d })) : []));
    },
    async add(fid, c, data) {
      const id = randomId();
      C(fid, c)[id] = clean({ ...data, createdAt: Date.now() });
      save();
      return id;
    },
    async set(fid, c, id, data) {
      C(fid, c)[id] = clean(data);
      save();
    },
    async update(fid, c, id, patch) {
      C(fid, c)[id] = clean({ ...C(fid, c)[id], ...patch, updatedAt: Date.now() });
      save();
    },
    async remove(fid, c, id) {
      delete C(fid, c)[id];
      save();
    },
    async createFeed(fid) {
      const token = randomId(32);
      F(fid).doc.feedToken = token;
      save();
      return token;
    },
    resetDemo() {
      localStorage.removeItem(KEY);
    },
  };
}

function clean(o) {
  return JSON.parse(JSON.stringify(o));
}
