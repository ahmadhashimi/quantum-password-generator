import { Badge, Callout, Table, Td, Th, type Tone } from "@/components/ui";

import { Block } from "./Block";
import { TextLink } from "./links";

const ROWS: { area: string; tone: Tone; status: string; detail: string }[] = [
  {
    area: "Receipt signatures",
    tone: "success",
    status: "Implemented",
    detail: "Ed25519 and ML-DSA-65, the algorithm standardised in FIPS 204. The implementation is not validated " +
      "under any FIPS programme.",
  },
  {
    area: "Entropy health screening",
    tone: "warning",
    status: "Screening only",
    detail: "SP 800-90B-style RCT/APT screening (not a NIST validation). It catches stuck or biased output, not a " +
      "clean-looking fake.",
  },
  {
    area: "Source provenance",
    tone: "warning",
    status: "Operator-asserted",
    detail: "Sources, IBM jobs and screening results are signed claims by the operator. Nobody outside can re-check them.",
  },
  {
    area: "Independent quantum evidence",
    tone: "neutral",
    status: "Not available",
    detail: "IBM does not sign job results, and there is no device-independent attestation.",
  },
  {
    area: "Receipt log",
    tone: "warning",
    status: "Server-operated",
    detail: "Not externally anchored, so the operator could withhold results.",
  },
  {
    area: "Signing key custody",
    tone: "warning",
    status: "File-based key",
    detail: "No HSM or KMS yet. Public keys are published, and keys can be rotated and revoked.",
  },
  {
    area: "Independent security review",
    tone: "neutral",
    status: "Not yet",
    detail: "An internal adversarial review has been run and its findings are published. A third-party review has not " +
      "happened.",
  },
];

export function SecurityPosture() {
  return (
    <Block id="security-posture" eyebrow="Security posture" title="What we claim, and what we do not"
           description="A reviewer should be able to read this section and find nothing they would have to discover later.">
      <Callout tone="neutral" title="What we don't claim">
        No FIPS, FedRAMP, GLI-19, or independently attested quantum-origin certification is claimed.
      </Callout>
      <div className="mt-6">
        <Table className="min-w-[36rem]">
          <caption className="sr-only">Security posture by area, with status and detail</caption>
          <thead>
            <tr>
              <Th className="w-[22%]">Area</Th>
              <Th className="w-[18%]">Status</Th>
              <Th>Detail</Th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.area}>
                <Td className="font-medium">{row.area}</Td>
                <Td><Badge tone={row.tone}>{row.status}</Badge></Td>
                <Td><span className="text-muted">{row.detail}</span></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
      <p className="mt-4 text-sm text-muted">
        The limits in full, including entropy assumptions and the draw protocol, are on the{" "}
        <TextLink href="/transparency">transparency page</TextLink>.
      </p>
      <Callout tone="info" title="A note on the market" className="mt-6">
        <p>
          Quantum Origin from Quantinuum is deployed with large enterprises and, per Quantinuum, holds a NIST entropy
          source validation. We don&apos;t compete on certification or source assurance. If a validated entropy source
          is a hard requirement, use one.
        </p>
        <p className="mt-2">
          QuantumPass works at a different layer: portable, verifiable evidence of how each credential was issued, with
          an honest label on everything it cannot prove.
        </p>
      </Callout>
    </Block>
  );
}
