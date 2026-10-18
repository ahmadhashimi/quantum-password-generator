import { Ban, Radio } from "lucide-react";
import Link from "next/link";

import { Badge, Callout, Card, CardBody, CardHeader, Table, Td, Th } from "@/components/ui";
import { sourceLabel } from "@/lib/format";

import { linkClass, SectionBadges, Term } from "./parts";
import { healthLabel, isQuantumSource, type PayloadView } from "./proof-data";

function ModeBadge({ mode }: { mode: string | null }) {
  if (mode === "simulator") return <Badge tone="warning">Simulator: not quantum</Badge>;
  if (mode === "hardware") return <Badge tone="neutral">Hardware (as reported)</Badge>;
  return <Badge tone="neutral">Unknown</Badge>;
}

/** Section 4: what the issuing server says about the entropy. Signed by it, not independently authenticated. */
export function ProvenanceCard({ view, verified }: { view: PayloadView; verified: boolean }) {
  const p = view.provenance;
  const simulator = p.sources.includes("ibm_simulator") || p.ibmJobs.some((j) => j.mode === "simulator");
  return (
    <Card id="provenance">
      <CardHeader icon={<Radio />} title="Provenance (operator-asserted)"
                  description="What the issuing server reports about the entropy sources. It signed these claims; nothing independent authenticated them."
                  action={<SectionBadges verified={verified}><Badge tone="warning">Operator-asserted</Badge></SectionBadges>} />
      <CardBody className="space-y-6">
        <dl className="grid gap-4 sm:grid-cols-2">
          <Term label="Entropy sources reported">
            {p.sources.length ? (
              <span className="flex flex-wrap gap-1.5">
                {p.sources.map((s) => (
                  <Badge key={s} tone={s === "ibm_simulator" ? "warning" : isQuantumSource(s) ? "accent" : "neutral"}>
                    {sourceLabel(s)}
                  </Badge>
                ))}
              </span>
            ) : (
              <span className="text-muted">None: this receipt did not draw any randomness.</span>
            )}
          </Term>
          <Term label="Quantum source reported">
            <span className="flex flex-wrap items-center gap-2">
              <Badge tone={p.quantum ? "accent" : "neutral"}>{p.quantum ? "Yes" : "No"}</Badge>
              {p.quantum && p.quantumBytes !== null && (
                <span className="text-muted">{p.quantumBytes.toLocaleString("en-US")} bytes from quantum sources</span>
              )}
            </span>
          </Term>
          <Term label="Mixed with">
            {p.mixedWith === "os_csprng" ? "OS CSPRNG (via HKDF)" : p.mixedWith === "none" ? "Nothing else" : (p.mixedWith ?? "—")}
          </Term>
          {view.entropyBits !== null && (
            <Term label="Entropy estimate">
              {`${view.entropyBits.toLocaleString("en-US", { maximumFractionDigits: 2 })} bits`}
            </Term>
          )}
        </dl>

        {simulator && (
          <Callout tone="warning" title="Simulator output is not quantum">
            At least one IBM job ran on a simulator. A classical computer produced that output, so it must not be
            counted as quantum randomness.
          </Callout>
        )}

        {p.ibmJobs.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-fg">IBM jobs reported</h3>
            <Table>
              <caption className="sr-only">IBM jobs the server reports using for this receipt</caption>
              <thead>
                <tr><Th>Backend</Th><Th>Job ID</Th><Th>Mode</Th></tr>
              </thead>
              <tbody>
                {p.ibmJobs.map((job, i) => (
                  <tr key={`${job.jobId ?? "no-id"}-${i}`}>
                    <Td className="font-mono text-xs">{job.backend ?? "—"}</Td>
                    <Td className="font-mono text-xs break-all">{job.jobId ?? "—"}</Td>
                    <Td><ModeBadge mode={job.mode} /></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}

        {p.health.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-fg">Health screening reported</h3>
            <ul className="space-y-2">
              {p.health.map((h) => (
                <li key={h.name} className="flex flex-wrap items-center gap-2 text-sm text-muted">
                  <Badge tone={h.outcome === "pass" ? "success" : "neutral"}>{h.outcome}</Badge>
                  {healthLabel(h.name)}
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-sm text-muted">
          Reported by the issuing server and covered by its signature, but not independently authenticated: IBM does not
          sign job results and third parties cannot fetch them.{" "}
          <Link href="/transparency#entropy" prefetch={false} className={linkClass}>How sources are screened</Link>
        </p>
      </CardBody>
    </Card>
  );
}

/** Section 5: always "none" today; spelled out so it can't be mistaken for a pass. */
export function QuantumEvidenceCard({ view, verified }: { view: PayloadView; verified: boolean }) {
  return (
    <Card id="quantum-evidence">
      <CardHeader icon={<Ban />} title="Independent quantum evidence"
                  description="Evidence a third party could check without trusting this server."
                  action={<SectionBadges verified={verified}><Badge>None available</Badge></SectionBadges>} />
      <CardBody className="space-y-3">
        <Callout tone="neutral" title="None available">
          IBM does not sign job results, so quantum origin can&apos;t be independently authenticated today.
        </Callout>
        <p className="text-xs text-subtle">
          {view.version === "qpg-receipt/2"
            ? "This receipt version states that in its signed evidence block (quantum_evidence: none)."
            : "This receipt version predates the signed evidence block, but the same limit applies."}
        </p>
      </CardBody>
    </Card>
  );
}
