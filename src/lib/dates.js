// Everything about "today" is computed in the user's own timezone, matching
// how the backend decides which day an entry belongs to and when it locks.

export const DEFAULT_TIMEZONE = "America/Los_Angeles";

export function browserTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE;
}

// "2026-11-03"
export function dateInTimezone(timezone, now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(now);
}

export function secondsLeftInDay(timezone, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const read = (type) => Number(parts.find((part) => part.type === type).value);
  return 86400 - (read("hour") * 3600 + read("minute") * 60 + read("second"));
}

export function formatRemaining(totalSeconds) {
  const pad = (n) => String(n).padStart(2, "0");
  const seconds = Math.max(0, totalSeconds);
  return `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`;
}

// Parsed at local noon so daylight-saving shifts can't change the day shown.
function parseDay(dateString) {
  return new Date(`${dateString}T12:00:00`);
}

export function longDate(dateString) {
  return parseDay(dateString).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function shortDate(dateString) {
  return parseDay(dateString).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function shiftDay(dateString, days) {
  const date = new Date(`${dateString}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// Consecutive days with an entry, ending today (or yesterday, so the streak
// isn't shown as broken before the person has had a chance to write today).
export function computeStreak(entryDates, today) {
  const days = new Set(entryDates);
  let cursor = days.has(today) ? today : shiftDay(today, -1);
  let count = 0;
  while (days.has(cursor)) {
    count += 1;
    cursor = shiftDay(cursor, -1);
  }
  return count;
}
