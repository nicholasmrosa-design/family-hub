import { useMemo, useState } from 'preact/hooks';
import { Plus, Repeat, Trash2, Users, Check, X, CornerUpRight, Pencil } from 'lucide-preact';
import { useApp } from '../app.jsx';
import { Sheet, Field, MemberChips, Empty, Avatar, Seg, Toggle, toast, confirmBox } from '../ui.jsx';
import { choreBoard, describeRoutine, isFlex } from '../lib/routines.js';
import { fmtTime, DAY_NAMES, fmtShortDate, fmtDayLabel, addDays, weekday, partsIn, toMinutes, pad } from '../lib/dates.js';

export const AREAS = [
  { id: 'kitchen', label: 'Kitchen', emoji: '🍳' },
  { id: 'bathroom', label: 'Bathroom', emoji: '🛁' },
  { id: 'bedroom', label: 'Bedrooms', emoji: '🛏️' },
  { id: 'living', label: 'Living areas', emoji: '🛋️' },
  { id: 'laundry', label: 'Laundry', emoji: '🧺' },
  { id: 'yard', label: 'Yard & outside', emoji: '🌿' },
  { id: 'pets', label: 'Pets', emoji: '🐾' },
  { id: 'other', label: 'Other', emoji: '🧹' },
];
const AREA = Object.fromEntries(AREAS.map((a) => [a.id, a]));
const ord = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');

function statusLabel(row, memberById, today) {
  const st = row.status;
  if (!st) return null;
  const who = memberById(st.by)?.name;
  const day = (d) => fmtDayLabel(d, today).replace(/^(\w+), /, '$1 ');
  if (row.moved === 'from') return `Moved to ${day(st.movedTo.date)}${st.movedTo.time ? ' ' + fmtTime(st.movedTo.time) : ''}`;
  if (st.state === 'done') return `Done${who ? ' by ' + who : ''}`;
  if (st.state === 'missed') return `Not done${who ? ' · ' + who : ''}`;
  return null;
}

export function ChoreRow({ row }) {
  const { memberById, act, me, today } = useApp();
  const [open, setOpen] = useState(false);
  const { r, slot, status, who, group, moved } = row;
  const people = who.map(memberById).filter(Boolean);
  const color = people.length === 1 ? people[0].color : 'var(--accent)';
  const state = moved === 'from' ? 'moved' : status && status.state !== 'moved' ? status.state : null;
  const time = moved === 'to' ? status.movedTo.time || r.time : r.time;
  const toggle = async () => {
    if (state === 'moved') return setOpen(true);
    if (state) await act.choreSet(r, slot, null, status);
    else { await act.choreSet(r, slot, 'done', status); toast(`✨ ${r.title} done!`); }
  };
  const label = statusLabel(row, memberById, today);
  const sub = label || [
    time && (!slot.flex || moved === 'to') ? fmtTime(time) : null,
    moved === 'to' ? `moved from ${fmtShortDate(slot.flex ? slot.start : slot.date)}` : null,
    group === 'overdue' ? `was due ${fmtShortDate(moved === 'to' ? status.movedTo.date : slot.date)}` : slot.flex && moved !== 'to' ? `by ${group === 'week' ? 'Saturday' : fmtShortDate(slot.date)}` : null,
    r.rotate && people.length === 1 ? `${people[0].id === me.id ? 'your' : people[0].name + '’s'} turn` : null,
  ].filter(Boolean).join(' · ');
  return (
    <>
      <div class={`todo-row chore ${state ? 'st-' + state : ''} ${group === 'overdue' && !state ? 'overdue' : ''}`} onClick={() => setOpen(true)}>
        <button type="button" class={`plan-check ${state || ''}`} style={{ '--c': color }} onClick={(e) => { e.stopPropagation(); toggle(); }} aria-label="Done">
          {state === 'done' && <Check size={15} strokeWidth={3.2} />}
          {state === 'missed' && <X size={15} strokeWidth={3} />}
          {state === 'moved' && <CornerUpRight size={14} strokeWidth={2.6} />}
        </button>
        <span class="todo-text">
          <span class="chore-title">{(AREA[r.area] || AREA.other).emoji} {r.title}</span>
          {sub && <small class="chore-sub">{sub}</small>}
        </span>
        {group === 'overdue' && !state ? (
          <div class="icon-checkins" onClick={(e) => e.stopPropagation()}>
            <button class="ic" aria-label="Not done" onClick={() => act.choreSet(r, slot, 'missed', status)}><X size={18} strokeWidth={2.6} /></button>
            <button class="ic" aria-label="Move" onClick={() => setOpen('move')}><CornerUpRight size={18} strokeWidth={2.4} /></button>
          </div>
        ) : <span class="avatars">{people.slice(0, 3).map((m) => <Avatar m={m} size={24} />)}</span>}
      </div>
      {open && <ChoreSheet row={row} startMove={open === 'move'} onClose={() => setOpen(false)} />}
    </>
  );
}

