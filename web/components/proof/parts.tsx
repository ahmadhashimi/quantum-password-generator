"use client";

import { Check, CheckCircle2, Copy, MinusCircle, XCircle } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { Badge, type Tone } from "@/components/ui";
import { cn } from "@/lib/cn";

import type { CheckState } from "./proof-data";

export const linkClass =
  "rounded-sm font-medium text-accent underline-offset-4 hover:underline focus-visible:outline-2 " +
  "focus-visible:outline-offset-2 focus-visible:outline-ring";

const STATE: Record<CheckState, { icon: typeof Check; text: string; badge: Tone; spoken: string }> = {
  pass: { icon: CheckCircle2, text: "text-success", badge: "success", spoken: "Passed" },
  fail: { icon: XCircle, text: "text-danger", badge: "danger", spoken: "Failed" },
  skip: { icon: MinusCircle, text: "text-subtle", badge: "neutral", spoken: "Not checked" },
};

export const stateTextClass = (state: CheckState): string => STATE[state].text;

/** Pass / fail / not checked as icon + colour; the words always accompany them. */
export function StateIcon({ state, className }: { state: CheckState; className?: string }) {
  const Icon = STATE[state].icon;
  return <Icon aria-hidden className={cn("size-4 shrink-0", STATE[state].text, className)} />;
}

export function StateBadge({ state, labels }: {
  state: CheckState;
  labels?: Partial<Record<CheckState, string>>;
}) {
  const text = { pass: "Valid", fail: "Invalid", skip: "Not checked", ...labels }[state];
  return <Badge tone={STATE[state].badge} icon={<StateIcon state={state} />}>{text}</Badge>;
}

export function CheckRow({ state, label, detail }: { state: CheckState; label: ReactNode; detail?: ReactNode }) {
  return (
    <li className="flex gap-3 text-sm">
      <StateIcon state={state} className="mt-0.5" />
      <div className="min-w-0">
        <p className="text-fg"><span className="sr-only">{STATE[state].spoken}: </span>{label}</p>
        {detail && <p className="mt-0.5 text-xs break-words text-muted">{detail}</p>}
      </div>
    </li>
  );
}

/** Header badges for a section; claims that did not verify are flagged on every section that shows them. */
export function SectionBadges({ verified, children }: { verified: boolean; children: ReactNode }) {
  return (
    <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
      {!verified && <Badge tone="danger" title="The receipt did not verify, so this is not authenticated">Unverified</Badge>}
      {children}
    </div>
  );
}

export function Term({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1">
      <dt className="text-xs font-medium tracking-wide text-subtle uppercase">{label}</dt>
      <dd className="text-sm break-words text-fg">{children}</dd>
    </div>
  );
}

/** Copy for public values (IDs, fingerprints, seeds). Unlike useClipboard it never clears the clipboard afterwards. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed"); // no permission or an insecure context; the value is still selectable
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("idle"), 2000);
  }

  return (
    <>
      <button type="button" aria-label={`Copy ${label}`} onClick={() => void copy()}
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-border
                         bg-surface-raised text-muted transition hover:text-fg focus-visible:outline-2
                         focus-visible:outline-offset-2 focus-visible:outline-ring">
        {state === "copied" ? <Check className="size-3.5 text-success" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      </button>
      <span role="status" className={state === "failed" ? "text-xs text-warning" : "sr-only"}>
        {state === "copied" ? `${label} copied` : state === "failed" ? "Couldn't copy: select the text instead." : ""}
      </span>
    </>
  );
}

export function CopyableValue({ value, label, display }: { value: string; label: string; display?: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-2">
      <code className="min-w-0 font-mono text-xs break-all text-fg" title={display ? value : undefined}>
        {display ?? value}
      </code>
      <CopyButton value={value} label={label} />
    </span>
  );
}

const noSubscribe = () => () => undefined;

/** The page origin in the browser, "" while rendering on the server (so hydration matches). */
export function useOrigin(): string {
  return useSyncExternalStore(noSubscribe, () => window.location.origin, () => "");
}
