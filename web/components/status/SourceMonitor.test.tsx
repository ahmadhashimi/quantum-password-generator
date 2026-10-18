import { act, fireEvent, render, screen, within } from "@testing-library/react";

import type { EntropyStatus, ProviderStatus } from "@/lib/api/schemas";

import { SourceMonitor } from "./SourceMonitor";
import { POLL_MS } from "./useSourceStatus";

const T0 = 1_792_304_938;

const LFD: ProviderStatus = { name: "lfd", quantum: true, configured: true, available: true, state: "ok", last_success_at: T0 - 90,
              error: false };
const ANU_COOLDOWN: ProviderStatus = { name: "anu", quantum: true, configured: true, available: false, state: "cooldown",
                       last_success_at: null, error: true };
const IBM_HARDWARE: ProviderStatus = { name: "ibm_quantum", quantum: true, configured: true, available: true, mode: "hardware",
                       pool_bytes: 8_128, last_harvest_at: T0 - 3_600, jobs_last_24h: 1, error: false };
const IBM_SIMULATOR: ProviderStatus = { name: "ibm_simulator", quantum: true, configured: true, available: true, mode: "simulator",
                        pool_bytes: 4_096, last_harvest_at: T0 - 600, jobs_last_24h: 2, error: false };

const status = (over: Partial<EntropyStatus> = {}): EntropyStatus => ({
  quantum_available: true, fallback: "os_csprng", providers: [LFD], checked_at: T0, ...over,
});

/** A minimal Response: the client only reads ok, status, headers and json(), and this stays clear of stream timers. */
const json = (body: unknown, init: { status?: number } = {}): Response => {
  const status = init.status ?? 200;
  return { ok: status < 400, status, headers: new Headers({ "x-request-id": "req-1" }), json: async () => body } as Response;
};

type Handler = () => Response | Promise<Response>;

/** Routes the monitor's two requests; `statusHandler` can change between polls. */
function mockApi(statusHandler: Handler) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url === "/api/v2/health") return json({ status: "ok", version: "2.1.0" });
    if (url === "/api/v2/entropy/status") return statusHandler();
    throw new Error(`unexpected request to ${url}`);
  });
}

const statusCalls = (spy: ReturnType<typeof mockApi>) =>
  spy.mock.calls.filter(([input]) => String(input) === "/api/v2/entropy/status");

const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

const defineHidden = (hidden: boolean) =>
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });

function setHidden(hidden: boolean) {
  defineHidden(hidden);
  document.dispatchEvent(new Event("visibilitychange"));
}

async function renderMonitor(statusHandler: Handler) {
  const spy = mockApi(statusHandler);
  render(<SourceMonitor />);
  await flush();
  return spy;
}

