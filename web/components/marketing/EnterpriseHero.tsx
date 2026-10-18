import { Check } from "lucide-react";

import { ButtonLink, buttonClass, Card, Section } from "@/components/ui";

import { Eyebrow } from "./Block";

const FACTS = [
  "Hybrid Ed25519 + ML-DSA-65 signatures on every receipt",
  "A commitment to the credential, never the credential",
  "A public receipt schema and two reference verifiers",
  "Idempotent draws and a hash-chained audit log",
];

export function EnterpriseHero() {
  return (
    <div className="relative isolate overflow-hidden border-b border-border">
      <div aria-hidden className="bg-aurora pointer-events-none absolute inset-0 -z-10" />
      <div aria-hidden className="bg-grid pointer-events-none absolute inset-0 -z-10" />
      <Section className="grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-[1.2fr_0.8fr] lg:py-24">
        <div>
          <Eyebrow>Enterprise</Eyebrow>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-balance text-fg sm:text-5xl">
            An embedded <span className="text-gradient">cryptographic evidence system</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-pretty text-fg sm:text-xl">
            Keep your existing secrets infrastructure. Add QuantumPass to make credential issuance independently
            auditable, with post-quantum signed evidence and transparent security guarantees.
          </p>
          <p className="mt-4 max-w-2xl text-sm text-pretty text-muted">
            &quot;Independently auditable&quot; means a third party can verify the signed evidence without trusting your
            systems or holding the credential. It does not mean the entropy sources are independently attested.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a href="#evaluation" className={buttonClass("primary", "lg")}>
              Plan a 30-day evaluation
            </a>
            <ButtonLink href="/developers" variant="secondary" size="lg">Read the Evidence API</ButtonLink>
          </div>
        </div>
        <Card className="bg-surface-raised p-6 shadow-pop">
          <p className="text-xs font-semibold tracking-widest text-subtle uppercase">Evidence, not a black box</p>
          <ul className="mt-4 space-y-3">
            {FACTS.map((fact) => (
              <li key={fact} className="flex gap-3 text-sm text-muted">
                <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                {fact}
              </li>
            ))}
          </ul>
          <p className="mt-5 border-t border-border pt-4 text-sm text-fg">
            Valid signatures prove what this server signed, not that a quantum device independently attested the
            entropy.
          </p>
        </Card>
      </Section>
    </div>
  );
}
