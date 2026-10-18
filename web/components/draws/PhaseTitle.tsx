"use client";

import { type ReactNode, useEffect, useRef } from "react";

/** A card title that takes focus when its step appears, so keyboard and screen-reader users land on the new content. */
export function PhaseTitle({ children, focus }: { children: ReactNode; focus: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (focus) ref.current?.focus();
  }, [focus]);
  return <span ref={ref} tabIndex={-1}>{children}</span>;
}
