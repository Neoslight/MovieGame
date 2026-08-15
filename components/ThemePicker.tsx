"use client";

import { useSyncExternalStore } from "react";
import {
  applyTheme,
  readTheme,
  serverTheme,
  subscribeTheme,
  THEME_LABELS,
  THEMES,
  writeTheme,
  type Theme,
} from "@/lib/theme";

export function ThemePicker() {
  const theme = useSyncExternalStore(subscribeTheme, readTheme, serverTheme);

  function choose(next: Theme) {
    applyTheme(next);
    writeTheme(next);
  }

  return (
    <div className="grid grid-cols-3 gap-2" role="group" aria-label="Thème">
      {THEMES.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={theme === option}
          onClick={() => choose(option)}
          className={`min-h-12 rounded-full border px-4 text-sm transition-colors duration-200 ${
            theme === option
              ? "border-accent bg-accent text-accent-fg"
              : "border-line bg-surface text-fg"
          }`}
        >
          {THEME_LABELS[option]}
        </button>
      ))}
    </div>
  );
}
