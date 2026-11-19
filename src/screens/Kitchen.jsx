import { useEffect, useMemo, useState } from 'preact/hooks';
import { X, Car, MapPin } from 'lucide-preact';
import { useApp } from '../app.jsx';
import { Dots } from '../ui.jsx';
import { expand } from '../lib/recur.js';
import { addDays, parseDate, DAY_NAMES_LONG, MONTH_NAMES, fmtTimeRange, partsIn, fmtTime } from '../lib/dates.js';
import { CAT, MEAL_SLOTS } from '../lib/constants.js';
import { choreBoard } from '../lib/routines.js';

export function Kitchen({ onExit }) {
  const { events, today, tz, members, mealPlan, recipes, grocery, chores, memberById, routines, routineDone, checkins, act } = useApp();
  const board = useMemo(() => choreBoard(routines, routineDone, today).filter((x) => (x.group === 'today' || x.group === 'overdue') && x.moved !== 'from' && x.status?.state !== 'missed'), [routines, routineDone, today]);
  const [now, setNow] = useState(() => partsIn(new Date(), tz).time);
  useEffect(() => {
    const id = setInterval(() => setNow(partsIn(new Date(), tz).time), 15000);
    let lock = null;
    (async () => { try { lock = await navigator.wakeLock?.request('screen'); } catch {} })();
    return () => { clearInterval(id); try { lock && lock.release(); } catch {} };
  }, []);
  const days = useMemo(() => expand(events, today, addDays(today, 1)), [events, today]);
  const d = parseDate(today);
  const meal = (date, slot) => {
    const p = mealPlan[`${date}_${slot}`];
    return p && (p.mealId ? recipes.find((r) => r.id === p.mealId)?.name : p.text);
  };
  const Day = ({ date, label }) => {
    const list = days.filter((i) => i.date === date);
    return (
      <div class="k-col">
        <h2>{label}</h2>
        {list.length ? list.map((i) => {
          const to = i.ev.driverTo && memberById(i.ev.driverTo);
          const from = i.ev.driverFrom && memberById(i.ev.driverFrom);
          return (
            <div class="k-event">
              <div class="k-time">{i.ev.allDay || !i.ev.start ? 'All day' : fmtTime(i.ev.start)}</div>
              <div class="k-body">
                <div class="k-title">{(CAT[i.ev.category] || CAT.other).emoji} {i.ev.title}{checkins[i.key]?.state === 'done' ? ' ✅' : ''}</div>
                <div class="k-meta">
                  {!i.ev.allDay && i.ev.end && <span>{fmtTimeRange(i.ev.start, i.ev.end)}</span>}
                  {(to || from) && <span><Car size={16} /> {[to && to.name, from && from !== to && from.name].filter(Boolean).join(' → ')}</span>}
                  {i.ev.location && <span><MapPin size={16} /> {i.ev.location}</span>}
                </div>
              </div>
              <Dots ids={i.ev.memberIds} members={members} />
            </div>
          );
        }) : <div class="k-empty">Nothing scheduled</div>}
      </div>
    );
  };
  const [hh, mm] = now.split(':').map(Number);
  return (
    <div class="kitchen" onDblClick={onExit}>
      <button class="k-exit" onClick={onExit} aria-label="Exit"><X size={22} /></button>
      <div class="k-top">
        <div class="k-clock">{(hh % 12) || 12}:{String(mm).padStart(2, '0')}<small>{hh >= 12 ? 'pm' : 'am'}</small></div>
        <div class="k-date">{DAY_NAMES_LONG[d.getUTCDay()]}<br /><b>{MONTH_NAMES[d.getUTCMonth()]} {d.getUTCDate()}</b></div>
      </div>
      <div class="k-grid">
        <Day date={today} label="Today" />
        <Day date={addDays(today, 1)} label="Tomorrow" />
        <div class="k-col side">
          <h2>Meals today</h2>
          {MEAL_SLOTS.map((s) => <div class="k-meal"><span>{s.emoji} {s.label}</span><b>{meal(today, s.id) || '—'}</b></div>)}
          <h2>Chores today</h2>
          {board.map((x) => {
            const m = x.who.length === 1 && memberById(x.who[0]);
            return (
              <button class={`k-todo ${x.done ? 'done' : ''}`} onClick={() => act.choreSet(x.r, x.slot, x.done ? null : 'done', x.status)}>
                <i style={{ background: x.done ? 'var(--ok)' : m ? m.color : 'var(--accent)' }} />{x.r.title}{m ? <small> · {m.name}</small> : ''}{x.done ? ' ✓' : ''}
              </button>
            );
          })}
          {!board.length && <div class="k-empty">All done 🎉</div>}
          <h2>To-dos</h2>
          {chores.filter((c) => !c.done && (!c.due || c.due <= today)).slice(0, 6).map((c) => {
            const m = c.assignee && memberById(c.assignee);
            return <div class="k-todo"><i style={{ background: m ? m.color : 'var(--accent)' }} />{c.title}</div>;
          })}
          <div class="k-grocery">🛒 {grocery.filter((g) => !g.done).length} on the grocery list</div>
        </div>
      </div>
    </div>
  );
}
