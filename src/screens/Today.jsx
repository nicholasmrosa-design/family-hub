import { useMemo, useState } from 'preact/hooks';
import { TriangleAlert, ShoppingCart, ChevronRight, Monitor } from 'lucide-preact';
import { useApp } from '../app.jsx';
import { Avatar, Check, Seg, Empty } from '../ui.jsx';
import { EventRow, CheckInButtons } from './Event.jsx';
import { ChoreRow } from './Chores.jsx';
import { choreBoard } from '../lib/routines.js';
import { isPlanned, CAT } from '../lib/constants.js';
import { expand } from '../lib/recur.js';
import { findConflicts } from '../lib/conflicts.js';
import { addDays, fmtDayLabel, parseDate, DAY_NAMES_LONG, MONTH_NAMES, startOfWeek, diffDays, partsIn, toMinutes, fmtShortDate, fmtTime } from '../lib/dates.js';

export function filterForMember(inst, id) {
  const ev = inst.ev;
  return !ev.memberIds || ev.memberIds.length === 0 || ev.memberIds.includes(id) || ev.driverTo === id || ev.driverFrom === id;
}

export function Today() {
  const app = useApp();
  const { today, events, me, members, recipes, mealPlan, chores, grocery, act, go, tz, memberById, checkins, routines, routineDone } = app;
  const [scope, setScope] = useState('all');

  const week = useMemo(() => expand(events, today, addDays(today, 7)), [events, today]);
  const conflictMap = useMemo(() => findConflicts(week.filter((i) => !['moved', 'missed'].includes(checkins[i.key]?.state))), [week, checkins]);
  const scoped = scope === 'me' ? week.filter((i) => filterForMember(i, me.id)) : week;
  const todays = scoped.filter((i) => i.date === today);
  const tomorrow = scoped.filter((i) => i.date === addDays(today, 1));

  const conflictDays = useMemo(() => {
    const seen = new Set(); const out = [];
    for (const i of week) {
      const c = conflictMap.get(i.key);
      if (!c) continue;
      for (const x of c) {
        const k = [i.key, x.other.key].sort().join('|');
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({ a: i, b: x.other, people: x.people });
      }
    }
    return out;
  }, [week, conflictMap]);

  const hour = Number(partsIn(new Date(), tz).time.slice(0, 2));
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const d = parseDate(today);

  const dinner = mealPlan[`${today}_dinner`];
  const dinnerName = dinner && (dinner.mealId ? recipes.find((r) => r.id === dinner.mealId)?.name : dinner.text);
  const cook = dinner && dinner.cook && memberById(dinner.cook);

  const myChores = chores.filter((c) => !c.done && c.assignee === me.id).sort((a, b) => (a.due || '9') < (b.due || '9') ? -1 : 1);
  const groceryLeft = grocery.filter((g) => !g.done).length;

  // Workouts this week (Sun–Sat)
  const ws = startOfWeek(today);
  const workouts = useMemo(() => expand(events.filter((e) => e.category === 'workout'), ws, addDays(ws, 6)), [events, ws]);
  const nowMin = toMinutes(partsIn(new Date(), tz).time);
  const stateOf = (i) => checkins[i.key]?.state;
  const isPast = (i) => i.date < today || (i.date === today && toMinutes(i.ev.end || i.ev.start || '23:59') <= nowMin);

  // Planned items that already happened (yesterday/today) and nobody has checked in on yet.
  const pending = useMemo(() => expand(events.filter(isPlanned), addDays(today, -2), today)
    .filter((i) => isPast(i) && !checkins[i.key])
    .filter((i) => (scope === 'me' ? filterForMember(i, me.id) : true)), [events, checkins, today, nowMin, scope]);

  const board = useMemo(() => choreBoard(routines, routineDone, today), [routines, routineDone, today]);
  const myBoard = board.filter((x) => x.group !== 'month' && (scope === 'all' ? true : x.who.length === 0 || x.who.includes(me.id)));

  // Birthdays in the next 45 days
  const bdays = useMemo(() => expand(events.filter((e) => e.category === 'birthday'), today, addDays(today, 45)), [events, today]);

  return (
    <div class="page">
      <header class="page-head greet">
        <div>
          <div class="eyebrow">{DAY_NAMES_LONG[d.getUTCDay()]}, {MONTH_NAMES[d.getUTCMonth()]} {d.getUTCDate()}</div>
          <h1>{greet}, {me.name}</h1>
        </div>
        <button class="avatar-btn" onClick={() => go('more')}><Avatar m={me} size={40} /></button>
      </header>

      {conflictDays.length > 0 && (
        <div class="warn-box">
          <TriangleAlert size={18} />
          <div>
            <b>{conflictDays.length === 1 ? 'Schedule conflict this week' : `${conflictDays.length} schedule conflicts this week`}</b>
            {conflictDays.slice(0, 3).map((c) => (
              <button class="warn-line" onClick={() => app.openEvent(c.a.ev, c.a.date)}>
                {fmtDayLabel(c.a.date, today)}: {c.people.map((p) => memberById(p)?.name).join(' & ')} has <b>{c.a.ev.title}</b> and <b>{c.b.ev.title}</b>
              </button>
            ))}
          </div>
        </div>
      )}

      <section class="card">
        <div class="card-head">
          <h2>Today</h2>
          <Seg value={scope} onChange={setScope} options={[{ value: 'all', label: 'Everyone' }, { value: 'me', label: 'Just me' }]} />
        </div>
        {todays.length ? todays.map((i) => <EventRow inst={i} conflicts={conflictMap.get(i.key)} />) : (
          <Empty emoji="🌤️" title="Nothing scheduled" text="Enjoy the free time, or tap + to add something." />
        )}
      </section>

      {pending.length > 0 && (
        <section class="card checkin-card">
          <div class="card-head"><h2>✅ Did these happen?</h2>{pending.length > 5 && <span class="muted small">{pending.length} to check</span>}</div>
          {pending.slice(0, 5).map((i) => (
            <div class="pending-row">
              <div class="pending-title" onClick={() => app.openEvent(i.ev, i.date)}><span>{(CAT[i.ev.category] || CAT.other).emoji} <b>{i.ev.title}</b></span>
                <small>{fmtDayLabel(i.date, today)}{i.ev.start ? ' · ' + fmtTime(i.ev.start) : ''}{(i.ev.memberIds || []).length ? ' · ' + i.ev.memberIds.map((x) => memberById(x)?.name).filter(Boolean).join(', ') : ''}</small>
              </div>
              <CheckInButtons ev={i.ev} date={i.date} icons />
            </div>
          ))}
        </section>
      )}

      {myBoard.length > 0 && (
        <section class="card">
          <div class="card-head"><h2>🧹 Chores</h2><button class="link-btn" onClick={() => { app.setListTab('routines'); go('lists'); }}>All <ChevronRight size={16} /></button></div>
          {myBoard.slice(0, 8).map((x) => <ChoreRow row={x} />)}
        </section>
      )}

      <div class="two-col">
        <button class="card mini-card dinner" onClick={() => go('meals')}>
          <div class="mini-label">🍽️ Dinner tonight</div>
          <div class="mini-value">{dinnerName || <span class="muted">Not planned yet</span>}</div>
          {cook && <div class="mini-sub">{cook.name} is cooking</div>}
        </button>
        <button class="card mini-card" onClick={() => { app.setListTab('grocery'); go('lists'); }}>
          <div class="mini-label"><ShoppingCart size={14} /> Grocery list</div>
          <div class="mini-value">{groceryLeft} <span class="mini-unit">item{groceryLeft === 1 ? '' : 's'}</span></div>
          <div class="mini-sub">to pick up</div>
        </button>
      </div>

      {tomorrow.length > 0 && (
        <section class="card">
          <div class="card-head"><h2>Tomorrow</h2><button class="link-btn" onClick={() => go('calendar')}>Calendar <ChevronRight size={16} /></button></div>
          {tomorrow.map((i) => <EventRow inst={i} compact conflicts={conflictMap.get(i.key)} />)}
        </section>
      )}

      {myChores.length > 0 && (
        <section class="card">
          <div class="card-head"><h2>📝 My to-dos</h2><button class="link-btn" onClick={() => { app.setListTab('chores'); go('lists'); }}>All <ChevronRight size={16} /></button></div>
          {myChores.slice(0, 5).map((c) => (
            <div class="todo-row">
              <Check done={c.done} color={me.color} onClick={() => act.update('chores', c.id, { done: true, doneAt: Date.now(), doneBy: me.id })} />
              <span class="todo-text">{c.title}</span>
              {c.due && <span class={`due ${c.due < today ? 'late' : c.due === today ? 'today' : ''}`}>{c.due < today ? 'Overdue' : c.due === today ? 'Today' : fmtShortDate(c.due)}</span>}
            </div>
          ))}
        </section>
      )}

      <section class="card">
        <div class="card-head"><h2>💪 Workouts this week</h2></div>
        {members.map((m) => {
          const mine = workouts.filter((i) => (i.ev.memberIds || []).includes(m.id) && stateOf(i) !== 'moved');
          const done = mine.filter((i) => stateOf(i) === 'done').length;
          const missed = mine.filter((i) => stateOf(i) === 'missed').length;
          const left = mine.length - done - missed;
          const goal = Number(m.workoutGoal) || 0;
          const total = Math.max(goal, done + left, 1);
          return (
            <div class="progress-row">
              <Avatar m={m} size={28} />
              <div class="progress-main">
                <div class="progress-label"><b>{m.name}</b><span>{done} done{left ? ` · ${left} planned` : ''}{missed ? ` · ${missed} missed` : ''}{goal ? ` · goal ${goal}` : ''}</span></div>
                <div class="bar">
                  <span class="fill" style={{ width: `${(done / total) * 100}%`, background: m.color }} />
                  <span class="fill planned" style={{ width: `${(left / total) * 100}%`, background: m.color }} />
                  {goal > 0 && <span class="goal-mark" style={{ left: `${(goal / total) * 100}%` }} />}
                </div>
              </div>
            </div>
          );
        })}
      </section>

      {bdays.length > 0 && (
        <section class="card">
          <div class="card-head"><h2>🎂 Coming up</h2></div>
          {bdays.slice(0, 4).map((i) => {
            const n = diffDays(today, i.date);
            return (
              <button class="bday-row" onClick={() => app.openEvent(i.ev, i.date)}>
                <span class="t">{i.ev.title}</span>
                <span class={`pill ${n <= 7 ? 'hot' : ''}`}>{n === 0 ? 'Today! 🎉' : n === 1 ? 'Tomorrow' : `in ${n} days`}</span>
              </button>
            );
          })}
        </section>
      )}

      <button class="kitchen-link" onClick={app.openKitchen}><Monitor size={16} /> Kitchen display mode</button>
    </div>
  );
}
