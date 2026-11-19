import { pinHashFor, randomId } from './hash.js';
import { addDays, startOfWeek, todayIn } from '../lib/dates.js';

export async function seedDemo(fid) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles';
  const today = todayIn(tz);
  const wk = startOfWeek(today);
  const members = [
    { id: 'dad', name: 'Dad', color: '#2F6FED', role: 'parent', workoutGoal: 4 },
    { id: 'mom', name: 'Mom', color: '#E5487D', role: 'parent', workoutGoal: 3 },
    { id: 'son', name: 'Ethan', color: '#12A26B', role: 'kid', workoutGoal: 5 },
  ];
  const now = Date.now();
  const ev = (o) => ({ id: randomId(), allDay: false, memberIds: [], reminders: [], repeat: { freq: 'none' }, createdBy: 'dad', createdAt: now, ...o });
  const events = [
    ev({ title: 'Basketball practice', category: 'practice', memberIds: ['son'], date: addDays(wk, -7), start: '17:00', end: '18:30',
      repeat: { freq: 'weekly', days: [2, 4], interval: 1 }, location: 'Lincoln High Gym', bring: 'Water bottle, practice jersey',
      driverTo: 'mom', driverFrom: 'dad', reminders: [60] }),
    ev({ title: 'Game vs. Eagles', category: 'game', memberIds: ['son', 'dad', 'mom'], date: addDays(wk, 6), start: '10:00', end: '11:30',
      location: 'Riverside Sports Complex', bring: 'Home (white) jersey. Snack duty for the team!', driverTo: 'dad', reminders: [1440, 60] }),
    ev({ title: 'Dentist', category: 'appointment', memberIds: ['son'], date: addDays(today, 1), start: '15:30', end: '16:15',
      location: 'Bright Smiles Dental', driverTo: 'mom', reminders: [1440] }),
    ev({ title: 'Morning workout', category: 'workout', memberIds: ['dad'], date: addDays(wk, -6), start: '06:00', end: '07:00',
      repeat: { freq: 'weekly', days: [1, 3, 5], interval: 1 } }),
    ev({ title: 'Yoga', category: 'workout', memberIds: ['mom'], date: addDays(wk, -5), start: '07:30', end: '08:30',
      repeat: { freq: 'weekly', days: [2, 4], interval: 1 } }),
    ev({ title: 'Weight room', category: 'workout', memberIds: ['son'], date: addDays(wk, -6), start: '15:00', end: '16:00',
      repeat: { freq: 'weekly', days: [1, 3], interval: 1 } }),
    ev({ title: 'Client meeting', category: 'work', memberIds: ['dad'], date: addDays(wk, 3), start: '13:00', end: '14:30', location: 'Fresno office' }),
    ev({ title: 'Hair appointment', category: 'appointment', memberIds: ['mom'], date: addDays(wk, 4), start: '16:00', end: '17:00', location: 'Salon Bella' }),
    ev({ title: 'Focus work block', category: 'work', memberIds: ['dad'], date: addDays(wk, -6), start: '09:00', end: '12:00',
      repeat: { freq: 'weekly', days: [1, 2, 3, 4, 5], interval: 1 } }),
    ev({ title: 'Family movie night', category: 'family', memberIds: ['dad', 'mom', 'son'], date: addDays(wk, -2), start: '19:00', end: '21:30',
      repeat: { freq: 'weekly', days: [5], interval: 1 }, notes: "Ethan picks the movie this week 🍿" }),
    ev({ title: "Mom's birthday", category: 'birthday', memberIds: [], allDay: true, start: null, end: null, date: addDays(today, 9),
      repeat: { freq: 'yearly', interval: 1 }, reminders: [10080, 1440] }),
    ev({ title: "Grandpa Joe's birthday", category: 'birthday', memberIds: [], allDay: true, start: null, end: null, date: addDays(today, 23),
      repeat: { freq: 'yearly', interval: 1 }, reminders: [10080] }),
    ev({ title: 'Report cards', category: 'school', memberIds: ['son'], allDay: true, start: null, end: null, date: addDays(today, 3) }),
  ];

  const recipes = [
    { name: 'Street tacos', type: 'dinner', prepMin: 30, favorite: true, ingredients: ['1 lb ground beef', 'Taco seasoning', 'Corn tortillas', 'Cilantro', 'White onion', 'Limes', 'Salsa'], instructions: 'Brown beef with seasoning. Warm tortillas. Top with onion, cilantro and a squeeze of lime.' },
    { name: 'Spaghetti & meatballs', type: 'dinner', prepMin: 45, favorite: true, ingredients: ['Spaghetti', 'Frozen meatballs', 'Marinara sauce', 'Parmesan', 'Garlic bread'], instructions: 'Simmer meatballs in sauce 20 min. Boil pasta. Serve with parmesan and garlic bread.' },
    { name: 'Sheet-pan chicken & veggies', type: 'dinner', prepMin: 40, ingredients: ['2 lb chicken thighs', 'Broccoli', 'Baby potatoes', 'Olive oil', 'Garlic powder', 'Paprika'], instructions: '425°F for 35 minutes. Toss everything in oil and spices first.' },
    { name: 'Grilled salmon & rice', type: 'dinner', prepMin: 30, ingredients: ['Salmon fillets', 'Jasmine rice', 'Asparagus', 'Lemon', 'Butter'], instructions: '' },
    { name: 'Pancakes & bacon', type: 'breakfast', prepMin: 25, favorite: true, ingredients: ['Pancake mix', 'Eggs', 'Milk', 'Bacon', 'Maple syrup'], instructions: '' },
    { name: 'Overnight oats', type: 'breakfast', prepMin: 5, ingredients: ['Rolled oats', 'Greek yogurt', 'Milk', 'Berries', 'Honey'], instructions: 'Mix the night before, refrigerate.' },
    { name: 'Turkey sandwiches', type: 'lunch', prepMin: 10, ingredients: ['Sliced turkey', 'Sandwich bread', 'Cheddar slices', 'Lettuce', 'Tomatoes'], instructions: '' },
    { name: 'Chicken Caesar wraps', type: 'lunch', prepMin: 15, ingredients: ['Rotisserie chicken', 'Romaine', 'Caesar dressing', 'Flour tortillas', 'Parmesan'], instructions: '' },
  ].map((r) => ({ ...r, id: randomId(), createdBy: 'mom', createdAt: now, link: '' }));
  const R = Object.fromEntries(recipes.map((r) => [r.name, r.id]));

  const plan = {};
  const put = (d, slot, mealId, text, cook) => { plan[`${d}_${slot}`] = { date: d, slot, mealId: mealId || null, text: text || '', cook: cook || null }; };
  put(addDays(today, 0), 'dinner', R['Street tacos'], '', 'dad');
  put(addDays(today, 0), 'breakfast', R['Overnight oats'], '', null);
  put(addDays(today, 0), 'lunch', R['Turkey sandwiches'], '', null);
  put(addDays(today, 1), 'dinner', R['Spaghetti & meatballs'], '', 'mom');
  put(addDays(today, 2), 'dinner', R['Sheet-pan chicken & veggies'], '', 'mom');
  put(addDays(today, 3), 'dinner', null, 'Leftovers', null);
  put(addDays(today, 4), 'dinner', null, 'Pizza night 🍕', 'son');
  put(addDays(today, 5), 'breakfast', R['Pancakes & bacon'], '', 'dad');
  put(addDays(today, 5), 'dinner', R['Grilled salmon & rice'], '', 'dad');

  const g = (text, section, done = false) => ({ text, section, done, addedBy: 'mom', createdAt: now });
  const grocery = [g('Milk', 'Dairy & Eggs'), g('Bananas', 'Produce'), g('Gatorade', 'Drinks'), g('Paper towels', 'Household'), g('Eggs', 'Dairy & Eggs', true), g('Orange slices for team snack', 'Produce')];

  const c = (title, assignee, due, extra = {}) => ({ title, assignee, due, done: false, createdBy: 'mom', createdAt: now, ...extra });
  const chores = [c('Sign permission slip', 'mom', addDays(today, 1)), c('Schedule oil change', 'dad', null), c('Return library books', 'son', addDays(today, 2)), c('Buy team gift', 'mom', addDays(today, -1), { done: true, doneBy: 'mom', doneAt: now })];

  const rt = (title, area, freq, o = {}) => ({ id: randomId(), title, area, freq, days: [], monthDay: null, time: null, assignees: [], rotate: false, remind: false, paused: false, startDate: addDays(wk, -14), createdBy: 'mom', createdAt: now, ...o });
  const routines = [
    rt('Make bed', 'bedroom', 'daily', { assignees: ['son'], time: '07:30' }),
    rt('Unload dishwasher', 'kitchen', 'daily', { assignees: ['son', 'mom', 'dad'], rotate: true, time: '16:00' }),
    rt('Feed the dog', 'pets', 'daily', { assignees: ['son'], time: '18:00', remind: true }),
    rt('Take out trash', 'kitchen', 'weekly', { days: [1, 4], assignees: ['son'], time: '19:00', remind: true }),
    rt('Clean bathrooms', 'bathroom', 'weekly', { days: [6], assignees: ['mom', 'dad'], rotate: true }),
    rt('Vacuum downstairs', 'living', 'weekly', { assignees: ['son'] }),
    rt('Laundry', 'laundry', 'weekly', { days: [0, 3], assignees: ['mom'] }),
    rt('Mow lawn', 'yard', 'weekly', { assignees: ['dad', 'son'], rotate: true }),
    rt('Change AC filter', 'other', 'monthly', { assignees: ['dad'] }),
    rt('Clean out fridge', 'kitchen', 'monthly', { monthDay: 1, assignees: ['mom'] }),
  ];
  const R2 = Object.fromEntries(routines.map((r) => [r.title, r.id]));
  const routineDone = {};
  const rd = (title, key, by) => { routineDone[`${R2[title]}_${key}`] = { routineId: R2[title], key, state: 'done', by, uid: 'demo-user', at: now }; };
  rd('Make bed', today, 'son');
  rd('Vacuum downstairs', 'W' + wk, 'son');
  rd('Laundry', wk, 'mom');
  rd('Take out trash', addDays(wk, 1), 'son');
  for (let d = addDays(today, -6); d < today; d = addDays(d, 1)) { rd('Make bed', d, 'son'); rd('Unload dishwasher', d, 'mom'); rd('Feed the dog', d, 'son'); }

  // Check-ins for planned events this week
  const checkins = {};
  const ci = (title, date, state, by, extra = {}) => {
    const e = events.find((x) => x.title === title);
    if (date < today) checkins[`${e.id}_${date}`] = { eventId: e.id, date, state, by, uid: 'demo-user', at: now, ...extra };
  };

  for (let d = wk; d < today; d = addDays(d, 1)) {
    const wd = new Date(d + 'T12:00:00Z').getUTCDay();
    if ([1, 3, 5].includes(wd)) ci('Morning workout', d, 'done', 'dad');
    if ([2, 4].includes(wd)) ci('Yoga', d, wd === 2 ? 'done' : 'missed', 'mom');
    if (wd === 1) ci('Weight room', d, 'done', 'son');
  }
  const byId = (arr) => Object.fromEntries(arr.map((x) => { const { id, ...rest } = x; return [id || randomId(), rest]; }));
  return {
    doc: { name: 'The Demo Family', members, tz, createdAt: now },
    pinHash: await pinHashFor(fid, '1234'),
    cols: { events: byId(events), recipes: byId(recipes), mealPlan: plan, grocery: byId(grocery), chores: byId(chores), routines: byId(routines), routineDone, checkins },
  };
}
