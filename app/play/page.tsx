"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { db, getSetting, setSetting } from "@/lib/db/schema";
import { backfillCards } from "@/lib/import/run";
import { categoryStats, nextQuestion, type CategoryStats } from "@/lib/srs/queue";
import { ARCADE_LIVES, isOver, newRun, nextArcade, type ArcadeState } from "@/lib/game/arcade";
import type { Card, PlayMode } from "@/lib/db/schema";
import { formatInterval, review, Rating } from "@/lib/srs/scheduler";
import {
  castClue,
  castToReveal,
  checkSubmission,
  promptFor,
  requiredFor,
  scoreRound,
  scoreYear,
  targetsFor,
  type RoundOutcome,
} from "@/lib/game/round";
import { capGrade, HINTS_AFTER_WRONG, hintFor, hintForYear, MAX_HINT_LEVEL } from "@/lib/game/hints";
import { buildChoices, type Choice } from "@/lib/game/choices";
import { matchTitle } from "@/lib/matching/title";
import {
  DEFAULT_SESSION,
  sanitizeSession,
  SESSION_SETTING_KEY,
  type SessionSettings,
} from "@/lib/game/session";
import {
  CATEGORY_ANSWER,
  CATEGORY_LABELS,
  isMultiName,
  type Category,
  type Film,
  type Person,
} from "@/lib/types";
import { PosterCard } from "@/components/PosterCard";
import { HiddenChip, PersonChip } from "@/components/PersonChip";
import { SessionSetup } from "@/components/SessionSetup";
import { Button, Eyebrow, Notice, ProgressBar, Screen } from "@/components/ui";

type Phase = "asking" | "revealed";

/** Just enough of a film to feed the title matcher and the decoy pool. */
type TitleRef = Pick<Film, "tmdbId" | "title" | "originalTitle">;

/**
 * One round, whichever mode drew it. `card` is null in arcade — that is the
 * whole guarantee: with no card there is nothing to reschedule, so a fast run
 * cannot rewrite the deck's due dates.
 */
interface Round {
  film: Film;
  category: Category;
  card: Card | null;
}

