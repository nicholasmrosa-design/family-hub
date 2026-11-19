import { useMemo, useState } from 'preact/hooks';
import { ChevronLeft, ChevronRight, Search, Star, ShoppingCart, Pencil, Trash2, Link, Timer, Plus, ChefHat } from 'lucide-preact';
import { useApp } from '../app.jsx';
import { Seg, Sheet, Field, MemberChips, Empty, Avatar, toast, confirmBox } from '../ui.jsx';
import { MEAL_SLOTS } from '../lib/constants.js';
import { addDays, startOfWeek, fmtDayLabel, fmtShortDate } from '../lib/dates.js';
import { guessSection, normalizeItem } from '../lib/grocery.js';

export function Meals() {
  const [view, setView] = useState('plan');
  return (
    <div class="page">
      <header class="page-head">
        <h1>Meals</h1>
        <Seg value={view} onChange={setView} options={[{ value: 'plan', label: 'Week plan' }, { value: 'recipes', label: 'Recipes' }]} />
      </header>
      {view === 'plan' ? <Plan /> : <Recipes />}
    </div>
  );
}

function Plan() {
  const { today, mealPlan, recipes, memberById } = useApp();
  const [anchor, setAnchor] = useState(today);
  const [slot, setSlot] = useState(null);
  const [shop, setShop] = useState(null);
  const days = [...Array(7)].map((_, i) => addDays(anchor, i));
  const recipeById = (id) => recipes.find((r) => r.id === id);

  const weekIngredients = () => {
    const out = [];
    for (const d of days) {
      if (d < today) continue;
      for (const s of MEAL_SLOTS) {
        const p = mealPlan[`${d}_${s.id}`];
        const r = p && p.mealId && recipeById(p.mealId);
        if (r) for (const ing of r.ingredients || []) out.push({ text: ing, for: r.name });
      }
    }
    if (!out.length) return toast('No recipes planned for the rest of this week', 'err');
    setShop(out);
  };

  return (
    <>
      <div class="cal-nav">
        <button class="icon-btn" onClick={() => setAnchor(addDays(anchor, -7))} aria-label="Previous week"><ChevronLeft size={22} /></button>
        <button class="cal-title" onClick={() => setAnchor(today)}>{fmtShortDate(anchor)} – {fmtShortDate(addDays(anchor, 6))}</button>
        <button class="icon-btn" onClick={() => setAnchor(addDays(anchor, 7))} aria-label="Next week"><ChevronRight size={22} /></button>
      </div>
      <button class="btn block soft" onClick={weekIngredients}><ShoppingCart size={18} /> Add this week’s ingredients to the grocery list</button>
      {days.map((d) => (
        <section class={`card meal-day ${d === today ? 'is-today' : ''} ${d < today ? 'past' : ''}`}>
          <div class="day-head"><span class="day-name">{fmtDayLabel(d, today)}</span></div>
          {MEAL_SLOTS.map((s) => {
            const p = mealPlan[`${d}_${s.id}`];
            const r = p && p.mealId && recipeById(p.mealId);
            const name = r ? r.name : p && p.text;
            const cook = p && p.cook && memberById(p.cook);
            return (
              <button class={`slot ${name ? 'filled' : ''}`} onClick={() => setSlot({ date: d, slot: s.id })}>
                <span class="slot-emoji">{s.emoji}</span>
                <span class="slot-label">{s.label}</span>
                <span class="slot-value">{name || <span class="muted">+ Add</span>}</span>
                {cook && <Avatar m={cook} size={22} />}
              </button>
            );
          })}
        </section>
      ))}
      {slot && <SlotSheet {...slot} onClose={() => setSlot(null)} />}
      {shop && <AddToGrocery items={shop} onClose={() => setShop(null)} />}
    </>
  );
}

