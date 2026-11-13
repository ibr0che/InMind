import "dotenv/config";
import { randomUUID } from "node:crypto";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { requireUser } from "./auth.js";
import { createUserClient, requireEnvironment } from "./supabase.js";
import rateLimit from "express-rate-limit";

requireEnvironment();

const app = express();
const port = Number(process.env.PORT || 3001);
const clientOrigin = process.env.CLIENT_ORIGIN || "http://localhost:5173";

const MEDIA_BUCKET = "journal-media";
const MAX_MEDIA_BYTES = 50 * 1024 * 1024; // matches Supabase's default per-file cap
const SIGNED_URL_SECONDS = 60 * 60;

app.use(helmet());
app.use(cors({ origin: clientOrigin }));
app.use(express.json({ limit: "1mb" }));

//rate limiter for logins to deter brute force
const limiter = (options) =>
  rateLimit({ standardHeaders: true, legacyHeaders: false, ...options });

// Only failed sign-ins count, so normal use never hits the cap.
const loginLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  message: { error: "Too many sign-in attempts. Try again in a few minutes." },
});
const signupLimiter = limiter({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  message: { error: "Too many sign-up attempts. Try again later." },
});

app.use("/api/auth/login", loginLimiter);
app.use("/api/auth/signup", signupLimiter);
app.use(
  "/api/auth/refresh",
  limiter({
    windowMs: 15 * 60 * 1000,
    limit: 60,
    message: { error: "Too many requests." },
  }),
);

/* ---------- helpers ---------- */

function todayInUserTimezone(user) {
  const format = (timeZone) =>
    new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
  try {
    return format(user.user_metadata?.timezone || "America/Los_Angeles");
  } catch {
    return format("America/Los_Angeles");
  }
}

// Entries are only editable on their own day (in the user's timezone);
// they lock at midnight. This is the server-side source of truth, so
// a stale or tampered client cannot edit a past day.
async function loadEditableEntry(req, res, entryId) {
  const { data, error } = await req.supabase
    .from("entries")
    .select("id, entry_date")
    .eq("id", entryId)
    .eq("user_id", req.user.id)
    .maybeSingle();
  if (error) {
    res.status(400).json({ error: error.message });
    return null;
  }
  if (!data) {
    res.status(404).json({ error: "Entry not found." });
    return null;
  }
  if (data.entry_date !== todayInUserTimezone(req.user)) {
    res.status(423).json({ error: "This entry is locked." });
    return null;
  }
  return data;
}

// The media bucket is private, so the client needs short-lived signed URLs to
// display photos. Adds a `url` field to every media row.
async function withMediaUrls(supabase, entries) {
  const list = Array.isArray(entries) ? entries : [entries];
  const paths = list.flatMap((entry) =>
    (entry.media || []).map((item) => item.storage_path),
  );
  if (!paths.length) return entries;
  const { data } = await supabase.storage
    .from(MEDIA_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_SECONDS);
  const urls = new Map((data || []).map((item) => [item.path, item.signedUrl]));
  for (const entry of list) {
    for (const item of entry.media || []) {
      item.url = urls.get(item.storage_path) || null;
    }
  }
  return entries;
}

const TEXT_LIMITS = { title: 25, body: 2500, highlight: 280, lessons: 100 };
const NOTE_MAX_CHARS = 100;
const NOTES_PER_DAY = 10;
// Shared by sign-up and the username change, so both accept the same names.
const USERNAME = /^[a-zA-Z0-9_.-]{3,30}$/;
const USERNAME_RULE =
  "Usernames are 3–30 letters, numbers, dots, dashes or underscores.";
const MOODS = ["Great", "Good", "Okay", "Low", "Rough"];

// Returns { value } holding only known, valid fields, or { error } with a message safe to show.
// Unknown keys (locked, user_id, ...) are ignored, so a client can't set them.
function parseEntryFields(input = {}) {
  const value = {};
  for (const [key, max] of Object.entries(TEXT_LIMITS)) {
    if (input[key] === undefined) continue;
    if (typeof input[key] !== "string" || input[key].length > max)
      return {
        error: `${key} must be text up to ${max.toLocaleString("en-US")} characters.`,
      };
    value[key] = input[key];
  }
  if (input.mood !== undefined) {
    if (!MOODS.includes(input.mood))
      return { error: "Choose a mood from the list." };
    value.mood = input.mood;
  }
  return { value };
}