export default function PlayPage() {
  /** null until the stored settings are read; the setup screen waits for them. */
  const [settings, setSettings] = useState<SessionSettings | null>(null);
  const [stats, setStats] = useState<Record<Category, CategoryStats> | null>(null);
  const [started, setStarted] = useState(false);

  const [question, setQuestion] = useState<Round | null>(null);
  const [run, setRun] = useState<ArcadeState>(newRun);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<Phase>("asking");
  const [answer, setAnswer] = useState("");
  const [found, setFound] = useState<Person[]>([]);
  const [worstDistance, setWorstDistance] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [nextDue, setNextDue] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [answered, setAnswered] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);

  // The rescue path: wrong answers open the hint ladder, the ladder opens the
  // multiple choice. Reset on every draw.
  const [wrongAttempts, setWrongAttempts] = useState(0);
  const [hintLevel, setHintLevel] = useState(0);
  const [choices, setChoices] = useState<Choice<string>[] | null>(null);

  // Set by every draw; reading the clock during render is not allowed.
  const startedAt = useRef(0);
  const recentFilmIds = useRef<number[]>([]);
  const activeCategories = useRef<Category[]>([]);
  const activeMode = useRef<PlayMode>("srs");
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * The whole cast of the deck, and every title, loaded once: both matchers
   * need them to reject an answer that fits something else better. Rebuilding
   * this per question would mean re-reading every film row on every draw.
   */
  const [corpus, setCorpus] = useState<Person[]>([]);
  const [titleCorpus, setTitleCorpus] = useState<TitleRef[]>([]);
  /** The deck itself, kept for the arcade draw so it is read exactly once. */
  const allFilms = useRef<Film[]>([]);
  useEffect(() => {
    db.films.toArray().then((films) => {
      allFilms.current = films;
      const byId = new Map<number, Person>();
      for (const film of films) {
        for (const person of [...film.directors, ...film.cast]) {
          if (!byId.has(person.tmdbId)) byId.set(person.tmdbId, person);
        }
      }
      setCorpus([...byId.values()]);
      setTitleCorpus(
        films.map((f) => ({
          tmdbId: f.tmdbId,
          title: f.title,
          originalTitle: f.originalTitle,
        })),
      );
    });
  }, []);

  useEffect(() => {
    // Backfill first: a deck imported before a category existed has no card for
    // it, and the counts below would report it empty for ever otherwise.
    backfillCards()
      .catch(() => 0)
      .then(() =>
        Promise.all([
          getSetting<unknown>(SESSION_SETTING_KEY, DEFAULT_SESSION),
          categoryStats(),
        ]),
      )
      .then(([stored, counts]) => {
        setSettings(sanitizeSession(stored));
        setStats(counts);
      });
  }, []);

  /**
   * The clock, read through a callback. Reading it in render scope is not
   * allowed — and every read below happens in response to a tap, never during
   * a render, so deferring it this way says what is actually going on.
   */
  const now = useCallback(() => Date.now(), []);

  const draw = useCallback(async () => {
    setLoading(true);
    let next: Round | null;
    if (activeMode.current === "arcade") {
      const drawn = nextArcade(allFilms.current, activeCategories.current, {
        score: 0,
        mistakes: 0,
        seen: recentFilmIds.current,
      });
      next = drawn ? { film: drawn.film, category: drawn.category, card: null } : null;
    } else {
      const drawn = await nextQuestion({
        categories: activeCategories.current,
        recentFilmIds: recentFilmIds.current,
      });
      next = drawn ? { film: drawn.film, category: drawn.card.category, card: drawn.card } : null;
    }
    setQuestion(next);
    setPhase("asking");
    setAnswer("");
    setFound([]);
    setWorstDistance(0);
    setFeedback(null);
    setNextDue(null);
    setWriteError(null);
    setWrongAttempts(0);
    setHintLevel(0);
    setChoices(null);
    startedAt.current = now();
    setLoading(false);
    if (next) recentFilmIds.current = [...recentFilmIds.current, next.film.tmdbId].slice(-20);
  }, [now]);

  function start() {
    if (!settings) return;
    setSetting(SESSION_SETTING_KEY, settings);
    // Frozen for the whole session: the setup screen is where the choice is
    // made, and a draw mid-session should not switch categories underfoot.
    activeCategories.current = settings.categories;
    activeMode.current = settings.mode;
    recentFilmIds.current = [];
    setAnswered(0);
    setCorrectCount(0);
    setRun(newRun());
    setStarted(true);
    draw();
  }

  const category = question?.category ?? "director";
  const kind = CATEGORY_ANSWER[category];

  /** Everyone who counts as a right answer — the whole credited cast. */
  const targets = useMemo(
    () => (question ? targetsFor(question.film, category) : []),
    [question, category],
  );
  /** How many of them close the round — scales with the film's notoriety. */
  const required = useMemo(
    () => (question ? requiredFor(question.film, category) : 0),
    [question, category],
  );
  const remaining = useMemo(
    () => targets.filter((t) => !found.some((f) => f.tmdbId === t.tmdbId)),
    [targets, found],
  );
  // Only the cast needs trimming: the other categories credit a handful of
  // people at most, so the reveal shows them whole.
  const revealCast = useMemo(
    () =>
      question && isMultiName(category)
        ? castToReveal(question.film, found, required)
        : targets,
    [question, category, found, required, targets],
  );

  /** What the hint ladder uncovers, and what the multiple choice asks for. */
  const expectedText = useMemo(() => {
    if (!question) return "";
    if (kind === "year") return String(question.film.year ?? "");
    if (kind === "title") return question.film.title;
    return revealCast.map((p) => p.name).join(", ");
  }, [question, kind, revealCast]);

  const hintTarget = useMemo(() => {
    if (!question) return "";
    if (kind === "title") return question.film.title;
    return remaining[0]?.name ?? targets[0]?.name ?? "";
  }, [question, kind, remaining, targets]);

  const hintText =
    hintLevel > 0 && question
      ? kind === "year"
        ? hintForYear(question.film.year ?? 0, hintLevel)
        : hintFor(hintTarget, hintLevel)
      : null;

  /**
   * Writes the round away. Scoring happens before this and never depends on it,
   * which is what lets arcade reuse the whole round while skipping the card
   * write entirely — see lib/game/arcade.ts.
   */
  async function persist(outcome: RoundOutcome, userAnswer: string) {
    if (!question) return null;
    const card = question.card;
    const updated = card ? review(card, outcome.grade) : null;
    const entry = {
      cardId: card?.id ?? null,
      filmId: question.film.tmdbId,
      category,
      ts: now(),
      correct: outcome.correct,
      rating: outcome.grade,
      userAnswer,
      // The billed names only: storing all thirty would bloat every review row.
      expected: expectedText,
      distance: outcome.distance,
      durationMs: now() - startedAt.current,
      mode: activeMode.current,
      hintsUsed: hintLevel,
      filmTitle: question.film.title,
      posterPath: question.film.posterPath,
    };

    try {
      if (card && updated) {
        await db.transaction("rw", db.cards, db.reviews, async () => {
          await db.cards.update(card.id!, updated);
          await db.reviews.add(entry);
        });
      } else {
        // Arcade: the run is remembered, the schedule is not touched.
        await db.reviews.add(entry);
      }
    } catch (error) {
      // A failed write (quota, private browsing) used to leave the round frozen:
      // the answer field is already cleared and the reveal never came. Show the
      // answer anyway — the round is lost to the scheduler, not to the player.
      setWriteError(
        error instanceof Error
          ? `Progression non enregistrée : ${error.message}`
          : "Progression non enregistrée.",
      );
    }
    return updated;
  }

  async function conclude(outcome: RoundOutcome, userAnswer: string) {
    const updated = await persist(outcome, userAnswer);
    setPhase("revealed");
    if (updated) setNextDue(formatInterval(new Date(updated.due)));
    setAnswered((n) => n + 1);
    if (outcome.correct) setCorrectCount((n) => n + 1);
    if (activeMode.current === "arcade") {
      setRun((state) => ({
        score: state.score + (outcome.correct ? 1 : 0),
        mistakes: state.mistakes + (outcome.correct ? 0 : 1),
        seen: state.seen,
      }));
    }
  }

  async function finish(revealed: boolean, overrideFound = found, distance = worstDistance) {
    if (!question) return;
    const elapsedMs = now() - startedAt.current;

    if (kind === "year") {
      const guess = Number.parseInt(answer, 10);
      const outcome = scoreYear({
        guess: Number.isFinite(guess) ? guess : Number.NEGATIVE_INFINITY,
        actual: question.film.year ?? 0,
        elapsedMs,
        revealed,
        hintsUsed: hintLevel,
      });
      await conclude(outcome, revealed ? "" : answer);
      return;
    }

    if (kind === "title") {
      await conclude(
        { grade: Rating.Again, correct: false, distance: 0 },
        revealed ? "" : answer,
      );
      return;
    }

    const outcome = scoreRound({
      category,
      foundCount: overrideFound.length,
      required,
      worstDistance: distance,
      elapsedMs,
      revealed,
      hintsUsed: hintLevel,
    });
    await conclude(outcome, overrideFound.map((p) => p.name).join(", "));
  }

  function miss(message: string) {
    setFeedback(message);
    setWrongAttempts((n) => n + 1);
  }

  function submit() {
    if (!question || !answer.trim() || phase === "revealed") return;
    const elapsedMs = now() - startedAt.current;

    if (kind === "year") {
      const guess = Number.parseInt(answer.trim(), 10);
      if (!Number.isFinite(guess)) {
        miss("Donne une année, en chiffres.");
        return;
      }
      const outcome = scoreYear({
        guess,
        actual: question.film.year ?? 0,
        elapsedMs,
        revealed: false,
        hintsUsed: hintLevel,
      });
      if (!outcome.correct) {
        setAnswer("");
        miss("Non. Réessaie, ou demande un indice.");
        return;
      }
      setAnswer("");
      conclude(outcome, String(guess));
      return;
    }

    if (kind === "title") {
      const result = matchTitle(answer, question.film, {
        corpus: titleCorpus.filter((f) => f.tmdbId !== question.film.tmdbId),
      });
      setAnswer("");
      if (!result.ok) {
        miss("Non. Réessaie, ou demande un indice.");
        return;
      }
      conclude(
        {
          grade: capGrade(
            result.distance > 0 ? Rating.Hard : Rating.Good,
            hintLevel,
          ),
          correct: true,
          distance: result.distance,
        },
        answer,
      );
      return;
    }

    const result = checkSubmission(answer, remaining, corpus);
    setAnswer("");

    if (result.kind === "ambiguous") {
      setFeedback(`Précise le prénom — ${result.ambiguousWith?.join(" ou ")} ?`);
      return;
    }
    if (!result.ok || !result.person) {
      miss("Non. Réessaie, ou demande un indice.");
      return;
    }

    const distance = Math.max(worstDistance, result.distance);
    const nextFound = [...found, result.person];
    setWorstDistance(distance);
    setFound(nextFound);
    setFeedback(
      result.distance > 0 ? `Accepté — ça s'écrit « ${result.person.name} »` : "Trouvé.",
    );

    if (nextFound.length >= required) finish(false, nextFound, distance);
    else inputRef.current?.focus();
  }

  /** Builds the four-option rescue once the ladder is exhausted. */
  function openChoices() {
    if (!question) return;
    const answerLabel =
      kind === "year"
        ? String(question.film.year ?? "")
        : kind === "title"
          ? question.film.title
          : (remaining[0]?.name ?? targets[0]?.name ?? "");

    let pool: string[];
    if (kind === "year") {
      const actual = question.film.year ?? 0;
      pool = [actual - 7, actual - 3, actual + 4, actual + 9, actual - 12].map(String);
    } else if (kind === "title") {
      pool = titleCorpus.filter((f) => f.tmdbId !== question.film.tmdbId).map((f) => f.title);
    } else {
      // Everyone credited on this film is also a right answer, so none of them
      // can be a decoy.
      const alsoRight = new Set(targets.map((p) => p.name));
      pool = corpus.map((p) => p.name).filter((name) => !alsoRight.has(name));
    }

    setChoices(buildChoices(answerLabel, pool, (s) => s, (s) => s));
  }

  function pickChoice(picked: string) {
    if (!question) return;
    const answerLabel =
      kind === "year"
        ? String(question.film.year ?? "")
        : kind === "title"
          ? question.film.title
          : (remaining[0]?.name ?? targets[0]?.name ?? "");

    setChoices(null);
    if (picked !== answerLabel) {
      conclude({ grade: Rating.Again, correct: false, distance: 0 }, picked);
      return;
    }
    // Recognised, not recalled: worth keeping the card moving, never more.
    conclude({ grade: Rating.Hard, correct: true, distance: 0 }, picked);
  }

  // Every hook above runs unconditionally; the branching starts here.
  if (!settings) {
    return (
      <Screen>
        <p className="m-auto text-sm text-muted">Chargement…</p>
      </Screen>
    );
  }

  if (!started) {
    return (
      <SessionSetup settings={settings} stats={stats} onChange={setSettings} onStart={start} />
    );
  }

  if (loading) {
    return (
      <Screen>
        <p className="m-auto text-sm text-muted">Tirage…</p>
      </Screen>
    );
  }

  if (!question) {
    return (
      <Screen>
        <div className="m-auto space-y-4 text-center">
          <p className="font-serif text-2xl">Rien à jouer</p>
          <p className="text-sm text-muted">
            Aucune carte dans cette sélection — change de catégorie, ou importe ton profil.
          </p>
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setStarted(false)}
              className="text-sm text-accent underline underline-offset-4"
            >
              Changer de réglages
            </button>
            <Link
              href="/onboarding"
              className="block text-sm text-muted underline underline-offset-4"
            >
              Importer
            </Link>
          </div>
        </div>
      </Screen>
    );
  }

  const arcade = settings.mode === "arcade";
  // A length of 0 means the player asked for an open session: never end it.
  // An arcade run ignores the length entirely and ends on the third mistake.
  const sessionOver = arcade
    ? isOver(run)
    : settings.length > 0 && answered >= settings.length;

  if (sessionOver && phase === "revealed") {
    return (
      <Screen>
        <div className="m-auto space-y-6 text-center">
          <Eyebrow>{arcade ? "Partie terminée" : "Session terminée"}</Eyebrow>
          <p className="font-serif text-5xl">
            {arcade ? run.score : correctCount}
            {!arcade && <span className="text-muted">/{answered}</span>}
          </p>
          {arcade && (
            <p className="text-sm text-muted">
              {run.score === 0
                ? "Aucun film trouvé."
                : `${run.score} film${run.score > 1 ? "s" : ""} d'affilée avant la troisième faute.`}
            </p>
          )}
          <div className="space-y-3 pt-4">
            <Button className="w-full" onClick={start}>
              Rejouer
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => setStarted(false)}>
              Changer de réglages
            </Button>
            <Link href="/" className="block text-sm text-muted underline underline-offset-4">
              Retour à l&apos;accueil
            </Link>
          </div>
        </div>
      </Screen>
    );
  }

  const { film } = question;
  const revealed = phase === "revealed";
  // The title is the answer here, so it cannot sit under the poster until the
  // round is over — see PosterCard for why it is shown everywhere else.
  const showCaption = category !== "title-poster" || revealed;
  // The cast is the clue, so the poster stays out of it until the reveal.
  const showPoster = category !== "title-cast" || revealed;
  const canHint = !revealed && wrongAttempts >= HINTS_AFTER_WRONG;

  return (
    <Screen>
      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <Eyebrow>{CATEGORY_LABELS[category]}</Eyebrow>
          {arcade ? (
            <span className="text-xs tabular-nums text-muted">
              {run.score} ·{" "}
              <span aria-label={`${ARCADE_LIVES - run.mistakes} vies restantes`}>
                {"●".repeat(Math.max(0, ARCADE_LIVES - run.mistakes))}
                <span className="text-line">{"●".repeat(run.mistakes)}</span>
              </span>
            </span>
          ) : (
            <span className="text-xs text-muted tabular-nums">
              {settings.length > 0
                ? `${Math.min(answered + 1, settings.length)}/${settings.length}`
                : `${answered + 1}`}
            </span>
          )}
        </div>
        {/* An open session has no end to point at, so the bar would be a lie —
            and an arcade run has no end at all, only a last mistake. */}
        {!arcade && settings.length > 0 && (
          <ProgressBar value={answered / settings.length} />
        )}
      </div>

      {showPoster ? (
        <div className="mt-6">
          <PosterCard
            posterPath={film.posterPath}
            title={film.title}
            year={film.year}
            revealed={revealed}
            showCaption={showCaption}
            showYear={category !== "year" || revealed}
          />
        </div>
      ) : (
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {castClue(film).map((person, i) => (
            <PersonChip key={person.tmdbId} person={person} index={i} />
          ))}
        </div>
      )}

      <p className="mt-6 text-center font-serif text-2xl leading-tight">
        {revealed ? "" : promptFor(category, required)}
      </p>

      {isMultiName(category) && !revealed && (
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {found.map((person, i) => (
            <PersonChip key={person.tmdbId} person={person} found index={i} />
          ))}
          {Array.from({ length: Math.max(0, required - found.length) }, (_, i) => (
            <HiddenChip key={`hidden-${i}`} index={i} />
          ))}
        </div>
      )}

      {hintText && !revealed && (
        <p className="mt-4 text-center font-serif text-xl tracking-[0.12em] text-muted">
          {hintText}
        </p>
      )}

      <AnimatePresence mode="wait">
        {revealed && (
          <motion.div
            key="reveal"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="mt-4 space-y-4"
          >
            {kind === "people" && (
              <div className="flex flex-wrap justify-center gap-2">
                {revealCast.map((person, i) => (
                  <PersonChip
                    key={person.tmdbId}
                    person={person}
                    found={found.some((f) => f.tmdbId === person.tmdbId)}
                    index={i}
                  />
                ))}
              </div>
            )}
            {writeError && <Notice tone="error">{writeError}</Notice>}
            {nextDue && !writeError && (
              <p className="text-center text-xs text-muted">Reposé {nextDue}</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-auto space-y-3 pt-8">
        {/* The only per-answer feedback in the game: without a live region a
            screen reader never hears "Trouvé" or "Non". */}
        <p role="status" aria-live="polite" className="text-center text-sm text-muted">
          {!revealed && feedback}
        </p>

        {revealed ? (
          <Button className="w-full" onClick={draw} autoFocus>
            Film suivant
          </Button>
        ) : choices ? (
          <div className="grid gap-2">
            {choices.map((choice) => (
              <Button
                key={choice.label}
                variant="ghost"
                className="w-full"
                onClick={() => pickChoice(choice.label)}
              >
                {choice.label}
              </Button>
            ))}
          </div>
        ) : (
          <>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <input
                ref={inputRef}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder={kind === "year" ? "Une année…" : "Un nom…"}
                inputMode={kind === "year" ? "numeric" : "text"}
                autoCapitalize={kind === "year" ? "none" : "words"}
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="send"
                autoFocus
                className="w-full rounded-2xl border border-line bg-surface px-5 py-3.5 outline-none placeholder:text-muted/60 focus:border-accent/60"
              />
            </form>

            {canHint && (
              <Button
                variant="ghost"
                className="w-full"
                onClick={() =>
                  hintLevel >= MAX_HINT_LEVEL
                    ? openChoices()
                    : setHintLevel((n) => n + 1)
                }
              >
                {hintLevel >= MAX_HINT_LEVEL ? "Voir quatre propositions" : "Un indice"}
              </Button>
            )}

            <div className="flex gap-3">
              <Button variant="ghost" className="flex-1" onClick={() => finish(true)}>
                Je sèche
              </Button>
              <Button className="flex-1" onClick={submit} disabled={!answer.trim()}>
                Valider
              </Button>
            </div>
          </>
        )}
      </div>
    </Screen>
  );
}
