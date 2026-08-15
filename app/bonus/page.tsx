"use client";

import Image from "next/image";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/schema";
import {
  byDecade,
  currentStreak,
  forgotten,
  topActors,
  topDirectors,
  weakDirectors,
} from "@/lib/stats/overview";
import { posterUrl } from "@/lib/tmdb/images";
import { Eyebrow, Screen, Stat, Title } from "@/components/ui";

/**
 * The bonus shelf: what the deck knows about the player, kept deliberately
 * outside the game. Nothing here schedules a card or costs a request — it is
 * all read back from rows already stored.
 */
export default function BonusPage() {
  const data = useLiveQuery(async () => {
    const [films, reviews, cards] = await Promise.all([
      db.films.toArray(),
      db.reviews.toArray(),
      db.cards.toArray(),
    ]);
    return {
      directors: topDirectors(films),
      actors: topActors(films),
      decades: byDecade(films),
      weak: weakDirectors(reviews, films),
      lost: forgotten(cards, films),
      streak: currentStreak(reviews),
      films: films.length,
    };
  }, []);

  if (!data) {
    return (
      <Screen>
        <p className="m-auto text-sm text-muted">Chargement…</p>
      </Screen>
    );
  }

  if (data.films === 0) {
    return (
      <Screen>
        <div className="m-auto space-y-4 text-center">
          <p className="font-serif text-2xl">Rien à raconter</p>
          <p className="text-sm text-muted">Importe ton profil, joue un peu, reviens.</p>
          <Link href="/" className="block text-sm text-muted underline underline-offset-4">
            Retour
          </Link>
        </div>
      </Screen>
    );
  }

  const peak = Math.max(1, ...data.decades.map((d) => d.count));

  return (
    <Screen>
      <header className="space-y-2">
        <Eyebrow>Hors jeu</Eyebrow>
        <Title>Ton cinéma</Title>
      </header>

      <div className="mt-8 grid grid-cols-2 gap-3">
        <Stat value={data.films} label="films vus" />
        <Stat
          value={data.streak}
          label={`jour${data.streak > 1 ? "s" : ""} d'affilée`}
        />
      </div>

      {data.directors.length > 0 && (
        <section className="mt-10 space-y-3">
          <h2 className="font-serif text-2xl">Tes réalisateurs</h2>
          <ul className="space-y-1.5">
            {data.directors.map((d) => (
              <li key={d.name} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate">{d.name}</span>
                <span className="shrink-0 text-muted tabular-nums">{d.count} films</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.actors.length > 0 && (
        <section className="mt-10 space-y-3">
          <h2 className="font-serif text-2xl">Tes têtes d&apos;affiche</h2>
          <ul className="space-y-1.5">
            {data.actors.map((a) => (
              <li key={a.name} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate">{a.name}</span>
                <span className="shrink-0 text-muted tabular-nums">{a.count} films</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.decades.length > 0 && (
        <section className="mt-10 space-y-3">
          <h2 className="font-serif text-2xl">Tes décennies</h2>
          <ul className="space-y-1.5">
            {data.decades.map((d) => (
              <li key={d.decade} className="flex items-center gap-3 text-sm">
                <span className="w-12 shrink-0 tabular-nums text-muted">{d.decade}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-line">
                  <span
                    className="block h-full rounded-full bg-accent"
                    style={{ width: `${(d.count / peak) * 100}%` }}
                  />
                </span>
                <span className="w-8 shrink-0 text-right tabular-nums text-muted">
                  {d.count}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-10 space-y-3">
        <h2 className="font-serif text-2xl">Tes angles morts</h2>
        {data.weak.length === 0 ? (
          <p className="text-sm text-muted">
            Rien de net pour l&apos;instant — il faut avoir raté plusieurs fois le même
            réalisateur pour que ça compte.
          </p>
        ) : (
          <ul className="space-y-2">
            {data.weak.map((w) => (
              <li
                key={w.name}
                className="flex items-baseline justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3"
              >
                <span className="truncate font-serif text-lg">{w.name}</span>
                <span className="shrink-0 text-xs text-muted tabular-nums">
                  {w.missed}/{w.asked} manqués
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="font-serif text-2xl">Ce soir ?</h2>
        <p className="text-sm leading-relaxed text-muted">
          Ces films-là, tu les as vus et tu ne t&apos;en souviens plus. C&apos;est peut-être le
          moment de les revoir.
        </p>
        {data.lost.length === 0 ? (
          <p className="text-sm text-muted">Rien d&apos;oublié pour l&apos;instant.</p>
        ) : (
          <ul className="grid grid-cols-3 gap-3">
            {data.lost.map((film) => (
              <li key={film.tmdbId}>
                <a
                  href={`https://letterboxd.com/film/${film.slug}/`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="block space-y-1.5"
                >
                  <span className="relative block aspect-[2/3] overflow-hidden rounded-lg border border-line bg-surface">
                    {film.posterPath && (
                      <Image
                        src={posterUrl(film.posterPath, "w342")}
                        alt=""
                        fill
                        sizes="33vw"
                        className="object-cover"
                      />
                    )}
                  </span>
                  <span className="block truncate text-xs text-muted">{film.title}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Link
        href="/"
        className="mt-10 block text-center text-xs text-muted underline-offset-4 hover:underline"
      >
        Retour
      </Link>
    </Screen>
  );
}