/* ---------- health ---------- */

app.get("/", (_req, res) => res.json({ ok: true, service: "inmind-api" }));

/* ---------- auth ---------- */

app.post("/api/auth/signup", async (req, res, next) => {
  try {
    const { email, password, timezone = "America/Los_Angeles" } = req.body;
    const username = req.body.username?.trim();
    if (!email || !password || !username)
      return res
        .status(400)
        .json({ error: "Email, password, and username are required." });
    if (!USERNAME.test(username))
      return res.status(400).json({ error: USERNAME_RULE });
    const supabase = createUserClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username, timezone } },
    });
    if (error)
      return res
        .status(error.status === 429 ? 429 : 400)
        .json({ error: error.message });
    res.status(201).json({
      user: data.user,
      session: data.session,
      message: data.session
        ? undefined
        : "Check your email to confirm your account.",
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res
        .status(400)
        .json({ error: "Email and password are required." });
    const { data, error } = await createUserClient().auth.signInWithPassword({
      email,
      password,
    });
    if (error) return res.status(401).json({ error: error.message });
    res.json(data);
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/logout", async (req, res) => {
  const token = (req.headers.authorization || "").replace(/^Bearer /, "");
  if (token) {
    try {
      await fetch(`${process.env.SUPABASE_URL}/auth/v1/logout?scope=local`, {
        method: "POST",
        headers: {
          apikey: process.env.SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${token}`,
        },
      });
    } catch (error) {
      console.error("[auth] logout revoke failed:", error.message);
    }
  }
  res.status(204).send();
});

// Access tokens expire (about an hour by default). The client trades its
// refresh token for a new session here instead of logging the user out.
app.post("/api/auth/refresh", async (req, res, next) => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token)
      return res.status(400).json({ error: "refresh_token is required." });
    const { data, error } = await createUserClient().auth.refreshSession({
      refresh_token,
    });
    if (error) return res.status(401).json({ error: error.message });
    res.json(data);
  } catch (error) {
    next(error);
  }
});

app.get("/api/auth/me", requireUser, async (req, res) => {
  const { data, error } = await req.supabase
    .from("profiles")
    .select("*")
    .eq("id", req.user.id)
    .maybeSingle();
  if (error) return res.status(400).json({ error: error.message });
  res.json({
    user: req.user,
    profile: data,
    today: todayInUserTimezone(req.user),
  });
});

// Change the signed-in user's username. Updates the profile row (what the app
// shows) and the auth metadata (the fallback), so the two never disagree.
app.patch("/api/auth/me", requireUser, async (req, res, next) => {
  try {
    const username = req.body?.username?.trim();
    if (!USERNAME.test(username || ""))
      return res.status(400).json({ error: USERNAME_RULE });
    const { data, error } = await req.supabase
      .from("profiles")
      .update({ username })
      .eq("id", req.user.id)
      .select()
      .maybeSingle();
    if (error)
      return res.status(error.code === "23505" ? 409 : 400).json({
        error:
          error.code === "23505" ? "That username is taken." : error.message,
      });
    // No row back means no profile, or row-level security blocked the update.
    if (!data)
      return res.status(404).json({ error: "Couldn't update your profile." });
    // supabase-js can't update a user without a stored session, so call the Auth REST API directly.
    await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
      method: "PUT",
      headers: {
        apikey: process.env.SUPABASE_PUBLISHABLE_KEY,
        Authorization: req.headers.authorization,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ data: { username } }),
    });
    res.json({ profile: data });
  } catch (error) {
    next(error);
  }
});

/* ---------- entries ---------- */

app.get("/api/entries", requireUser, async (req, res, next) => {
  try {
    let query = req.supabase
      .from("entries")
      .select("*, notes(*), media(*)")
      .eq("user_id", req.user.id)
      .order("entry_date", { ascending: false });
    if (req.query.date) query = query.eq("entry_date", req.query.date);
    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });
    await withMediaUrls(req.supabase, data);
    res.json({ entries: data });
  } catch (error) {
    next(error);
  }
});

app.post("/api/entries", requireUser, async (req, res, next) => {
  try {
    const { entry_date, ...fields } = req.body ?? {};
    if (!entry_date)
      return res.status(400).json({ error: "entry_date is required." });
    if (entry_date !== todayInUserTimezone(req.user))
      return res
        .status(400)
        .json({ error: "You can only start an entry for today." });
    const parsed = parseEntryFields(fields);
    if (parsed.error) return res.status(400).json({ error: parsed.error });

    const { data, error } = await req.supabase
      .from("entries")
      .insert({
        user_id: req.user.id,
        entry_date,
        title: "",
        body: "",
        highlight: "",
        lessons: "",
        mood: "Okay",
        visibility: "private",
        ...parsed.value, // whatever the client sent overrides the defaults above
      })
      .select("*, notes(*), media(*)")
      .single();
    if (error)
      return res
        .status(error.code === "23505" ? 409 : 400)
        .json({ error: error.message });
    res.status(201).json({ entry: data });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/entries/:id", requireUser, async (req, res, next) => {
  try {
    const parsed = parseEntryFields(req.body ?? {});
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    if (!Object.keys(parsed.value).length)
      return res
        .status(400)
        .json({ error: "No editable fields were provided." });

    const updates = { ...parsed.value, updated_at: new Date().toISOString() };
    const { data, error } = await req.supabase
      .from("entries")
      .update(updates)
      .eq("id", req.params.id)
      .eq("user_id", req.user.id)
      .eq("entry_date", todayInUserTimezone(req.user))
      .select("*, notes(*), media(*)")
      .single();
    if (error)
      return res.status(error.code === "PGRST116" ? 423 : 400).json({
        error:
          error.code === "PGRST116"
            ? "Entry is locked or does not exist."
            : error.message,
      });
    await withMediaUrls(req.supabase, data);
    res.json({ entry: data });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/entries/:id", requireUser, async (req, res, next) => {
  try {
    const { error } = await req.supabase
      .from("entries")
      .delete()
      .eq("id", req.params.id)
      .eq("user_id", req.user.id)
      .eq("entry_date", todayInUserTimezone(req.user));
    if (error) return res.status(400).json({ error: error.message });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

/* ---------- notes ---------- */

app.post("/api/entries/:entryId/notes", requireUser, async (req, res, next) => {
  try {
    const text = typeof req.body.text === "string" ? req.body.text.trim() : "";
    if (!text) return res.status(400).json({ error: "Note text is required." });
    if (text.length > NOTE_MAX_CHARS)
      return res
        .status(400)
        .json({ error: `Notes can be up to ${NOTE_MAX_CHARS} characters.` });
    const entry = await loadEditableEntry(req, res, req.params.entryId);
    if (!entry) return;
    const { count, error: countError } = await req.supabase
      .from("notes")
      .select("id", { count: "exact", head: true })
      .eq("entry_id", entry.id);
    if (countError) return res.status(400).json({ error: countError.message });
    if (count >= NOTES_PER_DAY)
      return res
        .status(400)
        .json({ error: `You can add up to ${NOTES_PER_DAY} notes a day.` });
    const { data, error } = await req.supabase
      .from("notes")
      .insert({
        entry_id: entry.id,
        user_id: req.user.id,
        text,
      })
      .select()
      .single();
    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json({ note: data });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/notes/:id", requireUser, async (req, res, next) => {
  try {
    const { data: note, error: lookupError } = await req.supabase
      .from("notes")
      .select("entry_id")
      .eq("id", req.params.id)
      .eq("user_id", req.user.id)
      .maybeSingle();
    if (lookupError)
      return res.status(400).json({ error: lookupError.message });
    if (!note) return res.status(404).json({ error: "Note not found." });
    const entry = await loadEditableEntry(req, res, note.entry_id);
    if (!entry) return;
    const { error } = await req.supabase
      .from("notes")
      .delete()
      .eq("id", req.params.id)
      .eq("user_id", req.user.id);
    if (error) return res.status(400).json({ error: error.message });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

/* ---------- media ---------- */

// One photo per day. Raw file upload: the browser sends the image bytes as the
// request body (Content-Type: image/*) with the original name in X-File-Name.
// The server stores the file in Supabase Storage and records the metadata.
app.post(
  "/api/entries/:entryId/media/upload",
  requireUser,
  express.raw({ type: "image/*", limit: MAX_MEDIA_BYTES }),
  async (req, res, next) => {
    try {
      const mimeType = (req.headers["content-type"] || "").split(";")[0];
      if (
        !mimeType.startsWith("image/") ||
        !Buffer.isBuffer(req.body) ||
        !req.body.length
      )
        return res
          .status(400)
          .json({ error: "Send a photo as the request body." });
      const entry = await loadEditableEntry(req, res, req.params.entryId);
      if (!entry) return;
      const { count, error: countError } = await req.supabase
        .from("media")
        .select("id", { count: "exact", head: true })
        .eq("entry_id", entry.id);
      if (countError)
        return res.status(400).json({ error: countError.message });
      if (count > 0)
        return res
          .status(409)
          .json({ error: "This day already has a photo. Remove it first." });

      let fileName = "upload";
      try {
        fileName = decodeURIComponent(req.headers["x-file-name"] || "upload");
      } catch {
        /* keep the default name */
      }
      const extension = (fileName.split(".").pop() || "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .slice(0, 8);
      const storagePath = `${req.user.id}/${entry.id}/${randomUUID()}${
        extension && fileName.includes(".") ? `.${extension}` : ""
      }`;

      const { error: storageError } = await req.supabase.storage
        .from(MEDIA_BUCKET)
        .upload(storagePath, req.body, { contentType: mimeType });
      if (storageError)
        return res.status(400).json({ error: storageError.message });

      const { data, error } = await req.supabase
        .from("media")
        .insert({
          entry_id: entry.id,
          user_id: req.user.id,
          storage_path: storagePath,
          file_name: fileName,
          mime_type: mimeType,
          size_bytes: req.body.length,
        })
        .select()
        .single();
      if (error) {
        // Don't leave an orphaned file behind if the database insert fails.
        await req.supabase.storage.from(MEDIA_BUCKET).remove([storagePath]);
        return res.status(400).json({ error: error.message });
      }
      const wrapper = { media: [data] };
      await withMediaUrls(req.supabase, wrapper);
      res.status(201).json({ media: wrapper.media[0] });
    } catch (error) {
      next(error);
    }
  },
);

app.delete("/api/media/:id", requireUser, async (req, res, next) => {
  try {
    const { data: media, error: lookupError } = await req.supabase
      .from("media")
      .select("storage_path, entry_id")
      .eq("id", req.params.id)
      .eq("user_id", req.user.id)
      .single();
    if (lookupError)
      return res.status(404).json({ error: "Media record not found." });
    const entry = await loadEditableEntry(req, res, media.entry_id);
    if (!entry) return;
    const { error: storageError } = await req.supabase.storage
      .from(MEDIA_BUCKET)
      .remove([media.storage_path]);
    if (storageError)
      return res.status(400).json({ error: storageError.message });
    const { error } = await req.supabase
      .from("media")
      .delete()
      .eq("id", req.params.id)
      .eq("user_id", req.user.id);
    if (error) return res.status(400).json({ error: error.message });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

/* ---------- errors ---------- */

app.use((error, _req, res, _next) => {
  if (error.type === "entity.too.large")
    return res
      .status(413)
      .json({ error: "That photo is too large (50 MB max)." });
  if (error.status && error.status < 500)
    return res.status(error.status).json({ error: error.message });
  console.error(error);
  res.status(500).json({ error: "Unexpected server error." });
});

app.listen(port, () => console.log(`API running on http://localhost:${port}`));
