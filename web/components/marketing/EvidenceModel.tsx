import { CircleSlash, FileSignature, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

import { Badge, ButtonLink, Callout, type Tone } from "@/components/ui";
import { cn } from "@/lib/cn";

import { Block } from "./Block";

interface Column {
  id: string;
  tone: Tone;
  icon: ReactNode;
  label: string;
  heading: string;
  badge: string;
  box: string;
  iconBox: string;
  items: string[];
  check: string;
}

const COLUMNS: Column[] = [
  {
    id: "proven",
    tone: "success",
    icon: <ShieldCheck />,
    label: "Proven",
    heading: "Integrity",
    badge: "Cryptographic",
    box: "border-success/30 bg-success-soft",
    iconBox: "bg-success/15 text-success",
    items: [
      "The receipt is exactly what this server signed: both the Ed25519 and the ML-DSA-65 signature verify over the " +
        "domain-separated canonical payload.",
      "The signing key is published and was not revoked when the receipt was issued.",
      "The secret you hold opens the commitment in the receipt, checked locally with your salt.",
      "For draws: the entry list matches its fingerprint and the winners follow from the published seed.",
    ],
    check: "Anyone can check it, in the browser or offline, with the published public keys.",
  },
  {
    id: "asserted",
    tone: "warning",
    icon: <FileSignature />,
    label: "Asserted",
    heading: "Provenance",
    badge: "Operator-reported",
    box: "border-warning/30 bg-warning-soft",
    iconBox: "bg-warning/15 text-warning",
    items: [
      "Which sources were mixed in, IBM job ids and modes, quantum byte counts and the screening result.",
      "Signed, so it cannot change after issue. Signing does not make it true: nobody outside can fetch another " +
        "party's IBM job or replay an ANU call.",
      "A simulator is labelled \"not quantum\". A source that was unavailable is never listed as contributing.",
      "Availability is live telemetry, not evidence of a source's contribution to a past receipt.",
    ],
    check: "You can read it and weigh it. You cannot independently prove it.",
  },
  {
    id: "not-available",
    tone: "neutral",
    icon: <CircleSlash />,
    label: "Not available",
    heading: "Independent quantum evidence",
    badge: "None today",
    box: "border-dashed border-border-strong bg-surface-sunken",
    iconBox: "bg-bg-subtle text-subtle",
    items: [
      "No independently authenticated proof that the bytes came from quantum hardware. IBM does not sign job results.",
      "No device-independent or externally attested randomness.",
      "The receipt log is server-operated, not an externally anchored transparency log, so the operator can withhold " +
        "results.",
    ],
    check: "Receipts say so explicitly: quantum_evidence is \"none\".",
  },
];

export function EvidenceModel() {
  return (
    <Block id="evidence" eyebrow="What a receipt proves" title="Proven, asserted, and not available: kept apart"
           description="Most tools collapse everything into one green tick. A receipt never does. Each claim sits in exactly one of three columns.">
      <div className="grid gap-4 lg:grid-cols-3">
        {COLUMNS.map((col) => (
          <article key={col.id} aria-labelledby={`evidence-${col.id}`}
                   className={cn("flex flex-col rounded-xl border p-6", col.box)}>
            <div className="flex items-center justify-between gap-3">
              <span aria-hidden className={cn("flex size-10 items-center justify-center rounded-md [&>svg]:size-5", col.iconBox)}>
                {col.icon}
              </span>
              <Badge tone={col.tone}>{col.badge}</Badge>
            </div>
            <p className="mt-5 text-xs font-semibold tracking-widest text-muted uppercase">{col.label}</p>
            <h3 id={`evidence-${col.id}`} className="mt-1 text-xl font-semibold text-fg">{col.heading}</h3>
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-muted">
              {col.items.map((item) => (
                <li key={item} className="flex gap-3">
                  <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-subtle" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <div className="mt-auto pt-5">
              <p className="border-t border-border pt-4 text-sm font-medium text-fg">{col.check}</p>
            </div>
          </article>
        ))}
      </div>
      <Callout tone="info" title="The short version" className="mt-6">
        Valid signatures prove what this server signed, not that a quantum device independently attested the entropy.
      </Callout>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <ButtonLink href="/verify" variant="secondary">Open the Proof Explorer</ButtonLink>
        <ButtonLink href="/transparency" variant="ghost">Read the full evidence model</ButtonLink>
      </div>
    </Block>
  );
}
