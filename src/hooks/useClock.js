import { useEffect, useState } from "react";
import { dateInTimezone, secondsLeftInDay } from "../lib/dates.js";

// Ticks once a second. `today` rolls over at midnight in the user's timezone.
export function useClock(timezone) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return {
    today: dateInTimezone(timezone, now),
    secondsLeft: secondsLeftInDay(timezone, now),
  };
}
