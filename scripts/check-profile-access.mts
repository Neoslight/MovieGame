/** One request: is the Letterboxd profile section reachable right now? */
import { fetchText, HttpError } from "../lib/http";

const user = process.argv[2] ?? "neoslight";
try {
  const html = await fetchText(`https://letterboxd.com/${user}/films/page/2/`, { retries: 0 });
  console.log(`section profil : OK (${(html.match(/data-item-slug/g) ?? []).length} affiches)`);
} catch (e) {
  console.log(`section profil : BLOQUÉE (${e instanceof HttpError ? e.status : String(e)})`);
}
