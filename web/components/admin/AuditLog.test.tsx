import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import type { AuditEvent, AuditVerify } from "@/lib/api/schemas";

import { AuditLog, PAGE_SIZE } from "./AuditLog";

const hash = (n: number): string => n.toString(16).padStart(64, "0");

const event = (seq: number, over: Partial<AuditEvent> = {}): AuditEvent => ({
  seq,
  ts: "2026-10-18T06:28:58.681639+00:00",
  actor: "dev_local",
  action: "draw.commit",
  target: `target-${seq}`,
  details: { winners: 2 },
  prev_hash: hash(seq - 1),
  hash: hash(seq),
  ...over,
});

const range = (from: number, to: number): AuditEvent[] =>
  Array.from({ length: to - from + 1 }, (_, i) => event(from + i));
const desc = (from: number, to: number): AuditEvent[] => range(from, to).reverse();

const json = (body: unknown, status = 200): Response =>
  ({ ok: status < 400, status, headers: new Headers({ "x-request-id": "req-1" }), json: async () => body }) as Response;

/** `before` is 0 for the first (newest) page. */
type Routes = { audit: (before: number) => Response | Promise<Response>; verify?: () => Response | Promise<Response> };

function mockApi({ audit, verify }: Routes) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = new URL(String(input), "http://localhost");
    if (url.pathname === "/api/v2/admin/audit") return audit(Number(url.searchParams.get("before") ?? 0));
    if (url.pathname === "/api/v2/admin/audit/verify" && verify) return verify();
    throw new Error(`unexpected request to ${String(input)}`);
  });
}

const urls = (spy: ReturnType<typeof mockApi>): string[] => spy.mock.calls.map(([input]) => String(input));

const VERIFIED: AuditVerify = { ok: true, events: 4, first_bad_seq: null, head: hash(4) };

describe("AuditLog", () => {
  afterEach(() => vi.restoreAllMocks());

  it("loads the first page without caching and renders every column", async () => {
    const spy = mockApi({ audit: () => json({ events: [event(1, { actor: "system", action: "key.loaded", target: null,
                                                                  details: {} }), event(2)] }) });
    render(<AuditLog />);

    expect(await screen.findByRole("table", { name: "Audit log entries by sequence number" })).toBeInTheDocument();
    expect(urls(spy)).toEqual([`/api/v2/admin/audit?order=desc&limit=${PAGE_SIZE}`]);
    expect(spy.mock.calls[0]?.[1]).toMatchObject({ cache: "no-store", method: "GET" });

    const rows = screen.getAllByRole("row");
    expect(rows).toHaveLength(3);
    expect(within(rows[1]!).getByText("key.loaded")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("system")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("draw.commit")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("target-2")).toBeInTheDocument();
    expect(within(rows[2]!).getByText('{"winners":2}')).toBeInTheDocument();
    expect(screen.getByText(/2 entries loaded, oldest entry reached/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("pages back with before=<oldest loaded seq> and appends until a short page reaches the oldest entry", async () => {
    const spy = mockApi({
      audit: (before) => json({ events: before === 0 ? desc(4, PAGE_SIZE + 3) : desc(1, 3) }),
    });
    render(<AuditLog />);

    const more = await screen.findByRole("button", { name: "Load more" });
    expect(screen.getAllByRole("row")).toHaveLength(PAGE_SIZE + 1);
    fireEvent.click(more);

    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(PAGE_SIZE + 3 + 1));
    expect(urls(spy)).toEqual([
      `/api/v2/admin/audit?order=desc&limit=${PAGE_SIZE}`,
      `/api/v2/admin/audit?order=desc&before=4&limit=${PAGE_SIZE}`,
    ]);
    expect(screen.getByText(`${PAGE_SIZE + 3} entries loaded, oldest entry reached`)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("keeps the loaded entries and reports an error when a later page fails", async () => {
    mockApi({
      audit: (before) => (before === 0 ? json({ events: desc(1, PAGE_SIZE) })
                                      : json({ detail: "Database is busy" }, 503)),
    });
    render(<AuditLog />);

    fireEvent.click(await screen.findByRole("button", { name: "Load more" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Database is busy");
    expect(screen.getAllByRole("row")).toHaveLength(PAGE_SIZE + 1);
    expect(screen.getByRole("button", { name: "Load more" })).toBeEnabled();
  });

  it("shows an error with a retry when the first page fails", async () => {
    let fail = true;
    mockApi({ audit: () => (fail ? json({ detail: "Admins only" }, 403) : json({ events: [event(1)] })) });
    render(<AuditLog />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Admins only");
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("table")).toBeInTheDocument();
  });

  it("truncates long details and expands them with the entry hashes", async () => {
    const details = { note: "x".repeat(120) };
    mockApi({ audit: () => json({ events: [event(7, { details })] }) });
    render(<AuditLog />);

    const full = JSON.stringify(details);
    const expand = await screen.findByRole("button", { name: /Show all/ });
    expect(expand).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(full)).not.toBeInTheDocument();
    expect(screen.getByText(/…$/)).toBeInTheDocument();

    fireEvent.click(expand);
    expect(screen.getByText(full)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Show less/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(hash(7))).toBeInTheDocument();
    expect(screen.getByText(hash(6))).toBeInTheDocument();
  });

  it("verifies the hash chain on demand and shows the head hash", async () => {
    const spy = mockApi({ audit: () => json({ events: [event(1)] }), verify: () => json(VERIFIED) });
    render(<AuditLog />);
    await screen.findByRole("table");
    expect(urls(spy)).not.toContain("/api/v2/admin/audit/verify");

    fireEvent.click(screen.getByRole("button", { name: /Verify hash chain/ }));

    const result = (await screen.findByText("Hash chain intact: 4 events")).closest<HTMLElement>('[role="status"]');
    expect(result).not.toBeNull();
    expect(result).toHaveTextContent("Hash chain intact: 4 events");
    expect(result).toHaveTextContent(hash(4));
    expect(result).toHaveTextContent("not anchored outside this server");
    expect(urls(spy)).toContain("/api/v2/admin/audit/verify");
    const call = spy.mock.calls.find(([input]) => String(input) === "/api/v2/admin/audit/verify");
    expect(call?.[1]).toMatchObject({ cache: "no-store" });
    expect(screen.queryByText("First bad entry")).not.toBeInTheDocument();
  });

  it("reports a broken chain and flags the first bad entry", async () => {
    mockApi({
      audit: () => json({ events: [event(1), event(2), event(3)] }),
      verify: () => json({ ok: false, events: 3, first_bad_seq: 2, head: hash(3) } satisfies AuditVerify),
    });
    render(<AuditLog />);
    await screen.findByRole("table");

    fireEvent.click(screen.getByRole("button", { name: /Verify hash chain/ }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Hash chain broken at entry 2");
    expect(alert).toHaveTextContent("cannot be trusted");
    const flagged = screen.getByText("First bad entry").closest("tr");
    expect(flagged).not.toBeNull();
    expect(within(flagged!).getByText("target-2")).toBeInTheDocument();
    expect(screen.getAllByText("First bad entry")).toHaveLength(1);
  });

  it("explains a failed verification instead of claiming anything", async () => {
    mockApi({ audit: () => json({ events: [event(1)] }), verify: () => json({ detail: "Verification timed out" }, 500) });
    render(<AuditLog />);
    await screen.findByRole("table");

    fireEvent.click(screen.getByRole("button", { name: /Verify hash chain/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Verification timed out");
    expect(screen.queryByText(/Hash chain intact/)).not.toBeInTheDocument();
  });
});
