import { CircleSlash, FileSignature, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

import { Badge, type Tone } from "@/components/ui";
import { cn } from "@/lib/cn";

interface Column {
  tone: Tone;
  icon: ReactNode;
  label: string;
  heading: string;
  value: string;
  items: string[];
  box: string;
}

const COLUMNS: Column[] = [
  {
    tone: "success",
    icon: <ShieldCheck />,
    label: "Proven",
    heading: "Integrity",
    value: "hybrid-signature:ed25519+ml-dsa-65",
    box: "border-success/30 bg-success-soft",
    items: [
      "The receipt is exactly what this server signed. Both the Ed25519 and the ML-DSA-65 signature must verify over " +
        "the domain-separated canonical payload.",
      "The signing key is published and was not revoked when the receipt was issued.",
      "A secret's commitment opens to the secret you hold, checked locally with your salt.",
      "For draws: the entry list matches its SHA-256 fingerprint and the winners follow from the published seed.",
    ],
  },
  {
    tone: "warning",
    icon: <FileSignature />,
    label: "Asserted",
    heading: "Provenance",
    value: "operator-asserted",
    box: "border-warning/30 bg-warning-soft",
    items: [
      "Which sources were mixed in, IBM job ids and modes, quantum byte counts and health-screening results.",
      "The operator signed these statements, so they cannot be changed after issue. A valid signature proves the " +
        "operator made the claims, not that they are true.",
      "A simulator is labelled \"not quantum\". A source that was unavailable is never listed as used.",
    ],
  },
  {
    tone: "neutral",
    icon: <CircleSlash />,
    label: "Not available",
    heading: "Independent quantum evidence",
    value: "none",
    box: "border-dashed border-border-strong bg-surface-sunken",
    items: [
      "IBM does not sign job results, and third parties cannot fetch someone else's job, so nobody can independently " +
        "authenticate quantum origin today.",
      "No device-independent or externally attested randomness.",
      "The receipt log is server-operated, not an externally anchored transparency log. The operator can withhold " +
        "results.",
    ],
  },
];

/** The three evidence classes side by side. Never merged into one verdict. */
export function EvidenceTriad({ className }: { className?: string }) {
  return (
    <ul className={cn("grid gap-4 lg:grid-cols-3", className)}>
      {COLUMNS.map((c) => (
        <li key={c.label} className={cn("flex flex-col gap-3 rounded-xl border p-5", c.box)}>
          <div className="flex items-center justify-between gap-2">
            <Badge tone={c.tone} icon={c.icon}>{c.label}</Badge>
          </div>
          <h3 className="text-base font-semibold text-fg">{c.heading}</h3>
          <p className="font-mono text-xs break-all text-subtle">
            <span className="sr-only">Receipt value: </span>
            {c.value}
          </p>
          <ul className="list-disc space-y-2 pl-4 text-sm text-muted marker:text-subtle">
            {c.items.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </li>
      ))}
    </ul>
  );
}
