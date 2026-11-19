// Per-occurrence status for planned events: done / missed / moved.
export const checkinId = (evId, date) => `${evId}_${date}`;

export function checkinMap(list) {
  const m = {};
  for (const c of list || []) m[`${c.eventId}@${c.date}`] = c;
  return m;
}
