import type { ProviderStatus } from "@/lib/api/schemas";

import { describeProvider, summarize } from "./provider-state";

const live = (over: Partial<ProviderStatus> = {}): ProviderStatus => ({
  name: "lfd", quantum: true, configured: true, available: true, state: "ok", last_success_at: 1_792_304_938,
  error: false, ...over,
});

const ibm = (over: Partial<ProviderStatus> = {}): ProviderStatus => ({
  name: "ibm_quantum", quantum: true, configured: true, available: true, mode: "hardware", pool_bytes: 8_128,
  last_harvest_at: 1_792_300_000, jobs_last_24h: 1, error: false, ...over,
});

describe("describeProvider", () => {
  it("maps the live-source states the backend reports", () => {
    const cases = [
      ["ok", true, "OK", "success"],
      ["failing", false, "Failing", "danger"],
      ["cooldown", false, "Cooldown", "warning"],
      ["not_configured", false, "Not configured", "neutral"],
      ["untested", false, "Untested", "neutral"],
    ] as const;
    for (const [state, available, label, tone] of cases) {
      const v = describeProvider(live({ state, available, configured: state !== "not_configured" }));
      expect([v.stateLabel, v.tone, v.available]).toEqual([label, tone, available]);
    }
  });

  it("never shows an unavailable source as ok, even if the server says state ok", () => {
    const v = describeProvider(live({ available: false, state: "ok" }));
    expect(v.available).toBe(false);
    expect(v.stateLabel).toBe("Unavailable");
    expect(v.tone).toBe("neutral");
  });

  it("keeps an unknown state readable instead of dropping it", () => {
    const v = describeProvider(live({ available: false, state: "half_open" }));
    expect(v.state).toBe("unknown");
    expect(v.stateLabel).toBe("Half open");
    expect(describeProvider(live({ available: false, state: "constructor" })).state).toBe("unknown");
  });

  it("derives an IBM state from what the harvester reports and counts whole seeds", () => {
    const ok = describeProvider(ibm({ pool_bytes: 8_128 }));
    expect([ok.state, ok.isPool, ok.poolBytes, ok.poolSeeds, ok.jobsLast24h]).toEqual(["ok", true, 8_128, 127, 1]);
    expect(describeProvider(ibm({ pool_bytes: 100, available: false })).poolSeeds).toBe(1);
    expect(describeProvider(ibm({ pool_bytes: 10, available: false })).state).toBe("pool_empty");
    expect(describeProvider(ibm({ pool_bytes: 0, available: false, last_harvest_at: null })).state).toBe("untested");
    expect(describeProvider(ibm({ pool_bytes: 0, available: false, error: true })).state).toBe("failing");
    expect(describeProvider(ibm({ configured: false, available: false })).state).toBe("not_configured");
  });

  it("uses the harvest time as an IBM source's last success", () => {
    expect(describeProvider(ibm()).lastSuccessAt).toBe(1_792_300_000);
    expect(describeProvider(live()).lastSuccessAt).toBe(1_792_304_938);
    expect(describeProvider(live({ last_success_at: null })).lastSuccessAt).toBeNull();
  });

  it("never treats the simulator as quantum, whatever the quantum flag says", () => {
    const v = describeProvider(ibm({ name: "ibm_simulator", mode: "simulator", quantum: true }));
    expect(v.simulator).toBe(true);
    expect(v.quantum).toBe(false);
    expect(v.tone).toBe("warning");
    expect(describeProvider(ibm({ name: "ibm_simulator", quantum: true })).quantum).toBe(false);
  });

  it("reports only the coarse error flag", () => {
    expect(describeProvider(live({ error: true })).recentError).toBe(true);
    expect(describeProvider(live({ error: undefined })).recentError).toBe(false);
  });
});

describe("summarize", () => {
  it("lists only available quantum sources as available", () => {
    const s = summarize({
      quantum_available: true, fallback: "os_csprng",
      providers: [ibm({ available: false, pool_bytes: 0 }), live({ name: "anu", state: "cooldown", available: false }),
                  live()],
    });
    expect(s.availableQuantum.map((v) => v.name)).toEqual(["lfd"]);
    expect(s.unavailableQuantum.map((v) => v.name)).toEqual(["ibm_quantum", "anu"]);
    expect(s.simulatorAvailable).toBe(false);
  });

  it("flags an available simulator without counting it as quantum", () => {
    const s = summarize({
      quantum_available: false, fallback: "os_csprng",
      providers: [ibm({ name: "ibm_simulator", mode: "simulator", quantum: false })],
    });
    expect(s.simulatorAvailable).toBe(true);
    expect(s.availableQuantum).toEqual([]);
    expect(s.unavailableQuantum).toEqual([]);
  });
});
