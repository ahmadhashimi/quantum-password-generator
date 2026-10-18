import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

/** Native disclosure widgets: keyboard operable, no client JavaScript. */
export function Faq({ items }: { items: { q: string; a: ReactNode }[] }) {
  return (
    <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
      {items.map((item) => (
        <details key={item.q} className="group px-5 py-4 open:bg-surface-sunken">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-md font-medium
                              text-fg [&::-webkit-details-marker]:hidden">
            {item.q}
            <ChevronDown aria-hidden className="size-4 shrink-0 text-subtle transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-3 max-w-3xl space-y-3 text-sm leading-relaxed text-muted">{item.a}</div>
        </details>
      ))}
    </div>
  );
}
