import type { ReactNode } from "react";

/** A documentation section with a stable anchor and a hover-visible link to itself. */
export function DocSection({ id, title, lead, children }: {
  id: string;
  title: string;
  lead?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 space-y-5">
      <div className="space-y-2">
        <h2 id={`${id}-title`} className="group flex items-center gap-2 text-2xl font-semibold tracking-tight text-fg">
          {title}
          <a href={`#${id}`} aria-label={`Link to ${title}`}
             className="rounded text-lg text-subtle opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100">
            #
          </a>
        </h2>
        {lead && <p className="max-w-3xl text-base text-pretty text-muted">{lead}</p>}
      </div>
      {children}
    </section>
  );
}
