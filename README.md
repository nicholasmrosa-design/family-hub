# Family Hub

A free, installable iPhone app (PWA) for the whole family: shared calendar, who's driving, schedule conflicts, workout/work/family time blocks, birthdays, weekly meal plan, saved recipes, grocery list, to-dos, reminders, Apple Calendar sync, and a kitchen display mode.

**Start here → [SETUP.md](SETUP.md)**

- `docs/`: the built app GitHub Pages serves. **`docs/config.js` is the only file you need to edit.**
- `firestore.rules`: paste into Firebase › Firestore › Rules
- `worker/worker.js`: paste into a Cloudflare Worker (reminders + Apple Calendar)
- `src/`, `worker/src/`: source code. Run `npm install && npm run build` after changing it.
