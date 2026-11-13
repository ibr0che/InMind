import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { formatRemaining, longDate } from "../lib/dates.js";
import { autoCapitalize } from "../lib/autoCapitalize.js";

const MOODS = ["Great", "Good", "Okay", "Low", "Rough"];
const EMPTY_FORM = {
  title: "",
  body: "",
  mood: "Okay",
  highlight: "",
  lessons: "",
};
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const AUTOSAVE_MS = 1500;
const HIGHLIGHT_MAX = 280;
const LESSONS_MAX = 100;
const TITLE_MAX = 25;
const BODY_MAX = 2500;
const NOTE_MAX = 100;
const NOTES_PER_DAY = 10; // matches the server

const pickFields = (entry) => ({
  title: entry.title ?? "",
  body: entry.body ?? "",
  mood: entry.mood ?? "Okay",
  highlight: entry.highlight ?? "",
  // Trailing blank lines look empty but hide the placeholder and stretch the box.
  lessons: (entry.lessons ?? "").trimEnd(),
});

const hasText = (form) =>
  Boolean(
    form.title.trim() ||
    form.body.trim() ||
    form.highlight.trim() ||
    form.lessons.trim(),
  );

// Sizes a textarea to its text, so it grows line by line instead of scrolling.
function useAutoHeight(ref, ...deps) {
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    // Empty: let the CSS rows decide, so the box always fits its placeholder.
    if (!box.value) {
      box.style.height = "";
      return;
    }
    box.style.height = "auto";
    box.style.height = `${box.scrollHeight}px`;
  }, deps);
}

