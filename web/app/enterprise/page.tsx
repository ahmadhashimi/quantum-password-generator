import type { Metadata } from "next";

import { Capabilities } from "@/components/marketing/Capabilities";
import { EnterpriseFlow } from "@/components/marketing/EnterpriseFlow";
import { EnterpriseHero } from "@/components/marketing/EnterpriseHero";
import { EnterpriseProblem } from "@/components/marketing/EnterpriseProblem";
import { EvaluationCta } from "@/components/marketing/EvaluationCta";
import { SecurityPosture } from "@/components/marketing/SecurityPosture";

export const metadata: Metadata = {
  title: "Enterprise",
  description: "An embedded cryptographic evidence system: add QuantumPass to credential issuance for post-quantum " +
    "signed evidence an auditor can verify without the credential. What V2.1 provides, what V3 would, and what is not claimed.",
};

export default function EnterprisePage() {
  return (
    <>
      <EnterpriseHero />
      <EnterpriseProblem />
      <EnterpriseFlow />
      <Capabilities />
      <SecurityPosture />
      <EvaluationCta />
    </>
  );
}
