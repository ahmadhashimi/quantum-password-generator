import type { ReactNode } from "react";

import { Section } from "@/components/ui";
import { cn } from "@/lib/cn";

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-xs font-semibold tracking-widest text-accent uppercase", className)}>{children}</p>;
}

/** A landing-page section: eyebrow, h2 and optional lead, then the content. `id` is the anchor and the label id. */
export function Block({ id, eyebrow, title, description, align = "left", tight = false, className, children }: {
  id: string;
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  align?: "left" | "center";
  /** Less vertical padding, for pages whose first section follows a page header. */
  tight?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Section id={id} aria-labelledby={`${id}-title`}
             className={cn("scroll-mt-20", tight ? "py-8 sm:py-12" : "py-14 sm:py-20", className)}>
      <div className={cn("max-w-3xl", align === "center" && "mx-auto text-center")}>
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h2 id={`${id}-title`}
            className={cn("text-2xl font-semibold tracking-tight text-balance text-fg sm:text-3xl", eyebrow && "mt-3")}>
          {title}
        </h2>
        {description && <p className="mt-4 text-base text-pretty text-muted sm:text-lg">{description}</p>}
      </div>
      <div className="mt-10">{children}</div>
    </Section>
  );
}
