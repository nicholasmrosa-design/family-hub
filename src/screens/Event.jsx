import { useMemo, useState } from 'preact/hooks';
import { Car, MapPin, Backpack, Bell, Repeat, Pencil, Trash2, TriangleAlert, Clock, Check, X, CornerUpRight } from 'lucide-preact';
import { useApp } from '../app.jsx';
import { Sheet, Dots, MemberChips, Field, Toggle, confirmBox, toast, mapsUrl, Avatar } from '../ui.jsx';
import { CATEGORIES, CAT, REMINDER_OPTIONS, REMINDER_LABEL, isPlanned } from '../lib/constants.js';
import { fmtTimeRange, fmtDayLabel, fmtTime, addDays, weekday, DAY_NAMES, addMonths, toMinutes, pad, partsIn } from '../lib/dates.js';
import { describeRepeat } from '../lib/recur.js';
import { conflictsForDraft } from '../lib/conflicts.js';

export function statusText(c, memberById, today) {
  if (!c) return null;
  const who = memberById(c.by)?.name;
  if (c.state === 'done') return `Done${who ? ' · ' + who : ''}`;
  if (c.state === 'missed') return `Didn’t happen${who ? ' · ' + who : ''}`;
  if (c.state === 'moved') return `Moved to ${fmtDayLabel(c.movedTo.date, today).replace(/^(\w+), /, '$1 ')}${c.movedTo.start ? ' ' + fmtTime(c.movedTo.start) : ''}`;
  return null;
}

export function EventRow({ inst, conflicts, compact }) {
  const { members, memberById, openEvent, checkins, act, today } = useApp();
  const ev = inst.ev;
  const cat = CAT[ev.category] || CAT.other;
  const color = (ev.memberIds && ev.memberIds.length === 1 && memberById(ev.memberIds[0])?.color) || 'var(--accent)';
  const to = ev.driverTo && memberById(ev.driverTo);
  const from = ev.driverFrom && memberById(ev.driverFrom);
  const plan = isPlanned(ev);
  const c = plan && checkins[`${ev.id}@${inst.date}`];
  const state = c ? c.state : null;
  const toggle = () => {
    if (state === 'moved') return openEvent(ev, inst.date);
    act.checkin(ev, inst.date, state ? null : 'done').then(() => !state && toast('Nice work! 🎉')).catch(() => {});
  };
  return (
    <div role="button" tabindex="0" class={`event-row ${compact ? 'compact' : ''} ${plan ? 'plan' : ''} ${state ? 'st-' + state : ''}`}
      onClick={() => openEvent(ev, inst.date)} style={{ '--c': color }}>
      {plan && (
        <button type="button" class={`plan-check ${state || ''}`} style={{ '--c': color }} onClick={(e) => { e.stopPropagation(); toggle(); }}
          aria-label={state === 'done' ? 'Mark not done' : 'Mark done'}>
          {state === 'done' && <Check size={15} strokeWidth={3.2} />}
          {state === 'missed' && <X size={15} strokeWidth={3} />}
          {state === 'moved' && <CornerUpRight size={14} strokeWidth={2.6} />}
        </button>
      )}
      <div class="event-time">
        {ev.allDay || !ev.start ? <span class="allday">All day</span> : <><b>{fmtTime(ev.start)}</b>{ev.end && !compact && <span>{fmtTime(ev.end)}</span>}</>}
      </div>
      <div class="event-main">
        <div class="event-title">
          <span class="emoji">{cat.emoji}</span>
          <span class="t">{ev.title}</span>
          {conflicts && conflicts.length > 0 && !state && <TriangleAlert size={16} class="warn-ic" />}
        </div>
        {c && <div class={`status-line ${state}`}>{statusText(c, memberById, today)}</div>}
        {!compact && !c && (
          <div class="event-meta">
            {ev.movedFrom && <span class="meta"><CornerUpRight size={14} />Moved from {fmtDayLabel(ev.movedFrom.date, today)}</span>}
            {(to || from) && (
              <span class="meta"><Car size={14} />
                {to && from && to.id === from.id ? to.name : [to && `${to.name} drops off`, from && `${from.name} picks up`].filter(Boolean).join(' · ')}
              </span>
            )}
            {ev.location && <span class="meta"><MapPin size={14} />{ev.location}</span>}
            {ev.bring && <span class="meta"><Backpack size={14} />{ev.bring}</span>}
          </div>
        )}
      </div>
      <Dots ids={ev.memberIds} members={members} />
    </div>
  );
}

