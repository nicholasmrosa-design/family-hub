import { createContext } from 'preact';
import { useContext, useEffect, useMemo, useState } from 'preact/hooks';
import { House, CalendarDays, UtensilsCrossed, ListChecks, Ellipsis, Plus } from 'lucide-preact';
import { todayIn, toMinutes, pad } from './lib/dates.js';
import { checkinMap, checkinId } from './lib/checkins.js';
import { Overlays, toast } from './ui.jsx';
import { Login } from './screens/Login.jsx';
import { Today } from './screens/Today.jsx';
import { Calendar } from './screens/Calendar.jsx';
import { Meals } from './screens/Meals.jsx';
import { Lists } from './screens/Lists.jsx';
import { More } from './screens/More.jsx';
import { Kitchen } from './screens/Kitchen.jsx';
import { EventDetail, EventEditor } from './screens/Event.jsx';
import { QuickAdd } from './screens/QuickAdd.jsx';

export const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

const SESSION_KEY = 'familyhub.session';
export const FAMILY_KEY = 'familyhub.family'; // remembered family on this phone (skip the passcode next time)
export function rememberFamily(fid) { try { fid ? localStorage.setItem(FAMILY_KEY, fid) : localStorage.removeItem(FAMILY_KEY); } catch {} }
export function rememberedFamily() { try { return localStorage.getItem(FAMILY_KEY); } catch { return null; } }
function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
}

export function App({ store, config }) {
  const [session, setSession] = useState(loadSession);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    store.ready.then(() => setReady(true)).catch((e) => setErr(e));
  }, []);

  const saveSession = (s) => {
    try {
      if (s) rememberFamily(s.fid);
      if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
      else localStorage.removeItem(SESSION_KEY);
    } catch {}
    setSession(s);
  };

  let body;
  if (err) body = <div class="center-screen"><div class="empty"><div class="empty-emoji">⚠️</div><div class="empty-title">Couldn't connect</div><div class="empty-text">{String(err.message || err)}</div><button class="btn primary" onClick={() => location.reload()}>Try again</button></div></div>;
  else if (!ready) body = <div class="center-screen"><div class="spinner" /></div>;
  else if (!session) body = <Login store={store} onDone={saveSession} />;
  else body = <Main store={store} config={config} session={session} setSession={saveSession} />;

  return <>{body}<Overlays /></>;
}

function useCollection(store, fid, name, onErr) {
  const [rows, setRows] = useState(null);
  useEffect(() => store.watch(fid, name, setRows, onErr), [fid, name]);
  return rows;
}

