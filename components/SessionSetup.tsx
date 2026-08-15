"use client";

import Link from "next/link";
import {
  formatLength,
  MODE_LABELS,
  SESSION_LENGTHS,
  type SessionSettings,
} from "@/lib/game/session";
import type { PlayMode } from "@/lib/db/schema";
import type { CategoryStats } from "@/lib/srs/queue";
import { CATEGORY_GROUPS, CATEGORY_LABELS, type Category } from "@/lib/types";
import { Button, Eyebrow, Screen, Title } from "./ui";

function Pill({
  selected,
  className = "",
  ...props
}: React.ComponentProps<"button"> & { selected: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={`min-h-12 rounded-full border px-4 text-sm transition-colors duration-200 ${
        selected
          ? "border-accent bg-accent text-accent-fg"
          : "border-line bg-surface text-fg"
      } ${className}`}
      {...props}
    />
  );
}

export function SessionSetup({
  settings,
  stats,
  onChange,
  onStart,
}: {
  settings: SessionSettings;
  stats: Record<Category, CategoryStats> | null;
  onChange: (next: SessionSettings) => void;
  onStart: () => void;
}) {
  function toggle(category: Category) {
    const next = settings.categories.includes(category)
      ? settings.categories.filter((c) => c !== category)
      : [...settings.categories, category];
    onChange({ ...settings, categories: next });
  }

  const playable = settings.categories.reduce(
    (sum, c) => sum + (stats?.[c]?.total ?? 0),
    0,
  );

  return (
    <Screen>
      <header className="space-y-3">
        <Eyebrow>Nouvelle session</Eyebrow>
        <Title>Régler la partie</Title>
      </header>

      <section className="mt-8 space-y-3">
        <h2 className="text-sm text-muted">Comment ?</h2>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(MODE_LABELS) as PlayMode[]).map((mode) => (
            <Pill
              key={mode}
              selected={settings.mode === mode}
              onClick={() => onChange({ ...settings, mode })}
            >
              {MODE_LABELS[mode]}
            </Pill>
          ))}
        </div>
        <p className="text-xs leading-relaxed text-muted">
          {settings.mode === "arcade"
            ? "Sans fin, trois fautes et c'est terminé. Ne touche pas à ta progression : les films sont tirés au hasard, pas selon les échéances."
            : "Les films dus en premier, et chaque réponse déplace la prochaine échéance."}
        </p>
      </section>

      {settings.mode === "srs" && (
        <section className="mt-8 space-y-3">
          <h2 className="text-sm text-muted">Combien de cartes ?</h2>
          <div className="grid grid-cols-4 gap-2">
            {SESSION_LENGTHS.map((length) => (
              <Pill
                key={length}
                selected={settings.length === length}
                onClick={() => onChange({ ...settings, length })}
              >
                {formatLength(length)}
              </Pill>
            ))}
          </div>
        </section>
      )}

      {/* Grouped rather than one flat list: seven categories in a row stops
          being readable, and the two halves ask genuinely different things —
          who made the film, versus which film this is. */}
      {CATEGORY_GROUPS.map((group) => (
        <section key={group.label} className="mt-8 space-y-3">
          <h2 className="text-sm text-muted">{group.label}</h2>
          <div className="space-y-2">
            {group.categories.map((category) => {
              const selected = settings.categories.includes(category);
              const stat = stats?.[category];
              return (
                <button
                  key={category}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggle(category)}
                  className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition-colors duration-200 ${
                    selected ? "border-accent bg-accent/10" : "border-line bg-surface"
                  }`}
                >
                  <span>
                    <span className="block font-serif text-xl">
                      {CATEGORY_LABELS[category]}
                    </span>
                    {stat && (
                      <span className="mt-0.5 block text-xs text-muted tabular-nums">
                        {stat.due > 0 ? `${stat.due} à revoir · ` : ""}
                        {stat.fresh} jamais posée{stat.fresh > 1 ? "s" : ""}
                      </span>
                    )}
                  </span>
                  <span
                    className={`h-5 w-5 shrink-0 rounded-full border ${
                      selected ? "border-accent bg-accent" : "border-line"
                    }`}
                  />
                </button>
              );
            })}
          </div>
        </section>
      ))}

      <div className="mt-auto space-y-3 pt-10">
        {settings.categories.length === 0 ? (
          <p className="text-center text-sm text-muted">Choisis au moins une catégorie.</p>
        ) : (
          playable === 0 && (
            <p className="text-center text-sm text-muted">
              Aucune carte dans cette sélection.
            </p>
          )
        )}
        <Button className="w-full" onClick={onStart} disabled={playable === 0}>
          Commencer
        </Button>
        <Link
          href="/"
          className="block text-center text-sm text-muted underline-offset-4 hover:underline"
        >
          Retour
        </Link>
      </div>
    </Screen>
  );
}
