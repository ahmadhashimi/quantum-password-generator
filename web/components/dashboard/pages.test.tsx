import { render, screen } from "@testing-library/react";

import AdminPage from "@/app/admin/page";
import DashboardPage from "@/app/dashboard/page";
import ReceiptsPage from "@/app/dashboard/receipts/page";
import UsagePage from "@/app/dashboard/usage/page";
import type { AdminStats, Me, MeReceipts, MeUsage } from "@/lib/api/schemas";

import { load, type Loaded } from "./load";

vi.mock("./load", () => ({ load: vi.fn() }));
// The client components fetch on mount and have their own tests; here only the page composition matters.
vi.mock("@/components/admin/AuditLog", () => ({ AuditLog: () => <section aria-label="Audit log stub" /> }));
vi.mock("@/components/admin/Investigations", () => ({ Investigations: () => <section aria-label="Investigations stub" /> }));

const loaded = vi.mocked(load);
const ok = <T,>(data: T): Loaded<T> => ({ state: "ok", data });

const me: Me = { id: "u1", email: "ada@example.com", name: "Ada", is_admin: false,
                 stats: { counts: { password: 2 }, total: 2, quantum: 2 } };
const receipts: MeReceipts = {
  next_before: null,
  items: [{ receipt_id: "KTJbG0BDxMMUxbkN", kind: "password", created_at: "2026-10-18T06:28:58.887244+00:00",
            version: "qpg-receipt/2", sources: ["lfd"], quantum: true, entropy_bits: 128, key_id: "9d4cc626d6b265c6" }],
};
const usage: MeUsage = {
  today: { password: 1 }, month: { password: 1 }, draws_today: 0, assistant_spend_today_usd: 0,
  assistant_spend_month_usd: 0,
  quotas: { draws_per_day: 50, assistant_messages_per_day: 50, assistant_budget_per_day_usd: 1, ibm_seeds_per_day: 20,
            rate_limit: "120/minute" },
};
const stats: AdminStats = {
  users: 1, events: {}, total_events: 0, quantum_share: 0, assistant_cost_usd: 0, assistant_cost_today_usd: 0,
  daily: [], recent_users: [], draws_needing_investigation: [],
};

const requested = (): URL => new URL(String(loaded.mock.calls.at(-1)?.[0]), "http://localhost");

describe("/dashboard", () => {
  afterEach(() => loaded.mockReset());

  it("greets the account by name, falling back to the email and then to nothing", async () => {
    loaded.mockResolvedValue(ok(me));
    const { unmount } = render(await DashboardPage());
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Welcome back, Ada");
    expect(requested().pathname).toBe("/api/v2/me");
    unmount();

    loaded.mockResolvedValue(ok({ ...me, name: "  " }));
    const second = render(await DashboardPage());
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Welcome back, ada@example.com");
    second.unmount();

    loaded.mockResolvedValue(ok({ ...me, name: null, email: null }));
    render(await DashboardPage());
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/^Welcome back$/);
  });

  it("explains a signed-out visit instead of failing", async () => {
    loaded.mockResolvedValue({ state: "denied", status: 401 });
    render(await DashboardPage());
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Your dashboard");
    expect(screen.getByText("Start the backend in development mode")).toBeInTheDocument();
  });
});

describe("/dashboard/receipts", () => {
  afterEach(() => loaded.mockReset());

  const page = (before?: string | string[]) =>
    ReceiptsPage({ searchParams: Promise.resolve(before === undefined ? {} : { before }) });

  it("asks for the newest page when there is no cursor", async () => {
    loaded.mockResolvedValue(ok(receipts));
    render(await page());

    expect(requested().pathname).toBe("/api/v2/me/receipts");
    expect(requested().searchParams.get("limit")).toBe("25");
    expect(requested().searchParams.has("before")).toBe(false);
    expect(screen.queryByRole("link", { name: "Back to newest" })).not.toBeInTheDocument();
    expect(screen.getByText("Sources are asserted by the operator")).toBeInTheDocument();
  });

  it("passes a valid cursor to the API with its UTC offset intact", async () => {
    const cursor = "2026-10-18T06:28:58.887244+00:00";
    loaded.mockResolvedValue(ok(receipts));
    render(await page(cursor));

    expect(requested().searchParams.get("before")).toBe(cursor);
    expect(screen.getByRole("link", { name: "Back to newest" })).toBeInTheDocument();
  });

  it.each(["yesterday", "2026-10-18T06:28:58Z&limit=500", ["2026-10-18T06:28:58Z", "x"]])(
    "ignores the cursor %j and shows the newest page",
    async (before) => {
      loaded.mockResolvedValue(ok(receipts));
      render(await page(before));

      expect(requested().searchParams.has("before")).toBe(false);
      expect(screen.queryByRole("link", { name: "Back to newest" })).not.toBeInTheDocument();
    },
  );

  it("explains an API outage and hides the table", async () => {
    loaded.mockResolvedValue({ state: "failed", message: "The API could not be reached.", requestId: null });
    render(await page());

    expect(screen.getByRole("alert")).toHaveTextContent("The API could not be reached.");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("/dashboard/usage", () => {
  afterEach(() => loaded.mockReset());

  it("shows usage and limits, or the reason it cannot", async () => {
    loaded.mockResolvedValue(ok(usage));
    const { unmount } = render(await UsagePage());
    expect(requested().pathname).toBe("/api/v2/me/usage");
    expect(screen.getByText("Your limits today")).toBeInTheDocument();
    unmount();

    loaded.mockResolvedValue({ state: "denied", status: 404 });
    render(await UsagePage());
    expect(screen.queryByText("Your limits today")).not.toBeInTheDocument();
    expect(screen.getByText("The API has nothing to show for your usage.")).toBeInTheDocument();
  });
});

describe("/admin", () => {
  afterEach(() => loaded.mockReset());

  it("renders the overview, audit log and investigations for an operator, with the evidence caveat", async () => {
    loaded.mockResolvedValue(ok(stats));
    render(await AdminPage());

    expect(requested().pathname).toBe("/api/v2/admin/stats");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Operations");
    expect(screen.getByRole("region", { name: "Audit log stub" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Investigations stub" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Your dashboard" })).toHaveAttribute("href", "/dashboard");
    expect(screen.getByText(/IBM does not sign job results/)).toBeInTheDocument();
  });

  it("shows a non-operator the admin notice and none of the operator tools", async () => {
    loaded.mockResolvedValue({ state: "denied", status: 403 });
    render(await AdminPage());

    expect(screen.getByText(/Admins only/)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Audit log stub" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Investigations stub" })).not.toBeInTheDocument();
  });
});
