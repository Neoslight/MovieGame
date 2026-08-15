/**
 * Three-state theme, which is what the stylesheet was always written for:
 * `globals.css` carries a `prefers-color-scheme` block guarded by
 * `:not([data-theme="light"])` and a matching `[data-theme="dark"]` block, so
 * "auto" is simply the absence of the attribute.
 */
export type Theme = "auto" | "light" | "dark";

/**
 * Kept in localStorage rather than in the Dexie settings table, for two
 * reasons: it has to be readable synchronously so the right colours are up
 * before the first paint, and it is a property of this device — restoring a
 * backup from a phone should not force its theme onto a laptop.
 */
export const THEME_SETTING_KEY = "contretype-theme";

export const THEME_LABELS: Record<Theme, string> = {
  auto: "Système",
  light: "Clair",
  dark: "Sombre",
};

export const THEMES: Theme[] = ["auto", "light", "dark"];

export function sanitizeTheme(raw: unknown): Theme {
  return THEMES.includes(raw as Theme) ? (raw as Theme) : "auto";
}

/** Applies the choice to the document; "auto" removes the attribute entirely. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

export function readTheme(): Theme {
  try {
    return sanitizeTheme(localStorage.getItem(THEME_SETTING_KEY));
  } catch {
    // Storage can be unavailable (private mode, blocked cookies); the OS
    // preference is a perfectly good answer in that case.
    return "auto";
  }
}

export function writeTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_SETTING_KEY, theme);
  } catch {
    // The choice still applies to this page; it just will not survive a reload.
  }
  for (const listener of listeners) listener();
}

/**
 * The theme is an external store, not React state: it lives on the document and
 * in localStorage, neither of which exists while rendering on the server. The
 * subscription lets `useSyncExternalStore` read it on the client without an
 * effect that would set state on mount and render the page twice.
 */
const listeners = new Set<() => void>();

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** What the server renders: no storage there, so nothing is overridden. */
export const serverTheme = (): Theme => "auto";

/**
 * Runs before the first paint, inlined in the document head. Without it the
 * page renders in the OS theme and then snaps to the chosen one — the flash is
 * exactly what a stored preference is supposed to avoid.
 */
export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(
  THEME_SETTING_KEY,
)});if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;
