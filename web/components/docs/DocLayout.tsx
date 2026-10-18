import type { ReactNode } from "react";

export interface TocItem {
  id: string;
  label: string;
}

function TocList({ items }: { items: readonly TocItem[] }) {
  return (
    <ul className="space-y-1 text-sm">
      {items.map((item) => (
        <li key={item.id}>
          <a href={`#${item.id}`}
             className="block rounded-md px-2 py-1 text-muted transition hover:bg-bg-subtle hover:text-fg">
            {item.label}
          </a>
        </li>
      ))}
    </ul>
  );
}

/**
 * Long-form page body with an "On this page" index: a sticky column from `lg` up, a collapsed disclosure below it.
 * Plain anchors, so it works without JavaScript.
 */
export function DocLayout({ toc, children }: { toc: readonly TocItem[]; children: ReactNode }) {
  return (
    <div className="grid gap-8 lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-12">
      <aside>
        <details className="rounded-lg border border-border bg-surface px-4 py-3 lg:hidden">
          <summary className="cursor-pointer text-sm font-medium text-fg">On this page</summary>
          <nav aria-label="On this page (mobile)" className="mt-3"><TocList items={toc} /></nav>
        </details>
        <nav aria-label="On this page" className="sticky top-24 hidden lg:block">
          <p className="mb-2 px-2 text-xs font-semibold tracking-widest text-subtle uppercase">On this page</p>
          <TocList items={toc} />
        </nav>
      </aside>
      <div className="min-w-0 space-y-16">{children}</div>
    </div>
  );
}
