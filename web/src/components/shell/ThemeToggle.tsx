"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "day" | "night";
const KEY = "lineready-theme";

/** Day / Night switch. Night is the default between 19:00 and 07:00 unless the engineer has chosen. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("day");

  useEffect(() => {
    let saved: Theme | null = null;
    try {
      saved = localStorage.getItem(KEY) as Theme | null;
    } catch {}
    const hour = new Date().getHours();
    setTheme(saved ?? (hour >= 19 || hour < 7 ? "night" : "day"));
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const next: Theme = theme === "day" ? "night" : "day";
  return (
    <button
      type="button"
      className="btn btn-secondary"
      aria-label={`Switch to ${next} mode`}
      onClick={() => {
        setTheme(next);
        try {
          localStorage.setItem(KEY, next);
        } catch {}
      }}
    >
      {theme === "day" ? <Moon size={18} aria-hidden /> : <Sun size={18} aria-hidden />}
      {theme === "day" ? "Night mode" : "Day mode"}
    </button>
  );
}
