import type { Tone } from "@/components/ui";
import type { EntropyStatus, ProviderStatus } from "@/lib/api/schemas";

/** Bytes in one seed: the unit the entropy service takes from the IBM pool per request. */
export const SEED_BYTES = 64;

export type StateKey = "ok" | "failing" | "cooldown" | "not_configured" | "untested" | "pool_empty" | "unknown";

export const STATE_COPY: Record<Exclude<StateKey, "unknown">, { label: string; meaning: string }> = {
  ok: {
    label: "OK",
    meaning: "Responding and passing health screening. Available for new requests.",
  },
  failing: {
    label: "Failing",
    meaning: "A recent request or health screening failed. Not used for new requests until it recovers.",
  },
  cooldown: {
    label: "Cooldown",
    meaning: "The circuit breaker is open after repeated failures or a refusal (authentication, quota or rate limit). " +
      "Not used until the cooldown ends.",
  },
  not_configured: {
    label: "Not configured",
    meaning: "This deployment has no credentials or endpoint for it. Not used.",
  },
  untested: {
    label: "Untested",
    meaning: "Configured, but no request has succeeded since the API started. Not counted as available.",
  },
  pool_empty: {
    label: "Pool empty",
    meaning: "The IBM pool holds less than one 64-byte seed. Harvest jobs are capped per day, so it can stay empty for hours.",
  },
};

export interface ProviderView {
  name: string;
  /** Quantum source as the operator reports it. A simulator is never quantum, whatever the flag says. */
  quantum: boolean;
  simulator: boolean;
  /** The server's own verdict: only an available source can be used for a request. */
  available: boolean;
  state: StateKey;
  stateLabel: string;
  tone: Tone;
  isPool: boolean;
  poolBytes: number | null;
  poolSeeds: number | null;
  jobsLast24h: number | null;
  /** Last successful fetch (live sources) or harvest (IBM), unix seconds. */
  lastSuccessAt: number | null;
  recentError: boolean;
}

/** The one-line explanation shown under a source's state. */
export function meaningOf(v: ProviderView): string | null {
  if (v.state === "unknown") return null;
  if (v.isPool && v.state === "ok") {
    return v.simulator
      ? "The pool holds at least one 64-byte seed from the simulator, which is classical pseudo-randomness."
      : "The pool holds at least one 64-byte seed. Only signed-in users draw from it, within a daily quota.";
  }
  return STATE_COPY[v.state].meaning;
}

function stateOf(p: ProviderStatus, isPool: boolean): StateKey {
  if (p.state !== undefined) {
    return Object.hasOwn(STATE_COPY, p.state) ? (p.state as StateKey) : "unknown";
  }
  // The IBM harvester reports no state of its own: derive one from what it does report.
  if (!p.configured) return "not_configured";
  if (p.available) return "ok";
  if (p.error) return "failing";
  if (isPool && !p.last_harvest_at) return "untested";
  return "pool_empty";
}

function toneOf(state: StateKey, available: boolean, simulator: boolean): Tone {
  if (available) return simulator ? "warning" : "success";
  switch (state) {
    case "failing": return "danger";
    case "cooldown":
    case "pool_empty": return "warning";
    default: return "neutral";
  }
}

const titleCase = (s: string): string => (s.charAt(0).toUpperCase() + s.slice(1)).replace(/_/g, " ");

export function describeProvider(p: ProviderStatus): ProviderView {
  const simulator = p.mode === "simulator" || p.name === "ibm_simulator";
  const isPool = p.pool_bytes !== undefined;
  // `available` is authoritative. A state of "ok" on an unavailable source would be a server bug; never show it as ok.
  const available = p.available && p.configured;
  const raw = stateOf(p, isPool);
  const state = raw === "ok" && !available ? "unknown" : raw;
  return {
    name: p.name,
    quantum: p.quantum && !simulator,
    simulator,
    available,
    state,
    stateLabel: state === "unknown" ? (p.state && p.state !== "ok" ? titleCase(p.state) : "Unavailable")
                                    : STATE_COPY[state].label,
    tone: toneOf(state, available, simulator),
    isPool,
    poolBytes: p.pool_bytes ?? null,
    poolSeeds: p.pool_bytes === undefined ? null : Math.floor(p.pool_bytes / SEED_BYTES),
    jobsLast24h: p.jobs_last_24h ?? null,
    lastSuccessAt: (isPool ? p.last_harvest_at : p.last_success_at) ?? null,
    recentError: p.error === true,
  };
}

/** Everything the overall banner needs, derived only from what is available right now. */
export function summarize(status: EntropyStatus): {
  views: ProviderView[];
  availableQuantum: ProviderView[];
  unavailableQuantum: ProviderView[];
  simulatorAvailable: boolean;
} {
  const views = status.providers.map(describeProvider);
  return {
    views,
    availableQuantum: views.filter((v) => v.available && v.quantum),
    unavailableQuantum: views.filter((v) => !v.available && v.quantum),
    simulatorAvailable: views.some((v) => v.available && v.simulator),
  };
}
