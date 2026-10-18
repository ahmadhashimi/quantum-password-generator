import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-border-strong bg-surface-sunken px-1.5 py-0.5 text-[0.7rem] text-muted">
      {children}
    </kbd>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-bg-subtle", className)} />;
}

export function Section({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6", className)} {...props} />;
}

export function PageHeader({ eyebrow, title, description, icon, actions }: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 pt-10 pb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-3xl">
        {eyebrow && (
          <p className="mb-3 inline-flex items-center gap-2 text-xs font-semibold tracking-widest text-accent uppercase
                        [&>svg]:size-3.5">
            {icon}
            {eyebrow}
          </p>
        )}
        <h1 className="text-3xl font-semibold tracking-tight text-balance text-fg sm:text-4xl">{title}</h1>
        {description && <p className="mt-3 text-base text-pretty text-muted sm:text-lg">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </header>
  );
}

/** Bar meter (0..1). */
export function Meter({ value, label, tone = "brand" }: { value: number; label: string; tone?: "brand" | "warning" | "danger" }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  const fill = tone === "brand" ? "bg-brand" : tone === "warning" ? "bg-warning" : "bg-danger";
  return (
    <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}
         className="h-1.5 w-full overflow-hidden rounded-full bg-bg-subtle">
      <div className={cn("h-full rounded-full transition-[width] duration-500", fill)} style={{ width: `${pct}%` }} />
    </div>
  );
}
