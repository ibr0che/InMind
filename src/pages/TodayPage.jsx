import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatRemaining, longDate } from "../lib/dates.js";

const MOODS = ["Great", "Good", "Okay", "Low", "Rough"];
const EMPTY_FORM = { title: "", body: "", mood: "Okay", visibility: "private" };
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const AUTOSAVE_MS = 1500;

const pickFields = (entry) => ({
  title: entry.title ?? "",
  body: entry.body ?? "",
  mood: entry.mood ?? "Okay",
  visibility: entry.visibility ?? "private",
});

export default function TodayPage({ today, secondsLeft, journal }) {
  const { entries, status, saveToday, lock, addNote, removeNote, addMedia, removeMedia } = journal;

  const entry = useMemo(() => entries.find((item) => item.entry_date === today) || null, [entries, today]);
  const locked = Boolean(entry?.locked);
  const notes = useMemo(
    () => [...(entry?.notes || [])].sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [entry],
  );
  const media = entry?.media || [];

  const [form, setForm] = useState(EMPTY_FORM);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState("");
  const [noteText, setNoteText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [problem, setProblem] = useState("");

  // Fill the form once per day, when the saved entry first arrives. Later
  // saves must not overwrite what the person is typing.
  const hydratedFor = useRef(null);
  useEffect(() => {
    if (status !== "ready" || hydratedFor.current === today) return;
    hydratedFor.current = today;
    setForm(entry ? pickFields(entry) : EMPTY_FORM);
    setDirty(false);
    setSaveState("");
  }, [status, today, entry]);

  const save = useCallback(
    async (fields) => {
      setDirty(false);
      setSaveState("Saving…");
      try {
        await saveToday(today, fields);
        setSaveState("Saved just now");
      } catch (error) {
        setSaveState(error.message);
      }
    },
    [saveToday, today],
  );

  // Autosave shortly after the person stops typing.
  useEffect(() => {
    if (!dirty || locked || status !== "ready") return undefined;
    if (!entry && !form.title.trim() && !form.body.trim()) return undefined;
    const timer = setTimeout(() => save(form), AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [form, dirty, locked, status, entry, save]);

  function change(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setDirty(true);
  }

  // Notes and media belong to an entry, so make sure today's entry exists.
  const ensureEntry = async () => entry ?? (await saveToday(today, form));

  async function handleAddNote(event) {
    event.preventDefault();
    const text = noteText.trim();
    if (!text || locked) return;
    try {
      const target = await ensureEntry();
      await addNote(target.id, text);
      setNoteText("");
      setProblem("");
    } catch (error) {
      setProblem(error.message);
    }
  }

  async function handleFiles(event) {
    const files = [...event.target.files];
    event.target.value = "";
    if (!files.length || locked) return;
    setUploading(true);
    setProblem("");
    try {
      const target = await ensureEntry();
      for (const file of files) {
        if (!/^(image|video)\//.test(file.type)) {
          setProblem(`${file.name} isn't a photo or video.`);
        } else if (file.size > MAX_UPLOAD_BYTES) {
          setProblem(`${file.name} is over the 50 MB limit.`);
        } else {
          await addMedia(target.id, file);
        }
      }
    } catch (error) {
      setProblem(error.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleLock() {
    if (!entry) return;
    if (!window.confirm("Lock today's entry early? You will not be able to edit it afterward.")) return;
    try {
      if (dirty) await saveToday(today, form); // don't lose unsaved edits
      setDirty(false);
      await lock(entry.id);
      setSaveState("");
    } catch (error) {
      setProblem(error.message);
    }
  }

  const progress = Math.max(0, Math.min(100, 100 - (secondsLeft / 86400) * 100));

  if (status === "loading") return <p className="subtle">Loading your journal…</p>;
  if (status === "error") {
    return (
      <div className="card empty-large">
        <h2>Couldn't load your journal</h2>
        <p>{journal.error}</p>
        <button className="primary" onClick={journal.reload}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="date-row">
        <div>
          <p className="eyebrow">{longDate(today).toUpperCase()}</p>
          <h1>Today</h1>
        </div>
        <div className={`countdown ${locked ? "locked" : ""}`}>
          <span>
            {locked ? "🔒" : "◷"} {locked ? "Entry locked" : "Editing closes in"}
          </span>
          <strong>{locked ? "Come back tomorrow" : formatRemaining(secondsLeft)}</strong>
        </div>
      </div>
      <div className="progress">
        <span style={{ width: `${progress}%` }} />
      </div>
      <div className="notice">
        <span>✦</span>
        <p>
          <strong>A little moment, made permanent.</strong>
          <br />
          Add to your day as it happens. Your entry locks at midnight so your memories stay honest.
        </p>
      </div>

      <div className="journal-grid">
        <div className="main-card card">
          <div className="card-head">
            <span>DAILY ENTRY</span>
            <span className="saved" role="status">
              {saveState || (locked ? "Locked" : "Saves as you write")}
            </span>
          </div>
          <input
            className="title-input"
            disabled={locked}
            value={form.title}
            onChange={(e) => change("title", e.target.value)}
            placeholder="Give today a title..."
          />
          <textarea
            className="body-input"
            disabled={locked}
            value={form.body}
            onChange={(e) => change("body", e.target.value)}
            placeholder="What is on your mind? What do you want to remember about today?"
          />
          <div className="entry-footer">
            <label className="mood-select">
              Mood{" "}
              <select disabled={locked} value={form.mood} onChange={(e) => change("mood", e.target.value)}>
                {MOODS.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label className="visibility">
              {form.visibility === "private" ? "▣" : "♧"}{" "}
              <select disabled={locked} value={form.visibility} onChange={(e) => change("visibility", e.target.value)}>
                <option value="private">Only me</option>
                <option value="friends">Friends</option>
              </select>
            </label>
            <button className="primary" disabled={locked} onClick={() => save(form)}>
              Save entry
            </button>
          </div>
        </div>

        <div className="side-stack">
          {problem && (
            <p className="inline-error" role="alert">
              {problem}
            </p>
          )}

          <div className="card notes-card">
            <div className="card-head">
              <span>QUICK NOTES</span>
              <span>{notes.length} today</span>
            </div>
            <form onSubmit={handleAddNote}>
              <input
                disabled={locked}
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Capture a moment..."
                aria-label="New note"
              />
              <button disabled={locked} aria-label="Add note">
                ＋
              </button>
            </form>
            <div className="notes-list">
              {notes.length ? (
                notes.map((item) => (
                  <div className="note" key={item.id}>
                    <span className="note-dot" />
                    <div>
                      <p>{item.text}</p>
                      <small>
                        {new Date(item.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                      </small>
                    </div>
                    {!locked && (
                      <button
                        className="icon-button"
                        aria-label="Delete note"
                        onClick={() => removeNote(entry.id, item.id).catch((e) => setProblem(e.message))}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <p className="empty">Small notes become big memories.</p>
              )}
            </div>
          </div>

          <div className="card media-card">
            <div className="card-head">
              <span>MEDIA</span>
              <span>{media.length} added</span>
            </div>
            <label className={`upload ${locked || uploading ? "disabled" : ""}`}>
              <input disabled={locked || uploading} type="file" accept="image/*,video/*" multiple onChange={handleFiles} />
              <span>{uploading ? "…" : "＋"}</span>
              <strong>{uploading ? "Uploading" : "Add a photo or video"}</strong>
              <small>Up to 50 MB each</small>
            </label>
            {media.length > 0 && (
              <div className="media-grid">
                {media.map((item) => (
                  <div className="media-item" key={item.id}>
                    {item.mime_type.startsWith("video") ? (
                      <video src={item.url || undefined} controls />
                    ) : (
                      <img src={item.url || undefined} alt={item.file_name} />
                    )}
                    {!locked && (
                      <button
                        className="icon-button media-remove"
                        aria-label={`Remove ${item.file_name}`}
                        onClick={() => removeMedia(entry.id, item.id).catch((e) => setProblem(e.message))}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bottom-row">
        <div className="card reflection">
          <span className="reflection-icon">◒</span>
          <div>
            <strong>End-of-day reflection</strong>
            <p>AI insights will live here later — patterns, habits, and gentle suggestions based on your journal.</p>
          </div>
          <span className="soon">COMING SOON</span>
        </div>
        <button className="lock-button" disabled={locked || !entry} onClick={handleLock}>
          🔒 Lock entry early
        </button>
      </div>
    </>
  );
}
