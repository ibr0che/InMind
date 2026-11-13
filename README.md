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
- SQLite persistence for entries and notes (using a portable WebAssembly SQLite build).
- Helmet security headers, SQLite WAL mode, JSON size limits, and basic server-side validation.

## Important prototype limitations

This is a demo, not yet a production privacy product. It uses a demo user with no authentication, and uses a browser-local data URL for media. Before deploying real journals, add authentication, authorization checks on every resource, encrypted media storage, encrypted backups, HTTPS, rate limiting, CSRF protection, audit logs, account deletion/export, and automated backups.

The server's midnight lock is currently represented by the client countdown plus the manual lock action. For production, calculate the lock state on the server using a timezone-aware user setting and reject edits after the user's local day ends. The client should never be trusted for access control.

## Suggested next steps

1. Add accounts and sessions (for example, secure, httpOnly cookies).
2. Add a user timezone and a server-side daily lock job/check.
3. Move media to encrypted object storage and save only metadata in SQLite/Postgres.
4. Add offline writes with IndexedDB and a sync queue instead of localStorage.
5. Add an AI service that analyzes only user-authorized date ranges and clearly explains its confidence and data sources.
6. Add tests for locking, privacy, sharing, offline sync, and account deletion.
