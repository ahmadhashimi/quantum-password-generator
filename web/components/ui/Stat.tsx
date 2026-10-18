import type { ReactNode } from "react";

export function Stat({ label, value, hint, icon }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <p className="flex items-center gap-2 text-xs font-medium tracking-wide text-subtle uppercase [&>svg]:size-3.5">
        {icon}
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-fg">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
