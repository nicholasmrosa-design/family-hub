import { useState } from 'preact/hooks';
import { useApp } from '../app.jsx';
import { Sheet, MemberChips, Field, toast } from '../ui.jsx';
import { guessSection, tidyItem } from '../lib/grocery.js';
import { RoutineEditor } from './Chores.jsx';

const EVENT_TYPES = [
  { cat: 'practice', emoji: '⚽', label: 'Practice' },
  { cat: 'game', emoji: '🏆', label: 'Game' },
  { cat: 'appointment', emoji: '🩺', label: 'Appointment' },
  { cat: 'birthday', emoji: '🎂', label: 'Birthday', extra: { allDay: true, repeat: { freq: 'yearly', interval: 1 }, reminders: [10080, 1440] } },
  { cat: 'school', emoji: '🏫', label: 'School' },
  { cat: 'other', emoji: '📌', label: 'Other event' },
];
const PLAN_TYPES = [
  { cat: 'workout', emoji: '💪', label: 'Workout' },
  { cat: 'work', emoji: '💼', label: 'Work time' },
  { cat: 'family', emoji: '❤️', label: 'Family time' },
  { cat: 'personal', emoji: '📚', label: 'Me time' },
];

export function QuickAdd({ onClose }) {
  const { openEditor, act, members, me, today, go } = useApp();
  const [mode, setMode] = useState(null);
  const [text, setText] = useState('');
  const [who, setWho] = useState(me.id);
  const [due, setDue] = useState(today);

  const pickEvent = (t) => {
    onClose();
    openEditor({ category: t.cat, memberIds: t.cat === 'birthday' || t.cat === 'family' ? [] : [me.id], ...(t.extra || {}), ...(t.cat === 'practice' ? { reminders: [60] } : t.cat === 'game' || t.cat === 'appointment' ? { reminders: [1440, 60] } : {}) });
  };

  const addGrocery = async (e) => {
    e.preventDefault();
    const items = text.split(',').map((s) => s.trim()).filter(Boolean);
    if (!items.length) return;
    for (const t of items) await act.add('grocery', { text: tidyItem(t), section: guessSection(t), done: false });
    toast(`Added to the grocery list`);
    onClose();
  };
  const addTodo = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    await act.add('chores', { title: text.trim(), assignee: who || null, due: due || null, repeat: 'none', done: false });
    toast('To-do added');
    onClose();
  };

  if (mode === 'chore') return <RoutineEditor draft={{}} onClose={onClose} />;
  if (mode === 'grocery') {
    return (
      <Sheet title="🛒 Grocery list" onClose={onClose}>
        <form class="form" onSubmit={addGrocery}>
          <input class="title-input" value={text} onInput={(e) => setText(e.currentTarget.value)} placeholder="Milk, bananas, eggs" autofocus />
          <p class="hint tight">Separate items with commas.</p>
          <button class="btn primary block">Add</button>
        </form>
      </Sheet>
    );
  }
  if (mode === 'todo') {
    return (
      <Sheet title="✅ New to-do" onClose={onClose}>
        <form class="form" onSubmit={addTodo}>
          <input class="title-input" value={text} onInput={(e) => setText(e.currentTarget.value)} placeholder="e.g. Mow the lawn" autofocus />
          <Field label="Who"><MemberChips members={members} value={who} multi={false} allowNone noneLabel="Anyone" onChange={setWho} /></Field>
          <Field label="Due"><input type="date" value={due || ''} onInput={(e) => setDue(e.currentTarget.value)} /></Field>
          <button class="btn primary block">Add to-do</button>
        </form>
      </Sheet>
    );
  }

  return (
    <Sheet title="Add something" onClose={onClose}>
      <div class="quick-label">On the calendar</div>
      <div class="quick-grid">
        {EVENT_TYPES.map((t) => (
          <button class="quick" onClick={() => pickEvent(t)}><span>{t.emoji}</span>{t.label}</button>
        ))}
      </div>
      <div class="quick-label">Plan time (check off when done)</div>
      <div class="quick-grid">
        {PLAN_TYPES.map((t) => (
          <button class="quick plan" onClick={() => pickEvent(t)}><span>{t.emoji}</span>{t.label}</button>
        ))}
      </div>
      <div class="quick-label">Other</div>
      <div class="quick-grid">
        <button class="quick" onClick={() => setMode('grocery')}><span>🛒</span>Grocery item</button>
        <button class="quick" onClick={() => setMode('chore')}><span>🧹</span>Chore</button>
        <button class="quick" onClick={() => setMode('todo')}><span>📝</span>To-do</button>
        <button class="quick" onClick={() => { onClose(); go('meals'); }}><span>🍽️</span>Plan a meal</button>
      </div>
    </Sheet>
  );
}
