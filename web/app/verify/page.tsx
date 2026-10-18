import { Ban, FileSearch, FileSignature, ShieldQuestion } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { VerifyEntry } from "@/components/proof/VerifyEntry";
import { Badge, Callout, PageHeader, Section } from "@/components/ui";

export const metadata: Metadata = {
  title: "Proof Explorer",
  description: "Check a QuantumPass receipt in your own browser: signatures, provenance claims and what is not proven.",
};

const VERDICTS: { icon: ReactNode; title: string; badge: ReactNode; body: string }[] = [
  {
    icon: <FileSignature />,
    title: "Integrity",
    badge: <Badge tone="violet">Cryptographic</Badge>,
    body: "Both signatures verify over the receipt's exact bytes under a published key. Anyone can check this, and " +
      "your browser does.",
  },
  {
    icon: <ShieldQuestion />,
    title: "Provenance",
    badge: <Badge tone="warning">Operator-asserted</Badge>,
    body: "Sources, IBM job IDs and health results are claims the server signed. A valid signature proves it made " +
      "them, not that they are true.",
  },
  {
    icon: <Ban />,
    title: "Independent quantum evidence",
    badge: <Badge>None available</Badge>,
    body: "IBM does not sign job results, so quantum origin can't be independently authenticated today.",
  },
];

export default function VerifyPage() {
  return (
    <Section className="pb-20">
      <PageHeader eyebrow="Proof Explorer" icon={<FileSearch aria-hidden />} title="Verify a receipt in your browser"
                  description={"Open a receipt by ID, or check a saved file. Signatures are verified locally, and anything you " +
                               "paste stays on your device."} />
      <VerifyEntry />
      <section aria-labelledby="verdicts" className="mt-12 space-y-4">
        <h2 id="verdicts" className="text-lg font-semibold text-fg">Three separate answers, never one badge</h2>
        <ul className="grid gap-3 md:grid-cols-3">
          {VERDICTS.map((v) => (
            <li key={v.title} className="rounded-xl border border-border bg-surface p-5 shadow-card">
              <p className="flex items-center gap-2 text-sm font-semibold text-fg">
                <span aria-hidden className="text-accent [&>svg]:size-4">{v.icon}</span>
                {v.title}
              </p>
              <div className="mt-2">{v.badge}</div>
              <p className="mt-3 text-sm text-muted">{v.body}</p>
            </li>
          ))}
        </ul>
        <Callout tone="info" title="What a valid receipt means">
          <p>
            Valid signatures prove what this server signed, not that a quantum device independently attested the
            entropy. The receipt log is operated by the same server, and the operator can withhold results.
          </p>
        </Callout>
      </section>
    </Section>
  );
}