describe("SourceMonitor", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: T0 * 1000 });
  });
  afterEach(() => {
    defineHidden(false);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("shows a loading state before the first response", () => {
    mockApi(() => new Promise<Response>(() => undefined));
    render(<SourceMonitor />);
    expect(screen.getByText("Loading source status")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Refreshing/ })).toHaveAttribute("aria-disabled", "true");
  });

  it("shows the fallback banner when no quantum source is available", async () => {
    await renderMonitor(() => json(status({ quantum_available: false, providers: [{ ...ANU_COOLDOWN, error: false }] })));
    expect(screen.getByText(/Fallback in use: results come from the OS CSPRNG only and are labelled not quantum/))
      .toBeInTheDocument();
    expect(screen.queryByText("Quantum source available")).not.toBeInTheDocument();
  });

  it("shows quantum availability and lists only sources that are available", async () => {
    await renderMonitor(() => json(status({ providers: [IBM_HARDWARE, ANU_COOLDOWN, LFD] })));
    const banner = screen.getByText("Quantum source available").closest("div") as HTMLElement;
    expect(banner).toHaveTextContent("Available now: IBM Quantum, LfD QRNG.");
    expect(banner).toHaveTextContent("Not available: ANU QRNG.");
    expect(screen.queryByText(/Fallback in use/)).not.toBeInTheDocument();
  });

  it("never labels a source that is not available as contributing or in use", async () => {
    await renderMonitor(() => json(status({ providers: [ANU_COOLDOWN, LFD] })));
    const anu = screen.getByRole("article", { name: "ANU QRNG" });
    expect(within(anu).getByText("Cooldown")).toBeInTheDocument();
    expect(within(anu).getByText("Not available")).toBeInTheDocument();
    expect(anu).not.toHaveTextContent(/contribut|in use|active|available now/i);
    expect(within(anu).getByText("Yes")).toBeInTheDocument(); // the coarse error flag, no raw message

    const lfd = screen.getByRole("article", { name: "LfD QRNG" });
    expect(within(lfd).getByText("Quantum")).toBeInTheDocument();
    expect(within(lfd).getByText("Available now")).toBeInTheDocument();
    expect(lfd).not.toHaveTextContent(/contribut/i);
  });

  it("labels the IBM simulator as not quantum even when the server flags it quantum", async () => {
    await renderMonitor(() => json(status({ quantum_available: false, providers: [IBM_SIMULATOR] })));
    const card = screen.getByRole("article", { name: "IBM simulator (not quantum)" });
    expect(within(card).getByText("Classical (simulator)")).toBeInTheDocument();
    expect(within(card).getByText("Simulator: not quantum")).toBeInTheDocument();
    expect(card).toHaveTextContent("classical pseudo-randomness");
    expect(within(card).queryByText("Quantum")).not.toBeInTheDocument();
    expect(screen.getByText(/Fallback in use/)).toBeInTheDocument();
    expect(screen.getByText(/The IBM simulator is classical/)).toBeInTheDocument();
  });

  it("shows IBM hardware mode, pool level in bytes and seeds, and jobs in the last 24 hours", async () => {
    await renderMonitor(() => json(status({ providers: [IBM_HARDWARE] })));
    const card = screen.getByRole("article", { name: "IBM Quantum" });
    expect(within(card).getByText("Hardware")).toBeInTheDocument();
    expect(card).toHaveTextContent("Only signed-in users draw from it, within a daily quota");
    expect(within(card).getByText(/8,128 bytes/)).toBeInTheDocument();
    expect(within(card).getByText("127 seeds of 64 bytes")).toBeInTheDocument();
    expect(within(card).getByText("Jobs in last 24 h").nextSibling).toHaveTextContent("1");
    expect(within(card).getByText("Last harvest")).toBeInTheDocument();
    expect(within(card).getByText("1 h ago")).toBeInTheDocument();
    expect(within(card).getByText("2026-10-18 05:28:58 UTC")).toBeInTheDocument();
  });

  it("shows the last success as relative and absolute UTC time", async () => {
    await renderMonitor(() => json(status()));
    const card = screen.getByRole("article", { name: "LfD QRNG" });
    expect(within(card).getByText("Last success")).toBeInTheDocument();
    expect(within(card).getByText("2 min ago")).toBeInTheDocument();
    expect(within(card).getByText("2026-10-18 06:27:28 UTC")).toBeInTheDocument();
  });

  it("states that availability is telemetry, shows the API version and checked time", async () => {
    await renderMonitor(() => json(status()));
    expect(screen.getByText(/Availability is live telemetry, not evidence of a source's contribution to a past receipt/))
      .toBeInTheDocument();
    expect(screen.getByText("2.1.0")).toBeInTheDocument();
    expect(screen.getByText(/Health check passed/)).toBeInTheDocument();
    expect(screen.getByText(/Checked just now/)).toBeInTheDocument();
    expect(screen.getByText(/2026-10-18 06:28:58 UTC/)).toBeInTheDocument();
  });

  it("requests same-origin with cache: no-store", async () => {
    const spy = await renderMonitor(() => json(status()));
    const urls = spy.mock.calls.map(([input]) => String(input)).sort();
    expect(urls).toEqual(["/api/v2/entropy/status", "/api/v2/health"]);
    for (const [, init] of spy.mock.calls) {
      expect(init?.cache).toBe("no-store");
      expect(init?.credentials).toBe("same-origin");
    }
  });

  it("polls every 30 seconds, still with no-store", async () => {
    const spy = await renderMonitor(() => json(status()));
    expect(statusCalls(spy)).toHaveLength(1);
    await advance(POLL_MS - 1);
    expect(statusCalls(spy)).toHaveLength(1);
    await advance(1);
    expect(statusCalls(spy)).toHaveLength(2);
    await advance(POLL_MS);
    expect(statusCalls(spy)).toHaveLength(3);
    for (const [, init] of spy.mock.calls) expect(init?.cache).toBe("no-store");
  });

  it("pauses while the document is hidden and catches up when it is visible again", async () => {
    const spy = await renderMonitor(() => json(status()));
    setHidden(true);
    await advance(POLL_MS * 4);
    expect(statusCalls(spy)).toHaveLength(1);

    setHidden(false);
    await flush();
    expect(statusCalls(spy)).toHaveLength(2);
    await advance(POLL_MS);
    expect(statusCalls(spy)).toHaveLength(3);
  });

  it("refreshes on demand", async () => {
    const spy = await renderMonitor(() => json(status()));
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await flush();
    expect(statusCalls(spy)).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Refresh" })).toHaveAttribute("aria-disabled", "false");
  });

  it("ignores a second refresh click while one is in flight and keeps the button focusable", async () => {
    let release: (r: Response) => void = () => undefined;
    let calls = 0;
    const spy = await renderMonitor(() => (++calls === 1 ? json(status()) : new Promise<Response>((r) => { release = r; })));
    const button = screen.getByRole("button", { name: "Refresh" });
    button.focus();
    fireEvent.click(button);
    await flush();
    expect(statusCalls(spy)).toHaveLength(2);

    const busy = screen.getByRole("button", { name: /Refreshing/ });
    expect(busy).toHaveFocus();
    fireEvent.click(busy);
    await flush();
    expect(statusCalls(spy)).toHaveLength(2);

    release(json(status()));
    await flush();
    expect(screen.getByRole("button", { name: "Refresh" })).toHaveAttribute("aria-disabled", "false");
  });

  it("keeps the last result on screen when a refresh fails and says how old it is", async () => {
    let calls = 0;
    await renderMonitor(() => (++calls === 1 ? json(status()) : json({ detail: "boom" }, { status: 502 })));
    await advance(POLL_MS);
    const alert = screen.getByText("Could not refresh").closest("div") as HTMLElement;
    expect(alert).toHaveTextContent("boom");
    expect(alert).toHaveTextContent("Showing the last result, checked just now");
    expect(screen.getByRole("article", { name: "LfD QRNG" })).toBeInTheDocument();

    await advance(120_000); // 150 s after the last good response
    expect(alert).toHaveTextContent("checked 3 min ago");
    expect(screen.getByText(/Checked 3 min ago/)).toBeInTheDocument();
  });

  it("shows an error with a retry when nothing has loaded yet", async () => {
    let calls = 0;
    const spy = await renderMonitor(() => (++calls === 1 ? json({ detail: "down" }, { status: 503 }) : json(status())));
    expect(screen.getByRole("alert")).toHaveTextContent("Source status is unavailable");
    expect(screen.getByRole("alert")).toHaveTextContent("down");
    expect(screen.getByText("Not checked yet")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await flush();
    expect(statusCalls(spy)).toHaveLength(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("Quantum source available")).toBeInTheDocument();
  });

  it("stops polling when it unmounts", async () => {
    const spy = mockApi(() => json(status()));
    const { unmount } = render(<SourceMonitor />);
    await flush();
    unmount();
    await advance(POLL_MS * 3);
    expect(statusCalls(spy)).toHaveLength(1);
  });
});
