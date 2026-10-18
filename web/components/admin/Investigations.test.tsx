import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import type { DrawRunResponse, Investigations as InvestigationList } from "@/lib/api/schemas";

import { Investigations } from "./Investigations";

const DRAW_ID = "0GWyxha4hPAsX-8S";
const COMMIT_ID = "ynv6nW9YW7N-1JCy";
const RESULT_ID = "KTJbG0BDxMMUxbkN";

const draw = (over: Partial<InvestigationList["draws"][number]> = {}): InvestigationList["draws"][number] => ({
  draw_id: DRAW_ID,
  owner_id: "user_123",
  title: "Launch giveaway",
  entries_count: 4,
  winners: 2,
  commit_receipt_id: COMMIT_ID,
  created_at: "2026-10-18T06:28:58+00:00",
  run_started_at: "2026-10-18T06:30:00+00:00",
  seed_provenance: { sources: ["lfd", "os_csprng"], quantum: true },
  ...over,
});

const RUN: DrawRunResponse = {
  winners: [{ index: 3, entry: "dave" }, { index: 2, entry: "carol" }],
  verify_url: `/verify/${RESULT_ID}`,
  receipt: {
    payload: {
      version: "qpg-receipt/2", receipt_id: RESULT_ID, issued_at: 1_792_304_938, kind: "draw", key_id: "9d4cc626d6b265c6",
      provenance: { sources: ["lfd"], quantum: true, quantum_bytes: 64, mixed_with: "os_csprng" },
      entropy_bits: null, commitment: null, result: null, details: {},
    },
    signatures: { ed25519: "sig" },
  },
};

const json = (body: unknown, status = 200): Response =>
  ({ ok: status < 400, status, headers: new Headers({ "x-request-id": "req-1" }), json: async () => body }) as Response;

interface Deferred { promise: Promise<Response>; resolve: (r: Response) => void }
function deferred(): Deferred {
  let resolve!: (r: Response) => void;
  const promise = new Promise<Response>((r) => { resolve = r; });
  return { promise, resolve };
}

function mockApi(draws: InvestigationList["draws"], complete: () => Response | Promise<Response>) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    if (url === "/api/v2/admin/draws/investigate") return json({ draws });
    if (url === `/api/v2/admin/draws/${DRAW_ID}/complete` && init?.method === "POST") return complete();
    throw new Error(`unexpected request to ${init?.method ?? "GET"} ${url}`);
  });
}

const posts = (spy: ReturnType<typeof mockApi>) => spy.mock.calls.filter(([, init]) => init?.method === "POST");

async function openConfirm() {
  fireEvent.click(await screen.findByRole("button", { name: /Complete from saved seed/ }));
  return screen.getByRole("group", { name: /Confirm completing Launch giveaway/ });
}