function Main({ store, config, session, setSession }) {
  const { fid } = session;
  const [family, setFamily] = useState(undefined);
  const onErr = (e) => {
    console.error(e);
    if (String(e && e.code).includes('permission')) {
      toast('Please sign in again', 'err');
      setSession(null);
    }
  };
  useEffect(() => store.watchFamily(fid, setFamily, onErr), [fid]);
  const events = useCollection(store, fid, 'events', onErr);
  const recipes = useCollection(store, fid, 'recipes', onErr);
  const planRows = useCollection(store, fid, 'mealPlan', onErr);
  const grocery = useCollection(store, fid, 'grocery', onErr);
  const chores = useCollection(store, fid, 'chores', onErr);
  const checkinRows = useCollection(store, fid, 'checkins', onErr);
  const routines = useCollection(store, fid, 'routines', onErr);
  const routineDoneRows = useCollection(store, fid, 'routineDone', onErr);

  const tz = (family && family.tz) || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [today, setToday] = useState(() => todayIn(tz));
  useEffect(() => {
    setToday(todayIn(tz));
    const id = setInterval(() => setToday(todayIn(tz)), 30000);
    return () => clearInterval(id);
  }, [tz]);

  const [tab, setTab] = useState('today');
  const [detail, setDetail] = useState(null); // {ev, date}
  const [editor, setEditor] = useState(null); // draft event
  const [quick, setQuick] = useState(false);
  const [kitchen, setKitchen] = useState(false);
  const [listTab, setListTab] = useState('grocery');

  useEffect(() => {
    if (family === null) { toast('Family not found', 'err'); setSession(null); }
  }, [family]);

  const value = useMemo(() => {
    if (!family) return null;
    const members = family.members || [];
    const me = members.find((m) => m.id === session.memberId) || { id: session.memberId, name: '?', color: '#888' };
    const isParent = session.role === 'parent';
    const guard = (p) => p.catch((e) => {
      console.error(e);
      toast(String(e.code || e.message).includes('permission') ? 'Only a parent can do that' : 'Couldn’t save. Check your connection.', 'err');
      throw e;
    });
    const act = {
      add: (c, d) => guard(store.add(fid, c, { ...d, createdBy: me.id })),
      set: (c, id, d) => guard(store.set(fid, c, id, d)),
      update: (c, id, p) => guard(store.update(fid, c, id, p)),
      remove: (c, id) => guard(store.remove(fid, c, id)),
      updateFamily: (p) => guard(store.updateFamily(fid, p)),
      // Planned events: mark one occurrence done / missed, or clear it.
      checkin: (ev, date, state, extra = {}) => state
        ? guard(store.set(fid, 'checkins', checkinId(ev.id, date), { eventId: ev.id, date, state, by: me.id, uid: store.uid(), at: Date.now(), ...extra }))
        : guard(store.remove(fid, 'checkins', checkinId(ev.id, date))),
      // Move one occurrence: a new one-off event at the new time, and the old one marked "moved".
      moveOccurrence: async (ev, date, newDate, newStart) => {
        let newEnd = null;
        if (newStart && ev.start && ev.end) {
          const m = toMinutes(newStart) + (toMinutes(ev.end) - toMinutes(ev.start));
          newEnd = m < 24 * 60 ? `${pad(Math.floor(m / 60))}:${pad(m % 60)}` : '23:59';
        }
        const { id, createdAt, updatedAt, createdBy, exceptions, repeat, ...rest } = ev;
        await guard(store.add(fid, 'events', { ...rest, date: newDate, start: newStart || ev.start || null, end: newEnd || ev.end || null, repeat: { freq: 'none' }, exceptions: [], movedFrom: { id: ev.id, date }, createdBy: me.id }));
        await guard(store.set(fid, 'checkins', checkinId(ev.id, date), { eventId: ev.id, date, state: 'moved', movedTo: { date: newDate, start: newStart || null }, by: me.id, uid: store.uid(), at: Date.now() }));
      },
      // Chores: state = 'done' | 'missed' | 'moved' | null (undo). A moved chore keeps its movedTo
      // so it shows on the new day; undoing a check-off on a moved chore puts it back to "moved".
      choreSet: (r, slot, state, prev, extra = {}) => {
        const id = `${r.id}_${slot.key}`;
        if (!state) {
          if (prev && prev.movedTo && prev.state !== 'moved') return guard(store.set(fid, 'routineDone', id, { ...prev, state: 'moved', by: me.id, uid: store.uid(), at: Date.now() }));
          return guard(store.remove(fid, 'routineDone', id));
        }
        const movedTo = extra.movedTo || (prev && prev.movedTo) || null;
        return guard(store.set(fid, 'routineDone', id, { routineId: r.id, key: slot.key, state, by: me.id, uid: store.uid(), at: Date.now(), ...(movedTo ? { movedTo } : {}) }));
      },
    };
    const mealPlan = Object.fromEntries((planRows || []).map((r) => [r.id, r]));
    return {
      store, config, fid, family, members, me, isParent, role: session.role, tz, today,
      events: events || [], recipes: recipes || [], mealPlan, grocery: grocery || [], chores: chores || [],
      checkins: checkinMap(checkinRows), routines: routines || [],
      routineDone: Object.fromEntries((routineDoneRows || []).map((r) => [r.id, r])),
      memberById: (id) => members.find((m) => m.id === id),
      act, session, setSession,
      go: setTab, tab, listTab, setListTab,
      openEvent: (ev, date) => setDetail({ ev, date }),
      openEditor: (draft) => { setDetail(null); setEditor(draft || {}); },
      openKitchen: () => setKitchen(true),
      openQuick: () => setQuick(true),
    };
  }, [family, events, recipes, planRows, grocery, chores, checkinRows, routines, routineDoneRows, today, session, tab, listTab]);

  if (!value) return <div class="center-screen"><div class="spinner" /></div>;

  if (kitchen) return <Ctx.Provider value={value}><Kitchen onExit={() => setKitchen(false)} /></Ctx.Provider>;

  const tabs = [
    { id: 'today', label: 'Today', Icon: House },
    { id: 'calendar', label: 'Calendar', Icon: CalendarDays },
    { id: 'meals', label: 'Meals', Icon: UtensilsCrossed },
    { id: 'lists', label: 'Lists', Icon: ListChecks },
    { id: 'more', label: 'More', Icon: Ellipsis },
  ];
  const Screen = { today: Today, calendar: Calendar, meals: Meals, lists: Lists, more: More }[tab];
  // Keep the live event object in the detail sheet so edits show up immediately.
  const liveDetail = detail && { ...detail, ev: value.events.find((e) => e.id === detail.ev.id) || detail.ev };

  return (
    <Ctx.Provider value={value}>
      {store.mode === 'demo' && <div class="demo-banner">Demo mode · data stays on this device</div>}
      <main class="screen" key={tab}><Screen /></main>
      {tab !== 'more' && (
        <button class="fab" onClick={() => (tab === 'calendar' ? value.openEditor({}) : setQuick(true))} aria-label="Add">
          <Plus size={28} strokeWidth={2.5} />
        </button>
      )}
      <nav class="tabbar">
        {tabs.map(({ id, label, Icon }) => (
          <button class={tab === id ? 'on' : ''} onClick={() => { setTab(id); window.scrollTo(0, 0); }}>
            <Icon size={24} strokeWidth={tab === id ? 2.4 : 1.9} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      {liveDetail && <EventDetail ev={liveDetail.ev} date={liveDetail.date} onClose={() => setDetail(null)} />}
      {editor && <EventEditor draft={editor} onClose={() => setEditor(null)} />}
      {quick && <QuickAdd onClose={() => setQuick(false)} />}
    </Ctx.Provider>
  );
}
