import { Comparison } from "@/components/marketing/Comparison";
import { EvidenceModel } from "@/components/marketing/EvidenceModel";
import { FinalCta } from "@/components/marketing/FinalCta";
import { Hero } from "@/components/marketing/Hero";
import { HowItWorks } from "@/components/marketing/HowItWorks";
import { UseCases } from "@/components/marketing/UseCases";
import { WhyNow } from "@/components/marketing/WhyNow";

export default function HomePage() {
  return (
    <>
      <Hero />
      <WhyNow />
      <HowItWorks />
      <EvidenceModel />
      <UseCases />
      <Comparison />
      <FinalCta />
    </>
  );
}