describe("Investigations", () => {
  afterEach(() => vi.restoreAllMocks());

  it("lists interrupted draws with owner, seed provenance and the commit receipt link", async () => {
    const spy = mockApi([draw()], () => json(RUN));
    render(<Investigations />);

    expect(await screen.findByRole("heading", { name: "Launch giveaway" })).toBeInTheDocument();
    expect(spy.mock.calls[0]?.[1]).toMatchObject({ cache: "no-store", method: "GET" });
    expect(screen.getByText("user_123")).toBeInTheDocument();
    expect(screen.getByText("4 entries, 2 winners")).toBeInTheDocument();
    expect(screen.getByText(/Seed sources \(operator-asserted\)/)).toBeInTheDocument();
    expect(screen.getByText(/LfD QRNG, OS CSPRNG/)).toBeInTheDocument();
    expect(screen.getByText("Reported quantum")).toBeInTheDocument();
    const commit = screen.getByRole("link", { name: COMMIT_ID });
    expect(commit).toHaveAttribute("href", `/verify/${COMMIT_ID}`);
    expect(posts(spy)).toHaveLength(0);
  });

  it("never labels a non-quantum seed as quantum and tolerates missing provenance", async () => {
    mockApi([draw({ seed_provenance: { sources: ["os_csprng"], quantum: false } }),
             draw({ draw_id: "AAAAAAAAAAAAAAAA", seed_provenance: null })], () => json(RUN));
    render(<Investigations />);

    expect(await screen.findByText("Not quantum")).toBeInTheDocument();
    expect(screen.queryByText("Reported quantum")).not.toBeInTheDocument();
    expect(screen.getByText("No provenance recorded")).toBeInTheDocument();
  });

  it("shows an empty state when nothing needs an operator", async () => {
    mockApi([], () => json(RUN));
    render(<Investigations />);
    expect(await screen.findByText("Nothing to investigate")).toBeInTheDocument();
  });

  it("asks for confirmation first and does not post until it is given", async () => {
    const spy = mockApi([draw()], () => json(RUN));
    render(<Investigations />);

    const group = await openConfirm();
    expect(group).toHaveTextContent("recomputes the winners from the seed saved");
    expect(group).toHaveTextContent("No new randomness");
    expect(group).toHaveTextContent("draw.admin_complete");
    expect(posts(spy)).toHaveLength(0);

    fireEvent.click(within(group).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Complete from saved seed/ })).toHaveFocus();
    expect(posts(spy)).toHaveLength(0);
  });

  it("posts exactly once even when confirm is clicked repeatedly, then shows winners and the result receipt", async () => {
    const pending = deferred();
    const spy = mockApi([draw()], () => pending.promise);
    render(<Investigations />);

    const group = await openConfirm();
    const confirm = within(group).getByRole("button", { name: "Confirm and publish" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    expect(await within(screen.getByRole("group")).findByRole("button", { name: "Publishing..." })).toBeDisabled();
    expect(posts(spy)).toHaveLength(1);

    pending.resolve(json(RUN));
    const done = await screen.findByRole("status");
    expect(done).toHaveTextContent("Result published");
    expect(done).toHaveTextContent("dave");
    expect(done).toHaveTextContent("carol");
    expect(done).toHaveTextContent("nothing was re-rolled");
    expect(within(done).getByRole("link", { name: /Open the result receipt/ })).toHaveAttribute("href", `/verify/${RESULT_ID}`);

    const [url, init] = posts(spy)[0]!;
    expect(String(url)).toBe(`/api/v2/admin/draws/${DRAW_ID}/complete`);
    expect(init).toMatchObject({ method: "POST", cache: "no-store" });
    expect(init?.body).toBeUndefined();
    expect(posts(spy)).toHaveLength(1);
  });

  it("explains a 409 conflict and reloads the list instead of retrying", async () => {
    let listed = [draw()];
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/api/v2/admin/draws/investigate") return json({ draws: listed });
      if (init?.method === "POST") {
        return json({ detail: "Draw is 'completed', only 'needs_investigation' draws can be completed" }, 409);
      }
      throw new Error(`unexpected request to ${url}`);
    });
    render(<Investigations />);

    const group = await openConfirm();
    fireEvent.click(within(group).getByRole("button", { name: "Confirm and publish" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("This draw can no longer be completed");
    expect(alert).toHaveTextContent("only 'needs_investigation' draws can be completed");
    expect(within(alert).queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();

    listed = [];
    fireEvent.click(within(alert).getByRole("button", { name: "Reload the list" }));
    expect(await screen.findByText("Nothing to investigate")).toBeInTheDocument();
    expect(spy.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });

  it("offers a retry after a server error, which goes back to the confirmation step", async () => {
    const spy = mockApi([draw()], () => json({ detail: "Entropy pool unavailable" }, 500));
    render(<Investigations />);

    const group = await openConfirm();
    fireEvent.click(within(group).getByRole("button", { name: "Confirm and publish" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not complete the draw");
    expect(alert).toHaveTextContent("Entropy pool unavailable");
    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));

    expect(screen.getByRole("group", { name: /Confirm completing/ })).toBeInTheDocument();
    await waitFor(() => expect(posts(spy)).toHaveLength(1));
  });
});
