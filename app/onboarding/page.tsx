"use client";

import { useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { setSetting } from "@/lib/db/schema";
import { normalizeUsername } from "@/lib/letterboxd/username";
import { parseLetterboxdExport } from "@/lib/letterboxd/csv";
import {
  fetchProfileFilms,
  importFilms,
  ImportError,
  refreshFilms,
  type ImportProgress,
} from "@/lib/import/run";
import { db } from "@/lib/db/schema";
import { ImportProgressPanel } from "@/components/ImportProgressPanel";
import { Button, Eyebrow, Notice, Screen, Title } from "@/components/ui";
import type { LetterboxdFilm } from "@/lib/types";

type Status =
  | { kind: "idle" }
  | { kind: "running"; progress: ImportProgress }
  | { kind: "error"; message: string; rateLimited: boolean }
  | {
      kind: "done";
      imported: number;
      skipped: number;
      viaLetterboxd: number;
      retryable: number;
    }
  | { kind: "refreshed"; refreshed: number; cards: number };

const starting = (message: string): ImportProgress => ({
  phase: "profile",
  done: 0,
  total: 1,
  message,
  imported: 0,
  skipped: 0,
});

export default function OnboardingPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const fileInput = useRef<HTMLInputElement>(null);
  const deckSize = useLiveQuery(() => db.films.count(), [], 0);

  async function ingest(films: LetterboxdFilm[]) {
    const summary = await importFilms(films, (progress) =>
      setStatus({ kind: "running", progress }),
    );
    setStatus({
      kind: "done",
      imported: summary.imported,
      skipped: summary.skipped,
      viaLetterboxd: summary.viaLetterboxd,
      retryable: summary.retryable,
    });
  }

  function fail(error: unknown, rateLimited = false) {
    setStatus({
      kind: "error",
      message: error instanceof Error ? error.message : "Import impossible.",
      rateLimited,
    });
  }

  async function runExportImport(file: File) {
    setStatus({
      kind: "running",
      progress: starting("Ouverture de l'archive"),
    });
    try {
      const { films, username: owner } = await parseLetterboxdExport(file);
      if (owner) await setSetting("username", owner.toLowerCase());
      await ingest(films);
    } catch (error) {
      fail(error);
    }
  }

  async function runProfileImport() {
    const user = normalizeUsername(username);
    if (!user) return;

    setStatus({
      kind: "running",
      progress: starting("Connexion à Letterboxd"),
    });
    try {
      const films = await fetchProfileFilms(user, (progress) =>
        setStatus({ kind: "running", progress }),
      );
      await setSetting("username", user);
      await ingest(films);
    } catch (error) {
      const code = error instanceof ImportError ? error.code : "";
      fail(error, code === "LetterboxdBlockedError" || code === "LetterboxdStructureError");
    }
  }

  async function runRefresh() {
    setStatus({ kind: "running", progress: starting("Lecture du deck") });
    try {
      const result = await refreshFilms((progress) => setStatus({ kind: "running", progress }));
      setStatus({ kind: "refreshed", refreshed: result.refreshed, cards: result.cards });
    } catch (error) {
      fail(error);
    }
  }

  const running = status.kind === "running";

  return (
    <Screen>
      <header className="space-y-3">
        <Eyebrow>Constituer le deck</Eyebrow>
        <Title>Tes films</Title>
        <p className="text-sm leading-relaxed text-muted">
          Deux façons de faire. Rien ne quitte ce navigateur : les fiches sont récupérées puis
          stockées ici.
        </p>
      </header>

      {/* CSV first: Letterboxd throttles profile reads hard, the export never fails. */}
      <section className="mt-8 space-y-3 rounded-2xl border border-line bg-surface p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-serif text-xl">Depuis ton export</h2>
          <span className="text-[0.65rem] uppercase tracking-[0.18em] text-ok">fiable</span>
        </div>
        <p className="text-sm leading-relaxed text-muted">
          Sur Letterboxd : Settings → Data → Export. Dépose l&apos;archive{" "}
          <code className="text-fg">.zip</code> telle quelle — elle est ouverte ici, dans ton
          navigateur.
        </p>
        <input
          ref={fileInput}
          type="file"
          accept=".zip,.csv,application/zip,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) runExportImport(file);
          }}
        />
        <Button className="w-full" disabled={running} onClick={() => fileInput.current?.click()}>
          Choisir l&apos;archive
        </Button>
      </section>

      <section className="mt-4 space-y-3 rounded-2xl border border-line p-4">
        <h2 className="font-serif text-xl">Depuis ton pseudo</h2>
        <p className="text-sm leading-relaxed text-muted">
          Plus rapide, mais Letterboxd limite la lecture des profils : au-delà d&apos;un import
          de temps en temps, ça peut être refusé pendant quelques minutes.
        </p>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            runProfileImport();
          }}
        >
          <label className="flex items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3">
            <span className="text-sm text-muted">letterboxd.com/</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="pseudo"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              disabled={running}
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted/60"
            />
          </label>
          <Button
            type="submit"
            variant="ghost"
            className="w-full"
            disabled={running || !username.trim()}
          >
            Lire le profil
          </Button>
        </form>
      </section>

      {/* Only useful once there is a deck: this re-reads what is already in it. */}
      {(deckSize ?? 0) > 0 && (
        <section className="mt-4 space-y-3 rounded-2xl border border-line p-4">
          <h2 className="font-serif text-xl">Mettre à jour les fiches</h2>
          <p className="text-sm leading-relaxed text-muted">
            Recharge les {deckSize} films du deck depuis TMDB : castings élargis à 30 acteurs et
            notoriété à jour. Ta progression et ton historique ne bougent pas.
          </p>
          <Button variant="ghost" className="w-full" disabled={running} onClick={runRefresh}>
            Rafraîchir le deck
          </Button>
        </section>
      )}

      {status.kind === "running" && (
        <div className="mt-8 space-y-3">
          <ImportProgressPanel progress={status.progress} />
          {status.progress.phase === "films" && (
            <p className="text-xs leading-relaxed text-muted/80">
              La progression est enregistrée au fur et à mesure : tu peux fermer et reprendre
              plus tard sans rien reperdre.
            </p>
          )}
        </div>
      )}

      {status.kind === "error" && (
        <div className="mt-8 space-y-3">
          <Notice tone="error">{status.message}</Notice>
          {status.rateLimited && (
            <Button className="w-full" onClick={() => fileInput.current?.click()}>
              Passer par l&apos;archive d&apos;export
            </Button>
          )}
        </div>
      )}

      {status.kind === "refreshed" && (
        <div className="mt-8 space-y-4">
          <Notice>
            {status.refreshed} fiches mises à jour
            {status.cards > 0 && `, ${status.cards} nouvelles cartes`}.
          </Notice>
          <Button className="w-full" onClick={() => router.push("/play")}>
            Jouer
          </Button>
        </div>
      )}

      {status.kind === "done" && (
        <div className="mt-8 space-y-4">
          <Notice>
            {status.imported} films importés
            {status.skipped > 0 && `, ${status.skipped} écartés faute de données fiables`}.
            {status.viaLetterboxd > 0 &&
              ` ${status.viaLetterboxd} titres ambigus ont été vérifiés un par un sur Letterboxd.`}
          </Notice>
          {/* These films are not lost: nothing was recorded against them, so
              relaunching the same import picks them up where TMDB failed. */}
          {status.retryable > 0 && (
            <Notice tone="error">
              {status.retryable} film{status.retryable > 1 ? "s n'ont" : " n'a"} pas pu être
              récupéré{status.retryable > 1 ? "s" : ""} sur TMDB. Relance le même import pour
              {status.retryable > 1 ? " les" : " le"} rattraper.
            </Notice>
          )}
          <Button className="w-full" onClick={() => router.push("/play")}>
            Jouer
          </Button>
        </div>
      )}

      <Link
        href="/"
        className="mt-auto pt-10 text-center text-xs text-muted underline-offset-4 hover:underline"
      >
        Retour
      </Link>
    </Screen>
  );
}
