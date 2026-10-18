import { Callout } from "@/components/ui";
import type { Provenance } from "@/lib/api/schemas";
import { sourceLabel } from "@/lib/format";

/**
 * Explains a fallback in plain words: nothing when every reported source contributed, a warning when the result is
 * not quantum (OS CSPRNG only, or the IBM simulator), when the simulator contributed next to a real source, or when
 * some sources failed for this request.
 */
export function ProvenanceNotice({ provenance }: { provenance: Provenance }) {
  const unavailable = Object.keys(provenance.failures ?? {}).map(sourceLabel);
  const osOnly = provenance.sources.length === 1 && provenance.sources[0] === "os_csprng";
  const simulator = provenance.sources.includes("ibm_simulator");
  if (provenance.quantum && unavailable.length === 0 && !simulator) return null;

  const lines: string[] = [];
  if (osOnly) {
    lines.push("Quantum sources unavailable: this result came from the OS CSPRNG only and is labelled not quantum.");
  } else if (!provenance.quantum) {
    lines.push(simulator
      ? "Only the IBM simulator contributed: this result is labelled not quantum."
      : "No quantum source contributed: this result is labelled not quantum.");
  } else {
    if (unavailable.length > 0) {
      lines.push(`Some quantum sources were unavailable for this request. Contributing: ${
        provenance.sources.map(sourceLabel).join(" + ")}.`);
    }
    if (simulator) lines.push("The IBM simulator also contributed. Simulator output is not quantum.");
  }
  if (unavailable.length > 0) lines.push(`Unavailable for this request: ${unavailable.join(", ")}.`);

  return (
    <Callout tone="warning" role="status">
      {lines.map((line, i) => <p key={line} className={i > 0 ? "mt-1" : undefined}>{line}</p>)}
    </Callout>
  );
}
