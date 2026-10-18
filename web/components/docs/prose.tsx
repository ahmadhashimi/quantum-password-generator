import { ExternalLink as ExternalIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export { REPO_URL, repoFile } from "./repo";

/** Inline code. */
export function Code({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <code className={cn("rounded bg-surface-sunken px-1.5 py-0.5 text-[0.85em] break-words text-fg", className)}>
      {children}
    </code>
  );
}

/** Body copy for a documentation section. */
export function Prose({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("space-y-3 text-[0.95rem] leading-relaxed text-pretty text-muted", className)}>{children}</div>;
}

export function SubHeading({ id, children }: { id?: string; children: ReactNode }) {
  return <h3 id={id} className="scroll-mt-24 pt-2 text-lg font-semibold tracking-tight text-fg">{children}</h3>;
}

export function BulletList({ children, ordered = false }: { children: ReactNode; ordered?: boolean }) {
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag className={cn("space-y-2 pl-5 marker:text-subtle", ordered ? "list-decimal" : "list-disc")}>{children}</Tag>
  );
}

/** A link that leaves the site (source files on GitHub). */
export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
       className="inline-flex items-center gap-1 text-accent underline underline-offset-2 hover:text-accent-strong">
      {children}
      <ExternalIcon aria-hidden className="size-3" />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}
