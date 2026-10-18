import { Check } from "lucide-react";

import { ButtonLink, Section } from "@/components/ui";

const CHECKS = [
  "Issue credentials through the Evidence API and keep a receipt for each one.",
  "Verify those receipts offline with the reference verifier, using only the published keys.",
  "Read the stated limits and decide whether they fit your review process.",
];

export function EvaluationCta() {
  return (
    <Section id="evaluation" aria-labelledby="evaluation-title" className="scroll-mt-20 pt-6 pb-4 sm:pt-10">
      <div className="relative isolate overflow-hidden rounded-xl border border-border bg-surface-raised p-6 shadow-card
                      sm:p-12">
        <div aria-hidden className="bg-aurora pointer-events-none absolute inset-0 -z-10" />
        <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <p className="text-xs font-semibold tracking-widest text-accent uppercase">Evaluation</p>
            <h2 id="evaluation-title"
                className="mt-3 text-3xl font-semibold tracking-tight text-balance text-fg sm:text-4xl">
              A 30-day technical evaluation
            </h2>
            <p className="mt-4 max-w-xl text-base text-pretty text-muted sm:text-lg">
              Everything an evaluation exercises is public today, so you can start before any conversation: the API
              contract, the verifier and the limits.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="/developers" size="lg">Read the Evidence API</ButtonLink>
              <ButtonLink href="/transparency" variant="secondary" size="lg">See the transparency page</ButtonLink>
            </div>
          </div>
          <div>
            <p className="text-sm font-medium text-fg">A useful evaluation answers three questions</p>
            <ul className="mt-4 space-y-3">
              {CHECKS.map((c) => (
                <li key={c} className="flex gap-3 text-sm text-muted">
                  <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                  {c}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </Section>
  );
}
