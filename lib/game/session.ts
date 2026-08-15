import { CATEGORY_LABELS, type Category } from "../types";
import type { PlayMode } from "../db/schema";

export interface SessionSettings {
  /** Cards to play. 0 means no limit: keep going until the queue runs dry. */
  length: number;
  categories: Category[];
  /**
   * "srs" is the deck: due cards first, and every answer moves a schedule.
   * "arcade" is a run beside it — three mistakes, no card ever written.
   */
  mode: PlayMode;
}

export const SESSION_LENGTHS = [10, 20, 40, 0] as const;

export const MODE_LABELS: Record<PlayMode, string> = {
  srs: "Révision",
  arcade: "Arcade",
};

export const DEFAULT_SESSION: SessionSettings = {
  length: 20,
  categories: ["director", "actors"],
  mode: "srs",
};

/** Where the player's last choice is stored, so a session starts in one tap. */
export const SESSION_SETTING_KEY = "session";

export function formatLength(length: number): string {
  return length === 0 ? "Sans fin" : String(length);
}

/**
 * Settings come back from IndexedDB, where a previous version of the app — or a
 * hand-edited export — may have written anything. Anything unrecognised falls
 * back to the default rather than breaking the draw.
 */
export function sanitizeSession(raw: unknown): SessionSettings {
  if (!raw || typeof raw !== "object") return DEFAULT_SESSION;
  const value = raw as Partial<SessionSettings>;

  const length = SESSION_LENGTHS.includes(value.length as (typeof SESSION_LENGTHS)[number])
    ? (value.length as number)
    : DEFAULT_SESSION.length;

  const categories = Array.isArray(value.categories)
    ? value.categories.filter((c): c is Category => c in CATEGORY_LABELS)
    : [];

  return {
    length,
    categories: categories.length > 0 ? categories : DEFAULT_SESSION.categories,
    mode: value.mode === "arcade" ? "arcade" : DEFAULT_SESSION.mode,
  };
}
