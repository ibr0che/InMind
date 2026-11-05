# Daymark API

Protected routes require:

```text
Authorization: Bearer <Supabase access token>
Content-Type: application/json
```

## Authentication

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/auth/signup` | Create a Supabase account and Daymark profile |
| POST | `/api/auth/login` | Return a Supabase session |
| GET | `/api/auth/me` | Return the current user and profile |

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
| POST | `/api/entries/:id/lock` | Lock an entry permanently |
| DELETE | `/api/entries/:id` | Delete an unlocked entry |

Create body:

```json
{
  "entry_date": "2026-11-03",
  "title": "A regular day",
  "body": "Today I worked on Daymark.",
  "mood": "Good",
  "visibility": "private"
}
```

## Notes and media metadata

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/entries/:entryId/notes` | Add a timestamped note |
| DELETE | `/api/notes/:id` | Delete a note |
| POST | `/api/entries/:entryId/media` | Save metadata after a Storage upload |
| DELETE | `/api/media/:id` | Delete the Storage object and metadata |

The actual file upload should go to the private `journal-media` Supabase Storage bucket. Use a path beginning with the authenticated user's ID, such as:

```text
<user-id>/<entry-id>/<file-name>
```
