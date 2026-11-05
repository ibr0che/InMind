import "dotenv/config";
import { randomUUID } from "node:crypto";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { requireUser } from "./auth.js";
import { createUserClient, requireEnvironment } from "./supabase.js";

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

/* ---------- helpers ---------- */

function todayInUserTimezone(user) {
  const timezone = user.user_metadata?.timezone || "America/Los_Angeles";
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(
    new Date(),
  );
}

// Entries are only editable on their own day (in the user's timezone) and
// until they are manually locked. This is the server-side source of truth, so
// a stale or tampered client cannot edit a past day.
async function loadEditableEntry(req, res, entryId) {
  const { data, error } = await req.supabase
    .from("entries")
    .select("id, entry_date, locked")
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
  if (data.locked || data.entry_date !== todayInUserTimezone(req.user)) {
    res.status(423).json({ error: "This entry is locked." });
    return null;
  }
  return data;
}

// The media bucket is private, so the client needs short-lived signed URLs to
// display photos and videos. Adds a `url` field to every media row.
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

/* ---------- health ---------- */

app.get("/", (_req, res) => res.json({ ok: true, service: "inmind-api" }));

/* ---------- auth ---------- */

app.post("/api/auth/signup", async (req, res, next) => {
  try {
    const {
      email,
      password,
      username,
      timezone = "America/Los_Angeles",
    } = req.body;
    if (!email || !password || !username)
      return res
        .status(400)
        .json({ error: "Email, password, and username are required." });
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

app.post("/api/auth/logout", requireUser, async (req, res) => {
  await req.supabase.auth.signOut();
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
    const {
      entry_date,
      title = "",
      body = "",
      mood = "Okay",
      visibility = "private",
    } = req.body;
    if (!entry_date)
      return res.status(400).json({ error: "entry_date is required." });
    if (entry_date !== todayInUserTimezone(req.user))
      return res
        .status(400)
        .json({ error: "You can only start an entry for today." });
    const { data, error } = await req.supabase
      .from("entries")
      .insert({
        user_id: req.user.id,
        entry_date,
        title,
        body,
        mood,
        visibility,
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
    const allowed = ["title", "body", "mood", "visibility"];
    const updates = Object.fromEntries(
      Object.entries(req.body).filter(([key]) => allowed.includes(key)),
    );
    if (!Object.keys(updates).length)
      return res
        .status(400)
        .json({ error: "No editable fields were provided." });
    updates.updated_at = new Date().toISOString();
    const { data, error } = await req.supabase
      .from("entries")
      .update(updates)
      .eq("id", req.params.id)
      .eq("user_id", req.user.id)
      .eq("entry_date", todayInUserTimezone(req.user))
      .eq("locked", false)
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

app.post("/api/entries/:id/lock", requireUser, async (req, res, next) => {
  try {
    const { data, error } = await req.supabase
      .from("entries")
      .update({
        locked: true,
        locked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", req.params.id)
      .eq("user_id", req.user.id)
      .eq("locked", false)
      .select()
      .single();
    if (error)
      return res.status(error.code === "PGRST116" ? 423 : 400).json({
        error:
          error.code === "PGRST116"
            ? "Entry is already locked or does not exist."
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
      .eq("entry_date", todayInUserTimezone(req.user))
      .eq("locked", false);
    if (error) return res.status(400).json({ error: error.message });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

/* ---------- notes ---------- */

app.post("/api/entries/:entryId/notes", requireUser, async (req, res, next) => {
  try {
    if (!req.body.text?.trim())
      return res.status(400).json({ error: "Note text is required." });
    const entry = await loadEditableEntry(req, res, req.params.entryId);
    if (!entry) return;
    const { data, error } = await req.supabase
      .from("notes")
      .insert({
        entry_id: entry.id,
        user_id: req.user.id,
        text: req.body.text.trim(),
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

// Raw file upload: the browser sends the file bytes as the request body
// (Content-Type: image/* or video/*) with the original name in X-File-Name.
// The server stores the file in Supabase Storage and records the metadata.
app.post(
  "/api/entries/:entryId/media/upload",
  requireUser,
  express.raw({ type: ["image/*", "video/*"], limit: MAX_MEDIA_BYTES }),
  async (req, res, next) => {
    try {
      const mimeType = (req.headers["content-type"] || "").split(";")[0];
      if (!Buffer.isBuffer(req.body) || !req.body.length)
        return res
          .status(400)
          .json({ error: "Send a photo or video as the request body." });
      const entry = await loadEditableEntry(req, res, req.params.entryId);
      if (!entry) return;

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

// Metadata-only route, kept for clients that upload to Storage themselves.
app.post("/api/entries/:entryId/media", requireUser, async (req, res, next) => {
  try {
    const { storage_path, file_name, mime_type, size_bytes = null } = req.body;
    if (!storage_path || !file_name || !mime_type)
      return res.status(400).json({
        error: "storage_path, file_name, and mime_type are required.",
      });
    const entry = await loadEditableEntry(req, res, req.params.entryId);
    if (!entry) return;
    const { data, error } = await req.supabase
      .from("media")
      .insert({
        entry_id: entry.id,
        user_id: req.user.id,
        storage_path,
        file_name,
        mime_type,
        size_bytes,
      })
      .select()
      .single();
    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json({ media: data });
  } catch (error) {
    next(error);
  }
});

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
      .json({ error: "That file is too large (50 MB max)." });
  if (error.status && error.status < 500)
    return res.status(error.status).json({ error: error.message });
  console.error(error);
  res.status(500).json({ error: "Unexpected server error." });
});

app.listen(port, () => console.log(`API running on http://localhost:${port}`));

// A limiter that limits the amount of times someone can attempt a login
//
// import rateLimit from "express-rate-limit";

// const authLimiter = rateLimit({
//   windowMs: 15 * 60 * 1000,
//   limit: 10,
//   standardHeaders: true,
//   legacyHeaders: false,
//   message: { error: "Too many attempts. Try again in a few minutes." },
// });

// app.use("/api/auth/login", authLimiter);
// app.use("/api/auth/signup", authLimiter);
// app.use("/api/auth/refresh", authLimiter);
