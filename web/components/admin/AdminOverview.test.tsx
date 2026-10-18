import { render, screen, within } from "@testing-library/react";

import type { AdminStats } from "@/lib/api/schemas";

import { AdminOverview } from "./AdminOverview";

const CHECKED = 1_792_305_000;

const stats = (over: Partial<AdminStats> = {}): AdminStats => ({
  users: 2,
  events: { password: 3, draw: 1, assistant_message: 2 },
  total_events: 6,
  quantum_share: 0.5,
  assistant_cost_usd: 0.1234,
  assistant_cost_today_usd: 0,
  daily: [{ date: "2026-10-18", count: 6 }],
  recent_users: [{ id: "user_1", email: "ada@example.com", name: "Ada", last_seen: "2026-10-18T06:28:58+00:00" }],
  draws_needing_investigation: [],
  entropy: {
    quantum_available: true,
    fallback: "os_csprng",
    checked_at: CHECKED,
    providers: [
      { name: "lfd", quantum: true, configured: true, available: true, state: "ok", successes: 12, last_error: null,
        last_success_at: CHECKED - 120, health: { rct_cutoff: 4, apt_cutoff: 18, samples: 1024, failures: 0 } },
      { name: "ibm_simulator", quantum: true, configured: true, available: true, mode: "simulator", pool_bytes: 640,
        last_harvest_at: CHECKED - 3600, jobs_last_24h: 3 },
      { name: "anu", quantum: true, configured: true, available: false, state: "cooldown", successes: 0,
        last_error: "HTTP 429 from provider" },
    ],
  },
  ...over,
});

const rowOf = (name: string): HTMLElement =>
  screen.getAllByRole("row").find((r) => within(r).queryByText(name) !== null)!;

describe("AdminOverview", () => {
  it("shows every source with its live state, counters and screening, as telemetry about now", () => {
    render(<AdminOverview stats={stats()} />);

    expect(screen.getByRole("table", { name: /Entropy sources/ })).toBeInTheDocument();
    const lfd = within(rowOf("LfD QRNG"));
    expect(lfd.getByText("OK")).toBeInTheDocument();
    expect(lfd.getByText("Available now")).toBeInTheDocument();
    expect(lfd.getByText("Succeeded 2 min ago")).toBeInTheDocument();
    expect(lfd.getByText("12")).toBeInTheDocument();
    expect(lfd.getByText("1,024")).toBeInTheDocument();
    expect(screen.getByText(/not evidence of a source's contribution to a past receipt/)).toBeInTheDocument();
    expect(screen.getByText(/SP 800-90B-style RCT\/APT screening \(not a NIST validation\)/)).toBeInTheDocument();
    expect(screen.getByText(/A quantum source is available/)).toBeInTheDocument();
    expect(screen.getByText(/Fallback: OS CSPRNG/)).toBeInTheDocument();
  });

  it("labels the simulator as not quantum even though the API flagged it quantum", () => {
    render(<AdminOverview stats={stats()} />);

    const sim = within(rowOf("IBM simulator (not quantum)"));
    expect(sim.getByText("Simulator: not quantum")).toBeInTheDocument();
    expect(sim.queryByText("Quantum")).not.toBeInTheDocument();
    expect(sim.getByText("Simulator")).toBeInTheDocument();
    expect(sim.getByText("10 seeds")).toBeInTheDocument();
  });

  it("shows an unavailable source as not available, with its last error for the operator", () => {
    render(<AdminOverview stats={stats()} />);

    const anu = within(rowOf("ANU QRNG"));
    expect(anu.getByText("Cooldown")).toBeInTheDocument();
    expect(anu.getByText("Not available")).toBeInTheDocument();
    expect(anu.queryByText("Available now")).not.toBeInTheDocument();
    expect(anu.getByText("HTTP 429 from provider")).toBeInTheDocument();
  });

  it("still lists a source whose detail is malformed instead of hiding the row", () => {
    const entropy = { quantum_available: false, providers: [{ name: "lfd", successes: "many", health: 7 }] };
    render(<AdminOverview stats={stats({ entropy })} />);

    expect(within(rowOf("LfD QRNG")).getByText("Not available")).toBeInTheDocument();
    expect(screen.getByText(/No quantum source is available/)).toBeInTheDocument();
  });

  it("says so when the API reports no entropy detail at all", () => {
    const withoutEntropy = stats();
    delete withoutEntropy.entropy;
    render(<AdminOverview stats={withoutEntropy} />);
    expect(screen.getByText("No source detail")).toBeInTheDocument();
  });

  it("points at interrupted draws, with the right grammar", () => {
    const { rerender } = render(<AdminOverview stats={stats({ draws_needing_investigation: ["a"] })} />);
    const one = screen.getByRole("status");
    expect(one).toHaveTextContent("1 draw needs investigation");
    expect(within(one).getByRole("link", { name: "Review it below." })).toHaveAttribute("href", "#investigations");

    rerender(<AdminOverview stats={stats({ draws_needing_investigation: ["a", "b"] })} />);
    expect(screen.getByRole("status")).toHaveTextContent("2 draws need investigation");
  });

  it("describes the quantum share as reported by the operator and shows spend with sub-cent amounts", () => {
    render(<AdminOverview stats={stats({ assistant_cost_today_usd: 0.004 })} />);

    const share = screen.getByText("Quantum share").closest("div");
    expect(share).toHaveTextContent("50%");
    expect(share).toHaveTextContent("Operator-reported");
    expect(screen.getByText("AI spend today").closest("div")).toHaveTextContent("<$0.01");
    expect(screen.getByText("AI spend total").closest("div")).toHaveTextContent("$0.12");
  });

  it("lists events by kind with shares and recent users", () => {
    render(<AdminOverview stats={stats()} />);

    const kinds = within(screen.getByRole("table", { name: "Usage events by kind" }));
    const cells = (label: string): (string | null)[] =>
      within(kinds.getByText(label).closest("tr")!).getAllByRole("cell").map((c) => c.textContent);
    expect(cells("Passwords")).toEqual(["Passwords", "3", "50%"]);
    expect(cells("Assistant messages")).toEqual(["Assistant messages", "2", "33%"]);
    const users = screen.getByRole("table", { name: "Most recently seen users" });
    expect(within(users).getByText("ada@example.com")).toBeInTheDocument();
    expect(within(users).getByText("2026-10-18 06:28:58 UTC")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /6 usage events in the last 30 days/ })).toBeInTheDocument();
  });
});