// Buttons to check in on a planned event: done / didn't do it / move.
export function CheckInButtons({ ev, date, onDone, small, icons }) {
  const { checkins, act } = useApp();
  const [moving, setMoving] = useState(false);
  const c = checkins[`${ev.id}@${date}`];
  const missed = async () => {
    const v = await confirmBox({ title: 'Didn’t happen?', message: 'Want to move it to another time?',
      options: [{ label: '↪ Move to later', value: 'move', primary: true }, { label: 'Just mark it missed', value: 'missed' }] });
    if (v === 'move') setMoving(true);
    else if (v === 'missed') { await act.checkin(ev, date, 'missed'); onDone && onDone(); }
  };
  if (c) {
    return (
      <div class={`row-btns ${small ? 'small' : ''}`}>
        <button class="btn ghost" onClick={async () => { await act.checkin(ev, date, null); }}>Undo</button>
        {c.state === 'missed' && <button class="btn soft" onClick={() => setMoving(true)}><CornerUpRight size={16} /> Move to later</button>}
        {moving && <MoveSheet ev={ev} date={date} onClose={() => { setMoving(false); onDone && onDone(); }} />}
      </div>
    );
  }
  if (icons) {
    return (
      <div class="icon-checkins">
        <button class="ic done" aria-label="Done" onClick={async () => { await act.checkin(ev, date, 'done'); toast('Nice work! 🎉'); }}><Check size={18} strokeWidth={3} /></button>
        <button class="ic" aria-label="Didn’t do it" onClick={missed}><X size={18} strokeWidth={2.6} /></button>
        <button class="ic" aria-label="Move" onClick={() => setMoving(true)}><CornerUpRight size={18} strokeWidth={2.4} /></button>
        {moving && <MoveSheet ev={ev} date={date} onClose={() => { setMoving(false); onDone && onDone(); }} />}
      </div>
    );
  }
  return (
    <div class={`row-btns ${small ? 'small' : ''}`}>
      <button class="btn done-btn" onClick={async () => { await act.checkin(ev, date, 'done'); toast('Nice work! 🎉'); onDone && onDone(); }}><Check size={16} /> Done</button>
      <button class="btn ghost" onClick={missed}><X size={16} /> Missed</button>
      <button class="btn ghost" onClick={() => setMoving(true)}><CornerUpRight size={16} /> Move</button>
      {moving && <MoveSheet ev={ev} date={date} onClose={() => { setMoving(false); onDone && onDone(); }} />}
    </div>
  );
}

