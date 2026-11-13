# InMind Journal

InMind is a small personal-journal prototype inspired by the idea of capturing life as it happens. It is intentionally simple to read and change.

## Run it

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

## What is included

- Daily journal title, body, mood, highlight, and lessons.
- A countdown to midnight, when the entry locks.
- Timestamped quick notes throughout the day.
- One photo of the day per entry.
- Memories: past entries as note pads that open up.
- Supabase for accounts, the Postgres database (entries, notes, media metadata) and private photo storage.
- Server-side midnight lock in each user's timezone, rate-limited sign-in, Helmet security headers, JSON size limits and server-side validation.

The API routes are documented in [server/API.md](server/API.md). Run [server/sql/perf-indexes.sql](server/sql/perf-indexes.sql) once in the Supabase SQL editor to add the indexes the API relies on.

## Important prototype limitations

This is a prototype, not yet a production privacy product. Before deploying real journals, add encrypted backups, HTTPS, audit logs, account deletion/export, and automated backups.

## Suggested next steps

1. Paginate the entry list (the streak and Memories currently load every entry).
2. Add account deletion and data export.
3. Add offline writes with IndexedDB and a sync queue.
4. Add an AI service that analyzes only user-authorized date ranges and clearly explains its confidence and data sources.
5. Add tests for locking, privacy, sharing, offline sync, and account deletion.
