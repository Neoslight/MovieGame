/** Categories whose answer is a person credited on the film. */
export type PeopleCategory = "director" | "actors" | "cinematographer" | "composer";

/** Categories whose answer is the film itself, asked from a different clue. */
export type FilmCategory = "title-cast" | "title-poster" | "year";

export type Category = PeopleCategory | FilmCategory;

export const CATEGORY_LABELS: Record<Category, string> = {
  director: "Réalisateur",
  actors: "Acteurs",
  cinematographer: "Chef opérateur",
  composer: "Compositeur",
  "title-cast": "Titre, d'après le casting",
  "title-poster": "Titre, d'après l'affiche",
  year: "Année de sortie",
};

/**
 * The two halves of the deck, kept apart in the setup screen: seven categories
 * in one flat list stops being readable.
 */
export const CATEGORY_GROUPS: { label: string; categories: Category[] }[] = [
  {
    label: "Les gens",
    categories: ["director", "actors", "cinematographer", "composer"],
  },
  {
    label: "Le film",
    categories: ["title-cast", "title-poster", "year"],
  },
];

/**
 * What the player has to type. `people` goes through the name matcher, `title`
 * through the title matcher, `year` through a numeric comparison — three
 * different answer shapes, so the round has to branch on this.
 */
export type AnswerKind = "people" | "title" | "year";

export const CATEGORY_ANSWER: Record<Category, AnswerKind> = {
  director: "people",
  actors: "people",
  cinematographer: "people",
  composer: "people",
  "title-cast": "title",
  "title-poster": "title",
  year: "year",
};

/**
 * Which credit each people-category asks about. Everything but `actors` is a
 * single-name question — the round closes on one right answer, and the reveal
 * shows the whole credit.
 */
export const CATEGORY_CREDIT: Record<
  PeopleCategory,
  "directors" | "cast" | "cinematographers" | "composers"
> = {
  director: "directors",
  actors: "cast",
  cinematographer: "cinematographers",
  composer: "composers",
};

export const isPeopleCategory = (category: Category): category is PeopleCategory =>
  CATEGORY_ANSWER[category] === "people";

/** The only category where several names are wanted before the round closes. */
export const isMultiName = (category: Category): boolean => category === "actors";

/**
 * A film before TMDB resolution. Profile pages give the slug directly; CSV
 * exports only give a boxd.it short link, whose slug appears after a redirect.
 * Exactly one of the two is set.
 */
export interface LetterboxdFilm {
  slug: string | null;
  shortUrl?: string;
  title: string;
  year: number | null;
}

/** Stable identity for a film we have not resolved yet. */
export const filmRefKey = (film: LetterboxdFilm): string =>
  film.slug ?? film.shortUrl ?? `${film.title}-${film.year}`;

export interface Person {
  tmdbId: number;
  name: string;
  profilePath: string | null;
  aliases: string[];
}

export interface Film {
  tmdbId: number;
  slug: string;
  title: string;
  originalTitle: string;
  year: number | null;
  posterPath: string | null;
  /** TMDB's rolling seven-day trend. Biases the draw; says nothing lasting. */
  popularity: number;
  /**
   * How many people ever rated the film — the all-time notoriety proxy, and
   * what decides how many actors a film asks for. Absent on rows imported
   * before this field existed; refreshing the deck fills it in.
   */
  voteCount?: number;
  directors: Person[];
  cast: Person[];
  /** Captured now, played in a later version. */
  cinematographers: Person[];
  composers: Person[];
  addedAt: number;
}

/**
 * Which categories a film has enough reliable data to be played on. A single
 * credited actor with a photo is enough now that the number of names asked for
 * scales with the film's notoriety — an obscure title simply asks for one.
 */
export function playableCategories(film: Film): Category[] {
  const out: Category[] = [];
  if (!film.posterPath) return out;
  if (film.directors.length > 0) out.push("director");
  if (film.cast.some((p) => p.profilePath)) out.push("actors");
  // Fetched since the first import for exactly this: TMDB credits a director of
  // photography and a composer far less consistently than a director, so these
  // two categories cover a smaller slice of the deck.
  if (film.cinematographers.length > 0) out.push("cinematographer");
  if (film.composers.length > 0) out.push("composer");

  // Naming the film from its faces only works if there are faces to show, and a
  // single one is a coin toss rather than a question.
  if (film.cast.filter((p) => p.profilePath).length >= 2) out.push("title-cast");
  // The poster is guaranteed by the guard above.
  out.push("title-poster");
  if (film.year !== null) out.push("year");
  return out;
}