function MoveSheet({ ev, date, onClose }) {
  const { act, today, tz, checkins } = useApp();
  const now = partsIn(new Date(), tz).time;
  const nowMin = toMinutes(now);
  const laterMin = Math.ceil((nowMin + 120) / 30) * 30;
  const later = laterMin < 22 * 60 ? `${pad(Math.floor(laterMin / 60))}:${pad(laterMin % 60)}` : null;
  const sat = addDays(today, ((6 - weekday(today)) + 7) % 7 || 7);
  const [d, setD] = useState(addDays(date > today ? date : today, 1));
  const [t, setT] = useState(ev.start || '');
  const go = async (nd, nt) => {
    await act.moveOccurrence(ev, date, nd, nt || null);
    toast(`Moved to ${fmtDayLabel(nd, today).toLowerCase()}${nt ? ' at ' + fmtTime(nt) : ''}`);
    onClose();
  };
  return (
    <Sheet title={`Move “${ev.title}”`} onClose={onClose}>
      <div class="form">
        {later && <button class="btn block soft" onClick={() => go(today, later)}>Later today · {fmtTime(later)}</button>}
        <button class="btn block soft" onClick={() => go(addDays(today, 1), ev.start)}>Tomorrow{ev.start ? ' · ' + fmtTime(ev.start) : ''}</button>
        <button class="btn block soft" onClick={() => go(sat, ev.start || '09:00')}>{fmtDayLabel(sat, today)} · {fmtTime(ev.start || '09:00')}</button>
        <div class="divider"><span>or pick a time</span></div>
        <div class="row2">
          <Field label="Day"><input type="date" value={d} min={today} onInput={(e) => setD(e.currentTarget.value)} /></Field>
          <Field label="Time"><input type="time" value={t} onInput={(e) => setT(e.currentTarget.value)} /></Field>
        </div>
        <button class="btn primary block" disabled={!d} onClick={() => go(d, t)}>Move it</button>
      </div>
    </Sheet>
  );
}

export function EventDetail({ ev, date, onClose }) {
  const { memberById, isParent, act, events, openEditor, today, checkins } = useApp();
  const cat = CAT[ev.category] || CAT.other;
  const recurring = ev.repeat && ev.repeat.freq && ev.repeat.freq !== 'none';
  const plan = isPlanned(ev);
  const myCheck = checkins[`${ev.id}@${date}`];
  const conflicts = useMemo(() => {
    if (myCheck && myCheck.state !== 'done') return [];
    return conflictsForDraft({ ...ev, date, repeat: { freq: 'none' } }, events, date)
      .filter((c) => !['moved', 'missed'].includes(checkins[c.other.key]?.state));
  }, [ev, date, events, checkins]);
  const who = (ev.memberIds || []).map(memberById).filter(Boolean);

  const del = async () => {
    if (recurring) {
      const v = await confirmBox({ title: 'Delete repeating event', message: `“${ev.title}” repeats. What do you want to delete?`,
        options: [{ label: `Just ${fmtDayLabel(date, today)}`, value: 'one' }, { label: 'All of them', value: 'all', danger: true }] });
      if (!v) return;
      if (v === 'one') await act.update('events', ev.id, { exceptions: [...(ev.exceptions || []), date] });
      else await act.remove('events', ev.id);
    } else {
      if (!(await confirmBox({ title: 'Delete event?', message: `“${ev.title}” will be removed for everyone.`, ok: 'Delete', danger: true }))) return;
      await act.remove('events', ev.id);
    }
    toast('Deleted');
    onClose();
  };

  return (
    <Sheet title="" onClose={onClose}
      actions={isParent && <button class="icon-btn" onClick={() => openEditor(ev)} aria-label="Edit"><Pencil size={20} /></button>}>
      <div class="detail-head">
        <span class="detail-emoji">{cat.emoji}</span>
        <div>
          <h2 class="detail-title">{ev.title}</h2>
          <div class="detail-sub">{cat.label} · {plan ? 'Planned time' : 'On the calendar'}</div>
        </div>
      </div>
      {plan && (
        <div class={`checkin-box ${myCheck ? 'st-' + myCheck.state : ''}`}>
          <div class="checkin-title">{myCheck ? statusText(myCheck, memberById, today) : date > today ? 'Planned' : 'How did it go?'}</div>
          <CheckInButtons ev={ev} date={date} />
        </div>
      )}
      <div class="detail-list">
        <div class="detail-item"><Clock size={18} /><div><b>{fmtDayLabel(date, today)}</b><div>{fmtTimeRange(ev.allDay ? null : ev.start, ev.end)}</div></div></div>
        {recurring && <div class="detail-item"><Repeat size={18} /><div>{describeRepeat(ev.repeat)}</div></div>}
        {who.length > 0 && (
          <div class="detail-item people"><span class="lbl">Who</span><div class="people-list">{who.map((m) => <span class="person"><Avatar m={m} size={24} />{m.name}</span>)}</div></div>
        )}
        {(ev.driverTo || ev.driverFrom) && (
          <div class="detail-item"><Car size={18} /><div>
            {ev.driverTo && <div>Drop-off: <b>{memberById(ev.driverTo)?.name}</b></div>}
            {ev.driverFrom && <div>Pick-up: <b>{memberById(ev.driverFrom)?.name}</b></div>}
          </div></div>
        )}
        {ev.location && <a class="detail-item link" href={mapsUrl(ev.location)} target="_blank" rel="noopener"><MapPin size={18} /><div>{ev.location}<div class="hint">Open in Maps</div></div></a>}
        {ev.bring && <div class="detail-item"><Backpack size={18} /><div><span class="lbl-inline">Bring:</span> {ev.bring}</div></div>}
        {ev.reminders && ev.reminders.length > 0 && (
          <div class="detail-item"><Bell size={18} /><div>{ev.reminders.slice().sort((a, b) => a - b).map((r) => REMINDER_LABEL[r] || `${r} min before`).join(', ')}{ev.remindAll ? ' · everyone' : ''}</div></div>
        )}
        {ev.notes && <div class="detail-notes">{ev.notes}</div>}
      </div>
      {conflicts.length > 0 && (
        <div class="warn-box"><TriangleAlert size={18} /><div>
          <b>Schedule conflict</b>
          {conflicts.map((c) => <div>{c.people.map((p) => memberById(p)?.name).join(' & ')} also {c.people.length > 1 ? 'have' : 'has'} <b>{c.other.ev.title}</b> at {fmtTime(c.other.ev.start)}</div>)}
        </div></div>
      )}
      {isParent ? (
        <div class="detail-actions">
          <button class="btn" onClick={() => openEditor(ev)}><Pencil size={16} /> Edit{recurring ? ' series' : ''}</button>
          <button class="btn danger-outline" onClick={del}><Trash2 size={16} /> Delete</button>
        </div>
      ) : <p class="hint center">Only parents can change or delete events.</p>}
    </Sheet>
  );
}

