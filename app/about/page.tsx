"use client";

import { useState } from "react";
import Link from "next/link";
import { db } from "@/lib/db/schema";
import { parseBackup, type Backup } from "@/lib/db/backup";
import { ThemePicker } from "@/components/ThemePicker";
import { Button, Eyebrow, Notice, Screen, Title } from "@/components/ui";

export default function AboutPage() {
  const [error, setError] = useState<string | null>(null);

  async function exportData() {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      films: await db.films.toArray(),
      cards: await db.cards.toArray(),
      reviews: await db.reviews.toArray(),
      settings: await db.settings.toArray(),
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `contretype-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importData(file: File) {
    setError(null);
    let backup: Backup;
    try {
      // Validated *before* anything is cleared. A file that parses but has the
      // wrong shape used to wipe the deck and then write the garbage in, with
      // the transaction committing happily on top of a destroyed collection.
      backup = parseBackup(JSON.parse(await file.text()));
    } catch (cause) {
      setError(
        cause instanceof SyntaxError
          ? "Fichier illisible : ce n'est pas du JSON. Ton deck n'a pas été touché."
          : "Fichier non reconnu : ce n'est pas une sauvegarde Contretype. Ton deck n'a pas été touché.",
      );
      return;
    }

    try {
      await db.transaction("rw", db.films, db.cards, db.reviews, db.settings, async () => {
        await Promise.all([db.films.clear(), db.cards.clear(), db.reviews.clear()]);
        await db.films.bulkPut(backup.films);
        await db.cards.bulkPut(backup.cards);
        await db.reviews.bulkPut(backup.reviews);
        await db.settings.bulkPut(backup.settings);
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `Restauration interrompue : ${cause.message}`
          : "Restauration interrompue.",
      );
      return;
    }
    location.href = "/";
  }

  async function wipe() {
    if (!confirm("Effacer tout le deck et l'historique de ce navigateur ?")) return;
    // Settings included: a half-wiped state that still remembers the account
    // makes a fresh import look like it worked when nothing was imported.
    await Promise.all([
      db.films.clear(),
      db.cards.clear(),
      db.reviews.clear(),
      db.unresolved.clear(),
      db.settings.clear(),
    ]);
    location.href = "/onboarding";
  }

  return (
    <Screen>
      <header className="space-y-2">
        <Eyebrow>Contretype</Eyebrow>
        <Title>À propos</Title>
      </header>

      <div className="mt-8 space-y-4 text-sm leading-relaxed text-muted">
        <p>
          Les films viennent de ton profil Letterboxd public. Les fiches, affiches et photos
          viennent de TMDB. Ta progression ne quitte jamais ce navigateur.
        </p>

        <Notice>
          This product uses the TMDB API but is not endorsed or certified by TMDB.
        </Notice>

        <p>
          Letterboxd ne fournit pas d&apos;API publique : les films sont lus depuis les pages
          publiques du profil, à un rythme volontairement lent. Si la lecture échoue, l&apos;import
          par fichier CSV prend le relais.
        </p>
      </div>

      <section className="mt-10 space-y-3">
        <h2 className="text-sm text-muted">Thème</h2>
        <ThemePicker />
      </section>

      <div className="mt-10 space-y-3">
        <Button variant="ghost" className="w-full" onClick={exportData}>
          Exporter mes données
        </Button>
        <label className="block">
          <span className="sr-only">Importer une sauvegarde</span>
          <input
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) importData(file);
            }}
          />
          <span className="inline-flex min-h-12 w-full cursor-pointer items-center justify-center rounded-full border border-line px-6 text-sm">
            Importer une sauvegarde
          </span>
        </label>
        <Button variant="ghost" className="w-full text-accent" onClick={wipe}>
          Tout effacer
        </Button>
        {error && <Notice tone="error">{error}</Notice>}
      </div>

      <Link
        href="/"
        className="mt-10 block text-center text-xs text-muted underline-offset-4 hover:underline"
      >
        Retour
      </Link>
    </Screen>
  );
}
