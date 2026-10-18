import { Atom, ShieldAlert } from "lucide-react";
import type { Provenance } from "../lib/types";
import { sourceLabel } from "../lib/format";

export function ProvenanceBadge({ provenance }: { provenance: Provenance }) {
  const { quantum, sources } = provenance;
  const label = sources.map(sourceLabel).join(" + ");
  return (
    <span
      title={`Mixed with ${sourceLabel(provenance.mixed_with)} via HKDF-SHA512`}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 ${
        quantum
          ? "bg-cyan-500/10 text-cyan-700 ring-cyan-500/30 dark:text-cyan-300"
          : "bg-amber-500/10 text-amber-700 ring-amber-500/30 dark:text-amber-300"
      }`}
    >
      {quantum ? <Atom className="size-3.5" aria-hidden /> : <ShieldAlert className="size-3.5" aria-hidden />}
      {quantum ? "Quantum" : "Not quantum"} · {label}
    </span>
  );
}
