"use client";

import Image from "next/image";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/schema";
import { posterUrl } from "@/lib/tmdb/images";
import { CATEGORY_LABELS } from "@/lib/types";
import { Eyebrow, Screen, Title } from "@/components/ui";

const relative = (ts: number) => {
  const minutes = Math.round((Date.now() - ts) / 60_000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  return `il y a ${Math.round(hours / 24)} j`;
};

export default function HistoryPage() {
  const reviews = useLiveQuery(
    () => db.reviews.orderBy("ts").reverse().limit(60).toArray(),
    [],
  );

  return (
    <Screen>
      <header className="space-y-2">
        <Eyebrow>Derniers tirages</Eyebrow>
        <Title>Historique</Title>
      </header>

      {reviews?.length === 0 && (
        <p className="mt-8 text-sm text-muted">Aucune réponse enregistrée pour l&apos;instant.</p>
      )}

      <ul className="mt-8 space-y-3">
        {reviews?.map((r) => (
          <li
            key={r.id}
            className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-3"
          >
            <div className="relative h-[4.5rem] w-12 shrink-0 overflow-hidden rounded-md bg-line">
              {r.posterPath && (
                <Image
                  src={posterUrl(r.posterPath, "w342")}
                  alt=""
                  fill
                  sizes="48px"
                  className="object-cover"
                />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-serif text-lg leading-tight">{r.filmTitle}</p>
              <p className="text-xs text-muted">
                {CATEGORY_LABELS[r.category]} · {relative(r.ts)}
              </p>
              <p className="mt-1 truncate text-sm">
                <span className={r.correct ? "text-ok" : "text-accent"}>
                  {r.correct ? "Trouvé" : "Manqué"}
                </span>
                <span className="text-muted"> — {r.expected}</span>
              </p>
            </div>
          </li>
        ))}
      </ul>

      <Link
        href="/"
        className="mt-10 block text-center text-xs text-muted underline-offset-4 hover:underline"
      >
        Retour
      </Link>
    </Screen>
  );
}
