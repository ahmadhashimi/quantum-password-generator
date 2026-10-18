import { ArrowRight } from "lucide-react";

import { ButtonLink, Section } from "@/components/ui";

import { TextLink } from "./links";

export function FinalCta() {
  return (
    <Section aria-labelledby="final-cta-title" className="pt-6 pb-4 sm:pt-10">
      <div className="relative isolate overflow-hidden rounded-xl border border-border bg-surface-raised px-6 py-12
                      text-center shadow-card sm:px-12 sm:py-16">
        <div aria-hidden className="bg-aurora pointer-events-none absolute inset-0 -z-10" />
        <h2 id="final-cta-title"
            className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight text-balance text-fg sm:text-4xl">
          Generate a secret, then check the receipt yourself
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base text-pretty text-muted sm:text-lg">
          It takes under a minute and needs no account. Generated values stay in your browser. Receipts store a salted
          commitment only.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <ButtonLink href="/generate" size="lg">
            Generate a secret <ArrowRight className="size-4" aria-hidden />
          </ButtonLink>
          <ButtonLink href="/verify" variant="secondary" size="lg">Verify a receipt</ButtonLink>
        </div>
        <p className="mt-6 text-sm text-subtle">
          Issuing credentials at volume? <TextLink href="/enterprise">See how QuantumPass fits an existing stack</TextLink>.
        </p>
      </div>
    </Section>
  );
}
