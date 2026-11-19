import { useState } from 'preact/hooks';
import { Plus, X, Trash2, Pencil } from 'lucide-preact';
import { useApp } from '../app.jsx';
import { Seg, Sheet, Field, MemberChips, Empty, Check, Avatar, toast, confirmBox } from '../ui.jsx';
import { GROCERY_SECTIONS } from '../lib/constants.js';
import { guessSection, tidyItem } from '../lib/grocery.js';
import { fmtShortDate, addDays } from '../lib/dates.js';
import { Chores as Routines } from './Chores.jsx';

export function Lists() {
  const { listTab, setListTab } = useApp();
  return (
    <div class="page">
      <header class="page-head">
        <h1>Lists</h1>
      </header>
      <div class="seg wide"><Seg value={listTab} onChange={setListTab} options={[{ value: 'grocery', label: '🛒 Groceries' }, { value: 'routines', label: '🧹 Chores' }, { value: 'chores', label: '📝 To-dos' }]} /></div>
      {listTab === 'grocery' ? <Grocery /> : listTab === 'routines' ? <Routines /> : <Chores />}
    </div>
  );
}

function Grocery() {
  const { grocery, act, isParent, me, memberById } = useApp();
  const [text, setText] = useState('');
  const [editG, setEditG] = useState(null);
  const add = async (e) => {
    e.preventDefault();
    const items = text.split(',').map((s) => s.trim()).filter(Boolean);
    if (!items.length) return;
    setText('');
    for (const t of items) await act.add('grocery', { text: tidyItem(t), section: guessSection(t), done: false });
  };
  const toggle = (g) => act.update('grocery', g.id, g.done ? { done: false, doneBy: null, doneAt: null } : { done: true, doneBy: me.id, doneAt: Date.now() });
  const open = grocery.filter((g) => !g.done);
  const done = grocery.filter((g) => g.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  const bySection = GROCERY_SECTIONS.map((s) => [s, open.filter((g) => (g.section || 'Other') === s).sort((a, b) => a.text.localeCompare(b.text))]).filter(([, l]) => l.length);

  const clearDone = async () => {
    if (!(await confirmBox({ title: 'Clear checked items?', message: `${done.length} item${done.length === 1 ? '' : 's'} will be removed from the list.`, ok: 'Clear' }))) return;
    for (const g of done) await act.remove('grocery', g.id);
  };

  return (
    <>
      <form class="add-bar" onSubmit={add}>
        <input value={text} onInput={(e) => setText(e.currentTarget.value)} placeholder="Add items (separate with commas)" enterkeyhint="done" />
        <button class="btn primary" aria-label="Add"><Plus size={20} /></button>
      </form>
      {!open.length && !done.length && <Empty emoji="🛒" title="List is empty" text="Add items above, or send a week of meal ingredients here from the Meals tab." />}
      {bySection.map(([sec, list]) => (
        <section class="card list-card">
          <div class="section-label">{sec}</div>
          {list.map((g) => (
            <div class="todo-row">
              <Check done={false} color="var(--accent)" onClick={() => toggle(g)} />
              <span class="todo-text" onClick={() => isParent && setEditG(g)}>{g.text}{g.note && <small> · {g.note}</small>}</span>
              {isParent && <button class="icon-btn small" onClick={() => act.remove('grocery', g.id)} aria-label="Remove"><X size={16} /></button>}
            </div>
          ))}
        </section>
      ))}
      {done.length > 0 && (
        <section class="card list-card done-list">
          <div class="card-head">
            <div class="section-label">In the cart ({done.length})</div>
            {isParent && <button class="link-btn" onClick={clearDone}>Clear</button>}
          </div>
          {done.map((g) => (
            <div class="todo-row done">
              <Check done color="var(--muted)" onClick={() => toggle(g)} />
              <span class="todo-text">{g.text}</span>
              {g.doneBy && memberById(g.doneBy) && <Avatar m={memberById(g.doneBy)} size={20} />}
            </div>
          ))}
        </section>
      )}
      {isParent && open.length > 0 && <p class="hint center">Tap an item to fix its name or aisle.</p>}
      {editG && <GroceryEditor g={editG} onClose={() => setEditG(null)} />}
    </>
  );
}

function GroceryEditor({ g, onClose }) {
  const { act } = useApp();
  const [text, setText] = useState(g.text);
  const [section, setSection] = useState(g.section || 'Other');
  const save = async () => {
    if (!text.trim()) return;
    await act.update('grocery', g.id, { text: text.trim(), section });
    onClose();
  };
  return (
    <Sheet title="Edit item" onClose={onClose} actions={<button class="btn primary small" onClick={save}>Save</button>}>
      <div class="form">
        <input class="title-input" value={text} onInput={(e) => setText(e.currentTarget.value)} />
        <Field label="Aisle">
          <div class="chips">{GROCERY_SECTIONS.map((s) => <button type="button" class={`chip ${section === s ? 'on' : ''}`} onClick={() => setSection(s)}>{s}</button>)}</div>
        </Field>
        <button class="btn primary block" onClick={save}>Save</button>
        <button class="btn danger-outline block" onClick={async () => { await act.remove('grocery', g.id); onClose(); }}>Remove from list</button>
      </div>
    </Sheet>
  );
}

function Chores() {
  const { chores, act, members, me, today, isParent, memberById } = useApp();
  const [who, setWho] = useState('all');
  const [edit, setEdit] = useState(null);
  const list = chores.filter((c) => who === 'all' || c.assignee === who);
  const open = list.filter((c) => !c.done);
  const groups = [
    ['Overdue', open.filter((c) => c.due && c.due < today)],
    ['Today', open.filter((c) => c.due === today)],
    ['Coming up', open.filter((c) => c.due && c.due > today).sort((a, b) => (a.due < b.due ? -1 : 1))],
    ['Anytime', open.filter((c) => !c.due)],
  ].filter(([, l]) => l.length);
  const done = list.filter((c) => c.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)).slice(0, 15);

  const toggle = async (c) => {
    if (c.done) return act.update('chores', c.id, { done: false, doneAt: null, doneBy: null });
    await act.update('chores', c.id, { done: true, doneAt: Date.now(), doneBy: me.id });
    // Repeating to-dos come back on their next date.
    if (c.repeat && c.repeat !== 'none' && c.due) {
      const next = c.repeat === 'daily' ? addDays(c.due, 1) : c.repeat === 'weekly' ? addDays(c.due, 7) : addDays(c.due, 14);
      await act.add('chores', { title: c.title, assignee: c.assignee || null, due: next < today ? today : next, repeat: c.repeat, done: false });
    }
  };

  const Row = ({ c }) => {
    const m = c.assignee && memberById(c.assignee);
    return (
      <div class={`todo-row ${c.done ? 'done' : ''}`} onClick={() => isParent && setEdit(c)}>
        <Check done={c.done} color={c.done ? 'var(--muted)' : m ? m.color : 'var(--accent)'} onClick={() => toggle(c)} />
        <span class="todo-text">{c.title}{c.repeat && c.repeat !== 'none' && <small> · repeats {c.repeat}</small>}</span>
        {c.due && !c.done && <span class={`due ${c.due < today ? 'late' : c.due === today ? 'today' : ''}`}>{c.due < today ? fmtShortDate(c.due) : c.due === today ? 'Today' : fmtShortDate(c.due)}</span>}
        {m && <Avatar m={m} size={24} />}
      </div>
    );
  };

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
      <button class="btn block soft" onClick={() => setEdit({ assignee: who !== 'all' ? who : null })}><Plus size={18} /> New to-do</button>
      {groups.map(([label, l]) => (
        <section class="card list-card">
          <div class={`section-label ${label === 'Overdue' ? 'late' : ''}`}>{label}</div>
          {l.map((c) => <Row c={c} />)}
        </section>
      ))}
      {!groups.length && <Empty emoji="🎉" title="All caught up" text="Nothing left to do here." />}
      {done.length > 0 && (
        <section class="card list-card done-list">
          <div class="section-label">Done</div>
          {done.map((c) => <Row c={c} />)}
        </section>
      )}
      {edit && <ChoreEditor draft={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function ChoreEditor({ draft, onClose }) {
  const { act, members, isParent, today } = useApp();
  const isNew = !draft.id;
  const [f, setF] = useState({ title: '', assignee: null, due: today, repeat: 'none', ...draft });
  const set = (p) => setF({ ...f, ...p });
  const save = async () => {
    if (!f.title.trim()) return toast('What needs doing?', 'err');
    const out = { title: f.title.trim(), assignee: f.assignee || null, due: f.due || null, repeat: f.repeat || 'none' };
    if (isNew) await act.add('chores', { ...out, done: false }); else await act.update('chores', draft.id, out);
    toast(isNew ? 'To-do added' : 'Saved');
    onClose();
  };
  const del = async () => { await act.remove('chores', draft.id); toast('Deleted'); onClose(); };
  return (
    <Sheet title={isNew ? 'New to-do' : 'Edit to-do'} onClose={onClose} actions={<button class="btn primary small" onClick={save}>Save</button>}>
      <div class="form">
        <input class="title-input" value={f.title} onInput={(e) => set({ title: e.currentTarget.value })} placeholder="e.g. Take out the trash" autofocus={isNew} />
        <Field label="Who"><MemberChips members={members} value={f.assignee} multi={false} allowNone noneLabel="Anyone" onChange={(v) => set({ assignee: v })} /></Field>
        <Field label="Due"><input type="date" value={f.due || ''} onInput={(e) => set({ due: e.currentTarget.value || null })} /></Field>
        <Field label="Repeats">
          <select value={f.repeat} onChange={(e) => set({ repeat: e.currentTarget.value })}>
            <option value="none">Doesn’t repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="biweekly">Every 2 weeks</option>
          </select>
        </Field>
        <button class="btn primary block" onClick={save}>{isNew ? 'Add to-do' : 'Save'}</button>
        {!isNew && isParent && <button class="btn danger-outline block" onClick={del}><Trash2 size={16} /> Delete</button>}
      </div>
    </Sheet>
  );
}
