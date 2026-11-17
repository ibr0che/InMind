# InMind API

Protected routes require:

```text
Authorization: Bearer <Supabase access token>
Content-Type: application/json
```

## Authentication

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/auth/signup` | Create a Supabase account and InMind profile |
| POST | `/api/auth/login` | Return a Supabase session |
| GET | `/api/auth/me` | Return the current user and profile |
| PATCH | `/api/auth/me` | Change settings: `{ "username": "jordan" }` (3–30 of `a-z A-Z 0-9 _ . -`; 409 if taken) and/or `{ "theme": "aurora" }` (saved to the account, so it follows you across devices) |

Signup body:

```json
{
  "email": "jordan@example.com",
  "password": "a-strong-password",
  "username": "jordan",
  "timezone": "America/Los_Angeles"
}
```

## Entries

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/entries` | List the signed-in user's entries |
| GET | `/api/entries?date=2026-11-03` | Get one date |
| POST | `/api/entries` | Create an entry |
| PATCH | `/api/entries/:id` | Edit an unlocked entry |
| DELETE | `/api/entries/:id` | Delete an unlocked entry |

Create body:

```json
{
  "entry_date": "2026-11-03",
  "title": "A regular day",
  "body": "Today I worked on InMind.",
  "mood": "Good"
}
```

## Notes and photo

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/entries/:entryId/notes` | Add a timestamped note |
| DELETE | `/api/notes/:id` | Delete a note |
| POST | `/api/entries/:entryId/media/upload` | Upload the day's one photo (raw `image/*` body, name in `X-File-Name`, 50 MB max; 409 if the day already has one) |
| DELETE | `/api/media/:id` | Delete the Storage object and metadata |

Notes are up to 100 characters, 10 per day. The server stores the photo in the private `journal-media` Supabase Storage bucket at:

```text
<user-id>/<entry-id>/<file-name>
```
