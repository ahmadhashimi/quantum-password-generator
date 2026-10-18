"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui";

const noSubscribe = () => () => undefined;

/** The page origin on the client, "" while rendering on the server (so there is no hydration mismatch). */
function useOrigin(): string {
  return useSyncExternalStore(noSubscribe, () => window.location.origin, () => "");
}

/**
 * A public value (a link, a fingerprint, a published seed) with a copy button. Unlike lib/hooks/useClipboard this never
 * clears the clipboard afterwards: it is for things meant to be shared, not for secrets.
 */
export function CopyValue({ label, value }: { label: string; value: string }) {
  const labelId = useId();
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed"); // no clipboard permission or insecure context: the text is still selectable
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("idle"), 2500);
  }

  return (
    <div role="group" aria-labelledby={labelId} className="space-y-1.5">
      <p id={labelId} className="text-xs font-medium tracking-wide text-subtle uppercase">{label}</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <code className="min-w-0 flex-1 rounded-md border border-border bg-surface-sunken px-3 py-2 text-xs
                         leading-relaxed break-all text-fg select-all">
          {value}
        </code>
        <Button variant="secondary" size="sm" className="shrink-0 self-start sm:mt-1" aria-label={`Copy ${label}`}
                onClick={() => void copy()}>
          {state === "copied" ? <Check className="size-3.5 text-success" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
          {state === "copied" ? "Copied" : "Copy"}
        </Button>
      </div>
      <p role="status" className={state === "failed" ? "text-xs text-warning" : "sr-only"}>
        {state === "copied" ? "Copied to the clipboard." : state === "failed" ? "Couldn't copy. Select the text and copy it manually." : ""}
      </p>
    </div>
  );
}

/** A shareable link to a page on this site, shown absolute (needs the origin, so it renders after hydration). */
export function ShareLink({ label, path }: { label: string; path: string }) {
  const origin = useOrigin();
  return <CopyValue label={label} value={`${origin}${path}`} />;
}
