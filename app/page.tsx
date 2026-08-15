"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { db, getSetting } from "@/lib/db/schema";
import { deckStats } from "@/lib/srs/queue";
import { currentStreak } from "@/lib/stats/overview";
import { Eyebrow, LinkButton, Screen, Stat, Title } from "@/components/ui";

export default function HomePage() {
  const data = useLiveQuery(async () => {
    const [stats, username] = await Promise.all([
      deckStats(),
      getSetting<string | null>("username", null),
    ]);
    const films = await db.films.count();
    // Only the day column is needed, but Dexie has no projection — the review
    // table stays small next to the deck, so reading it whole is fine.
    const streak = currentStreak(await db.reviews.toArray());
    return { stats, username, films, streak };
  }, []);

  if (!data) {
    return (
      <Screen>
        <p className="m-auto text-sm text-muted">Chargement…</p>
      </Screen>
    );
  }

  if (data.stats.total === 0) {
    return (
      <Screen>
        <div className="my-auto space-y-8">
          <div className="space-y-3">
            <Eyebrow>Mémoire cinéphile</Eyebrow>
            <Title>
              Tes films.
              <br />
              Tes trous de mémoire.
            </Title>
            <p className="text-sm leading-relaxed text-muted">
              Contretype pioche dans les films de ton profil Letterboxd et te demande qui les a
              faits. Les titres que tu maîtrises reviennent de moins en moins souvent.
            </p>
          </div>
          <LinkButton href="/onboarding" className="w-full">
            Importer mon profil
          </LinkButton>
        </div>
        <FooterNav />
      </Screen>
    );
  }

  const { stats } = data;

  return (
    <Screen>
      <header className="space-y-2">
        <Eyebrow>{data.username ? `@${data.username}` : "Ton deck"}</Eyebrow>
        <Title>
          {stats.due > 0 ? `${stats.due} film${stats.due > 1 ? "s" : ""} à revoir` : "Deck à jour"}
        </Title>
      </header>

      <div className="mt-8 grid grid-cols-2 gap-3">
        <Stat value={data.films} label="films dans le deck" />
        <Stat value={stats.total} label="cartes (film × catégorie)" />
        <Stat value={stats.fresh} label="jamais posées" />
        <Stat value={stats.mastered} label="mémorisées (&gt; 3 sem.)" />
      </div>

      {data.streak > 0 && (
        <p className="mt-4 text-center text-sm text-muted">
          {data.streak} jour{data.streak > 1 ? "s" : ""} de suite.
        </p>
      )}

      <div className="mt-auto space-y-3 pt-10">
        <LinkButton href="/play" className="w-full">
          {stats.due > 0 ? "Réviser" : "Jouer quand même"}
        </LinkButton>
        <LinkButton href="/onboarding" variant="ghost" className="w-full">
          Mettre à jour depuis Letterboxd
        </LinkButton>
      </div>
      <FooterNav />
    </Screen>
  );
}

function FooterNav() {
  return (
    <nav className="mt-8 flex justify-center gap-6 text-xs text-muted">
      <Link href="/bonus" className="underline-offset-4 hover:underline">
        Ton cinéma
      </Link>
      <Link href="/history" className="underline-offset-4 hover:underline">
        Historique
      </Link>
      <Link href="/about" className="underline-offset-4 hover:underline">
        À propos
      </Link>
    </nav>
  );
}
