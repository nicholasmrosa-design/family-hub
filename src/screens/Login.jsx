import { useEffect, useState } from 'preact/hooks';
import { ChevronLeft, Plus, X } from 'lucide-preact';
import { Avatar, Field, toast } from '../ui.jsx';
import { MEMBER_COLORS } from '../lib/constants.js';
import { randomId } from '../data/hash.js';
import { rememberedFamily, rememberFamily } from '../app.jsx';

export function Login({ store, onDone }) {
  const remembered = rememberedFamily();
  const [step, setStep] = useState(remembered ? 'loading' : 'code'); // loading | code | who | pin | setup
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState(null); // {fid, family}
  const [who, setWho] = useState(null);
  const [pin, setPin] = useState('');

  useEffect(() => {
    if (!remembered) return;
    store.getFamily(remembered)
      .then((family) => { if (family) { setFound({ fid: remembered, family }); setStep('who'); } else { rememberFamily(null); setStep('code'); } })
      .catch(() => setStep('code'));
  }, []);
  const forget = () => { rememberFamily(null); setFound(null); setCode(''); setStep('code'); };

  const submitCode = async (e) => {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    try {
      const r = await store.findFamily(code);
      if (!r.family) toast('No family found with that passcode', 'err');
      else { setFound(r); setStep('who'); }
    } catch (e2) {
      toast('Couldn’t connect: ' + (e2.code || e2.message), 'err');
    }
    setBusy(false);
  };

  const pick = async (m) => {
    setWho(m);
    if (m.role === 'parent') { setPin(''); setStep('pin'); return; }
    setBusy(true);
    try {
      await store.startSession({ fid: found.fid, memberId: m.id, role: 'kid' });
      onDone({ fid: found.fid, memberId: m.id, role: 'kid' });
    } catch (e) { toast('Couldn’t sign in', 'err'); }
    setBusy(false);
  };

  const submitPin = async (e) => {
    e && e.preventDefault();
    setBusy(true);
    try {
      await store.startSession({ fid: found.fid, memberId: who.id, role: 'parent', pin });
      onDone({ fid: found.fid, memberId: who.id, role: 'parent' });
    } catch (e2) {
      toast(e2.message || 'Wrong PIN', 'err');
      setPin('');
    }
    setBusy(false);
  };

  if (step === 'setup') return <Setup store={store} onBack={() => setStep('code')} onDone={onDone} />;

  return (
    <div class="login">
      <div class="login-hero">
        <img src="icons/icon-192.png" alt="" class="login-logo" />
        <h1>Family Hub</h1>
        <p>Everything your family has going on, in one place.</p>
      </div>

      {step === 'loading' && <div class="center"><div class="spinner" style={{ margin: '30px auto' }} /></div>}

      {step === 'code' && (
        <form class="card login-card" onSubmit={submitCode}>
          <Field label="Family passcode">
            <input type="password" autocomplete="current-password" value={code} onInput={(e) => setCode(e.currentTarget.value)} placeholder="Enter passcode" autofocus />
          </Field>
          <button class="btn primary block" disabled={busy}>{busy ? 'Checking…' : 'Continue'}</button>
          {store.mode === 'demo' && <p class="hint center">Demo: passcode <b>demo</b> · parent PIN <b>1234</b></p>}
          <div class="divider"><span>first time?</span></div>
          <button type="button" class="btn ghost block" onClick={() => setStep('setup')}>Set up a new family</button>
        </form>
      )}

      {step === 'who' && (
        <div class="card login-card">
          {!remembered && <button class="link-btn" onClick={() => setStep('code')}><ChevronLeft size={18} /> Back</button>}
          <h2 class="center">Who’s using this phone?</h2>
          <p class="hint center">{found.family.name}</p>
          <div class="who-grid">
            {found.family.members.map((m) => (
              <button class="who" onClick={() => pick(m)} disabled={busy}>
                <Avatar m={m} size={64} />
                <span>{m.name}</span>
                <small>{m.role === 'parent' ? 'Parent' : 'Kid'}</small>
              </button>
            ))}
          </div>
          <p class="hint center">Kids go right in. Parents enter the parent PIN.</p>
          {remembered && <button class="link-btn center-btn" onClick={forget}>Not your family? Use a different passcode</button>}
        </div>
      )}

      {step === 'pin' && (
        <form class="card login-card" onSubmit={submitPin}>
          <button type="button" class="link-btn" onClick={() => setStep('who')}><ChevronLeft size={18} /> Back</button>
          <div class="center"><Avatar m={who} size={56} /></div>
          <h2 class="center">Parent PIN</h2>
          <input class="pin-input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength={8} value={pin}
            onInput={(e) => setPin(e.currentTarget.value.replace(/\D/g, ''))} autofocus placeholder="••••" />
          <button class="btn primary block" disabled={busy || pin.length < 4}>{busy ? 'Checking…' : 'Sign in'}</button>
        </form>
      )}
    </div>
  );
}