function SlotSheet({ date, slot, onClose }) {
  const { mealPlan, recipes, members, act, isParent, today, memberById } = useApp();
  const key = `${date}_${slot}`;
  const cur = mealPlan[key];
  const locked = cur && !isParent; // kids can only fill empty slots
  const [mealId, setMealId] = useState(cur ? cur.mealId : null);
  const [text, setText] = useState(cur ? cur.text || '' : '');
  const [cook, setCook] = useState(cur ? cur.cook : null);
  const [q, setQ] = useState('');
  const slotInfo = MEAL_SLOTS.find((s) => s.id === slot);
  const list = recipes
    .filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (b.type === slot) - (a.type === slot) || (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) || a.name.localeCompare(b.name));

  const save = async () => {
    if (!mealId && !text.trim()) return toast('Pick a recipe or type a meal', 'err');
    await act.set('mealPlan', key, { date, slot, mealId: mealId || null, text: mealId ? '' : text.trim(), cook: cook || null, updatedAt: Date.now() });
    toast('Meal planned');
    onClose();
  };
  const clear = async () => {
    await act.remove('mealPlan', key);
    onClose();
  };

  if (locked) {
    const r = cur.mealId && recipes.find((x) => x.id === cur.mealId);
    return (
      <Sheet title={`${slotInfo.label} · ${fmtDayLabel(date, today)}`} onClose={onClose}>
        <h2>{r ? r.name : cur.text}</h2>
        {cur.cook && <p>{memberById(cur.cook)?.name} is cooking</p>}
        {r && <RecipeBody r={r} />}
        <p class="hint">Only parents can change a planned meal.</p>
      </Sheet>
    );
  }

  return (
    <Sheet title={`${slotInfo.emoji} ${slotInfo.label} · ${fmtDayLabel(date, today)}`} onClose={onClose} tall
      actions={<button class="btn primary small" onClick={save}>Save</button>}>
      <div class="form">
        <Field label="Quick meal"><input value={mealId ? '' : text} onInput={(e) => { setText(e.currentTarget.value); setMealId(null); }} placeholder="e.g. Leftovers, Pizza night, Eating out" /></Field>
        <div class="search"><Search size={16} /><input value={q} onInput={(e) => setQ(e.currentTarget.value)} placeholder="…or pick a saved recipe" /></div>
        <div class="recipe-pick">
          {list.map((r) => (
            <button class={`pick ${mealId === r.id ? 'on' : ''}`} onClick={() => { setMealId(mealId === r.id ? null : r.id); setText(''); }}>
              <span>{r.favorite && '⭐ '}{r.name}</span>
              <small>{r.type[0].toUpperCase() + r.type.slice(1)}{r.prepMin ? ` · ${r.prepMin} min` : ''}</small>
            </button>
          ))}
          {!list.length && <p class="hint">No saved recipes yet. Add some in the Recipes tab.</p>}
        </div>
        <Field label="Who’s cooking?"><MemberChips members={members} value={cook} multi={false} allowNone noneLabel="TBD" onChange={setCook} /></Field>
        <button class="btn primary block" onClick={save}>Save</button>
        {cur && isParent && <button class="btn danger-outline block" onClick={clear}>Clear this meal</button>}
      </div>
    </Sheet>
  );
}

export function AddToGrocery({ items, onClose }) {
  const { grocery, act } = useApp();
  const have = new Set(grocery.filter((g) => !g.done).map((g) => normalizeItem(g.text)));
  // merge duplicates
  const merged = [];
  for (const it of items) {
    const k = normalizeItem(it.text);
    const ex = merged.find((m) => m.key === k);
    if (ex) { if (!ex.for.includes(it.for)) ex.for.push(it.for); }
    else merged.push({ key: k, text: it.text, for: it.for ? [it.for] : [], onList: have.has(k) });
  }
  const [sel, setSel] = useState(() => new Set(merged.filter((m) => !m.onList).map((m) => m.key)));
  const toggle = (k) => { const s = new Set(sel); s.has(k) ? s.delete(k) : s.add(k); setSel(s); };
  const add = async () => {
    const chosen = merged.filter((m) => sel.has(m.key));
    for (const m of chosen) await act.add('grocery', { text: m.text, section: guessSection(m.text), done: false, note: m.for.length ? 'for ' + m.for.join(', ') : '' });
    toast(`Added ${chosen.length} item${chosen.length === 1 ? '' : 's'} to the grocery list`);
    onClose();
  };
  return (
    <Sheet title="Add to grocery list" onClose={onClose} tall actions={<button class="btn primary small" onClick={add}>Add {sel.size}</button>}>
      <p class="hint">Uncheck anything you already have at home.</p>
      {merged.map((m) => (
        <label class="ing-row">
          <input type="checkbox" checked={sel.has(m.key)} onChange={() => toggle(m.key)} />
          <span><b>{m.text}</b>{m.for.length > 0 && <small> · {m.for.join(', ')}</small>}{m.onList && <small class="tag">already on list</small>}</span>
        </label>
      ))}
      <button class="btn primary block" onClick={add} disabled={!sel.size}>Add {sel.size} item{sel.size === 1 ? '' : 's'}</button>
    </Sheet>
  );
}

