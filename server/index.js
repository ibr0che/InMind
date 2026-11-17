import "dotenv/config";
import { randomUUID } from "node:crypto";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
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
app.use(compression());
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

const DEFAULT_TIMEZONE = "America/Los_Angeles";
// Building an Intl formatter is the slow part, so keep one per timezone.
const dateFormatters = new Map();
function dateFormatter(timeZone) {
  let formatter = dateFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", { timeZone }); // throws on bad zone
    dateFormatters.set(timeZone, formatter);
  }
  return formatter;
}

function todayInUserTimezone(user) {
  const now = new Date();
  try {
    return dateFormatter(user?.user_metadata?.timezone || DEFAULT_TIMEZONE).format(now);
  } catch {
    return dateFormatter(DEFAULT_TIMEZONE).format(now);
  }
}

// Entries are only editable on their own day (in the user's timezone);
// they lock at midnight. This is the server-side source of truth, so
// a stale or tampered client cannot edit a past day.
// `entry` is a row holding at least `entry_date`, or null if none was found.
// Returns null when editable, otherwise { status, error } to send.
function editProblem(req, entry, queryError) {
  if (queryError) return { status: 400, error: queryError.message };
  if (!entry) return { status: 404, error: "Entry not found." };
  if (entry.entry_date !== todayInUserTimezone(req.user))
    return { status: 423, error: "This entry is locked." };
  return null;
}

function fetchEntryDate(req, entryId) {
  return req.supabase
    .from("entries")
    .select("id, entry_date")
    .eq("id", entryId)
    .eq("user_id", req.user.id)
    .maybeSingle();
}

// The media bucket is private, so the client needs short-lived signed URLs to
// display photos. Signed URLs live for an hour; reuse one for up to 50 minutes
// so repeat loads skip the Storage round trip. A path is only ever looked up
// for rows the database (row-level security) already returned to this user.
const URL_REUSE_MS = 50 * 60 * 1000;
const URL_CACHE_MAX = 5000;
const signedUrlCache = new Map(); // storage_path -> { url, expiresAt }

function forgetSignedUrl(path) {
  signedUrlCache.delete(path);
}

