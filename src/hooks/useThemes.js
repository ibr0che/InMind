import { useEffect, useState } from "react";

// Every theme is dark. Colors live in styles.css under [data-theme="…"].
export const THEMES = ["sand", "violet", "rainforest", "red", "blue", "orange"];
const KEY = "inmind-theme";

const stored = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

export function useTheme() {
  const [theme, setTheme] = useState(() =>
    THEMES.includes(stored()) ? stored() : THEMES[0],
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* private mode: the choice just won't survive a reload */
    }
  }, [theme]);

  return { theme, setTheme };
}
