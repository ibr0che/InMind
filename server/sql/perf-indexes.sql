-- Indexes for the lookups the API makes on every request.
-- Run once in the Supabase SQL editor. "if not exists" makes it safe to re-run.
-- (Postgres does not index foreign-key columns automatically.)

create index if not exists notes_entry_id_idx on public.notes (entry_id);
create index if not exists media_entry_id_idx on public.media (entry_id);

-- Entry lists are filtered by user and sorted by date. Skip this one if a
-- unique (user_id, entry_date) constraint already exists: it already serves
-- as this index.
create index if not exists entries_user_date_idx on public.entries (user_id, entry_date desc);
