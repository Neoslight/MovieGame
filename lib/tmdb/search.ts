import { normalizeName } from "../matching/normalize";
import { tmdbGet } from "./client";
import type { LetterboxdFilm } from "../types";

export interface MultiHit {
  id: number;
  media_type: "movie" | "tv" | "person";
  title?: string;
  original_title?: string;
  name?: string;
  original_name?: string;
  release_date?: string;
  first_air_date?: string;
}

const titlesOf = (hit: MultiHit) =>
  [hit.title, hit.original_title, hit.name, hit.original_name].filter(Boolean) as string[];

const yearOf = (hit: MultiHit) => {
  const date = hit.release_date || hit.first_air_date;
  return date ? Number(date.slice(0, 4)) : null;
};

export interface SearchMatch {
  tmdbId: number;
  /** Kept for symmetry with the Letterboxd resolver. */
  tmdbType: "movie";
}

/**
 * Resolve a film through TMDB search instead of the slow Letterboxd page.
 *
 * Returns a match only when there is exactly one candidate with this exact
 * title in this year — across films *and* series, so a mini-series sharing a
 * title with a film is treated as ambiguous rather than silently mapped to the
 * film. Everything else returns null and goes to the Letterboxd resolver,
 * which gives the exact id. Speed never comes at the cost of a wrong answer:
 * the doubt is resolved, not guessed.
 */
export async function searchConfidentMatch(
  film: LetterboxdFilm,
): Promise<SearchMatch | null> {
  if (!normalizeName(film.title)) return null;
  try {
    const res = await tmdbGet<{ results?: MultiHit[] }>("/search/multi", {
      query: film.title,
      include_adult: "true",
    });
    return pickConfidentHit(film, res.results ?? []);
  } catch {
    return null;
  }
}

/** The decision itself, kept free of I/O so it can be tested exhaustively. */
export function pickConfidentHit(
  film: LetterboxdFilm,
  hits: MultiHit[],
): SearchMatch | null {
  const wanted = normalizeName(film.title);
  if (!wanted) return null;

  const candidates = hits.filter((hit) => {
    if (hit.media_type !== "movie" && hit.media_type !== "tv") return false;
    if (!titlesOf(hit).some((t) => normalizeName(t) === wanted)) return false;
    if (!film.year) return true;
    const year = yearOf(hit);
    // ±1 year: Letterboxd and TMDB disagree on festival vs release dates.
    return year !== null && Math.abs(year - film.year) <= 1;
  });

  if (candidates.length !== 1) return null;
  const only = candidates[0];
  return only.media_type === "movie" ? { tmdbId: only.id, tmdbType: "movie" } : null;
}
