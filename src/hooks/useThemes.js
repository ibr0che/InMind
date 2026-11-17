import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";

// Every theme is dark. Each theme's colors live in styles.css under
// [data-theme="…"]; this list names them for the picker on the Profile page.
// The chosen theme is kept on this device and, when signed in, on the
// account (Supabase user metadata), so it follows you to other devices.
// To add a theme: add its four colors in styles.css and one line here.
export const THEMES = [
  { id: "sand", label: "Sand", group: "Classic" },
  { id: "violet", label: "Violet", group: "Classic" },
  { id: "rainforest", label: "Rainforest", group: "Classic" },
  { id: "red", label: "Red", group: "Classic" },
  { id: "blue", label: "Blue", group: "Classic" },
  { id: "orange", label: "Orange", group: "Classic" },
  { id: "sunset", label: "Sunset", group: "Duo" },
  { id: "aurora", label: "Aurora", group: "Duo" },
  { id: "ocean", label: "Ocean", group: "Duo" },
  { id: "candy", label: "Candy", group: "Duo" },
  { id: "ember", label: "Ember", group: "Duo" },
  { id: "citrus", label: "Citrus", group: "Duo" },
  { id: "berry", label: "Berry", group: "Duo" },
];
export const THEME_GROUPS = [...new Set(THEMES.map((t) => t.group))];

const KEY = "inmind-theme";
const SAVE_DELAY_MS = 500; // flipping through themes sends one save, not one per theme
const isTheme = (id) => THEMES.some((t) => t.id === id);

const stored = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

export function useTheme(user) {
  // Before sign-in: this device's last theme, so the sign-in screen doesn't flash.
  const [theme, setThemeState] = useState(() =>
    isTheme(stored()) ? stored() : THEMES[0].id,
  );
  const saveTimer = useRef(null);
  const userId = user?.id;
  const accountTheme = user?.user_metadata?.theme;

  // Signing in brings the account's theme to this device.
  useEffect(() => {
    if (isTheme(accountTheme)) setThemeState(accountTheme);
  }, [userId, accountTheme]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* private mode: the choice just won't survive a reload */
    }
  }, [theme]);

  // Picking a theme applies it now and saves it to the account shortly after.
  const setTheme = useCallback(
    (id) => {
      setThemeState(id);
      if (!userId) return;
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        api.updateMe({ theme: id }).catch((error) => {
          // this device keeps the theme; the account catches up on the next pick
          console.warn("Couldn't save the theme to your account:", error.message);
        });
      }, SAVE_DELAY_MS);
    },
    [userId],
  );
  useEffect(() => () => clearTimeout(saveTimer.current), []);

  return { theme, setTheme };
}
