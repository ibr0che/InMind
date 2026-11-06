import { useEffect, useState } from "react";

const read = (key, fallback) => {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
};
const write = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode: skip */
  }
};

const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

export function useTheme() {
  const [theme, setTheme] = useState(() => read("daymark-theme", "sand"));
  const [mode, setMode] = useState(() => read("daymark-mode", "system")); // light | dark | system

  useEffect(() => {
    const apply = () => {
      const root = document.documentElement;
      root.dataset.theme = theme;
      root.dataset.mode =
        mode === "system" ? (systemDark.matches ? "dark" : "light") : mode;
    };
    apply();
    write("daymark-theme", theme);
    write("daymark-mode", mode);
    systemDark.addEventListener("change", apply); // follow the OS when mode is "system"
    return () => systemDark.removeEventListener("change", apply);
  }, [theme, mode]);

  return { theme, setTheme, mode, setMode };
}