function ChoreSheet({ row, startMove, onClose }) {
  const { act, memberById, isParent, today } = useApp();
  const { r, slot, status, who, moved } = row;
  const [moving, setMoving] = useState(!!startMove);
  const [edit, setEdit] = useState(false);
  const people = who.map(memberById).filter(Boolean);
  const label = statusLabel(row, memberById, today);
  const set = async (state) => { await act.choreSet(r, slot, state, status); if (state === 'done') toast(`✨ ${r.title} done!`); onClose(); };
  const pending = !status || status.state === 'moved';
  if (edit) return <RoutineEditor draft={r} onClose={onClose} />;
  if (moving) return <MoveChoreSheet row={row} onClose={onClose} />;
  return (
    <Sheet title="" onClose={onClose}>
      <div class="detail-head">
        <span class="detail-emoji">{(AREA[r.area] || AREA.other).emoji}</span>
        <div><h2 class="detail-title">{r.title}</h2>
          <div class="detail-sub">{describeRoutine(r)}{r.time ? ' · ' + fmtTime(r.time) : ''}{people.length ? ' · ' + people.map((m) => m.name).join(', ') : ' · anyone'}{r.rotate && people.length === 1 ? ' (their turn)' : ''}</div>
        </div>
      </div>
      <div class={`checkin-box ${status && moved !== 'from' ? 'st-' + status.state : ''}`}>
        <div class="checkin-title">{moved === 'to' && pending ? `Moved here from ${fmtDayLabel(slot.flex ? slot.start : slot.date, today)}` : label || (slot.flex ? `Due by ${fmtDayLabel(slot.date, today)}` : fmtDayLabel(moved === 'to' ? status.movedTo.date : slot.date, today))}</div>
        {moved === 'from' ? (
          <div class="row-btns"><button class="btn ghost" onClick={() => act.choreSet(r, slot, null, null).then(onClose)}>Undo move</button></div>
        ) : pending ? (
          <div class="row-btns">
            <button class="btn done-btn" onClick={() => set('done')}><Check size={16} /> Done</button>
            <button class="btn ghost" onClick={() => set('missed')}><X size={16} /> Not done</button>
            <button class="btn ghost" onClick={() => setMoving(true)}><CornerUpRight size={16} /> Move</button>
          </div>
        ) : (
          <div class="row-btns">
            <button class="btn ghost" onClick={() => act.choreSet(r, slot, null, status).then(onClose)}>Undo</button>
            {status.state === 'missed' && <button class="btn soft" onClick={() => setMoving(true)}><CornerUpRight size={16} /> Move to later</button>}
          </div>
        )}
      </div>
      {isParent ? <button class="btn block" onClick={() => setEdit(true)}><Pencil size={16} /> Edit chore</button> : <p class="hint center">Only parents can change the chore itself.</p>}
    </Sheet>
  );
}

