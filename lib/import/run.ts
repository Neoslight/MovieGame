import { db, type UnresolvedFilm } from "../db/schema";
import { readNdjson } from "../ndjson";
import { newCardState } from "../srs/scheduler";
import {
  filmRefKey,
  playableCategories,
  type Category,
  type Film,
  type LetterboxdFilm,
} from "../types";
import type { FilmsEvent } from "@/app/api/films/route";
import type { RefreshEvent } from "@/app/api/films/refresh/route";

export interface ImportProgress {
  phase: "profile" | "films";
  done: number;
  total: number;
  /** What the step is doing, e.g. "Lecture du profil". */
  message: string;
  /** The film being handled right now. */
  current?: string;
  /** How it was located — the fast path or the slow one. */
  via?: "search" | "letterboxd";
  imported: number;
  skipped: number;
  /** Seconds left, once there is enough history to estimate. */
  etaSeconds?: number;
}

export class ImportError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "ImportError";
  }
}

/** Reads the NDJSON stream from the profile scrape route. */
export async function fetchProfileFilms(
  username: string,
  onProgress: (p: ImportProgress) => void,
  signal?: AbortSignal,
): Promise<LetterboxdFilm[]> {
  const res = await fetch(`/api/letterboxd/films?user=${encodeURIComponent(username)}`, {
    signal,
  });
  if (!res.ok) throw new ImportError("Le serveur n'a pas répondu.", "NetworkError");

  let films: LetterboxdFilm[] | null = null;
  let thrown: ImportError | null = null;

  await readNdjson<
    | { type: "progress"; page: number; totalPages: number; films: number }
    | { type: "done"; films: LetterboxdFilm[] }
    | { type: "error"; code: string; message: string }
  >(res, (event) => {
    if (event.type === "progress") {
      onProgress({
        phase: "profile",
        done: event.page,
        total: event.totalPages,
        message: `Lecture du profil — page ${event.page} sur ${event.totalPages}`,
        current: `${event.films} films trouvés`,
        imported: 0,
        skipped: 0,
      });
    } else if (event.type === "done") films = event.films;
    else thrown = new ImportError(event.message, event.code);
  });

  if (thrown) throw thrown;
  if (!films) throw new ImportError("Flux interrompu avant la fin.", "TruncatedStream");
  return films;
}

const BATCH_SIZE = 40;
/** Ignore the first moments: the rate is meaningless before it settles. */
const ETA_AFTER = 12;

export interface ImportSummary {
  imported: number;
  skipped: number;
  cards: number;
  viaSearch: number;
  viaLetterboxd: number;
  /** Films TMDB failed to serve. Not blacklisted — re-running picks them up. */
  retryable: number;
}

/**
 * Resolves and enriches films in batches, writing each batch to IndexedDB as it
 * lands — an interrupted import keeps everything it already fetched, and
 * re-running it picks up where it stopped.
 */
export async function importFilms(
  candidates: LetterboxdFilm[],
  onProgress: (p: ImportProgress) => void,
  signal?: AbortSignal,
): Promise<ImportSummary> {
  const knownIds = new Set(await db.films.toCollection().primaryKeys());
  const knownSlugs = new Set((await db.films.toArray()).map((f) => f.slug));
  const alreadySkipped = new Set(await db.unresolved.toCollection().primaryKeys());

  // Short-link entries have no slug until they are resolved, so a re-run keys
  // on whichever reference the source gave us.
  const todo = candidates.filter((f) => {
    const key = filmRefKey(f);
    return !alreadySkipped.has(key) && !(f.slug && knownSlugs.has(f.slug));
  });

  const summary: ImportSummary = {
    imported: 0,
    skipped: 0,
    cards: 0,
    viaSearch: 0,
    viaLetterboxd: 0,
    retryable: 0,
  };
  const startedAt = Date.now();
  let settled = 0;
  let lastReport = 0;

  /**
   * Events land in bursts of a dozen per second. Repainting on every one buys
   * nothing the eye can read, so updates are throttled — except the ones that
   * must not be lost: the first, and every batch boundary.
   */
  const report = (current?: string, via?: ImportProgress["via"], force = false) => {
    const now = Date.now();
    if (!force && now - lastReport < 100) return;
    lastReport = now;

    const elapsed = (now - startedAt) / 1000;
    onProgress({
      phase: "films",
      done: settled,
      total: todo.length,
      message: "Récupération des fiches",
      current,
      via,
      imported: summary.imported,
      skipped: summary.skipped,
      etaSeconds:
        settled >= ETA_AFTER
          ? Math.round((elapsed / settled) * (todo.length - settled))
          : undefined,
    });
  };

  report(undefined, undefined, true);

  for (let start = 0; start < todo.length; start += BATCH_SIZE) {
    if (signal?.aborted) break;
    const batch = todo.slice(start, start + BATCH_SIZE);

    const res = await fetch("/api/films", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ films: batch }),
      signal,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new ImportError(body.error ?? "Échec de l'enrichissement.", body.code ?? "BatchError");
    }

    const films: Film[] = [];
    const unresolved: UnresolvedFilm[] = [];
    let failure: ImportError | null = null;

    await readNdjson<FilmsEvent>(res, (event) => {
      switch (event.type) {
        case "located":
          if (event.via === "search") summary.viaSearch++;
          else summary.viaLetterboxd++;
          report(event.title, event.via);
          break;
        case "film":
          films.push(event.film);
          summary.imported++;
          settled++;
          report(event.film.title);
          break;
        case "skipped":
          unresolved.push(event);
          summary.skipped++;
          settled++;
          report(event.title);
          break;
        case "fetch-failed":
          // Counted as settled for the progress bar only: the film is left out
          // of `unresolved` on purpose, so the next import tries it again.
          summary.retryable++;
          settled++;
          report(event.title);
          break;
        case "error":
          failure = new ImportError(event.message, event.code);
          break;
      }
    });

    if (failure) throw failure;

    await db.transaction("rw", db.films, db.cards, db.unresolved, async () => {
      await db.films.bulkPut(films);
      await db.unresolved.bulkPut(unresolved);
      summary.cards += await createCards(films, knownIds);
    });

    // The throttle can swallow the last events of a batch; this keeps the
    // counter honest at every boundary.
    report(undefined, undefined, true);
  }

  return summary;
}

