// kind 'event' = things on the calendar you just need to remember (practices, games, appointments).
// kind 'plan'  = time you planned for yourself (workouts, work, family time), checked off as done or missed.
export const CATEGORIES = [
  { id: 'practice', label: 'Practice', emoji: '⚽', kind: 'event' },
  { id: 'game', label: 'Game', emoji: '🏆', kind: 'event' },
  { id: 'appointment', label: 'Appointment', emoji: '🩺', kind: 'event' },
  { id: 'school', label: 'School', emoji: '🏫', kind: 'event' },
  { id: 'birthday', label: 'Birthday', emoji: '🎂', kind: 'event' },
  { id: 'other', label: 'Other', emoji: '📌', kind: 'event' },
  { id: 'workout', label: 'Workout', emoji: '💪', kind: 'plan' },
  { id: 'work', label: 'Work time', emoji: '💼', kind: 'plan' },
  { id: 'family', label: 'Family time', emoji: '❤️', kind: 'plan' },
  { id: 'personal', label: 'Me time', emoji: '📚', kind: 'plan' },
];

// Is this event something to check off (planned time) rather than just remember?
export function isPlanned(ev) {
  if (typeof ev.track === 'boolean') return ev.track;
  return (CAT[ev.category] || {}).kind === 'plan';
}
export const CAT = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

export const MEMBER_COLORS = [
  '#2F6FED', // blue
  '#E5487D', // pink
  '#12A26B', // green
  '#F08A24', // orange
  '#8B5CF6', // purple
  '#0EA5B7', // teal
  '#E23D3D', // red
  '#C99A06', // gold
  '#5B6B82', // slate
];

export const REMINDER_OPTIONS = [
  { min: 0, label: 'At start' },
  { min: 15, label: '15 min before' },
  { min: 30, label: '30 min before' },
  { min: 60, label: '1 hour before' },
  { min: 120, label: '2 hours before' },
  { min: 1440, label: '1 day before' },
  { min: 2880, label: '2 days before' },
  { min: 10080, label: '1 week before' },
];
export const REMINDER_LABEL = Object.fromEntries(REMINDER_OPTIONS.map((r) => [r.min, r.label]));

// All-day events (birthdays etc.) send their reminders relative to this local time.
export const ALL_DAY_REMINDER_TIME = '08:00';

export const MEAL_SLOTS = [
  { id: 'breakfast', label: 'Breakfast', emoji: '🥞' },
  { id: 'lunch', label: 'Lunch', emoji: '🥪' },
  { id: 'dinner', label: 'Dinner', emoji: '🍽️' },
];

export const GROCERY_SECTIONS = ['Produce', 'Meat & Seafood', 'Dairy & Eggs', 'Bakery', 'Pantry', 'Frozen', 'Drinks', 'Household', 'Other'];
