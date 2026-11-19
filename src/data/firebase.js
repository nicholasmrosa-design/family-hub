import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, onSnapshot, writeBatch, addDoc,
} from 'firebase/firestore';
import { familyIdFor, pinHashFor, randomId } from './hash.js';

export function createFirebaseStore(config) {
  const app = initializeApp(config);
  const auth = getAuth(app);
  let db;
  try {
    db = initializeFirestore(app, {
      ignoreUndefinedProperties: true,
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch (e) {
    db = initializeFirestore(app, { ignoreUndefinedProperties: true });
  }

  let uid = null;
  const ready = new Promise((resolve, reject) => {
    const off = onAuthStateChanged(auth, async (user) => {
      if (user) { uid = user.uid; off(); resolve(uid); return; }
      try { await signInAnonymously(auth); } catch (e) { reject(e); }
    });
  });

  const fam = (fid) => doc(db, 'families', fid);
  const col = (fid, c) => collection(db, 'families', fid, c);

  return {
    mode: 'firebase',
    ready,
    uid: () => uid,

    async findFamily(passcode) {
      await ready;
      const fid = await familyIdFor(passcode);
      const snap = await getDoc(fam(fid));
      return snap.exists() ? { fid, family: { id: fid, ...snap.data() } } : { fid, family: null };
    },

    async getFamily(fid) {
      await ready;
      const snap = await getDoc(fam(fid));
      return snap.exists() ? { id: fid, ...snap.data() } : null;
    },

    async createFamily({ passcode, name, members, parentPin, tz, me }) {
      await ready;
      const fid = await familyIdFor(passcode);
      const existing = await getDoc(fam(fid)).catch(() => null);
      if (existing && existing.exists()) throw new Error('That passcode is already in use. Pick a different one.');
      const pinHash = await pinHashFor(fid, parentPin);
      const b = writeBatch(db);
      b.set(doc(db, 'families', fid, 'private', 'parent'), { pinHash });
      b.set(doc(db, 'families', fid, 'sessions', uid), { role: 'parent', memberId: me, pinHash, at: Date.now() });
      b.set(fam(fid), { name, members, tz, createdAt: Date.now() });
      await b.commit();
      return fid;
    },

    async startSession({ fid, memberId, role, pin }) {
      await ready;
      const data = { role, memberId, at: Date.now() };
      if (role === 'parent') data.pinHash = await pinHashFor(fid, pin);
      try {
        await setDoc(doc(db, 'families', fid, 'sessions', uid), data);
      } catch (e) {
        if (role === 'parent') throw new Error('Wrong parent PIN.');
        throw e;
      }
    },

    async setParentPin(fid, pin) {
      const pinHash = await pinHashFor(fid, pin);
      await setDoc(doc(db, 'families', fid, 'private', 'parent'), { pinHash });
      await updateDoc(doc(db, 'families', fid, 'sessions', uid), { pinHash });
    },

    watchFamily(fid, cb, onErr) {
      return onSnapshot(fam(fid), (s) => cb(s.exists() ? { id: fid, ...s.data() } : null), onErr);
    },
    updateFamily(fid, patch) {
      return updateDoc(fam(fid), patch);
    },

    watch(fid, c, cb, onErr) {
      return onSnapshot(col(fid, c), (qs) => cb(qs.docs.map((d) => ({ id: d.id, ...d.data() }))), onErr);
    },
    async add(fid, c, data) {
      const r = await addDoc(col(fid, c), { ...data, createdAt: Date.now() });
      return r.id;
    },
    set(fid, c, id, data) {
      return setDoc(doc(db, 'families', fid, c, id), data);
    },
    update(fid, c, id, patch) {
      return updateDoc(doc(db, 'families', fid, c, id), { ...patch, updatedAt: Date.now() });
    },
    remove(fid, c, id) {
      return deleteDoc(doc(db, 'families', fid, c, id));
    },

    // Apple Calendar feed: a random token that maps to the family on the worker side.
    async createFeed(fid) {
      const token = randomId(32);
      await setDoc(doc(db, 'feeds', token), { fid, at: Date.now() });
      await updateDoc(fam(fid), { feedToken: token });
      return token;
    },
  };
}
