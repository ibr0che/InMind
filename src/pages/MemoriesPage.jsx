import { useEffect, useRef, useState } from "react";
import { longDate, shortDate } from "../lib/dates.js";

// One lesson per line. Strip any bullet or number the person typed so the
// list doesn't show a double marker.
const lessonLines = (text = "") =>
  text
    .split("\n")
    .map((line) => line.replace(/^\s*(?:[-*•–]|\d+[.)])\s*/, "").trim())
    .filter(Boolean);

const timeOf = (iso) =>
  new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export default function MemoriesPage({ journal }) {
  const { entries, status, error, reload } = journal;
  const [openId, setOpenId] = useState(null);
  const open = entries.find((entry) => entry.id === openId) || null;

  return (
    <div className="memories">
      <p className="eyebrow">YOUR ARCHIVE</p>
      <h1>Memories</h1>

      {status === "loading" && <p className="subtle">Loading your memories…</p>}
      {status === "error" && (
        <div className="card empty-large">
          <h2>Couldn't load your memories</h2>
          <p>{error}</p>
          <button className="primary" onClick={reload}>
            Try again
          </button>
        </div>
      )}

      {status === "ready" && entries.length === 0 && (
        <div className="card empty-large">
          <span>▣</span>
          <h2>Your story is just beginning.</h2>
          <p>
            As you write more days, this space will fill up with the life you
            want to remember.
          </p>
        </div>
      )}

      {status === "ready" && entries.length > 0 && (
        <div className="memory-grid">
          {entries.map((entry) => (
            <button
              key={entry.id}
              className="pad"
              onClick={() => setOpenId(entry.id)}
            >
              <span className="pad-date">{shortDate(entry.entry_date)}</span>
              <span className="pad-title">{entry.title || "Untitled day"}</span>
              <span className="chip">{entry.mood}</span>
            </button>
          ))}
        </div>
      )}

      {open && (
        <MemoryDialog
          entry={open}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}

// The opened pad. A native modal <dialog> gives Escape-to-close and keeps
// keyboard focus inside it for free.
function MemoryDialog({ entry, onClose }) {
  const ref = useRef(null);
  const [zoomed, setZoomed] = useState(false);
  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const lessons = lessonLines(entry.lessons);
  const notes = [...(entry.notes || [])].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );
  // One photo per day; older entries may hold more (or videos), so show their first photo.
  const photo = entry.media?.find((item) => item.mime_type.startsWith("image")) || null;

  return (
    <dialog
      ref={ref}
      className="pad-open"
      onClose={onClose}
      // a click on the dimmed backdrop lands on the <dialog> itself
      onClick={(event) => event.target === ref.current && ref.current.close()}
    >
      <button
        className="icon-button pad-close"
        aria-label="Close"
        onClick={() => ref.current.close()}
      >
        ×
      </button>

      {/* Same layout for every day: an empty part shows a quiet note instead of disappearing. */}
      <div className="memory-layout">
        <section className="memory-main">
          <header className="memory-box">
            <p className="pad-date">{longDate(entry.entry_date)}</p>
            <h2 className="pad-open-title">{entry.title || "Untitled day"}</h2>
            <div className="memory-meta">
              <span className="chip">{entry.mood}</span>
            </div>
          </header>

          <div className="memory-box memory-highlight">
            <span aria-hidden="true">☼</span>
            {entry.highlight || <span className="memory-empty">No highlight.</span>}
          </div>

          <div className="memory-box memory-entry">
            <p className="memory-label">JOURNAL</p>
            {entry.body ? (
              <p className="memory-body">{entry.body}</p>
            ) : (
              <p className="memory-empty">No writing for this day.</p>
            )}
          </div>
        </section>

        <section className="memory-box memory-notes-box">
          <p className="memory-label">QUICK NOTES</p>
          {notes.length ? (
            <ul className="memory-notes">
              {notes.map((note) => (
                <li key={note.id}>
                  <small>{timeOf(note.created_at)}</small>
                  {note.text}
                </li>
              ))}
            </ul>
          ) : (
            <p className="memory-empty">No notes.</p>
          )}
        </section>

        {/* The photo fills its spot on its own (no box); the box only shows when there's none. */}
        {photo ? (
          <button
            className="memory-media-box memory-photo-button"
            aria-label="View photo full size"
            onClick={() => setZoomed(true)}
          >
            <img className="memory-photo" src={photo.url || undefined} alt={photo.file_name} />
          </button>
        ) : (
          <section className="memory-box memory-media-box">
            <p className="memory-label">PHOTO OF THE DAY</p>
            <p className="memory-empty">No photo.</p>
          </section>
        )}

        <section className="memory-box memory-lessons-box">
          <p className="memory-label">LESSONS OF THE DAY</p>
          {lessons.length ? (
            <ul className="memory-lessons">
              {lessons.map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
          ) : (
            <p className="memory-empty">No lessons.</p>
          )}
        </section>
      </div>
      {zoomed && photo && (
        <PhotoViewer photo={photo} onClose={() => setZoomed(false)} />
      )}
    </dialog>
  );
}

// Full-size photo over the open pad. It is its own modal <dialog>, so Escape
// closes just this layer and returns to the memory underneath.
function PhotoViewer({ photo, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className="photo-viewer"
      // React passes "close" up to the memory's dialog too; stop it here so only the viewer closes
      onClose={(event) => {
        event.stopPropagation();
        onClose();
      }}
      onClick={() => ref.current.close()} // a click anywhere closes it
      aria-label="Photo of the day"
    >
      <img src={photo.url || undefined} alt={photo.file_name} />
    </dialog>
  );
}
