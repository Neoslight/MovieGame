import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function Screen({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pt-6 pb-8">
      {children}
    </main>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return (
    <h1 className="font-serif text-4xl leading-[1.05] tracking-tight text-fg">{children}</h1>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-[0.68rem] font-medium uppercase tracking-[0.22em] text-muted">
      {children}
    </p>
  );
}

const BASE_BUTTON =
  "inline-flex min-h-12 items-center justify-center rounded-full px-6 text-sm font-medium transition-[opacity,transform] duration-300 active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: "primary" | "ghost" }) {
  const skin =
    variant === "primary"
      ? "bg-accent text-accent-fg"
      : "border border-line bg-transparent text-fg";
  return <button className={`${BASE_BUTTON} ${skin} ${className}`} {...props} />;
}

export function LinkButton({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: "primary" | "ghost" }) {
  const skin =
    variant === "primary"
      ? "bg-accent text-accent-fg"
      : "border border-line bg-transparent text-fg";
  return <Link className={`${BASE_BUTTON} ${skin} ${className}`} {...props} />;
}

export function Stat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-4 py-3">
      <p className="font-serif text-3xl leading-none text-fg">{value}</p>
      <p className="mt-1.5 text-xs text-muted">{label}</p>
    </div>
  );
}

export function Notice({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "error";
  children: ReactNode;
}) {
  return (
    <p
      className={`rounded-2xl border px-4 py-3 text-sm leading-relaxed ${
        tone === "error"
          ? "border-accent/40 bg-accent/10 text-fg"
          : "border-line bg-surface text-muted"
      }`}
    >
      {children}
    </p>
  );
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-line">
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
        style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }}
      />
    </div>
  );
}
