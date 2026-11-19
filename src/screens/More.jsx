import { useEffect, useState } from 'preact/hooks';
import { Bell, CalendarPlus, Monitor, KeyRound, LogOut, Users, Smartphone, Copy, RotateCcw, Plus, Info, SquarePlus, Share } from 'lucide-preact';
import { useApp, rememberFamily } from '../app.jsx';
import { Avatar, Sheet, Field, toast, confirmBox } from '../ui.jsx';
import { ColorPick } from './Login.jsx';
import { MEMBER_COLORS } from '../lib/constants.js';
import { randomId } from '../data/hash.js';
import { pushSupported, isStandalone, isIOS, currentSubscription, enablePush, disablePush, sendTest } from '../lib/push.js';

export function More() {
  const app = useApp();
  const { me, members, isParent, family, store, fid, config, setSession, openKitchen } = app;
  const [editM, setEditM] = useState(null);
  const [pinSheet, setPinSheet] = useState(false);
  const [sub, setSub] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const workerUrl = (config.workerUrl || '').replace(/\/$/, '');

  useEffect(() => { currentSubscription().then(setSub).catch(() => setSub(null)); }, []);

  const turnOn = async () => {
    if (!config.vapidPublicKey || !workerUrl) return toast('Reminders aren’t set up yet. See step 5 in SETUP.md.', 'err');
    setBusy(true);
    try {
      const s = await enablePush({ vapidPublicKey: config.vapidPublicKey, store, fid, memberId: me.id });
      setSub(s);
      toast('Reminders are on for this phone 🔔');
    } catch (e) { toast(e.message, 'err'); }
    setBusy(false);
  };
  const turnOff = async () => { await disablePush({ store, fid }); setSub(null); toast('Reminders turned off for this phone'); };
  const test = async () => { try { await sendTest(workerUrl); toast('Test sent. It should arrive in a few seconds.'); } catch (e) { toast(e.message, 'err'); } };

  const feedBase = family.feedToken && workerUrl ? `${workerUrl.replace(/^https?:/, 'webcal:')}/ics/${family.feedToken}.ics` : null;
  const makeFeed = async () => {
    if (!workerUrl) return toast('Calendar sync isn’t set up yet. See step 5 in SETUP.md.', 'err');
    if (store.mode === 'demo') return toast('Calendar sync works once the app is connected to Firebase', 'err');
    try { await store.createFeed(fid); } catch (e) { toast('Couldn’t create link', 'err'); }
  };
  const copy = async (t) => { try { await navigator.clipboard.writeText(t); toast('Link copied'); } catch { toast(t); } };

  // Switch person: back to the "Who's using this phone?" picker (family stays remembered, no passcode).
  const signOut = async () => {
    try { await disablePush({ store, fid }); } catch {}
    setSession(null);
  };
  // Leave family: forget this family on this phone entirely (passcode needed again).
  const leave = async () => {
    if (!(await confirmBox({ title: 'Sign out of this family?', message: 'This phone will forget the family. You’ll need the family passcode to get back in.', ok: 'Sign out', danger: true }))) return;
    try { await disablePush({ store, fid }); } catch {}
    rememberFamily(null);
    setSession(null);
  };

  const standalone = isStandalone();

  return (
    <div class="page">
      <header class="page-head"><h1>More</h1></header>

      <section class="card me-card">
        <Avatar m={me} size={52} />
        <div>
          <div class="me-name">{me.name}</div>
          <div class="muted">{family.name} · {isParent ? 'Parent' : 'Kid (can add, not edit)'}</div>
        </div>
        <button class="btn small" onClick={signOut}>Switch</button>
      </section>

      {!standalone && isIOS() && (
        <section class="card install">
          <h2><Smartphone size={18} /> Put Family Hub on your home screen</h2>
          <ol>
            <li>Tap the <b>Share</b> button <Share size={14} /> at the bottom of Safari</li>
            <li>Scroll down and tap <b>Add to Home Screen</b> <SquarePlus size={14} /></li>
            <li>Open Family Hub from the new icon</li>
          </ol>
          <p class="hint">Reminders only work when Family Hub is opened from the home screen icon.</p>
        </section>
      )}

      <section class="card">
        <div class="card-head"><h2><Users size={18} /> Family</h2>{isParent && <button class="link-btn" onClick={() => setEditM({ id: randomId(8), name: '', role: 'kid', color: MEMBER_COLORS[members.length % MEMBER_COLORS.length], workoutGoal: 3, _new: true })}><Plus size={16} /> Add</button>}</div>
        {members.map((m) => (
          <button class="member-line" onClick={() => isParent && setEditM(m)} disabled={!isParent}>
            <Avatar m={m} size={36} />
            <div><b>{m.name}</b><div class="muted small">{m.role === 'parent' ? 'Parent' : 'Kid'}{m.workoutGoal ? ` · workout goal ${m.workoutGoal}/week` : ''}</div></div>
          </button>
        ))}
      </section>

      <section class="card">
        <div class="card-head"><h2><Bell size={18} /> Reminders on this phone</h2></div>
        {!pushSupported() ? (
          <p class="hint">{isIOS() && !standalone ? 'Add Family Hub to your home screen first (see above), then open it from there to turn on reminders.' : 'This browser can’t receive notifications.'}</p>
        ) : sub ? (
          <>
            <p>🔔 Reminders are <b>on</b>. You’ll get alerts for events you’re part of (or that are set to remind everyone).</p>
            <div class="row-btns"><button class="btn soft" onClick={test}>Send a test</button><button class="btn ghost" onClick={turnOff}>Turn off</button></div>
          </>
        ) : (
          <>
            <p class="hint">Get a notification before practices, games, appointments and birthdays. Set reminder times on each event.</p>
            <button class="btn primary block" onClick={turnOn} disabled={busy || sub === undefined}>Turn on reminders</button>
          </>
        )}
      </section>

      <section class="card">
        <div class="card-head"><h2><CalendarPlus size={18} /> Apple Calendar</h2></div>
        {feedBase ? (
          <>
            <p class="hint">Tap a link on your iPhone, then tap <b>Subscribe</b>. Family Hub events will show up in the Calendar app and update automatically. The Calendar app checks for changes on its own schedule; you can set how often in Settings › Calendar › Accounts › Subscribed Calendars.</p>
            <a class="btn block primary" href={feedBase}>Subscribe to the whole family</a>
            <div class="feed-list">
              {members.map((m) => (
                <a class="btn block soft" href={`${feedBase}?m=${m.id}`}><Avatar m={m} size={20} /> Just {m.name}’s events</a>
              ))}
            </div>
            <button class="link-btn" onClick={() => copy(feedBase.replace(/^webcal:/, 'https:'))}><Copy size={14} /> Copy link</button>
            {isParent && <button class="link-btn danger" onClick={async () => { if (await confirmBox({ title: 'Make a new link?', message: 'The old link will stop updating. Everyone will need to subscribe again.', ok: 'New link' })) makeFeed(); }}><RotateCcw size={14} /> Reset link</button>}
          </>
        ) : isParent ? (
          <>
            <p class="hint">Show Family Hub events in the iPhone Calendar app. Everything you add here updates there automatically.</p>
            <button class="btn primary block" onClick={makeFeed}>Set up Apple Calendar sync</button>
          </>
        ) : <p class="hint">Ask a parent to turn on Apple Calendar sync in More.</p>}
      </section>

      <section class="card">
        <button class="menu-line" onClick={openKitchen}><Monitor size={20} /> <span>Kitchen display mode</span></button>
        {isParent && <button class="menu-line" onClick={() => setPinSheet(true)}><KeyRound size={20} /> <span>Change parent PIN</span></button>}
        {store.mode === 'demo' && <button class="menu-line" onClick={() => { store.resetDemo(); localStorage.removeItem('familyhub.session'); location.reload(); }}><RotateCcw size={20} /> <span>Reset demo data</span></button>}
        <button class="menu-line" onClick={signOut}><Users size={20} /> <span>Switch person</span></button>
        <button class="menu-line" onClick={leave}><LogOut size={20} /> <span>Sign out of this family</span></button>
      </section>

      <p class="hint center"><Info size={12} /> Family Hub · {store.mode === 'demo' ? 'Demo mode' : 'Synced'}</p>

      {editM && <MemberEditor m={editM} onClose={() => setEditM(null)} />}
      {pinSheet && <PinSheet onClose={() => setPinSheet(false)} />}
    </div>
  );
}