function Recipes() {
  const { recipes } = useApp();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState(null);
  const [edit, setEdit] = useState(null);
  const list = recipes
    .filter((r) => filter === 'all' || (filter === 'fav' ? r.favorite : r.type === filter))
    .filter((r) => !q || (r.name + ' ' + (r.ingredients || []).join(' ')).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) || a.name.localeCompare(b.name));
  const live = open && recipes.find((r) => r.id === open);
  return (
    <>
      <div class="search"><Search size={16} /><input value={q} onInput={(e) => setQ(e.currentTarget.value)} placeholder="Search recipes or ingredients" /></div>
      <div class="chips scroll filter">
        {[['all', 'All'], ['fav', '⭐ Favorites'], ['breakfast', 'Breakfast'], ['lunch', 'Lunch'], ['dinner', 'Dinner']].map(([v, l]) => (
          <button class={`chip ${filter === v ? 'on' : ''}`} onClick={() => setFilter(v)}>{l}</button>
        ))}
      </div>
      <button class="btn block soft" onClick={() => setEdit({})}><Plus size={18} /> New recipe</button>
      {list.length ? (
        <div class="recipe-list">
          {list.map((r) => (
            <button class="card recipe-card" onClick={() => setOpen(r.id)}>
              <div class="recipe-name">{r.favorite && <Star size={15} class="star" fill="currentColor" />}{r.name}</div>
              <div class="recipe-meta">
                <span class={`type ${r.type}`}>{r.type}</span>
                {r.prepMin > 0 && <span><Timer size={13} /> {r.prepMin} min</span>}
                <span>{(r.ingredients || []).length} ingredients</span>
              </div>
            </button>
          ))}
        </div>
      ) : <Empty emoji="👩‍🍳" title="No recipes yet" text="Save your family’s go-to meals so planning the week takes seconds." />}
      {live && <RecipeDetail r={live} onClose={() => setOpen(null)} onEdit={() => { setEdit(live); setOpen(null); }} />}
      {edit && <RecipeEditor draft={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function RecipeBody({ r }) {
  return (
    <>
      {(r.ingredients || []).length > 0 && (<><h3 class="sub">Ingredients</h3><ul class="ing-list">{r.ingredients.map((i) => <li>{i}</li>)}</ul></>)}
      {r.instructions && (<><h3 class="sub">How to make it</h3><p class="pre">{r.instructions}</p></>)}
      {r.link && <a class="btn block" href={r.link} target="_blank" rel="noopener"><Link size={16} /> Open recipe link</a>}
    </>
  );
}

function RecipeDetail({ r, onClose, onEdit }) {
  const { isParent, act, today, mealPlan } = useApp();
  const [shop, setShop] = useState(null);
  const [plan, setPlan] = useState(null);
  const del = async () => {
    if (!(await confirmBox({ title: 'Delete recipe?', message: `“${r.name}” will be removed.`, ok: 'Delete', danger: true }))) return;
    await act.remove('recipes', r.id);
    onClose();
  };
  return (
    <Sheet title="" onClose={onClose} tall actions={isParent && <button class="icon-btn" onClick={onEdit} aria-label="Edit"><Pencil size={20} /></button>}>
      <div class="detail-head">
        <span class="detail-emoji"><ChefHat size={28} /></span>
        <div><h2 class="detail-title">{r.name}</h2><div class="detail-sub">{r.type[0].toUpperCase() + r.type.slice(1)}{r.prepMin ? ` · ${r.prepMin} min` : ''}</div></div>
      </div>
      <div class="row-btns">
        <button class="btn soft" onClick={() => setPlan({ date: today, slot: r.type === 'any' ? 'dinner' : r.type })}>📅 Plan it</button>
        <button class="btn soft" onClick={() => setShop((r.ingredients || []).map((t) => ({ text: t, for: r.name })))}><ShoppingCart size={16} /> Shop</button>
        {isParent && <button class={`btn soft ${r.favorite ? 'fav' : ''}`} onClick={() => act.update('recipes', r.id, { favorite: !r.favorite })}><Star size={16} fill={r.favorite ? 'currentColor' : 'none'} /> {r.favorite ? 'Favorited' : 'Favorite'}</button>}
      </div>
      <RecipeBody r={r} />
      {isParent && <button class="btn danger-outline block" onClick={del}><Trash2 size={16} /> Delete recipe</button>}
      {shop && <AddToGrocery items={shop} onClose={() => setShop(null)} />}
      {plan && (
        <Sheet title="Plan this meal" onClose={() => setPlan(null)}>
          <div class="form">
            <Field label="Day"><input type="date" value={plan.date} onInput={(e) => setPlan({ ...plan, date: e.currentTarget.value })} /></Field>
            <Field label="Meal"><select value={plan.slot} onChange={(e) => setPlan({ ...plan, slot: e.currentTarget.value })}>{MEAL_SLOTS.map((s) => <option value={s.id}>{s.label}</option>)}</select></Field>
            {mealPlan[`${plan.date}_${plan.slot}`] && <p class="hint">{isParent ? 'This will replace what’s already planned.' : 'Something is already planned there. Ask a parent to change it.'}</p>}
            <button class="btn primary block" disabled={!isParent && mealPlan[`${plan.date}_${plan.slot}`]} onClick={async () => {
              await act.set('mealPlan', `${plan.date}_${plan.slot}`, { date: plan.date, slot: plan.slot, mealId: r.id, text: '', cook: null, updatedAt: Date.now() });
              toast('Meal planned'); setPlan(null);
            }}>Plan it</button>
          </div>
        </Sheet>
      )}
    </Sheet>
  );
}

function RecipeEditor({ draft, onClose }) {
  const { act } = useApp();
  const isNew = !draft.id;
  const [f, setF] = useState({ name: '', type: 'dinner', prepMin: '', ingredients: [], instructions: '', link: '', favorite: false, ...draft });
  const [ingText, setIngText] = useState((draft.ingredients || []).join('\n'));
  const set = (p) => setF({ ...f, ...p });
  const save = async () => {
    if (!f.name.trim()) return toast('Give the recipe a name', 'err');
    const out = { name: f.name.trim(), type: f.type, prepMin: Number(f.prepMin) || 0, ingredients: ingText.split('\n').map((s) => s.trim()).filter(Boolean), instructions: f.instructions.trim(), link: f.link.trim(), favorite: !!f.favorite };
    if (isNew) await act.add('recipes', out); else await act.update('recipes', draft.id, out);
    toast('Recipe saved');
    onClose();
  };
  return (
    <Sheet title={isNew ? 'New recipe' : 'Edit recipe'} onClose={onClose} tall actions={<button class="btn primary small" onClick={save}>Save</button>}>
      <div class="form">
        <input class="title-input" value={f.name} onInput={(e) => set({ name: e.currentTarget.value })} placeholder="Recipe name" />
        <div class="row2">
          <Field label="Meal"><select value={f.type} onChange={(e) => set({ type: e.currentTarget.value })}><option value="breakfast">Breakfast</option><option value="lunch">Lunch</option><option value="dinner">Dinner</option><option value="any">Any</option></select></Field>
          <Field label="Time (min)"><input type="number" inputmode="numeric" value={f.prepMin} onInput={(e) => set({ prepMin: e.currentTarget.value })} placeholder="30" /></Field>
        </div>
        <Field label="Ingredients" hint="One per line. These can be added to the grocery list with one tap."><textarea rows={7} value={ingText} onInput={(e) => setIngText(e.currentTarget.value)} placeholder={'1 lb ground beef\nTortillas\nCheese'} /></Field>
        <Field label="Instructions"><textarea rows={5} value={f.instructions} onInput={(e) => set({ instructions: e.currentTarget.value })} placeholder="Optional" /></Field>
        <Field label="Recipe link"><input type="url" value={f.link} onInput={(e) => set({ link: e.currentTarget.value })} placeholder="https://… (optional)" /></Field>
        <button class="btn primary block" onClick={save}>Save recipe</button>
      </div>
    </Sheet>
  );
}