export default function TodayPage({ today, secondsLeft, journal }) {
  const {
    entries,
    status,
    saveToday,
    addNote,
    removeNote,
    addMedia,
    removeMedia,
  } = journal;

  const entry = useMemo(
    () => entries.find((item) => item.entry_date === today) || null,
    [entries, today],
  );
  const notes = useMemo(
    () =>
      [...(entry?.notes || [])].sort((a, b) =>
        a.created_at.localeCompare(b.created_at),
      ),
    [entry],
  );
  const photo = entry?.media?.[0] || null; // one photo per day
  const notesFull = notes.length >= NOTES_PER_DAY;

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

  // The highlight, note and lessons boxes grow with their text, so nothing is
  // cut off and they never need a scrollbar.
  // (Hooks must run before the early returns below, so these live up here.)
  const highlightRef = useRef(null);
  const noteRef = useRef(null);
  const lessonsRef = useRef(null);
  useAutoHeight(highlightRef, form.highlight, status);
  useAutoHeight(noteRef, noteText, status);
  useAutoHeight(lessonsRef, form.lessons, status);

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

  // The latest values, read by the timers below. "save" gets a new identity on
  // every render (the clock re-renders the page each second), so depending on
  // it directly would restart the autosave timer before it could ever fire.
  const latest = useRef({});
  latest.current = { form, dirty, entry, save };

  // Autosave shortly after the person stops typing.
  useEffect(() => {
    if (!dirty || status !== "ready") return undefined;
    if (!entry && !hasText(form)) return undefined;
    const timer = setTimeout(() => latest.current.save(latest.current.form), AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [form, dirty, status, entry]);

  // Leaving the page (Memories, Profile) saves whatever hasn't been saved yet.
  useEffect(
    () => () => {
      const { form, dirty, entry, save } = latest.current;
      if (dirty && (entry || hasText(form))) save(form);
    },
    [],
  );

  function change(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setDirty(true);
  }

  // Notes and media belong to an entry, so make sure today's entry exists.
  const ensureEntry = async () => entry ?? (await saveToday(today, form));

  async function handleAddNote(event) {
    event.preventDefault();
    const text = noteText.trim();
    if (!text || notesFull) return;
    try {
      const target = await ensureEntry();
      await addNote(target.id, text);
      setNoteText("");
      setProblem("");
    } catch (error) {
      setProblem(error.message);
    }
  }

  async function handleFile(event) {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/"))
      return setProblem(`${file.name} isn't a photo.`);
    if (file.size > MAX_UPLOAD_BYTES)
      return setProblem(`${file.name} is over the 50 MB limit.`);
    setUploading(true);
    setProblem("");
    try {
      const target = await ensureEntry();
      await addMedia(target.id, file);
    } catch (error) {
      setProblem(error.message);
    } finally {
      setUploading(false);
    }
  }

  const progress = Math.max(
    0,
    Math.min(100, 100 - (secondsLeft / 86400) * 100),
  );

  if (status === "loading")
    return <p className="subtle">Loading your journal…</p>;
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
    <div className="today">
      <div className="date-row">
        <div>
          <p className="eyebrow">{longDate(today).toUpperCase()}</p>
          <h1>Today</h1>
        </div>
        <div className="today-meta">
          <span className="save-pill" role="status">
            {saveState || "Saves as you write"}
          </span>
          <div className="countdown">
            <span>◷ Editing closes in</span>
            <strong>{formatRemaining(secondsLeft)}</strong>
          </div>
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
          Add to your day as it happens. Your entry locks at midnight so your
          memories stay honest.
        </p>
      </div>

      <div className="today-grid">
        <section className="card highlight-card">
          <div className="highlight-icon" aria-hidden="true">
            ☼
          </div>
          <div className="highlight-body">
            <label className="highlight-label" htmlFor="highlight">
              HIGHLIGHT OF THE DAY
            </label>
            <textarea
              id="highlight"
              ref={highlightRef}
              className="highlight-input"
              rows={2}
              maxLength={HIGHLIGHT_MAX}
              value={form.highlight}
              onChange={(e) => change("highlight", e.target.value)}
              placeholder="What was the best part of today?"
            />
          </div>
        </section>

        <div className="today-main">
          <section className="card journal-card">
            <div className="card-head">
              <span>DAILY ENTRY</span>
            </div>
            <input
              className="title-input"
              maxLength={TITLE_MAX}
              value={form.title}
              onChange={(e) => change("title", e.target.value)}
              placeholder="Give today a title..."
              aria-label="Entry title"
            />
            <textarea
              className="body-input"
              maxLength={BODY_MAX}
              value={form.body}
              onChange={(e) => {
                // Word-style capitals as you type. Fix the box directly and put the
                // caret back, so React doesn't jump it to the end.
                const box = e.target;
                const caret = box.selectionStart;
                const text = autoCapitalize(form.body, box.value, caret);
                if (text !== box.value) {
                  box.value = text;
                  box.setSelectionRange(caret, caret);
                }
                change("body", text);
              }}
              placeholder="What is on your mind? What do you want to remember about today?"
              aria-label="Journal entry"
            />
            <div className="entry-footer">
              <label className="mood-select">
                Mood{" "}
                <select
                  value={form.mood}
                  onChange={(e) => change("mood", e.target.value)}
                >
                  {MOODS.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <button className="primary" onClick={() => save(form)}>
                Save entry
              </button>
            </div>
          </section>

          <section className="card lessons-card">
            <div className="card-head">
              <span>LESSONS OF THE DAY</span>
            </div>
            <textarea
              ref={lessonsRef}
              className="lessons-input"
              rows={2}
              maxLength={LESSONS_MAX}
              value={form.lessons}
              onChange={(e) => change("lessons", e.target.value)}
              placeholder={"Lessons..."}
              aria-label="Lessons of the day"
            />
          </section>
        </div>

        <div className="today-side">
          {problem && (
            <p className="inline-error" role="alert">
              {problem}
            </p>
          )}

          <div className="card notes-card">
            <div className="card-head">
              <span>QUICK NOTES</span>
              <span>
                {notes.length}/{NOTES_PER_DAY} today
              </span>
            </div>
            <form onSubmit={handleAddNote}>
              <textarea
                ref={noteRef}
                rows={1}
                maxLength={NOTE_MAX}
                disabled={notesFull}
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                // Enter adds the note; Shift+Enter starts a new line.
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    e.currentTarget.form.requestSubmit();
                  }
                }}
                placeholder={
                  notesFull
                    ? `That’s ${NOTES_PER_DAY} notes for today.`
                    : "Capture a moment..."
                }
                aria-label="New note"
              />
              <button aria-label="Add note" disabled={notesFull}>
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
                        {new Date(item.created_at).toLocaleTimeString([], {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </small>
                    </div>
                    <button
                      className="icon-button"
                      aria-label="Delete note"
                      onClick={() =>
                        removeNote(entry.id, item.id).catch((e) =>
                          setProblem(e.message),
                        )
                      }
                    >
                      ×
                    </button>
                  </div>
                ))
              ) : (
                <p className="empty">Small notes become big memories.</p>
              )}
            </div>
          </div>

          <div className="card media-card">
            <div className="card-head">
              <span>PHOTO OF THE DAY</span>
            </div>
            {photo ? (
              <div className="media-item day-photo">
                <img src={photo.url || undefined} alt={photo.file_name} />
                <button
                  className="icon-button media-remove"
                  aria-label={`Remove ${photo.file_name}`}
                  onClick={() =>
                    removeMedia(entry.id, photo.id).catch((e) =>
                      setProblem(e.message),
                    )
                  }
                >
                  ×
                </button>
              </div>
            ) : (
              <label className={`upload ${uploading ? "disabled" : ""}`}>
                <input
                  disabled={uploading}
                  type="file"
                  accept="image/*"
                  onChange={handleFile}
                />
                <span>{uploading ? "…" : "＋"}</span>
                <strong>
                  {uploading ? "Uploading" : "Add one photo that sums up today"}
                </strong>
                <small>Up to 50 MB</small>
              </label>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
