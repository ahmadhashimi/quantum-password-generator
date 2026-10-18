import { render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";

import { AdminOverview } from "@/components/admin/AdminOverview";
import { Investigations } from "@/components/admin/Investigations";
import type { AdminStats, Me, MeReceipts } from "@/lib/api/schemas";

import { DashboardNav } from "./DashboardNav";
import { OverviewView } from "./OverviewView";
import { ReceiptsView } from "./ReceiptsView";

type Href = string | { pathname: string; query?: Record<string, string> };

/** Next's <Link> never shows `prefetch` in the DOM, so expose it to see what every link asked for. */
vi.mock("next/link", () => ({
  default: ({ href, prefetch, children, ...rest }: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
    href: Href;
    prefetch?: boolean | "auto" | null;
    children?: ReactNode;
  }) => (
    <a href={typeof href === "string" ? href : `${href.pathname}?${new URLSearchParams(href.query)}`}
       data-prefetch={String(prefetch)} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));

/** Every in-app link under `root`, which must opt out of prefetching: the pages behind them hold account data. */
function internalLinks(root: HTMLElement): HTMLAnchorElement[] {
  return [...root.querySelectorAll<HTMLAnchorElement>('a[href^="/"]')];
}

function expectNoPrefetch(root: HTMLElement, minimum: number) {
  const links = internalLinks(root);
  expect(links.length).toBeGreaterThanOrEqual(minimum);
  for (const link of links) expect(link, link.outerHTML).toHaveAttribute("data-prefetch", "false");
}

const me: Me = { id: "u", email: null, name: "Ada", is_admin: true, stats: { counts: { password: 2 }, total: 2, quantum: 1 } };

const receipts: MeReceipts = {
  next_before: "2026-10-18T06:28:58.887244+00:00",
  items: [{ receipt_id: "KTJbG0BDxMMUxbkN", kind: "password", created_at: "2026-10-18T06:28:58.887244+00:00",
            version: "qpg-receipt/2", sources: ["lfd"], quantum: true, entropy_bits: 128, key_id: "9d4cc626d6b265c6" }],
};

const stats: AdminStats = {
  users: 1, events: {}, total_events: 0, quantum_share: 0, assistant_cost_usd: 0, assistant_cost_today_usd: 0,
  daily: [], recent_users: [], draws_needing_investigation: ["0GWyxha4hPAsX-8S"],
};

describe("links in the account and operations area never prefetch", () => {
  afterEach(() => vi.restoreAllMocks());

  it("covers the sub-navigation", () => {
    const { container } = render(<DashboardNav />);
    expectNoPrefetch(container, 3);
  });

  it("covers the overview quick actions, including operations for an admin", () => {
    const { container } = render(<OverviewView me={me} />);
    expectNoPrefetch(container, 4);
    expect(screen.getByRole("link", { name: /Operations/ })).toHaveAttribute("data-prefetch", "false");
  });

  it("covers receipt links and paging", () => {
    const { container } = render(<ReceiptsView data={receipts} paged />);
    expectNoPrefetch(container, 3);
  });

  it("covers the operations overview", () => {
    const { container } = render(<AdminOverview stats={stats} />);
    expect(container.querySelector('a[href="#investigations"]')).not.toBeNull();
    expectNoPrefetch(container, 0);
  });

  it("covers the receipt links inside an interrupted draw", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true, status: 200, headers: new Headers(),
      json: async () => ({ draws: [{ draw_id: "0GWyxha4hPAsX-8S", owner_id: null, title: "Giveaway", entries_count: 3,
                                     winners: 1, commit_receipt_id: "ynv6nW9YW7N-1JCy", created_at: "2026-10-18T06:28:58+00:00",
                                     run_started_at: null, seed_provenance: null }] }),
    } as Response);
    const { container } = render(<Investigations />);

    await screen.findByRole("link", { name: "ynv6nW9YW7N-1JCy" });
    expectNoPrefetch(container, 1);
  });
});