function Setup({ store, onBack, onDone }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [code2, setCode2] = useState('');
  const [pin, setPin] = useState('');
  const [members, setMembers] = useState([
    { id: randomId(8), name: '', role: 'parent', color: MEMBER_COLORS[0], workoutGoal: 3 },
    { id: randomId(8), name: '', role: 'parent', color: MEMBER_COLORS[1], workoutGoal: 3 },
    { id: randomId(8), name: '', role: 'kid', color: MEMBER_COLORS[2], workoutGoal: 3 },
  ]);
  const [busy, setBusy] = useState(false);

  const upd = (i, p) => setMembers(members.map((m, j) => (j === i ? { ...m, ...p } : m)));

  const submit = async (e) => {
    e.preventDefault();
    const ms = members.filter((m) => m.name.trim()).map((m) => ({ ...m, name: m.name.trim() }));
    if (!name.trim()) return toast('Give your family a name', 'err');
    if (code.trim().length < 8) return toast('Passcode needs at least 8 characters', 'err');
    if (code !== code2) return toast('Passcodes don’t match', 'err');
    if (!/^\d{4,8}$/.test(pin)) return toast('Parent PIN must be 4–8 digits', 'err');
    if (!ms.some((m) => m.role === 'parent')) return toast('Add at least one parent', 'err');
    setBusy(true);
    try {
      const me = ms.find((m) => m.role === 'parent');
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles';
      const fid = await store.createFamily({ passcode: code, name: name.trim(), members: ms, parentPin: pin, tz, me: me.id });
      await store.startSession({ fid, memberId: me.id, role: 'parent', pin });
      toast('Family created 🎉');
      onDone({ fid, memberId: me.id, role: 'parent' });
    } catch (e2) {
      console.error(e2);
      toast(e2.message || 'Couldn’t create family', 'err');
    }
    setBusy(false);
  };

  return (
    <div class="login">
      <form class="card login-card wide" onSubmit={submit}>
        <button type="button" class="link-btn" onClick={onBack}><ChevronLeft size={18} /> Back</button>
        <h2>Set up your family</h2>
        <Field label="Family name"><input value={name} onInput={(e) => setName(e.currentTarget.value)} placeholder="The Smiths" /></Field>

        <h3 class="sub">Family members</h3>
        <p class="hint">The first parent listed is you.</p>
        {members.map((m, i) => (
          <div class="member-row">
            <ColorPick value={m.color} onChange={(c) => upd(i, { color: c })} />
            <input value={m.name} onInput={(e) => upd(i, { name: e.currentTarget.value })} placeholder={i === 0 ? 'Your name' : 'Name'} />
            <select value={m.role} onChange={(e) => upd(i, { role: e.currentTarget.value })}>
              <option value="parent">Parent</option>
              <option value="kid">Kid</option>
            </select>
            {members.length > 1 && <button type="button" class="icon-btn" onClick={() => setMembers(members.filter((_, j) => j !== i))}><X size={18} /></button>}
          </div>
        ))}
        <button type="button" class="btn ghost small" onClick={() => setMembers([...members, { id: randomId(8), name: '', role: 'kid', color: MEMBER_COLORS[members.length % MEMBER_COLORS.length], workoutGoal: 3 }])}>
          <Plus size={16} /> Add person
        </button>

        <h3 class="sub">Family passcode</h3>
        <p class="hint">Everyone uses this to get in. Make it at least 8 characters. A short phrase like “tacos on tuesday” works great.</p>
        <input type="password" autocomplete="new-password" value={code} onInput={(e) => setCode(e.currentTarget.value)} placeholder="Passcode" />
        <input type="password" autocomplete="new-password" value={code2} onInput={(e) => setCode2(e.currentTarget.value)} placeholder="Type it again" />

        <h3 class="sub">Parent PIN</h3>
        <p class="hint">Parents enter this PIN to sign in. Parents can edit and delete anything. Kids can add things but can’t change or delete them.</p>
        <input type="password" inputmode="numeric" pattern="[0-9]*" maxlength={8} value={pin} onInput={(e) => setPin(e.currentTarget.value.replace(/\D/g, ''))} placeholder="4–8 digits" />

        <button class="btn primary block" disabled={busy}>{busy ? 'Creating…' : 'Create family'}</button>
      </form>
    </div>
  );
}

export function ColorPick({ value, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <span class="colorpick">
      <button type="button" class="swatch" style={{ background: value }} onClick={() => setOpen(!open)} aria-label="Pick color" />
      {open && (
        <span class="swatches" onClick={(e) => e.stopPropagation()}>
          {MEMBER_COLORS.map((c) => (
            <button type="button" class={`swatch ${c === value ? 'on' : ''}`} style={{ background: c }} onClick={() => { onChange(c); setOpen(false); }} />
          ))}
        </span>
      )}
    </span>
  );
}
