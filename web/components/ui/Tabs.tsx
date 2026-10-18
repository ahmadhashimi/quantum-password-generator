"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/** Segmented control. Arrow keys move between options (roving tabindex). */
export function Tabs<T extends string>({ value, onChange, options, label, className }: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: ReactNode; icon?: ReactNode }[];
  label: string;
  className?: string;
}) {
  const index = options.findIndex((o) => o.value === value);
  const move = (delta: number) => {
    const next = options[(index + delta + options.length) % options.length];
    if (next) onChange(next.value);
  };
  return (
    <div role="tablist" aria-label={label}
         className={cn("inline-flex rounded-lg border border-border bg-surface-sunken p-1", className)}
         onKeyDown={(e) => {
           if (e.key === "ArrowRight") move(1);
           if (e.key === "ArrowLeft") move(-1);
         }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button key={o.value} type="button" role="tab" aria-selected={active} tabIndex={active ? 0 : -1}
                  onClick={() => onChange(o.value)}
                  className={cn("inline-flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm",
                                "font-medium transition [&>svg]:size-4",
                                active ? "bg-surface-raised text-fg shadow-card" : "text-muted hover:text-fg")}>
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