const REFRESH_BATCH = 60;

/**
 * Re-reads every film in the deck from TMDB, in place. Cards key on tmdbId, so
 * scheduling and review history survive untouched — this only widens the cast
 * and fills in fields that did not exist at import time. Categories a film has
 * newly become playable on get their card created here too.
 */
export async function refreshFilms(
  onProgress: (p: ImportProgress) => void,
  signal?: AbortSignal,
): Promise<{ refreshed: number; failed: number; cards: number }> {
  const stored = await db.films.toArray();
  const result = { refreshed: 0, failed: 0, cards: 0 };
  const startedAt = Date.now();
  let lastReport = 0;

  const report = (current?: string, force = false) => {
    const now = Date.now();
    if (!force && now - lastReport < 100) return;
    lastReport = now;
    const settled = result.refreshed + result.failed;
    const elapsed = (now - startedAt) / 1000;
    onProgress({
      phase: "films",
      done: settled,
      total: stored.length,
      message: "Mise à jour des fiches",
      current,
      imported: result.refreshed,
      skipped: result.failed,
      etaSeconds:
        settled >= ETA_AFTER
          ? Math.round((elapsed / settled) * (stored.length - settled))
          : undefined,
    });
  };

  report(undefined, true);

  for (let start = 0; start < stored.length; start += REFRESH_BATCH) {
    if (signal?.aborted) break;
    const batch = stored
      .slice(start, start + REFRESH_BATCH)
      .map((f) => ({ tmdbId: f.tmdbId, slug: f.slug }));

    const res = await fetch("/api/films/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ films: batch }),
      signal,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new ImportError(body.error ?? "Échec de la mise à jour.", body.code ?? "BatchError");
    }

    const films: Film[] = [];
    let failure: ImportError | null = null;

    await readNdjson<RefreshEvent>(res, (event) => {
      switch (event.type) {
        case "film":
          films.push(event.film);
          result.refreshed++;
          report(event.film.title);
          break;
        case "failed":
          result.failed++;
          report();
          break;
        case "error":
          failure = new ImportError(event.message, event.code);
          break;
      }
    });

    if (failure) throw failure;

    await db.transaction("rw", db.films, db.cards, async () => {
      await db.films.bulkPut(films);
      // A film that now qualifies for a category it did not before gets its
      // card; the ones it already has are left exactly as they are.
      for (const film of films) {
        const owned = new Set(
          (await db.cards.where("filmId").equals(film.tmdbId).toArray()).map((c) => c.category),
        );
        const missing = playableCategories(film).filter((c) => !owned.has(c));
        if (missing.length === 0) continue;
        await db.cards.bulkAdd(
          missing.map((category) => ({
            ...newCardState(),
            filmId: film.tmdbId,
            category,
            popularity: film.popularity,
          })),
        );
        result.cards += missing.length;
      }
    });

    report(undefined, true);
  }

  return result;
}

/**
 * Creates the cards a film has become playable on since it was imported.
 *
 * Purely local: every category shipped so far reads fields the deck already
 * stores, so opening the app is enough to unlock them — no TMDB round trip over
 * two thousand films, and it works offline. Idempotent, so it can run on every
 * launch; it returns 0 and touches nothing once the deck is up to date.
 */
export async function backfillCards(): Promise<number> {
  const [films, existing] = await Promise.all([db.films.toArray(), db.cards.toArray()]);

  const owned = new Map<number, Set<Category>>();
  for (const card of existing) {
    const set = owned.get(card.filmId) ?? new Set<Category>();
    set.add(card.category);
    owned.set(card.filmId, set);
  }

  const missing = films.flatMap((film) => {
    const has = owned.get(film.tmdbId);
    return playableCategories(film)
      .filter((category) => !has?.has(category))
      .map((category) => ({
        ...newCardState(),
        filmId: film.tmdbId,
        category,
        popularity: film.popularity,
      }));
  });

  if (missing.length > 0) await db.cards.bulkAdd(missing);
  return missing.length;
}

/** One card per (film, playable category); films missing data are simply skipped. */
async function createCards(films: Film[], knownIds: Set<number>): Promise<number> {
  const cards = [];
  for (const film of films) {
    if (knownIds.has(film.tmdbId)) continue;
    knownIds.add(film.tmdbId);
    for (const category of playableCategories(film)) {
      cards.push({
        ...newCardState(),
        filmId: film.tmdbId,
        category,
        popularity: film.popularity,
      });
    }
  }
  if (cards.length) await db.cards.bulkAdd(cards);
  return cards.length;
}
