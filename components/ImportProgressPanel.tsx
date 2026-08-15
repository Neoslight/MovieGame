"use client";

import { motion } from "framer-motion";
import type { ImportProgress } from "@/lib/import/run";

function formatEta(seconds: number): string {
  if (seconds < 45) return "moins d'une minute";
  const minutes = Math.round(seconds / 60);
  return minutes <= 1 ? "environ 1 minute" : `environ ${minutes} minutes`;
}

const VIA_LABEL: Record<"search" | "letterboxd", string> = {
  search: "identifié directement",
  letterboxd: "vérifié sur Letterboxd",
};

export function ImportProgressPanel({ progress }: { progress: ImportProgress }) {
  const ratio = progress.total > 0 ? progress.done / progress.total : 0;

  return (
    <section className="space-y-4 rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-serif text-xl leading-none">{progress.message}</p>
        <p className="shrink-0 font-serif text-xl leading-none tabular-nums">
          {Math.round(ratio * 100)}%
        </p>
      </div>

      {/* Determinate bar: the count it reflects is stated right below, so the
          player can tell progress from a stalled request. */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
        <motion.div
          className="h-full rounded-full bg-accent"
          animate={{ width: `${Math.min(100, ratio * 100)}%` }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>

      <div className="flex items-baseline justify-between gap-3 text-sm">
        <p className="tabular-nums text-fg">
          {progress.done} <span className="text-muted">sur {progress.total}</span>
        </p>
        {progress.etaSeconds !== undefined && (
          <p className="text-muted">{formatEta(progress.etaSeconds)} restantes</p>
        )}
      </div>

      {/* The moving line: proof that something is happening between two ticks
          of the counter. Titles change several times a second, so this is
          plain text — animating each one in and out would read as flicker. */}
      <div className="min-h-10 rounded-xl bg-bg/60 px-3 py-2">
        <p className="truncate text-sm text-fg">{progress.current ?? "Préparation…"}</p>
        {progress.via && (
          <p className="mt-0.5 text-xs text-muted">{VIA_LABEL[progress.via]}</p>
        )}
      </div>

      {progress.phase === "films" && (
        <dl className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl border border-line px-3 py-2">
            <dt className="text-muted">Ajoutés au deck</dt>
            <dd className="font-serif text-lg tabular-nums text-ok">{progress.imported}</dd>
          </div>
          <div className="rounded-xl border border-line px-3 py-2">
            <dt className="text-muted">Écartés</dt>
            <dd className="font-serif text-lg tabular-nums text-muted">{progress.skipped}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}
