/**
 * Kept apart from scrape.ts so the client can import it: scrape.ts pulls in
 * node:https, which must never reach the browser bundle.
 */
export function normalizeUsername(input: string): string {
  const trimmed = input.trim();
  const fromUrl = trimmed.match(/letterboxd\.com\/([^/?#]+)/i);
  return (fromUrl ? fromUrl[1] : trimmed).replace(/^@/, "").toLowerCase();
}
