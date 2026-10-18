import { Check } from "lucide-react";

import { cn } from "@/lib/cn";

export type DrawPhase = "compose" | "committed" | "done";

const STEPS = [
  { title: "Commit", hint: "Lock the entries" },
  { title: "Run", hint: "Draw exactly once" },
  { title: "Verify", hint: "Share and check" },
] as const;

type State = "complete" | "current" | "upcoming";

function stateOf(step: number, phase: DrawPhase): State {
  const current = phase === "compose" ? 0 : phase === "committed" ? 1 : 2;
  return step < current ? "complete" : step === current ? "current" : "upcoming";
}

const tile: Record<State, string> = {
  complete: "border-success/30 bg-success-soft",
  current: "border-accent/50 bg-accent-soft",
  upcoming: "border-border bg-surface",
};

const badge: Record<State, string> = {
  complete: "bg-success text-bg",
  current: "bg-brand text-white",
  upcoming: "bg-bg-subtle text-subtle ring-1 ring-border ring-inset",
};

const stateLabel: Record<State, string> = { complete: "done", current: "current step", upcoming: "not started" };

/** Where the draw is: three tiles that stay readable at 375px (hints appear from `sm`). */
export function DrawStepper({ phase }: { phase: DrawPhase }) {
  return (
    <ol aria-label="Draw progress" className="grid grid-cols-3 gap-2 sm:gap-3">
      {STEPS.map((step, i) => {
        const state = stateOf(i, phase);
        return (
          <li key={step.title} aria-current={state === "current" ? "step" : undefined}
              className={cn("flex flex-col items-center gap-1.5 rounded-lg border px-2 py-3 text-center transition",
                            "sm:flex-row sm:gap-3 sm:px-4 sm:text-left", tile[state])}>
            <span aria-hidden className={cn("flex size-7 shrink-0 items-center justify-center rounded-full text-xs",
                                            "font-semibold tabular-nums", badge[state])}>
              {state === "complete" ? <Check className="size-4" /> : i + 1}
            </span>
            <span className="min-w-0">
              <span className={cn("block text-sm font-medium", state === "upcoming" ? "text-muted" : "text-fg")}>
                {step.title}
                <span className="sr-only">, step {i + 1} of {STEPS.length}, {stateLabel[state]}</span>
              </span>
              <span className="hidden text-xs text-muted sm:block">{step.hint}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
