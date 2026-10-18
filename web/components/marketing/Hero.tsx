import { ArrowRight, Check } from "lucide-react";

import { ButtonLink, Section } from "@/components/ui";

import { Eyebrow } from "./Block";
import { HeroReceipt } from "./HeroReceipt";

const FACTS = [
  "Hybrid Ed25519 + ML-DSA-65 signatures",
  "Verify in your browser or offline",
  "No account needed to try it",
];

export function Hero() {
  return (
    <div className="relative isolate overflow-hidden border-b border-border">
      <div aria-hidden className="bg-aurora pointer-events-none absolute inset-0 -z-10" />
      <div aria-hidden className="bg-grid pointer-events-none absolute inset-0 -z-10" />
      <Section className="grid items-center gap-14 py-14 sm:py-20 lg:grid-cols-[1.15fr_0.85fr] lg:py-28">
        <div>
          <Eyebrow>Transparent cryptographic evidence</Eyebrow>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-balance text-fg sm:text-5xl lg:text-6xl">
            Secrets with <span className="text-gradient">evidence you can check yourself</span>
          </h1>
          <p className="mt-6 max-w-2xl text-base text-pretty text-muted sm:text-lg">
            Generation seeded by IBM Quantum, ANU and LfD whenever one is available, always mixed with your operating
            system&apos;s CSPRNG. Hybrid post-quantum signed receipts (Ed25519 + ML-DSA-65) that never contain the
            secret. And an honest evidence model: what is proven, what is only asserted, and what is not available.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/generate" size="lg">
              Generate a secret <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
            <ButtonLink href="/verify" variant="secondary" size="lg">Verify a receipt</ButtonLink>
          </div>
          <ul className="mt-8 flex flex-col gap-2 text-sm text-muted sm:flex-row sm:flex-wrap sm:gap-x-6">
            {FACTS.map((fact) => (
              <li key={fact} className="flex items-center gap-2">
                <Check className="size-4 shrink-0 text-success" aria-hidden />
                {fact}
              </li>
            ))}
          </ul>
        </div>
        <HeroReceipt />
      </Section>
    </div>
  );
}
