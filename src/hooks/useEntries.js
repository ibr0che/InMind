import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";

const newestFirst = (a, b) => b.entry_date.localeCompare(a.entry_date);

// Holds every entry (with its notes and media) and the actions that change
// them. Pages read from here, so there is one source of truth for the UI.
export function useEntries() {
  const [entries, setEntries] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [error, setError] = useState("");

  // The ref mirrors state so back-to-back async actions always see the latest
  // list (state from the last render can be one step behind).
  const entriesRef = useRef([]);
  const creating = useRef(null);

  const setAll = useCallback((updater) => {
    const next = typeof updater === "function" ? updater(entriesRef.current) : updater;
    entriesRef.current = next;
    setEntries(next);
  }, []);

  const load = useCallback(async () => {
    try {
      const { entries: list } = await api.listEntries();
      setAll([...list].sort(newestFirst));
      setStatus("ready");
      setError("");
    } catch (err) {
      setError(err.message);
      setStatus("error");
    }
  }, [setAll]);

  useEffect(() => {
    load();
  }, [load]);

  const merge = useCallback(
    (entry) =>
      setAll((current) => {
        const exists = current.some((item) => item.id === entry.id);
        const next = exists
          ? current.map((item) => (item.id === entry.id ? { ...item, ...entry } : item))
          : [{ notes: [], media: [], ...entry }, ...current];
        return [...next].sort(newestFirst);
      }),
    [setAll],
  );

  const patch = useCallback(
    (id, change) => setAll((current) => current.map((item) => (item.id === id ? change(item) : item))),
    [setAll],
  );

  const findByDate = (date) => entriesRef.current.find((item) => item.entry_date === date);

  // Only one create may be in flight, otherwise two quick actions (typing and
  // adding a note, say) would both try to create today's entry.
  const createToday = (today, fields) => {
    if (!creating.current) {
      creating.current = api
        .createEntry({ entry_date: today, ...fields })
        .then(({ entry }) => {
          merge(entry);
          return entry;
        })
        .finally(() => {
          creating.current = null;
        });
    }
    return creating.current;
  };

  // Creates today's entry on first save, updates it afterwards.
  const saveToday = async (today, fields) => {
    let existing = findByDate(today);
    if (!existing) {
      try {
        return await createToday(today, fields);
      } catch (err) {
        if (err.status !== 409) throw err;
        // Created elsewhere (another tab or device): reload, then update it.
        await load();
        existing = findByDate(today);
        if (!existing) throw err;
      }
    }
    const { entry } = await api.updateEntry(existing.id, fields);
    merge(entry);
    return entry;
  };

  const addNote = async (entryId, text) => {
    const { note } = await api.addNote(entryId, text);
    patch(entryId, (item) => ({ ...item, notes: [...(item.notes || []), note] }));
  };

  const removeNote = async (entryId, noteId) => {
    await api.deleteNote(noteId);
    patch(entryId, (item) => ({ ...item, notes: item.notes.filter((note) => note.id !== noteId) }));
  };

  const addMedia = async (entryId, file) => {
    const { media } = await api.uploadMedia(entryId, file);
    patch(entryId, (item) => ({ ...item, media: [...(item.media || []), media] }));
  };

  const removeMedia = async (entryId, mediaId) => {
    await api.deleteMedia(mediaId);
    patch(entryId, (item) => ({ ...item, media: item.media.filter((media) => media.id !== mediaId) }));
  };

  return { entries, status, error, reload: load, saveToday, addNote, removeNote, addMedia, removeMedia };
}
