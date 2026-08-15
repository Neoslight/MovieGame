import { unzipSync, strFromU8 } from "fflate";
import type { LetterboxdFilm } from "../types";

/** Minimal RFC-4180 reader: handles quoted fields and embedded commas. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") field += char;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export class CsvFormatError extends Error {
  constructor(detail: string) {
    super(
      `Fichier non reconnu : ${detail}. Attendu : l'archive ZIP de l'export Letterboxd (Settings → Data → Export), ou un des fichiers CSV qu'elle contient.`,
    );
    this.name = "CsvFormatError";
  }
}

interface HeaderPosition {
  index: number;
  nameCol: number;
  yearCol: number;
  uriCol: number;
}

/**
 * Finds the header row. List exports open with a metadata block (title, date,
 * description) before the real table, so the header is not always line 1 —
 * we look for the first row that names both a film and a link.
 */
function findHeader(rows: string[][]): HeaderPosition | null {
  const candidates: HeaderPosition[] = [];

  for (let index = 0; index < Math.min(rows.length, 12); index++) {
    const header = rows[index].map((h) => h.trim().toLowerCase());
    const nameCol = header.indexOf("name");
    // watched.csv says "Letterboxd URI"; list exports say "URL".
    const uriCol = header.findIndex((h) => h === "url" || h.includes("uri"));
    if (nameCol !== -1 && uriCol !== -1) {
      candidates.push({ index, nameCol, yearCol: header.indexOf("year"), uriCol });
    }
  }

  // A list export has two Name+URL headers: the list's own metadata block, then
  // the film table. Only the film table carries a Year column, which is what
  // stops the list itself from being imported as a film.
  return candidates.find((c) => c.yearCol !== -1) ?? candidates[0] ?? null;
}

/**
 * Reads any film-bearing CSV from a Letterboxd export: watched, ratings,
 * diary, watchlist, likes, or a list.
 *
 * Exports link films as `boxd.it/23gY` short codes rather than slugs, so most
 * rows come out with `slug: null` and a `shortUrl` that the resolver follows.
 */
export function parseLetterboxdCsv(text: string): LetterboxdFilm[] {
  const rows = parseCsv(text.trim());
  const header = findHeader(rows);
  if (!header) {
    throw new CsvFormatError(
      rows.length ? `colonnes trouvées : ${rows[0].join(", ")}` : "fichier vide",
    );
  }

  const films: LetterboxdFilm[] = [];
  const seen = new Set<string>();

  for (const row of rows.slice(header.index + 1)) {
    const uri = row[header.uriCol]?.trim();
    if (!uri) continue;

    const slug = uri.match(/letterboxd\.com\/film\/([^/?#]+)/i)?.[1] ?? null;
    const isShort = /boxd\.it\/[A-Za-z0-9]+/.test(uri);
    if (!slug && !isShort) continue;

    const key = slug ?? uri;
    if (seen.has(key)) continue;
    seen.add(key);

    const year = Number(row[header.yearCol]);
    films.push({
      slug,
      ...(slug ? {} : { shortUrl: uri.startsWith("http") ? uri : `https://${uri}` }),
      title: row[header.nameCol]?.trim() || slug || "Sans titre",
      year: Number.isFinite(year) && year > 1800 ? year : null,
    });
  }

  if (films.length === 0) throw new CsvFormatError("aucun lien de film trouvé");
  return films;
}

/** Files inside the archive, best first — the ones that mean "I have seen this". */
const WATCHED_FILES = ["watched.csv", "diary.csv", "ratings.csv"];

export interface ArchiveImport {
  films: LetterboxdFilm[];
  /** Which file inside the archive the films came from. */
  source: string;
  username?: string;
}

/**
 * Extracts films from a Letterboxd export archive. Prefers watched.csv, and
 * falls back to the other film-bearing files so an older or partial export
 * still works.
 */
export function parseLetterboxdArchive(bytes: Uint8Array): ArchiveImport {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    throw new CsvFormatError("archive ZIP illisible");
  }

  const names = Object.keys(entries);
  const read = (name: string) => strFromU8(entries[name]);

  // profile.csv carries the account name, which labels the deck afterwards.
  let username: string | undefined;
  const profile = names.find((n) => n.endsWith("profile.csv"));
  if (profile) {
    const rows = parseCsv(read(profile).trim());
    const col = rows[0]?.findIndex((h) => h.trim().toLowerCase() === "username");
    if (col !== undefined && col !== -1) username = rows[1]?.[col]?.trim() || undefined;
  }

  for (const wanted of WATCHED_FILES) {
    // Some archives nest everything under a folder.
    const name = names.find((n) => n === wanted || n.endsWith(`/${wanted}`));
    if (!name) continue;
    try {
      return { films: parseLetterboxdCsv(read(name)), source: wanted, username };
    } catch {
      continue;
    }
  }

  throw new CsvFormatError(
    `aucun fichier de films exploitable (contenu : ${names.slice(0, 6).join(", ")})`,
  );
}

/** Accepts either the whole archive or a single CSV pulled out of it. */
export async function parseLetterboxdExport(file: File): Promise<ArchiveImport> {
  const isZip = file.name.toLowerCase().endsWith(".zip") || file.type.includes("zip");
  if (isZip) {
    return parseLetterboxdArchive(new Uint8Array(await file.arrayBuffer()));
  }
  return { films: parseLetterboxdCsv(await file.text()), source: file.name };
}
