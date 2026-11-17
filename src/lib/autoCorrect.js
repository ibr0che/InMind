// Word-style auto-correct, applied only around the character just typed, so
// pasted text and earlier edits are never rewritten:
//   - capitalizes the first letter of a sentence and a lone "i"
//   - adds the apostrophe to contractions: "ive " -> "I've ", "hed " -> "he'd "
//
//   prev   - the text before this keystroke
//   next   - the text after it (what the browser put in the box)
//   cursor - the caret position after the keystroke (selectionStart)
//   max    - the box's maxLength; a fix that would go over it is skipped
//
// Returns { text, cursor }: the text to keep and where the caret belongs.

// Words ending in "." that don't end a sentence ("e.g. this", not "e.g. This").
const ABBREVIATION = /(?:^|\s)(?:e\.g|i\.e|etc|vs|approx|mr|mrs|ms|dr|st|jr|sr)\.\s+$/i;
// Start of the text, a new line, or ". " "! " "? " (but not "... ", which trails off).
const SENTENCE_START = /(?:^|\n|[^.]\.\s+|^\.\s+|[!?]\s+)$/;
// A lone "i" right before what was just typed: "so i" + " " -> "so I ".
const LONE_I = /(?:^|\s)i$/;
// Typing one of these ends a word, which is when a contraction gets fixed.
const WORD_END = /[\s.,!?;:)"]/;
// The whole word right before the caret (not part of "don't" or "it's").
const LAST_WORD = /(?:^|[^A-Za-z'’])([A-Za-z]+)$/;

// Missing-apostrophe spellings. Left out on purpose because they are common
// real words too: ill, well, were, wed, shed, hell, shell, its, lets, id.
// ("cant" and "wont" are rare enough as words that Word fixes them, so we do too.)
const CONTRACTIONS = {
  i: "I", // not a contraction, but fixLastWord should catch a final lone "i" too
  im: "I'm", ive: "I've", youre: "you're", youve: "you've", youll: "you'll",
  youd: "you'd", hes: "he's", hed: "he'd", shes: "she's",
  itll: "it'll", itd: "it'd", weve: "we've", theyre: "they're",
  theyve: "they've", theyll: "they'll", theyd: "they'd", thats: "that's",
  thatll: "that'll", whats: "what's", whos: "who's", whove: "who've",
  wheres: "where's", theres: "there's", therell: "there'll", heres: "here's",
  hows: "how's", whyd: "why'd", dont: "don't", doesnt: "doesn't",
  didnt: "didn't", isnt: "isn't", arent: "aren't", wasnt: "wasn't",
  werent: "weren't", hasnt: "hasn't", havent: "haven't", hadnt: "hadn't",
  wont: "won't", wouldnt: "wouldn't", couldnt: "couldn't",
  shouldnt: "shouldn't", cant: "can't", mustnt: "mustn't", neednt: "needn't",
  aint: "ain't", wouldve: "would've", couldve: "could've",
  shouldve: "should've", mightve: "might've", mustve: "must've", yall: "y'all",
};

// "dont" -> "don't", "Dont" -> "Don't", "DONT" -> "DON'T"; "I" words stay "I".
function matchCase(word, fixed) {
  if (fixed.startsWith("I")) return word.length > 1 && word === word.toUpperCase() ? fixed.toUpperCase() : fixed;
  if (word.length > 1 && word === word.toUpperCase()) return fixed.toUpperCase();
  if (word[0] === word[0].toUpperCase()) return fixed[0].toUpperCase() + fixed.slice(1);
  return fixed;
}

// Adds the apostrophe if `text` ends with a contraction missing one.
// Also used on submit, when no space was typed after the last word.
export function fixLastWord(text) {
  const match = LAST_WORD.exec(text);
  const fixed = match && CONTRACTIONS[match[1].toLowerCase()];
  if (!fixed) return text;
  return text.slice(0, -match[1].length) + matchCase(match[1], fixed);
}

export function autoCorrect(prev, next, cursor, max = Infinity) {
  const unchanged = { text: next, cursor };
  // Only a single typed character; pastes, deletions and replacements are left alone.
  if (next.length !== prev.length + 1 || cursor < 1) return unchanged;

  const before = next.slice(0, cursor - 1);
  const typed = next[cursor - 1];
  const after = next.slice(cursor);

  if (/[a-z]/.test(typed) && SENTENCE_START.test(before) && !ABBREVIATION.test(before)) {
    return { text: before + typed.toUpperCase() + after, cursor };
  }
  if (/[\s.,!?;:'’]/.test(typed) && LONE_I.test(before)) {
    return { text: before.slice(0, -1) + "I" + typed + after, cursor };
  }
  if (WORD_END.test(typed)) {
    const fixed = fixLastWord(before);
    const grew = fixed.length - before.length;
    if (grew && next.length + grew <= max) {
      return { text: fixed + typed + after, cursor: cursor + grew };
    }
  }
  return unchanged;
}