function dayPhrase(d, today) {
  const l = fmtDayLabel(d, today);
  return l === 'Today' || l === 'Tomorrow' ? l.toLowerCase() : 'on ' + l;
}

const DEFAULTS = {
  birthday: { allDay: true, repeat: { freq: 'yearly', interval: 1 }, reminders: [10080, 1440] },
  practice: { reminders: [60] },
  game: { reminders: [1440, 60] },
  appointment: { reminders: [1440, 60] },
};

function roundedNow() {
  const d = new Date();
  let h = d.getHours() + 1;
  if (h > 22) h = 17;
  return `${pad(h)}:00`;
}
function plusHour(t) {
  const m = Math.min(toMinutes(t) + 60, 23 * 60 + 59);
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export function EventEditor({ draft, onClose }) {
  const { members, act, events, today, isParent, me } = useApp();
  const isNew = !draft.id;
  const start0 = draft.start || roundedNow();
  const [f, setF] = useState(() => ({
    title: '', category: 'other', memberIds: isNew && !isParent ? [me.id] : [], date: today, allDay: false,
    start: start0, end: plusHour(start0), location: '', bring: '', notes: '', driverTo: null, driverFrom: null,
    reminders: [], remindAll: false,
    ...draft,
    repeat: { freq: 'none', interval: 1, days: [], until: null, ...(draft.repeat || {}) },
  }));
  const [busy, setBusy] = useState(false);
  const set = (p) => setF((x) => ({ ...x, ...p }));

  const pickCategory = (id) => {
    const d = DEFAULTS[id];
    if (isNew && d) set({ category: id, ...d, repeat: { ...f.repeat, ...(d.repeat || {}) } });
    else set({ category: id, ...(id === 'birthday' ? { allDay: true } : {}) });
    set({ track: undefined }); // follow the category's default unless changed below
  };
  const planned = isPlanned(f);

  const save = async () => {
    if (!f.title.trim()) return toast('Add a title', 'err');
    if (!f.allDay && f.start && f.end && f.end <= f.start) return toast('End time must be after start', 'err');
    const r = f.repeat;
    const out = {
      title: f.title.trim(), category: f.category, memberIds: f.memberIds, date: f.date, allDay: !!f.allDay,
      start: f.allDay ? null : f.start || null, end: f.allDay ? null : f.end || null,
      location: f.location.trim(), bring: f.bring.trim(), notes: f.notes.trim(),
      driverTo: f.driverTo || null, driverFrom: f.driverFrom || null,
      reminders: f.reminders, remindAll: !!f.remindAll,
      track: typeof f.track === 'boolean' ? f.track : null,
      repeat: r.freq === 'none' ? { freq: 'none' } : { freq: r.freq, interval: Number(r.interval) || 1, days: r.freq === 'weekly' ? (r.days.length ? r.days : [weekday(f.date)]) : [], until: r.until || null },
      exceptions: f.exceptions || [],
    };
    const conf = conflictsForDraft({ ...out, id: draft.id }, events, addMonths(f.date, 2));
    if (conf.length) {
      const c = conf[0];
      const names = c.people.map((p) => members.find((m) => m.id === p)?.name).join(' & ');
      const ok = await confirmBox({
        title: 'Heads up: schedule conflict',
        message: `${names} ${c.people.length > 1 ? 'are' : 'is'} already busy with “${c.other.ev.title}” ${dayPhrase(c.date, today)} at ${fmtTime(c.other.ev.start)}${conf.length > 1 ? ` (and ${conf.length - 1} more)` : ''}. Save anyway?`,
        ok: 'Save anyway',
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      if (isNew) await act.add('events', out);
      else await act.update('events', draft.id, out);
      toast(isNew ? 'Added to the calendar' : 'Saved');
      onClose();
    } catch {}
    setBusy(false);
  };

  const r = f.repeat;
  const setR = (p) => set({ repeat: { ...r, ...p } });

  return (
    <Sheet title={isNew ? 'New event' : 'Edit event'} onClose={onClose} tall
      actions={<button class="btn primary small" onClick={save} disabled={busy}>Save</button>}>
      <div class="form">
        <input class="title-input" value={f.title} onInput={(e) => set({ title: e.currentTarget.value })} placeholder={f.category === 'birthday' ? "Whose birthday? e.g. Grandma's birthday" : 'What’s happening?'} autofocus={isNew} />

        <div class="cat-group-label">📅 On the calendar <span>just remember it</span></div>
        <div class="cat-grid">
          {CATEGORIES.filter((c) => c.kind === 'event').map((c) => (
            <button type="button" class={`cat ${f.category === c.id ? 'on' : ''}`} onClick={() => pickCategory(c.id)}>
              <span>{c.emoji}</span>{c.label}
            </button>
          ))}
        </div>
        <div class="cat-group-label">✅ Planned time <span>check it off when it’s done</span></div>
        <div class="cat-grid four">
          {CATEGORIES.filter((c) => c.kind === 'plan').map((c) => (
            <button type="button" class={`cat plan ${f.category === c.id ? 'on' : ''}`} onClick={() => pickCategory(c.id)}>
              <span>{c.emoji}</span>{c.label}
            </button>
          ))}
        </div>
        <Toggle label="Check off when done (done / missed / move)" checked={planned} onChange={(v) => set({ track: v })} />

        <Field label="Who"><MemberChips members={members} value={f.memberIds} onChange={(v) => set({ memberIds: v })} /></Field>
        {f.memberIds.length === 0 && <p class="hint tight">Nobody selected = whole family</p>}

        <div class="group">
          <Field label="Date"><input type="date" value={f.date} onInput={(e) => set({ date: e.currentTarget.value })} /></Field>
          <Toggle label="All day" checked={f.allDay} onChange={(v) => set({ allDay: v })} />
          {!f.allDay && (
            <div class="row2">
              <Field label="Starts"><input type="time" value={f.start || ''} onInput={(e) => { const v = e.currentTarget.value; set({ start: v, end: f.end && f.end > v ? f.end : plusHour(v) }); }} /></Field>
              <Field label="Ends"><input type="time" value={f.end || ''} onInput={(e) => set({ end: e.currentTarget.value })} /></Field>
            </div>
          )}
        </div>

        <div class="group">
          <Field label="Repeats">
            <select value={r.freq} onChange={(e) => setR({ freq: e.currentTarget.value, days: e.currentTarget.value === 'weekly' && !r.days.length ? [weekday(f.date)] : r.days })}>
              <option value="none">Does not repeat</option>
              <option value="daily">Every day</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </Field>
          {r.freq === 'weekly' && (
            <>
              <div class="daypick">
                {DAY_NAMES.map((d, i) => (
                  <button type="button" class={r.days.includes(i) ? 'on' : ''} onClick={() => setR({ days: r.days.includes(i) ? r.days.filter((x) => x !== i) : [...r.days, i] })}>{d[0]}</button>
                ))}
              </div>
              <Field label="How often">
                <select value={r.interval} onChange={(e) => setR({ interval: Number(e.currentTarget.value) })}>
                  <option value={1}>Every week</option><option value={2}>Every 2 weeks</option><option value={3}>Every 3 weeks</option><option value={4}>Every 4 weeks</option>
                </select>
              </Field>
            </>
          )}
          {r.freq !== 'none' && (
            <Field label="Ends" hint="Leave blank to repeat forever (great for a sports season, set the last day).">
              <input type="date" value={r.until || ''} min={f.date} onInput={(e) => setR({ until: e.currentTarget.value || null })} />
            </Field>
          )}
          {!isNew && r.freq !== 'none' && <p class="hint tight">Changes apply to every repeat.</p>}
        </div>

        <div class="group">
          <Field label="Location"><input value={f.location} onInput={(e) => set({ location: e.currentTarget.value })} placeholder="Address or place name" /></Field>
          <Field label="Bring"><input value={f.bring} onInput={(e) => set({ bring: e.currentTarget.value })} placeholder="Uniform, water bottle, snack duty…" /></Field>
        </div>

        <div class="group">
          <div class="group-title"><Car size={16} /> Who’s driving?</div>
          <Field label="Drop-off"><MemberChips members={members} value={f.driverTo} multi={false} allowNone noneLabel="No one" onChange={(v) => set({ driverTo: v })} /></Field>
          <Field label="Pick-up"><MemberChips members={members} value={f.driverFrom} multi={false} allowNone noneLabel="No one" onChange={(v) => set({ driverFrom: v })} /></Field>
        </div>

        <div class="group">
          <div class="group-title"><Bell size={16} /> Reminders</div>
          <div class="chips">
            {REMINDER_OPTIONS.map((o) => (
              <button type="button" class={`chip ${f.reminders.includes(o.min) ? 'on' : ''}`}
                onClick={() => set({ reminders: f.reminders.includes(o.min) ? f.reminders.filter((x) => x !== o.min) : [...f.reminders, o.min] })}>{o.label}</button>
            ))}
          </div>
          {f.reminders.length > 0 && <Toggle label="Remind the whole family (not just who’s involved)" checked={f.remindAll} onChange={(v) => set({ remindAll: v })} />}
          {f.allDay && f.reminders.length > 0 && <p class="hint tight">All-day reminders arrive at 8am.</p>}
        </div>

        <Field label="Notes"><textarea rows={3} value={f.notes} onInput={(e) => set({ notes: e.currentTarget.value })} placeholder="Anything else to know" /></Field>
        {!isParent && <p class="hint">Once you add this, only a parent can change it, so double-check it first.</p>}
        <button class="btn primary block" onClick={save} disabled={busy}>{isNew ? 'Add event' : 'Save changes'}</button>
      </div>
    </Sheet>
  );
}
