import { CheckCircle2, CircleDashed } from "lucide-react";

import { Badge } from "@/components/ui";

import { Block } from "./Block";

interface Item {
  title: string;
  body: string;
}

const TODAY: Item[] = [
  {
    title: "Evidence API",
    body: "Versioned endpoints and a strict receipt schema (qpg-receipt/2), documented end to end.",
  },
  {
    title: "Hybrid signed receipts",
    body: "Ed25519 and ML-DSA-65 over a domain-separated canonical payload. Both must verify. Keys can be rotated " +
      "and revoked, and the public key set is published.",
  },
  {
    title: "Offline verifier",
    body: "Reference verifiers in Python and TypeScript, checked against shared test vectors, so an auditor does not " +
      "need our service to check a receipt.",
  },
  {
    title: "Idempotent draws",
    body: "Commit-then-run, executed at most once. Retries replay the stored result instead of drawing again, and " +
      "interrupted runs recover from the persisted seed.",
  },
  {
    title: "Audit log",
    body: "A hash-chained log of issuance and draw events with chain verification for operators.",
  },
];

const ROADMAP: Item[] = [
  {
    title: "Customer-hosted SDK or sidecar",
    body: "Generate and mix locally and send only commitments, so no secret leaves your boundary. Design only: no " +
      "code ships in V2.1.",
  },
  {
    title: "Externally anchored transparency log",
    body: "Receipts anchored where the operator cannot withhold or rewrite them. Today's log is server-operated.",
  },
  {
    title: "Independent design review",
    body: "A third-party review of the cryptographic design and a penetration test, with a published summary.",
  },
  {
    title: "Support terms, SLA and DPA",
    body: "Not offered today. Neither an SLA nor a data processing agreement exists yet.",
  },
];

export function Capabilities() {
  return (
    <Block id="capabilities" eyebrow="What you get" title="V2.1 today, and the V3 roadmap kept separate"
           description="Roadmap items are not available, have no committed dates, and are not part of any evaluation.">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-success/30 bg-surface p-6 shadow-card">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-fg">Available in V2.1</h3>
            <Badge tone="success" icon={<CheckCircle2 aria-hidden />}>Today</Badge>
          </div>
          <ul className="mt-5 space-y-4">
            {TODAY.map((item) => (
              <li key={item.title} className="flex gap-3">
                <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
                <div>
                  <p className="text-sm font-medium text-fg">{item.title}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-muted">{item.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-dashed border-border-strong bg-surface-sunken p-6">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-fg">V3 roadmap</h3>
            <Badge tone="neutral" icon={<CircleDashed aria-hidden />}>Not available</Badge>
          </div>
          <ul className="mt-5 space-y-4">
            {ROADMAP.map((item) => (
              <li key={item.title} className="flex gap-3">
                <CircleDashed aria-hidden className="mt-0.5 size-4 shrink-0 text-subtle" />
                <div>
                  <p className="text-sm font-medium text-fg">{item.title}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-muted">{item.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Block>
  );
}