function MemberEditor({ m, onClose }) {
  const { members, act, me } = useApp();
  const [f, setF] = useState(m);
  const set = (p) => setF({ ...f, ...p });
  const save = async () => {
    if (!f.name.trim()) return toast('Add a name', 'err');
    const { _new, ...clean } = { ...f, name: f.name.trim(), workoutGoal: Number(f.workoutGoal) || 0 };
    const list = m._new ? [...members, clean] : members.map((x) => (x.id === m.id ? clean : x));
    if (!list.some((x) => x.role === 'parent')) return toast('Keep at least one parent', 'err');
    await act.updateFamily({ members: list });
    onClose();
  };
  const remove = async () => {
    if (m.id === me.id) return toast('You can’t remove yourself', 'err');
    if (!(await confirmBox({ title: `Remove ${m.name}?`, message: 'Their events stay on the calendar.', ok: 'Remove', danger: true }))) return;
    await act.updateFamily({ members: members.filter((x) => x.id !== m.id) });
    onClose();
  };
  return (
    <Sheet title={m._new ? 'Add person' : `Edit ${m.name}`} onClose={onClose} actions={<button class="btn primary small" onClick={save}>Save</button>}>
      <div class="form">
        <div class="member-row"><ColorPick value={f.color} onChange={(c) => set({ color: c })} /><input value={f.name} onInput={(e) => set({ name: e.currentTarget.value })} placeholder="Name" /></div>
        <Field label="Role"><select value={f.role} onChange={(e) => set({ role: e.currentTarget.value })}><option value="parent">Parent (needs PIN, can edit everything)</option><option value="kid">Kid (can add, not edit)</option></select></Field>
        <Field label="Workout goal (times per week)"><input type="number" inputmode="numeric" min="0" max="14" value={f.workoutGoal} onInput={(e) => set({ workoutGoal: e.currentTarget.value })} /></Field>
        <button class="btn primary block" onClick={save}>Save</button>
        {!m._new && <button class="btn danger-outline block" onClick={remove}>Remove from family</button>}
      </div>
    </Sheet>
  );
}

function PinSheet({ onClose }) {
  const { store, fid } = useApp();
  const [pin, setPin] = useState('');
  const save = async () => {
    if (!/^\d{4,8}$/.test(pin)) return toast('PIN must be 4–8 digits', 'err');
    try { await store.setParentPin(fid, pin); toast('Parent PIN changed'); onClose(); } catch (e) { toast('Couldn’t change PIN', 'err'); }
  };
  return (
    <Sheet title="Change parent PIN" onClose={onClose}>
      <div class="form">
        <p class="hint">Both parents use this PIN. Phones that are already signed in stay signed in.</p>
        <input class="pin-input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength={8} value={pin} onInput={(e) => setPin(e.currentTarget.value.replace(/\D/g, ''))} placeholder="New PIN" />
        <button class="btn primary block" onClick={save}>Save PIN</button>
      </div>
    </Sheet>
  );
}
