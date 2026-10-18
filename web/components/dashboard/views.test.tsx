import { render, screen, within } from "@testing-library/react";

import type { Me, MeReceipts, MeUsage } from "@/lib/api/schemas";

import { count, formatShare, formatUsd } from "./format";
import { OverviewView } from "./OverviewView";
import { ReceiptsView } from "./ReceiptsView";
import { UsageView } from "./UsageView";

const receipt = (over: Partial<MeReceipts["items"][number]> = {}): MeReceipts["items"][number] => ({
  receipt_id: "KTJbG0BDxMMUxbkN",
  kind: "password",
  created_at: "2026-10-18T06:28:58.887244+00:00",
  version: "qpg-receipt/2",
  sources: ["lfd"],
  quantum: true,
  entropy_bits: 128,
  key_id: "9d4cc626d6b265c6",
  ...over,
});

describe("ReceiptsView", () => {
  it("lists receipt metadata with a verify link and UTC time", () => {
    render(<ReceiptsView paged={false} data={{ items: [receipt()], next_before: null }} />);

    const row = screen.getAllByRole("row")[1]!;
    expect(within(row).getByRole("link", { name: "KTJbG0BDxMMUxbkN" })).toHaveAttribute("href", "/verify/KTJbG0BDxMMUxbkN");
    expect(within(row).getByText("Password")).toBeInTheDocument();
    expect(within(row).getByText("2026-10-18 06:28:58 UTC")).toBeInTheDocument();
    expect(within(row).getByText("qpg-receipt/2")).toBeInTheDocument();
    expect(within(row).getByText("Quantum-seeded")).toBeInTheDocument();
    expect(within(row).getByText("128")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Load older" })).not.toBeInTheDocument();
  });

  it("offers Load older with the API cursor and a way back when paged", () => {
    render(<ReceiptsView paged data={{ items: [receipt()], next_before: "2026-10-18T06:28:58.887244+00:00" }} />);

    const older = screen.getByRole("link", { name: "Load older" });
    const href = new URL(older.getAttribute("href") ?? "", "http://localhost");
    expect(href.pathname).toBe("/dashboard/receipts");
    expect(href.searchParams.get("before")).toBe("2026-10-18T06:28:58.887244+00:00");
    expect(screen.getByRole("link", { name: "Back to newest" })).toHaveAttribute("href", "/dashboard/receipts");
  });

  it("never calls a simulator-only receipt quantum, and says when no entropy was used", () => {
    render(<ReceiptsView paged={false} data={{
      next_before: null,
      items: [
        receipt({ receipt_id: "SIMSIMSIMSIMSIM1", sources: ["ibm_simulator"], quantum: true }),
        receipt({ receipt_id: "COMMITCOMMITCOM1", kind: "draw_commit", sources: [], quantum: false, entropy_bits: null }),
      ],
    }} />);

    const [simulated, commit] = screen.getAllByRole("row").slice(1);
    expect(within(simulated!).getByText("Not quantum")).toBeInTheDocument();
    expect(within(simulated!).queryByText("Quantum-seeded")).not.toBeInTheDocument();
    expect(within(commit!).getByText("No entropy used")).toBeInTheDocument();
    expect(within(commit!).getByText("Not applicable")).toBeInTheDocument();
  });

  it("shows an empty state for a new account and for the end of history", () => {
    const { rerender } = render(<ReceiptsView paged={false} data={{ items: [], next_before: null }} />);
    expect(screen.getByText("No receipts yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Generate a secret" })).toHaveAttribute("href", "/generate");

    rerender(<ReceiptsView paged data={{ items: [], next_before: null }} />);
    expect(screen.getByText("No older receipts")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to newest" })).toBeInTheDocument();
  });
});

const usage = (over: Partial<MeUsage> = {}): MeUsage => ({
  today: { draw: 1, password: 3 },
  month: { draw: 4, password: 12, assistant_message: 2 },
  draws_today: 1,
  assistant_spend_today_usd: 0,
  assistant_spend_month_usd: 0.004,
  quotas: { draws_per_day: 50, assistant_messages_per_day: 50, assistant_budget_per_day_usd: 1, ibm_seeds_per_day: 20,
            rate_limit: "120/minute" },
  ...over,
});

describe("UsageView", () => {
  it("shows counts by kind with totals and the quotas, and says password generation is never blocked", () => {
    render(<UsageView usage={usage()} />);

    expect(screen.getByText("Password generation is never blocked by assistant caps")).toBeInTheDocument();
    const table = screen.getByRole("table", { name: /Results issued by kind/ });
    expect(within(table).getByRole("row", { name: /Passwords 3 12/ })).toBeInTheDocument();
    expect(within(table).getByRole("row", { name: /Total 4 18/ })).toBeInTheDocument();
    expect(screen.getByRole("meter", { name: "Draws today: 1 of 50" })).toHaveAttribute("aria-valuenow", "2");
    expect(screen.getByRole("meter", { name: /Assistant spend today: \$0\.00 of \$1\.00 per day/ })).toBeInTheDocument();
    expect(screen.getByText("20 per day")).toBeInTheDocument();
    expect(screen.getByText("120/minute")).toBeInTheDocument();
  });

  it("states a reached limit in words, not only colour", () => {
    render(<UsageView usage={usage({ draws_today: 50, assistant_spend_today_usd: 0.85 })} />);

    expect(screen.getByText("Limit reached")).toBeInTheDocument();
    expect(screen.getByText("Close to the limit")).toBeInTheDocument();
    expect(screen.getByRole("meter", { name: /Draws today/ })).toHaveAttribute("aria-valuenow", "100");
  });

  it("handles an account with no usage", () => {
    render(<UsageView usage={usage({ today: {}, month: {}, draws_today: 0 })} />);
    expect(screen.getByText("Nothing used this month")).toBeInTheDocument();
  });
});

const me = (over: Partial<Me> = {}): Me => ({
  id: "user_1", email: "a@example.com", name: "Ada", is_admin: false,
  stats: { counts: { password: 3, passphrase: 1, random: 0, draw: 1, assistant_message: 4 }, total: 9, quantum: 4 },
  ...over,
});

describe("OverviewView", () => {
  it("counts issued results without assistant messages and shows the reported quantum share", () => {
    render(<OverviewView me={me()} />);

    const total = screen.getByText("Total issued").closest("div");
    expect(total).toHaveTextContent("5");
    expect(screen.getByText("Quantum-seeded").closest("div")).toHaveTextContent("80%");
    expect(screen.getByText(/Reported by the server, not independently verifiable/)).toBeInTheDocument();
    expect(screen.getByText("Assistant messages").closest("div")).toHaveTextContent("4");
  });

  it("links to the generator, draws and verifier, and to operations only for admins", () => {
    const { rerender } = render(<OverviewView me={me()} />);
    expect(screen.getByRole("link", { name: /Generate a secret/ })).toHaveAttribute("href", "/generate");
    expect(screen.getByRole("link", { name: /Run a fair draw/ })).toHaveAttribute("href", "/draws");
    expect(screen.getByRole("link", { name: /Verify a receipt/ })).toHaveAttribute("href", "/verify");
    expect(screen.queryByRole("link", { name: /Operations/ })).not.toBeInTheDocument();

    rerender(<OverviewView me={me({ is_admin: true })} />);
    expect(screen.getByRole("link", { name: /Operations/ })).toHaveAttribute("href", "/admin");
  });

  it("shows an empty state before anything is issued", () => {
    render(<OverviewView me={me({ stats: { counts: {}, total: 0, quantum: 0 } })} />);
    expect(screen.getByText("Nothing issued yet")).toBeInTheDocument();
    expect(screen.queryByText("Total issued")).not.toBeInTheDocument();
  });
});

describe("format", () => {
  it("keeps tiny amounts and shares visible", () => {
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(0.004)).toBe("<$0.01");
    expect(formatUsd(1.5)).toBe("$1.50");
    expect(formatShare(0.004)).toBe("<1%");
    expect(formatShare(0)).toBe("0%");
    expect(formatShare(1.2)).toBe("100%");
    expect(count(12_345)).toBe("12,345");
  });
});
