import { FileSignature, FileText, Fingerprint, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

import { Badge, Card, type Tone } from "@/components/ui";

const ROWS: { icon: ReactNode; label: string; tone: Tone; verdict: string; detail: string }[] = [
  {
    icon: <ShieldCheck />,
    label: "Integrity",
    tone: "success",
    verdict: "Proven",
    detail: "Ed25519 and ML-DSA-65 both verify under a published key.",
  },
  {
    icon: <FileText />,
    label: "Provenance",
    tone: "warning",
    verdict: "Asserted",
    detail: "Sources, screening result and mixing with the OS CSPRNG, as reported by the operator.",
  },
  {
    icon: <FileSignature />,
    label: "Quantum evidence",
    tone: "neutral",
    verdict: "Not available",
    detail: "IBM does not sign job results, so none can be shown independently.",
  },
];

/** Orbit lines behind the card. Decorative only. */
function Orbits() {
  return (
    <svg viewBox="0 0 400 400" aria-hidden
         className="pointer-events-none absolute top-1/2 left-1/2 -z-10 size-[30rem] max-w-none -translate-x-1/2
                    -translate-y-1/2 fill-none opacity-60">
      <defs>
        <linearGradient id="hero-orbit" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--accent-2)" />
        </linearGradient>
      </defs>
      <g stroke="url(#hero-orbit)" strokeWidth="1.2">
        <ellipse cx="200" cy="200" rx="185" ry="72" />
        <ellipse cx="200" cy="200" rx="185" ry="72" transform="rotate(60 200 200)" />
        <ellipse cx="200" cy="200" rx="185" ry="72" transform="rotate(-60 200 200)" />
        <circle cx="200" cy="200" r="130" strokeDasharray="2 9" opacity="0.7" />
      </g>
      <g fill="var(--accent)">
        <circle cx="385" cy="200" r="4" />
        <circle cx="107.5" cy="40" r="3.5" />
      </g>
      <circle cx="107.5" cy="360" r="3.5" fill="var(--accent-2)" />
    </svg>
  );
}

/** An illustration of the three verdicts on a receipt. Field names are real, nothing here is a live receipt. */
export function HeroReceipt() {
  return (
    <figure className="relative mx-auto w-full max-w-md">
      <Orbits />
      <Card className="overflow-hidden bg-surface-raised shadow-pop">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
          <p className="flex items-center gap-2 font-mono text-xs text-muted">
            <Fingerprint className="size-4 text-accent-2" aria-hidden />
            qpg-receipt/2
          </p>
          <Badge tone="violet">Illustration</Badge>
        </div>
        <ul className="divide-y divide-border">
          {ROWS.map((row) => (
            <li key={row.label} className="space-y-2 px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <p className="flex items-center gap-2 text-sm font-medium text-fg [&>svg]:size-4 [&>svg]:text-subtle">
                  {row.icon}
                  {row.label}
                </p>
                <Badge tone={row.tone}>{row.verdict}</Badge>
              </div>
              <p className="text-sm text-muted">{row.detail}</p>
            </li>
          ))}
        </ul>
        <div className="border-t border-border bg-surface-sunken px-5 py-3">
          <p className="font-mono text-[0.7rem] break-all text-muted">
            commitment = SHA-512(salt ‖ secret). The secret is never in the receipt.
          </p>
        </div>
      </Card>
      <figcaption className="mt-3 text-center text-xs text-subtle">
        Each receipt keeps these three verdicts separate. Open any receipt in the Proof Explorer to check them yourself.
      </figcaption>
    </figure>
  );
}
