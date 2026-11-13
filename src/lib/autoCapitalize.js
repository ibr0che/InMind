// Word-style auto-capitalization, applied only to the character just typed:
// pasted text and earlier edits are never rewritten.
//
//   prev   - the text before this keystroke
//   next   - the text after it (what the browser put in the box)
//   cursor - the caret position after the keystroke (selectionStart)
//
// Returns the text to keep. It is always the same length as `next`, so the
// caret can stay exactly where it was.

// Words ending in "." that don't end a sentence ("e.g. this", not "e.g. This").
const ABBREVIATION = /(?:^|\s)(?:e\.g|i\.e|etc|vs|approx|mr|mrs|ms|dr|st|jr|sr)\.\s+$/i;
// Start of the text, a new line, or ". " "! " "? " (but not "... ", which trails off).
const SENTENCE_START = /(?:^|\n|[^.]\.\s+|^\.\s+|[!?]\s+)$/;
// A lone "i" right before what was just typed: "so i" + " " -> "so I ".
const LONE_I = /(?:^|\s)i$/;

export function autoCapitalize(prev, next, cursor) {
  // Only a single typed character; pastes, deletions and replacements are left alone.
  if (next.length !== prev.length + 1 || cursor < 1) return next;

  const before = next.slice(0, cursor - 1);
  const typed = next[cursor - 1];
  const after = next.slice(cursor);

  if (/[a-z]/.test(typed) && SENTENCE_START.test(before) && !ABBREVIATION.test(before)) {
    return before + typed.toUpperCase() + after;
  }
  if (/[\s.,!?;:'’]/.test(typed) && LONE_I.test(before)) {
    return before.slice(0, -1) + "I" + typed + after;
  }
  return next;
}