function MoveChoreSheet({ row, onClose }) {
  const { act, today, tz } = useApp();
  const { r, slot, status } = row;
  const nowMin = toMinutes(partsIn(new Date(), tz).time);
  const laterMin = Math.ceil((nowMin + 120) / 30) * 30;
  const later = laterMin < 22 * 60 ? `${pad(Math.floor(laterMin / 60))}:${pad(laterMin % 60)}` : null;
  const sat = addDays(today, ((6 - weekday(today)) + 7) % 7 || 7);
  const [d, setD] = useState(addDays(today, 1));
  const [t, setT] = useState(r.time || '');
  const go = async (date, time) => {
    await act.choreSet(r, slot, 'moved', status, { movedTo: { date, time: time || null } });
    toast(`Moved to ${fmtDayLabel(date, today).toLowerCase()}${time ? ' at ' + fmtTime(time) : ''}`);
    onClose();
  };
  return (
    <Sheet title={`Move “${r.title}”`} onClose={onClose}>
      <div class="form">
        {later && <button class="btn block soft" onClick={() => go(today, later)}>Later today · {fmtTime(later)}</button>}
        <button class="btn block soft" onClick={() => go(addDays(today, 1), r.time)}>Tomorrow{r.time ? ' · ' + fmtTime(r.time) : ''}</button>
        <button class="btn block soft" onClick={() => go(sat, r.time || '10:00')}>{fmtDayLabel(sat, today)} · {fmtTime(r.time || '10:00')}</button>
        <div class="divider"><span>or pick a time</span></div>
        <div class="row2">
          <Field label="Day"><input type="date" value={d} min={today} onInput={(e) => setD(e.currentTarget.value)} /></Field>
          <Field label="Time (optional)"><input type="time" value={t} onInput={(e) => setT(e.currentTarget.value)} /></Field>
        </div>
        <button class="btn primary block" disabled={!d} onClick={() => go(d, t)}>Move it</button>
      </div>
    </Sheet>
  );
}

export function Chores() {
  const { routines, routineDone, today, members, me, isParent } = useApp();
  const [who, setWho] = useState('all');
  const [edit, setEdit] = useState(null);
  const [manage, setManage] = useState(false);
  const board = useMemo(() => choreBoard(routines, routineDone, today), [routines, routineDone, today]);
  const mine = board.filter((x) => who === 'all' || x.who.length === 0 || x.who.includes(who));
  const groups = [
    ['overdue', 'Overdue'], ['today', 'Today'], ['week', 'This week'], ['month', 'This month'],
  ].map(([g, l]) => [l, mine.filter((x) => x.group === g).sort((a, b) => (!!(a.status && a.status.state !== 'moved') - !!(b.status && b.status.state !== 'moved')))]).filter(([, l]) => l.length);
  const todayRows = mine.filter((x) => x.group === 'today');
  const todayDone = todayRows.filter((x) => x.done).length;

  return (
    <>
      <div class="chips scroll filter">
        <button class={`chip ${who === 'all' ? 'on' : ''}`} onClick={() => setWho('all')}>Everyone</button>
        {members.map((m) => (
          <button class={`chip member ${who === m.id ? 'on' : ''}`} style={who === m.id ? { background: m.color, borderColor: m.color } : {}} onClick={() => setWho(m.id)}>
            <span class="dot" style={{ background: who === m.id ? '#fff' : m.color }} />{m.id === me.id ? 'Me' : m.name}
          </button>
        ))}
      </div>
      {todayRows.length > 0 && (
        <div class="card chore-progress">
          <div><b>{todayDone} of {todayRows.length}</b> done today{todayDone === todayRows.length ? ' 🎉' : ''}</div>
          <div class="bar"><span class="fill" style={{ width: `${(todayDone / todayRows.length) * 100}%`, background: 'var(--ok)' }} /></div>
        </div>
      )}
      <div class="row-btns">
        <button class="btn soft" onClick={() => setEdit({})}><Plus size={18} /> New chore</button>
        <button class="btn ghost" onClick={() => setManage(true)}>All chores ({routines.length})</button>
      </div>
      {groups.map(([label, rows]) => (
        <section class="card list-card">
          <div class={`section-label ${label === 'Overdue' ? 'late' : ''}`}>{label}</div>
          {rows.map((x) => <ChoreRow row={x} />)}
        </section>
      ))}
      {!groups.length && <Empty emoji="🧽" title={routines.length ? 'Nothing due' : 'No chores yet'} text={routines.length ? 'Nice and tidy.' : 'Add the jobs that keep the house running: daily, weekly or monthly, with who does them.'} />}
      {groups.length > 0 && <p class="hint center">Tap a chore for Done, Not done or Move{isParent ? ', or to edit it' : ''}.</p>}
      {edit && <RoutineEditor draft={edit} onClose={() => setEdit(null)} />}
      {manage && <ManageSheet onClose={() => setManage(false)} onEdit={(r) => { setManage(false); setEdit(r); }} />}
    </>
  );
}

