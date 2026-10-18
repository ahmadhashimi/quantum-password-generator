import Link, { type LinkProps } from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/** An inline link. Prefetch is off like every other link in the app: pages behind it may hold account data. */
export function TextLink<R extends string>({ className, prefetch = false, children, ...props }: LinkProps<R> & {
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link prefetch={prefetch} className={cn("text-accent underline underline-offset-2 hover:text-accent-strong", className)}
          {...props}>
      {children}
    </Link>
  );
}
