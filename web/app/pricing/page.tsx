import type { Metadata } from "next";

import { LimitsToday } from "@/components/marketing/LimitsToday";
import { PricingFaq } from "@/components/marketing/PricingFaq";
import { PricingTiers } from "@/components/marketing/PricingTiers";
import { Callout, PageHeader, Section } from "@/components/ui";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Proposed plans for QuantumPass. Paid checkout isn't available yet and prices are illustrative. " +
    "The Free limits and the evidence model are what the service provides today.",
};

export default function PricingPage() {
  return (
    <>
      <Section>
        <PageHeader
          eyebrow="Pricing"
          title="Plans that change limits, not what a receipt means"
          description={"Start free, with no account. The paid plans below are proposals we are testing: they add " +
                       "limits and features, and every one keeps the same honest evidence model."} />
        <Callout tone="warning" title="Proposed plans: paid checkout isn't available yet. Prices are illustrative." />
      </Section>
      <PricingTiers />
      <LimitsToday />
      <PricingFaq />
    </>
  );
}
