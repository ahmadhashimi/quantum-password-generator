import { Callout } from "@/components/ui";
import type { Provenance } from "@/lib/api/schemas";
import { sourceLabel } from "@/lib/format";

/**
 * Explains a fallback in plain words: nothing when every reported source contributed, a warning when the result is
 * not quantum (OS CSPRNG only, or the IBM simulator) or when some sources failed for this request.
 */
export function ProvenanceNotice({ provenance }: { provenance: Provenance }) {
  const unavailable = Object.keys(provenance.failures ?? {}).map(sourceLabel);
  const osOnly = provenance.sources.length === 1 && provenance.sources[0] === "os_csprng";
  if (provenance.quantum && unavailable.length === 0) return null;

  let lead: string;
  if (osOnly) {
    lead = "Quantum sources unavailable: this result came from the OS CSPRNG only and is labelled not quantum.";
  } else if (!provenance.quantum) {
    lead = provenance.sources.includes("ibm_simulator")
      ? "Only the IBM simulator contributed: this result is labelled not quantum."
      : "No quantum source contributed: this result is labelled not quantum.";
  } else {
    lead = `Some quantum sources were unavailable for this request. Contributing: ${
      provenance.sources.map(sourceLabel).join(" + ")}.`;
  }

  return (
    <Callout tone="warning" role="status">
      <p>{lead}</p>
      {unavailable.length > 0 && <p className="mt-1">Unavailable for this request: {unavailable.join(", ")}.</p>}
    </Callout>
  );
}
