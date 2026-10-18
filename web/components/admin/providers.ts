import { z } from "zod";

import { describeProvider, type ProviderView } from "@/components/status/provider-state";
import type { AdminStats } from "@/lib/api/schemas";

/**
 * The operator view of a source: everything the public status shows plus counters, health screening and the last
 * error text. AdminStats only types `name`, so the rest is read here. `.catch` keeps one malformed field from hiding
 * a whole row: an operator should always see every source.
 */
const Health = z.looseObject({
  rct_cutoff: z.number().optional().catch(undefined),
  apt_cutoff: z.number().optional().catch(undefined),
  samples: z.number().optional().catch(undefined),
  failures: z.number().optional().catch(undefined),
});

const Detailed = z.looseObject({
  name: z.string(),
  quantum: z.boolean().catch(false),
  configured: z.boolean().catch(false),
  available: z.boolean().catch(false),
  state: z.string().optional().catch(undefined),
  mode: z.enum(["hardware", "simulator"]).optional().catch(undefined),
  pool_bytes: z.number().optional().catch(undefined),
  last_success_at: z.number().nullable().optional().catch(undefined),
  last_harvest_at: z.number().nullable().optional().catch(undefined),
  jobs_last_24h: z.number().optional().catch(undefined),
  successes: z.number().optional().catch(undefined),
  last_error: z.string().nullable().optional().catch(undefined),
  health: Health.optional().catch(undefined),
});

export interface AdminProvider {
  view: ProviderView;
  successes: number | null;
  lastError: string | null;
  health: { rctCutoff: number | null; aptCutoff: number | null; samples: number | null; failures: number | null } | null;
  mode: "hardware" | "simulator" | null;
}

export function adminProviders(stats: AdminStats): AdminProvider[] {
  return (stats.entropy?.providers ?? []).flatMap((raw) => {
    const p = Detailed.safeParse(raw);
    if (!p.success) return [{ view: describeProvider({ name: raw.name, quantum: false, configured: false, available: false }),
                              successes: null, lastError: null, health: null, mode: null }];
    const d = p.data;
    return [{
      view: describeProvider(d),
      successes: d.successes ?? null,
      lastError: d.last_error ?? null,
      health: d.health
        ? { rctCutoff: d.health.rct_cutoff ?? null, aptCutoff: d.health.apt_cutoff ?? null,
            samples: d.health.samples ?? null, failures: d.health.failures ?? null }
        : null,
      mode: d.mode ?? (d.name === "ibm_simulator" ? "simulator" : null),
    }];
  });
}

/** Whole-fleet facts shown above the table, tolerant of a missing entropy block. */
export function entropyFacts(stats: AdminStats): { quantumAvailable: boolean | null; fallback: string | null;
                                                    checkedAt: number | null } {
  const e: Record<string, unknown> = stats.entropy ?? {};
  return {
    quantumAvailable: typeof e.quantum_available === "boolean" ? e.quantum_available : null,
    fallback: typeof e.fallback === "string" ? e.fallback : null,
    checkedAt: typeof e.checked_at === "number" ? e.checked_at : null,
  };
}