// Adds a `url` field to every media row.
async function withMediaUrls(supabase, entries) {
  const list = Array.isArray(entries) ? entries : [entries];
  const media = list.flatMap((entry) => entry.media || []);
  if (!media.length) return entries;

  const now = Date.now();
  const missing = [];
  for (const item of media) {
    const hit = signedUrlCache.get(item.storage_path);
    item.url = hit && hit.expiresAt > now ? hit.url : undefined;
    if (item.url === undefined) missing.push(item.storage_path);
  }
  if (missing.length) {
    const { data } = await supabase.storage
      .from(MEDIA_BUCKET)
      .createSignedUrls(missing, SIGNED_URL_SECONDS);
    for (const { path, signedUrl } of data || []) {
      if (!signedUrl) continue;
      if (signedUrlCache.size >= URL_CACHE_MAX)
        signedUrlCache.delete(signedUrlCache.keys().next().value); // oldest
      signedUrlCache.set(path, { url: signedUrl, expiresAt: now + URL_REUSE_MS });
    }
    for (const item of media)
      if (item.url === undefined)
        item.url = signedUrlCache.get(item.storage_path)?.url || null;
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

// The app needs the full user (created_at, fresh metadata) here, which the
// token's claims don't carry, so fetch it — alongside the profile, not after.
app.get("/api/auth/me", requireUser, async (req, res, next) => {
  try {
    const [userResult, profileResult] = await Promise.all([
      req.supabase.auth.getUser(req.token),
      req.supabase.from("profiles").select("*").eq("id", req.user.id).maybeSingle(),
    ]);
    if (userResult.error || !userResult.data.user)
      return res.status(401).json({ error: "Invalid or expired access token." });
    if (profileResult.error)
      return res.status(400).json({ error: profileResult.error.message });
    const user = userResult.data.user;
    res.json({
      user,
      profile: profileResult.data,
      today: todayInUserTimezone(user),
    });
  } catch (error) {
    next(error);
  }
});

// Change the signed-in user's settings: username and/or theme.
// - username updates the profile row (what the app shows) and the auth
//   metadata (the fallback), so the two never disagree.
// - theme is stored in the auth metadata, so it follows the account to every
//   device. Only its shape is checked; the app ignores names it doesn't know.
const THEME_ID = /^[a-z][a-z0-9-]{0,29}$/;
app.patch("/api/auth/me", requireUser, async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const hasUsername = body.username !== undefined;
    const hasTheme = body.theme !== undefined;
    if (!hasUsername && !hasTheme)
      return res.status(400).json({ error: "Nothing to update." });

    const metadata = {};
    if (hasTheme) {
      if (typeof body.theme !== "string" || !THEME_ID.test(body.theme))
        return res.status(400).json({ error: "Unknown theme." });
      metadata.theme = body.theme;
    }

    let profile = null;
    if (hasUsername) {
      const username = typeof body.username === "string" ? body.username.trim() : "";
      if (!USERNAME.test(username))
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
      profile = data;
      metadata.username = username;
    }

    // supabase-js can't update a user without a stored session, so call the
    // Auth REST API directly. It merges these keys into the existing metadata.
    const auth = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
      method: "PUT",
      headers: {
        apikey: process.env.SUPABASE_PUBLISHABLE_KEY,
        Authorization: req.headers.authorization,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ data: metadata }),
    });
    if (!auth.ok && hasTheme)
      return res.status(502).json({ error: "Couldn't save your theme." });
    res.json({ profile, user: auth.ok ? await auth.json() : null });
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

    // Returns only the entry's own columns: autosave doesn't change notes or
    // the photo, and the client keeps the ones it already has.
    const updates = { ...parsed.value, updated_at: new Date().toISOString() };
    const { data, error } = await req.supabase
      .from("entries")
      .update(updates)
      .eq("id", req.params.id)
      .eq("user_id", req.user.id)
      .eq("entry_date", todayInUserTimezone(req.user))
      .select("*")
      .single();
    if (error)
      return res.status(error.code === "PGRST116" ? 423 : 400).json({
        error:
          error.code === "PGRST116"
            ? "Entry is locked or does not exist."
            : error.message,
      });
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
    // The lock check and the note count are independent: run them together.
    const [{ data: entry, error: entryError }, { count, error: countError }] =
      await Promise.all([
        fetchEntryDate(req, req.params.entryId),
        req.supabase
          .from("notes")
          .select("id", { count: "exact", head: true })
          .eq("entry_id", req.params.entryId),
      ]);
    const problem = editProblem(req, entry, entryError);
    if (problem) return res.status(problem.status).json({ error: problem.error });
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
    // Fetch the note and its entry's date in one query (embedded join).
    const { data: note, error: lookupError } = await req.supabase
      .from("notes")
      .select("entry_id, entries(entry_date)")
      .eq("id", req.params.id)
      .eq("user_id", req.user.id)
      .maybeSingle();
    if (lookupError)
      return res.status(400).json({ error: lookupError.message });
    if (!note) return res.status(404).json({ error: "Note not found." });
    const problem = editProblem(req, note.entries);
    if (problem) return res.status(problem.status).json({ error: problem.error });
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
      const [{ data: entry, error: entryError }, { count, error: countError }] =
        await Promise.all([
          fetchEntryDate(req, req.params.entryId),
          req.supabase
            .from("media")
            .select("id", { count: "exact", head: true })
            .eq("entry_id", req.params.entryId),
        ]);
      const problem = editProblem(req, entry, entryError);
      if (problem)
        return res.status(problem.status).json({ error: problem.error });
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

      // Record the row and sign the display URL at the same time.
      const [{ data, error }, signed] = await Promise.all([
        req.supabase
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
          .single(),
        req.supabase.storage
          .from(MEDIA_BUCKET)
          .createSignedUrl(storagePath, SIGNED_URL_SECONDS),
      ]);
      if (error) {
        // Don't leave an orphaned file behind if the database insert fails.
        await req.supabase.storage.from(MEDIA_BUCKET).remove([storagePath]);
        return res.status(400).json({ error: error.message });
      }
      const url = signed.data?.signedUrl || null;
      if (url)
        signedUrlCache.set(storagePath, {
          url,
          expiresAt: Date.now() + URL_REUSE_MS,
        });
      res.status(201).json({ media: { ...data, url } });
    } catch (error) {
      next(error);
    }
  },
);

app.delete("/api/media/:id", requireUser, async (req, res, next) => {
  try {
    // Fetch the photo and its entry's date in one query (embedded join).
    const { data: media, error: lookupError } = await req.supabase
      .from("media")
      .select("storage_path, entry_id, entries(entry_date)")
      .eq("id", req.params.id)
      .eq("user_id", req.user.id)
      .single();
    if (lookupError)
      return res.status(404).json({ error: "Media record not found." });
    const problem = editProblem(req, media.entries);
    if (problem) return res.status(problem.status).json({ error: problem.error });
    // Remove the file and the row together.
    const [{ error: storageError }, { error }] = await Promise.all([
      req.supabase.storage.from(MEDIA_BUCKET).remove([media.storage_path]),
      req.supabase
        .from("media")
        .delete()
        .eq("id", req.params.id)
        .eq("user_id", req.user.id),
    ]);
    forgetSignedUrl(media.storage_path);
    if (storageError)
      return res.status(400).json({ error: storageError.message });
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
