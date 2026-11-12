import { useState } from "react";
import { longDate } from "../lib/dates.js";

// One lesson per line. Strip any bullet or number the person typed so the
// list doesn't show a double marker.
const lessonLines = (text = "") =>
  text
    .split("\n")
    .map((line) => line.replace(/^\s*(?:[-*•–]|\d+[.)])\s*/, "").trim())
    .filter(Boolean);

export default function MemoriesPage({ journal, today }) {
  const { entries, status, error, reload } = journal;
  const [openId, setOpenId] = useState(null);

  return (
    <div className="simple-page">
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
            As you write more days, this space will become a searchable timeline
            of the life you want to remember.
          </p>
        </div>
      )}

      {status === "ready" && entries.length > 0 && (
        <div className="memory-list">
          {entries.map((entry) => {
            const open = openId === entry.id;
            const sealed = entry.locked || entry.entry_date !== today;
            const lessons = lessonLines(entry.lessons);
            return (
              <article className="card memory" key={entry.id}>
                <button
                  className="memory-head"
                  aria-expanded={open}
                  onClick={() => setOpenId(open ? null : entry.id)}
                >
                  <span className="memory-date">
                    {longDate(entry.entry_date)}
                  </span>
                  <span className="memory-title">
                    {entry.title || "Untitled day"}
                  </span>
                  <span className="memory-meta">
                    <span className="chip">{entry.mood}</span>
                    <span className="chip">
                      {entry.visibility === "friends" ? "Friends" : "Only me"}
                    </span>
                    {lessons.length > 0 && (
                      <span className="chip">
                        {lessons.length}{" "}
                        {lessons.length === 1 ? "lesson" : "lessons"}
                      </span>
                    )}
                    {sealed && <span className="chip">Locked</span>}
                  </span>
                </button>

                {/* The highlight is the headline of the day, so it shows whether or not the card is open. */}
                {entry.highlight && (
                  <p className="memory-highlight">
                    <span aria-hidden="true">☼</span>
                    {entry.highlight}
                  </p>
                )}

                {!open && entry.body && (
                  <p className="memory-excerpt">{entry.body}</p>
                )}

                {open && (
                  <div className="memory-detail">
                    {entry.body && (
                      <>
                        <p className="memory-label">JOURNAL</p>
                        <p className="memory-body">{entry.body}</p>
                      </>
                    )}
                    {!entry.body && lessons.length === 0 && (
                      <p className="empty">No writing for this day.</p>
                    )}

                    {lessons.length > 0 && (
                      <>
                        <p className="memory-label">LESSONS OF THE DAY</p>
                        <ul className="memory-lessons">
                          {lessons.map((line, index) => (
                            <li key={index}>{line}</li>
                          ))}
                        </ul>
                      </>
                    )}

                    {entry.notes?.length > 0 && (
                      <>
                        <p className="memory-label">QUICK NOTES</p>
                        <ul className="memory-notes">
                          {[...entry.notes]
                            .sort((a, b) =>
                              a.created_at.localeCompare(b.created_at),
                            )
                            .map((note) => (
                              <li key={note.id}>
                                <small>
                                  {new Date(note.created_at).toLocaleTimeString(
                                    [],
                                    {
                                      hour: "numeric",
                                      minute: "2-digit",
                                    },
                                  )}
                                </small>
                                {note.text}
                              </li>
                            ))}
                        </ul>
                      </>
                    )}

                    {entry.media?.length > 0 && (
                      <div className="media-grid memory-media">
                        {entry.media.map((item) => (
                          <div className="media-item" key={item.id}>
                            {item.mime_type.startsWith("video") ? (
                              <video src={item.url || undefined} controls />
                            ) : (
                              <img
                                src={item.url || undefined}
                                alt={item.file_name}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
