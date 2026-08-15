import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { CsvFormatError, parseLetterboxdArchive, parseLetterboxdCsv } from "./csv";

/** Real shape of watched.csv: films are boxd.it short links, not slugs. */
const WATCHED = `Date,Name,Year,Letterboxd URI
2021-03-08,To Be and to Have,2002,https://boxd.it/23gY
2025-11-02,"Good Night, and Good Luck.",2005,https://boxd.it/1YHe
2025-10-30,Irréalisable,2026,https://letterboxd.com/film/irrealisable-1/
`;

test("lit les liens courts boxd.it", () => {
  const films = parseLetterboxdCsv(WATCHED);
  assert.equal(films.length, 3);
  assert.deepEqual(films[0], {
    slug: null,
    shortUrl: "https://boxd.it/23gY",
    title: "To Be and to Have",
    year: 2002,
  });
});

test("lit aussi les URL complètes", () => {
  const films = parseLetterboxdCsv(WATCHED);
  assert.equal(films[2].slug, "irrealisable-1");
  assert.equal(films[2].shortUrl, undefined);
});

test("gère les virgules entre guillemets", () => {
  assert.equal(parseLetterboxdCsv(WATCHED)[1].title, "Good Night, and Good Luck.");
});

test("déduplique", () => {
  const doubled = WATCHED + "2024-01-01,To Be and to Have,2002,https://boxd.it/23gY\n";
  assert.equal(parseLetterboxdCsv(doubled).length, 3);
});

test("saute le préambule d'un export de liste", () => {
  const list = `Letterboxd list export v7
Date,Name,Tags,URL,Description
2024-02-01,Ciné Club,,https://boxd.it/sEJYo,Les films du ciné club

Position,Name,Year,URL,Description
1,The Celebration,1998,https://boxd.it/2aCM,"1ère séance avec Matis, Théo"
2,Oldboy,2003,https://boxd.it/29R2,2ème séance
`;
  const films = parseLetterboxdCsv(list);
  // The list's own metadata row must not be mistaken for a film.
  assert.equal(films.length, 2);
  assert.equal(films[0].title, "The Celebration");
  assert.equal(films[0].year, 1998);
  assert.equal(films[1].shortUrl, "https://boxd.it/29R2");
});

test("rejette un fichier qui n'est pas un export", () => {
  assert.throws(() => parseLetterboxdCsv("a,b\n1,2\n"), CsvFormatError);
  assert.throws(() => parseLetterboxdCsv(""), CsvFormatError);
});

test("lit l'archive ZIP complète", (t) => {
  const path = new URL(
    "../../letterboxd-neoslight-2026-08-15-16-01-utc.zip",
    import.meta.url,
  );
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(readFileSync(path));
  } catch {
    t.skip("archive d'exemple absente");
    return;
  }

  const result = parseLetterboxdArchive(bytes);
  assert.equal(result.source, "watched.csv");
  assert.equal(result.username, "Neoslight");
  assert.ok(result.films.length > 1900, `attendu > 1900 films, reçu ${result.films.length}`);
  assert.ok(result.films.every((f) => f.slug || f.shortUrl));
});
