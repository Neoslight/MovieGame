"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { posterUrl } from "@/lib/tmdb/images";

/**
 * Posters print the cast and the director right on them, so an unblurred one
 * hands over the answer. Blurred, it still reads as *this* film — colours,
 * composition, the shape of a face — while the credits block and the features
 * are gone.
 */
const HIDDEN_BLUR = 12;

export function PosterCard({
  posterPath,
  title,
  year,
  revealed,
  showCaption = true,
  showYear = true,
}: {
  posterPath: string | null;
  title: string;
  year: number | null;
  revealed: boolean;
  /** False only where the title is the answer; see the caption comment below. */
  showCaption?: boolean;
  /** False while the year itself is the question. */
  showYear?: boolean;
}) {
  return (
    <motion.figure
      key={posterPath ?? title}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="relative mx-auto w-full max-w-[15rem]"
    >
      <div className="relative aspect-[2/3] overflow-hidden rounded-2xl border border-line bg-surface">
        {posterPath ? (
          <motion.div
            className="absolute inset-0"
            initial={false}
            animate={{
              filter: `blur(${revealed ? 0 : HIDDEN_BLUR}px)`,
              // Blur samples past the edges and would leave a translucent rim;
              // the overscan pushes that outside the rounded frame.
              scale: revealed ? 1 : 1.12,
            }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            <Image
              src={posterUrl(posterPath)}
              alt={revealed ? `Affiche de ${title}` : ""}
              fill
              sizes="240px"
              priority
              className="object-cover"
            />
          </motion.div>
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted">
            {title}
          </div>
        )}
        {/* Vignette: keeps the poster feeling printed rather than pasted on. */}
        <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_60px_rgba(0,0,0,0.45)]" />
      </div>

      {/* Readable by default: the blur removes the title along with the credits,
          and a film you cannot name is not a question, it is a guess. The one
          exception is the category where naming the film *is* the question —
          there the caption would be the answer, so it waits for the reveal. */}
      {showCaption ? (
        <figcaption className="mt-3 text-center font-serif text-lg leading-tight text-fg">
          {title}
          {year && showYear && <span className="text-muted"> · {year}</span>}
        </figcaption>
      ) : (
        // Keeps the poster from jumping when the caption appears at the reveal.
        <div aria-hidden className="mt-3 h-[1.75rem]" />
      )}
    </motion.figure>
  );
}
