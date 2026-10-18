import { Atom, Cpu, ShieldAlert } from "lucide-react";

import { Badge } from "@/components/ui";
import type { Provenance } from "@/lib/api/schemas";
import { sourceLabel } from "@/lib/format";

/** What the server reports about this result's entropy sources (operator-asserted, not proven). */
export function ProvenanceBadge({ provenance }: { provenance: Provenance }) {
  const label = provenance.sources.map(sourceLabel).join(" + ");
  const simulator = provenance.sources.includes("ibm_simulator");
  if (provenance.quantum) {
    return (
      <Badge tone="accent" icon={<Atom aria-hidden />} title="Reported by the server; mixed with the OS CSPRNG via HKDF">
        Quantum-seeded · {label}
      </Badge>
    );
  }
  return (
    <Badge tone="warning" icon={simulator ? <Cpu aria-hidden /> : <ShieldAlert aria-hidden />}
           title="No quantum source contributed to this result">
      Not quantum · {label}
    </Badge>
  );
}
