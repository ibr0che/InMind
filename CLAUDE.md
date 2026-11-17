# InMind

A personal journal: one entry per day that locks at midnight (user's timezone), plus
quick notes, one photo, a highlight and lessons. Memories shows past days as note pads.

## Run it

```bash
npm install
npm run dev      # API (node --watch, port 3001) + Vite client (port 5173)
npm run build    # production build, also the quickest compile check
npm run desktop  # build + open the Electron app (electron/main.js, server on 127.0.0.1:3017)
```

Vite proxies `/api` to `localhost:3001`. Another Vite project (e.g. algosketch) also
defaults to 5173: if both run, one of them silently moves ports.

## Stack and layout

- **Frontend:** React 18 + Vite, plain CSS in `src/styles.css` (no CSS framework).
  - `src/App.jsx` — signed-in shell (top bar, sidebar, page switch)
  - `src/pages/` — `TodayPage`, `MemoriesPage`, `ProfilePage`
  - `src/hooks/` — `useAuth`, `useEntries` (all entry data + actions), `useClock`, `useThemes`
  - `src/lib/api.js` — the only place that calls the backend (session + token refresh)
  - `src/lib/dates.js` — timezone-aware dates, streak
- **Backend:** Express in `server/index.js`, Supabase (auth + Postgres + Storage bucket
  `journal-media`). Routes are documented in `server/API.md`.
- **Env:** `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `PORT`, `CLIENT_ORIGIN` (server),
  `VITE_API_URL` (client). **Never read the root `.env`** — it holds real keys.

## Rules the code relies on

- **The server is the source of truth for locking:** entries are editable only on their
  own day in the user's timezone (`todayInUserTimezone`, `loadEditableEntry`).
- **Limits live on both sides and must match:** title 25, body 2500, lessons 100,
  highlight 280, notes 100 chars / 10 per day, one image (50 MB) per day, username
  3–30 of `a-z A-Z 0-9 _ . -`. Client constants are at the top of `TodayPage.jsx`;
  server ones near `TEXT_LIMITS` / `USERNAME` in `server/index.js`.
- **Autosave** (Today page): saves 1.5 s after typing stops and when leaving the page.
  Timers read the latest values from a ref — the clock re-renders every second, so a
  timer that depends on changing callbacks never fires.
- **Settings:** `PATCH /api/auth/me` takes `{ username }` and/or `{ theme }`. Themes are
  stored in Supabase user metadata so they follow the account across devices.

## Themes

- All themes are dark. Each is four colors in `styles.css` under `[data-theme="id"]`
  (`--bg`, `--surface`, `--accent`, `--accent-2`); everything else is mixed from them.
  Groups: **Classic** (accent-2 = lighter tint) and **Duo** (two hues).
- To add one: four colors in `styles.css` + one line in `THEMES` in `useThemes.js`.
- Text must stay ≥ 4.5:1 contrast on every theme's surfaces — check new colors.
- White accents (`--white`, `--shine`) are part of the look: titles, active nav, countdown.

## Conventions

- Keep it simple: small changes, plain CSS, no new dependencies without asking.
- Accessibility: real inputs/buttons, labels, keyboard support, `prefers-reduced-motion`.
- Animate only `transform` / `opacity` (cheap); avoid animating shadows, blurs, filters.
- Phones: layouts must work at 375 px wide with no sideways scrolling.
- Files may have CRLF line endings (`core.autocrlf` is on). Scripted edits should
  normalise to `\n` and write back the original endings.
- Testing in the browser autosaves to real data: don't type into a real entry; use
  display-only DOM previews or restore what you change.