function ManageSheet({ onClose, onEdit }) {
  const { routines, memberById, isParent } = useApp();
  const byFreq = ['daily', 'weekly', 'monthly'].map((f) => [f, routines.filter((r) => r.freq === f).sort((a, b) => a.title.localeCompare(b.title))]).filter(([, l]) => l.length);
  return (
    <Sheet title="All chores" onClose={onClose} tall>
      {byFreq.map(([f, list]) => (
        <section>
          <div class="section-label">{f === 'daily' ? 'Daily' : f === 'weekly' ? 'Weekly' : 'Monthly'}</div>
          {list.map((r) => (
            <button class="manage-row" onClick={() => isParent && onEdit(r)} disabled={!isParent}>
              <span class="emoji">{(AREA[r.area] || AREA.other).emoji}</span>
              <span class="grow"><b>{r.title}</b>{r.paused && <span class="tag"> paused</span>}
                <small>{describeRoutine(r)}{r.time ? ' · ' + fmtTime(r.time) : ''}{r.rotate ? ' · take turns' : ''}{r.remind ? ' · 🔔' : ''}</small>
              </span>
              <span class="avatars">{(r.assignees || []).map(memberById).filter(Boolean).map((m) => <Avatar m={m} size={22} />)}</span>
            </button>
          ))}
        </section>
      ))}
      {!routines.length && <Empty emoji="🧽" title="No chores yet" />}
    </Sheet>
  );
}

const PRESETS = [
  ['Make bed', 'bedroom', 'daily'], ['Unload dishwasher', 'kitchen', 'daily'], ['Wipe kitchen counters', 'kitchen', 'daily'],
  ['Take out trash', 'kitchen', 'weekly'], ['Vacuum', 'living', 'weekly'], ['Clean bathroom', 'bathroom', 'weekly'],
  ['Laundry', 'laundry', 'weekly'], ['Mow lawn', 'yard', 'weekly'], ['Change sheets', 'bedroom', 'weekly'],
  ['Clean fridge', 'kitchen', 'monthly'], ['Change AC filter', 'other', 'monthly'], ['Dust & baseboards', 'living', 'monthly'],
];

