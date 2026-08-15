"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { profileUrl } from "@/lib/tmdb/images";
import type { Person } from "@/lib/types";

export function PersonChip({
  person,
  found,
  index = 0,
}: {
  person: Person;
  found?: boolean;
  index?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: index * 0.07, ease: [0.22, 1, 0.36, 1] }}
      className={`flex items-center gap-3 rounded-full border py-1.5 pr-4 pl-1.5 ${
        found ? "border-ok/50 bg-ok/10" : "border-line bg-surface"
      }`}
    >
      <div className="relative size-9 shrink-0 overflow-hidden rounded-full bg-line">
        {person.profilePath && (
          <Image
            src={profileUrl(person.profilePath)}
            alt=""
            fill
            sizes="36px"
            className="object-cover"
          />
        )}
      </div>
      <span className="font-serif text-base leading-tight text-fg">{person.name}</span>
    </motion.div>
  );
}

/** Placeholder for a cast member the player has not named yet. */
export function HiddenChip({ index = 0 }: { index?: number }) {
  return (
    <div
      className="flex items-center gap-3 rounded-full border border-dashed border-line py-1.5 pr-4 pl-1.5"
      aria-label={`Acteur ${index + 1} à trouver`}
    >
      <div className="size-9 shrink-0 rounded-full bg-line/60" />
      <span className="font-serif text-base text-muted">· · ·</span>
    </div>
  );
}
