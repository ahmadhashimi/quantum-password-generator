import { Dices, Lock, SearchCheck, Shuffle } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Callout, PageHeader, Section } from "@/components/ui";
import { DrawFlow } from "@/components/draws/DrawFlow";

export const metadata: Metadata = {
  title: "Verifiable draws",
  description: "Commit your entry list first, run the draw once, and let anyone check the result against signed receipts.",
};

const STEPS: { icon: ReactNode; title: string; body: string }[] = [
  {
    icon: <Lock />,
    title: "Commit",
    body: "You submit the entries and how many winners. The server signs a receipt with a SHA-256 fingerprint of the " +
      "sorted list before it gathers any randomness for the draw.",
  },
  {
    icon: <Shuffle />,
    title: "Run",
    body: "You run the draw once. The server saves a selection seed and picks winners from the committed list. A retry " +
      "returns the stored result; it never re-rolls.",
  },
  {
    icon: <SearchCheck />,
    title: "Verify",
    body: "Anyone with the entry list and the result link can recompute the fingerprint and the winners in their own " +
      "browser.",
  },
];

export default function DrawsPage() {
  return (
    <Section className="pb-20">
      <PageHeader eyebrow="Commit, then run" icon={<Dices aria-hidden />} title="Verifiable draws"
                  description={"Lock the entry list first, then draw from it exactly once. Two signed receipts let anyone check " +
                               "that the list wasn't swapped and that the winners follow from the published seed."} />
      <ol className="grid gap-3 sm:grid-cols-3" aria-label="How a draw works">
        {STEPS.map((step, i) => (
          <li key={step.title} className="rounded-xl border border-border bg-surface p-5 shadow-card">
            <p className="flex items-center gap-2 text-sm font-semibold text-fg">
              <span aria-hidden className="flex size-6 items-center justify-center rounded-full bg-accent-soft text-xs
                                           text-accent tabular-nums">{i + 1}</span>
              <span aria-hidden className="text-accent [&>svg]:size-4">{step.icon}</span>
              {step.title}
            </p>
            <p className="mt-2 text-sm text-muted">{step.body}</p>
          </li>
        ))}
      </ol>
      <Callout tone="warning" title="What this does not do" className="mt-6">
        <p>
          The operator can still choose when to run a draw or withhold a result; receipts make tampering with a
          published result detectable. Not for regulated gambling or lotteries.
        </p>
        <p>
          The server also picks the selection seed when the draw runs, so a dishonest operator could try several draws
          privately and publish only one. Receipts make every published re-roll of a list visible, but cannot reveal
          draws that were never issued.
        </p>
        <p>
          Valid signatures prove what this server signed, not that a quantum device independently attested the entropy.
        </p>
      </Callout>
      <div className="mt-10">
        <DrawFlow />
      </div>
    </Section>
  );
}
