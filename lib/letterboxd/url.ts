/**
 * The public Letterboxd page for a film in the deck.
 *
 * `slug` is not always a slug. A CSV import starts from `boxd.it` short links,
 * and when TMDB search settles the film on its own — around nine times in ten —
 * Letterboxd is never visited, so there is no slug to store and the short link
 * is kept instead (see the resolver in app/api/films/route.ts). Both forms are
 * valid entry points; only the URL around them differs.
 */
export function letterboxdUrl(film: { slug: string }): string {
  const slug = film.slug.trim();
  if (!slug) return "https://letterboxd.com/";
  // Short links already point at the film, via a redirect.
  if (/^https?:\/\//i.test(slug)) return slug;
  if (/^boxd\.it\//i.test(slug)) return `https://${slug}`;
  return `https://letterboxd.com/film/${slug}/`;
}