export function RoutineEditor({ draft, onClose }) {
  const { act, members, isParent, today, me } = useApp();
  const isNew = !draft.id;
  const [f, setF] = useState({
    title: '', area: 'other', freq: 'daily', days: [], monthDay: null, time: '', assignees: isNew && !isParent ? [me.id] : [],
    rotate: false, remind: false, paused: false, ...draft,
  });
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const save = async () => {
    if (!f.title.trim()) return toast('What’s the chore?', 'err');
    const out = {
      title: f.title.trim(), area: f.area, freq: f.freq,
      days: f.freq === 'weekly' ? f.days : [], monthDay: f.freq === 'monthly' ? f.monthDay || null : null,
      time: f.time || null, assignees: f.assignees, rotate: !!f.rotate && f.assignees.length > 1,
      remind: !!f.remind && !!f.time, paused: !!f.paused, startDate: f.startDate || today,
    };
    if (isNew) await act.add('routines', out); else await act.update('routines', draft.id, out);
    toast(isNew ? 'Chore added' : 'Saved');
    onClose();
  };
  const del = async () => {
    if (!(await confirmBox({ title: 'Delete chore?', message: `“${f.title}” will be removed.`, ok: 'Delete', danger: true }))) return;
    await act.remove('routines', draft.id);
    onClose();
  };
  const flex = isFlex(f);
  return (
    <Sheet title={isNew ? 'New chore' : 'Edit chore'} onClose={onClose} tall actions={<button class="btn primary small" onClick={save}>Save</button>}>
      <div class="form">
        <input class="title-input" value={f.title} onInput={(e) => set({ title: e.currentTarget.value })} placeholder="e.g. Unload the dishwasher" autofocus={isNew} />
        {isNew && !f.title && (
          <div class="chips">
            {PRESETS.map(([t, a, fr]) => <button type="button" class="chip" onClick={() => set({ title: t, area: a, freq: fr })}>{t}</button>)}
          </div>
        )}
        <Field label="Area">
          <div class="chips">{AREAS.map((a) => <button type="button" class={`chip ${f.area === a.id ? 'on' : ''}`} onClick={() => set({ area: a.id })}>{a.emoji} {a.label}</button>)}</div>
        </Field>

        <div class="group">
          <div class="group-title"><Repeat size={16} /> How often</div>
          <Seg value={f.freq} onChange={(v) => set({ freq: v })} options={[{ value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }]} />
          {f.freq === 'weekly' && (
            <>
              <div class="daypick">
                {DAY_NAMES.map((d, i) => (
                  <button type="button" class={f.days.includes(i) ? 'on' : ''} onClick={() => set({ days: f.days.includes(i) ? f.days.filter((x) => x !== i) : [...f.days, i] })}>{d[0]}</button>
                ))}
              </div>
              <p class="hint tight">{f.days.length ? 'Due on the days picked.' : 'No days picked = once a week, any day (due by Saturday).'}</p>
            </>
          )}
          {f.freq === 'monthly' && (
            <Field label="When">
              <select value={f.monthDay || ''} onChange={(e) => set({ monthDay: e.currentTarget.value ? Number(e.currentTarget.value) : null })}>
                <option value="">Any time that month</option>
                {[...Array(31)].map((_, i) => <option value={i + 1}>On the {ord(i + 1)}</option>)}
              </select>
            </Field>
          )}
          {!flex && (
            <Field label="Time (optional)"><input type="time" value={f.time || ''} onInput={(e) => set({ time: e.currentTarget.value })} /></Field>
          )}
        </div>

        <div class="group">
          <div class="group-title"><Users size={16} /> Who does it</div>
          <MemberChips members={members} value={f.assignees} onChange={(v) => set({ assignees: v })} />
          {f.assignees.length === 0 && <p class="hint tight">Nobody picked = anyone can do it</p>}
          {f.assignees.length > 1 && <Toggle label="Take turns (rotate each time)" checked={f.rotate} onChange={(v) => set({ rotate: v })} />}
          {f.assignees.length > 1 && !f.rotate && <p class="hint tight">Shared: whoever does it checks it off.</p>}
        </div>

        {!flex && f.time && <Toggle label="🔔 Send a reminder at this time" checked={f.remind} onChange={(v) => set({ remind: v })} />}
        {!isNew && isParent && <Toggle label="Pause this chore" checked={f.paused} onChange={(v) => set({ paused: v })} />}
        <button class="btn primary block" onClick={save}>{isNew ? 'Add chore' : 'Save'}</button>
        {!isNew && isParent && <button class="btn danger-outline block" onClick={del}><Trash2 size={16} /> Delete chore</button>}
        {!isParent && <p class="hint">Once added, only a parent can change it.</p>}
      </div>
    </Sheet>
  );
}
