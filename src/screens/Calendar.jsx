import { useMemo, useState } from 'preact/hooks';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-preact';
import { useApp } from '../app.jsx';
import { Seg, Empty } from '../ui.jsx';
import { EventRow } from './Event.jsx';
import { filterForMember } from './Today.jsx';
import { expand } from '../lib/recur.js';
import { findConflicts } from '../lib/conflicts.js';
import { addDays, startOfWeek, startOfMonth, addMonths, parseDate, MONTH_NAMES, DAY_NAMES, fmtDayLabel, fmtShortDate } from '../lib/dates.js';

export function Calendar() {
  const { today, events, members, openEditor, checkins } = useApp();
  const [view, setView] = useState('week');
  const [anchor, setAnchor] = useState(today);
  const [selected, setSelected] = useState(today);
  const [who, setWho] = useState('all');
  const [showPast, setShowPast] = useState(false);

  const range = view === 'week'
    ? [startOfWeek(anchor), addDays(startOfWeek(anchor), 6)]
    : [startOfWeek(startOfMonth(anchor)), addDays(startOfWeek(startOfMonth(anchor)), 41)];

  const all = useMemo(() => expand(events, range[0], range[1]), [events, range[0], range[1]]);
  const conflicts = useMemo(() => findConflicts(all.filter((i) => !['moved', 'missed'].includes(checkins[i.key]?.state))), [all, checkins]);
  const insts = who === 'all' ? all : all.filter((i) => filterForMember(i, who));
  const byDay = useMemo(() => {
    const m = {};
    for (const i of insts) (m[i.date] ||= []).push(i);
    return m;
  }, [insts]);

  const move = (n) => {
    const a = view === 'week' ? addDays(anchor, 7 * n) : addMonths(startOfMonth(anchor), n);
    setAnchor(a);
    if (view === 'month') setSelected(a.slice(0, 7) === today.slice(0, 7) ? today : a);
  };
  const title = view === 'week'
    ? `${fmtShortDate(range[0])} – ${fmtShortDate(range[1])}`
    : `${MONTH_NAMES[parseDate(anchor).getUTCMonth()]} ${parseDate(anchor).getUTCFullYear()}`;

  const days = [];
  for (let d = range[0]; d <= range[1]; d = addDays(d, 1)) days.push(d);

  return (
    <div class="page">
      <header class="page-head">
        <h1>Calendar</h1>
        <Seg value={view} onChange={(v) => { setView(v); setAnchor(selected); }} options={[{ value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]} />
      </header>

      <div class="chips scroll filter">
        <button class={`chip ${who === 'all' ? 'on' : ''}`} onClick={() => setWho('all')}>Everyone</button>
        {members.map((m) => (
          <button class={`chip member ${who === m.id ? 'on' : ''}`} style={who === m.id ? { background: m.color, borderColor: m.color } : {}} onClick={() => setWho(m.id)}>
            <span class="dot" style={{ background: who === m.id ? '#fff' : m.color }} />{m.name}
          </button>
        ))}
      </div>

      <div class="cal-nav">
        <button class="icon-btn" onClick={() => move(-1)} aria-label="Previous"><ChevronLeft size={22} /></button>
        <button class="cal-title" onClick={() => { setAnchor(today); setSelected(today); }}>{title}</button>
        <button class="icon-btn" onClick={() => move(1)} aria-label="Next"><ChevronRight size={22} /></button>
      </div>

      {view === 'week' ? (
        <div class="week">
          {!showPast && days.some((d) => d < today) && days.some((d) => d >= today) && (
            <button class="link-btn show-past" onClick={() => setShowPast(true)}>Show earlier this week</button>
          )}
          {days.filter((d) => showPast || d >= today || !days.some((x) => x >= today)).map((d) => (
            <section class={`card day ${d === today ? 'is-today' : ''} ${d < today ? 'past' : ''}`}>
              <div class="day-head">
                <span class="day-name">{fmtDayLabel(d, today)}</span>
                <button class="icon-btn small" onClick={() => openEditor({ date: d })} aria-label="Add on this day"><Plus size={18} /></button>
              </div>
              {(byDay[d] || []).map((i) => <EventRow inst={i} conflicts={conflicts.get(i.key)} />)}
              {!(byDay[d] || []).length && <div class="day-empty">Free</div>}
            </section>
          ))}
        </div>
      ) : (
        <>
          <div class="month card">
            <div class="month-grid head">{DAY_NAMES.map((n) => <span>{n[0]}</span>)}</div>
            <div class="month-grid">
              {days.map((d) => {
                const list = byDay[d] || [];
                const colors = [];
                for (const i of list) {
                  const ids = i.ev.memberIds && i.ev.memberIds.length ? i.ev.memberIds : ['_fam'];
                  for (const id of ids) {
                    const c = id === '_fam' ? 'var(--accent)' : members.find((m) => m.id === id)?.color;
                    if (c && !colors.includes(c)) colors.push(c);
                  }
                }
                const out = d.slice(0, 7) !== anchor.slice(0, 7);
                return (
                  <button class={`mday ${out ? 'out' : ''} ${d === today ? 'today' : ''} ${d === selected ? 'sel' : ''}`} onClick={() => setSelected(d)}>
                    <span class="num">{parseDate(d).getUTCDate()}</span>
                    <span class="mdots">{colors.slice(0, 4).map((c) => <i style={{ background: c }} />)}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <section class="card">
            <div class="card-head">
              <h2>{fmtDayLabel(selected, today)}</h2>
              <button class="icon-btn small" onClick={() => openEditor({ date: selected })} aria-label="Add"><Plus size={18} /></button>
            </div>
            {(byDay[selected] || []).map((i) => <EventRow inst={i} conflicts={conflicts.get(i.key)} />)}
            {!(byDay[selected] || []).length && <Empty emoji="📭" title="Nothing on this day" />}
          </section>
        </>
      )}
    </div>
  );
}
