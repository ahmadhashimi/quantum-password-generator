import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { entriesHash, normalizeEntries } from "@/lib/verify/draws";

import { DrawFlow } from "./DrawFlow";

const auth = vi.hoisted(() => ({
  value: { enabled: false, loaded: true, signedIn: false, getToken: async (): Promise<string | null> => null },
}));
vi.mock("@/lib/auth/client", () => ({ useAppAuth: () => auth.value }));

const COMMIT_ID = "ynv6nW9YW7N-1JCy";
const RESULT_ID = "KTJbG0BDxMMUxbkN";
const DRAW_ID = "0GWyxha4hPAsX-8S";
const SEED = "e62f0f97ba20bcd3df4b3052b8f45cf7c4ac7aaa94bf4658d28e8411624357e99c66bd813e3a0aa9744e6f429e421b427ba2c49917fdb372421cc82d3e00b94d";

function receipt(kind: string, id: string, details: Record<string, unknown>, result: unknown, provenance: object) {
  return {
    payload: {
      version: "qpg-receipt/2", receipt_id: id, issued_at: 1792304938, kind, key_id: "9d4cc626d6b265c6",
      evidence: { integrity: "hybrid-signature:ed25519+ml-dsa-65", provenance: "operator-asserted", quantum_evidence: "none" },
      provenance, entropy_bits: null, commitment: null, result, details,
    },
    signatures: { ed25519: "sig", "ml-dsa-65": "sig" },
    algorithms: ["ed25519", "ml-dsa-65"],
  };
}

function commitBody(entries: string[], winners: number, overrides: Record<string, unknown> = {}) {
  const sorted = normalizeEntries(entries);
  return {
    draw_id: DRAW_ID,
    commit_receipt: receipt("draw_commit", COMMIT_ID, {
      draw_id: DRAW_ID, title: "Launch giveaway", entries_count: sorted.length, entries_sha256: entriesHash(sorted),
      winners, ...overrides,
    }, null, { sources: [], quantum: false, quantum_bytes: 0, mixed_with: "none" }),
    commit_url: `/verify/${COMMIT_ID}`,
  };
}

function runBody(extra: Record<string, unknown> = {}) {
  const winners = [{ index: 3, entry: "dave" }, { index: 2, entry: "carol" }];
  return {
    winners,
    receipt: receipt("draw", RESULT_ID, { draw_id: DRAW_ID, commit_receipt_id: COMMIT_ID, winners: 2 },
                     { winners, selection: { algorithm: "qpg-select/1", seed_hex: SEED } },
                     { sources: ["lfd"], quantum: true, quantum_bytes: 64, mixed_with: "os_csprng",
                       health: { sp800_90b: "pass" } }),
    verify_url: `/verify/${RESULT_ID}`,
    ...extra,
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const ENTRIES = ["alice", "bob", "carol", "dave"];

function fill({ title = "Launch giveaway", entries = ENTRIES.join("\n"), winners = "2" } = {}) {
  fireEvent.change(screen.getByLabelText("Draw title"), { target: { value: title } });
  fireEvent.change(screen.getByLabelText("Entries"), { target: { value: entries } });
  fireEvent.change(screen.getByLabelText("Winners"), { target: { value: winners } });
}

const commitButton = () => screen.getByRole("button", { name: /commit entries/i });
const keyOf = (call: unknown[]) => (call[1] as RequestInit & { headers: Record<string, string> }).headers["idempotency-key"];
const init = (call: unknown[]) => call[1] as RequestInit;

beforeEach(() => {
  auth.value = { enabled: false, loaded: true, signedIn: false, getToken: async () => null };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("commit form", () => {
  it("previews the count, ignoring empty lines", () => {
    render(<DrawFlow />);
    fill({ entries: "alice\n\n  bob  \n\ncarol\n" });
    const preview = screen.getByLabelText("Entry preview");
    expect(preview).toHaveTextContent(/3\s+entries will be committed/);
    expect(within(preview).getByText("Empty lines ignored").nextSibling).toHaveTextContent("3");
    expect(commitButton()).toBeEnabled();
  });

  it("detects duplicates ignoring case and blocks submit", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<DrawFlow />);
    fill({ entries: "Alice\nbob\nalice\ncarol", winners: "1" });
    expect(screen.getByText("1 duplicate found")).toBeInTheDocument();
    expect(screen.getByText(/on lines 1, 3/)).toBeInTheDocument();
    expect(commitButton()).toBeDisabled();
    expect(screen.getAllByText(/remove the duplicate entries/i).length).toBeGreaterThan(0);

    fireEvent.submit(commitButton().closest("form") as HTMLFormElement);
    expect(fetchSpy).not.toHaveBeenCalled();

    fill({ entries: "Alice\nbob\ncarol", winners: "1" });
    expect(screen.queryByText("1 duplicate found")).not.toBeInTheDocument();
    expect(commitButton()).toBeEnabled();
  });

  it("requires a link-free title and a valid winner count", () => {
    render(<DrawFlow />);
    fill({ title: "Win at https://evil.example", winners: "1" });
    expect(screen.getByText("Titles can't contain links.")).toBeInTheDocument();
    expect(commitButton()).toBeDisabled();

    fill({ title: "Fine", winners: "9" });
    expect(screen.getByText("Enter a whole number from 1 to 4.")).toBeInTheDocument();
    expect(commitButton()).toBeDisabled();

    fill({ title: "Fine", winners: "4" });
    expect(commitButton()).toBeEnabled();
  });
});

describe("idempotency", () => {
  it("reuses the commit key on retry after a network error and issues a new one when the entries change", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    render(<DrawFlow />);
    fill();

    fireEvent.click(commitButton());
    expect(await screen.findByText(/couldn't reach the server/i)).toBeInTheDocument();
    expect(screen.getByText(/can't create a second draw/i)).toBeInTheDocument();

    fireEvent.click(commitButton());
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    await screen.findByText(/couldn't reach the server/i);
    expect(keyOf(spy.mock.calls[0] as unknown[])).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(keyOf(spy.mock.calls[1] as unknown[])).toBe(keyOf(spy.mock.calls[0] as unknown[]));

    fill({ entries: [...ENTRIES, "erin"].join("\n") });
    fireEvent.click(commitButton());
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(3));
    expect(keyOf(spy.mock.calls[2] as unknown[])).not.toBe(keyOf(spy.mock.calls[0] as unknown[]));
  });

  it("keeps one run key per draw across retries and conflicts", async () => {
    const spy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json(commitBody(ENTRIES, 2)))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(json(runBody()));
    render(<DrawFlow />);
    fill();
    fireEvent.click(commitButton());
    fireEvent.click(await screen.findByRole("button", { name: /run the draw/i }));
    expect(await screen.findByText(/a draw can only run once/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /run the draw/i }));
    await screen.findByRole("heading", { name: "Winners" });

    const [commitCall, firstRun, secondRun] = spy.mock.calls as unknown[][];
    expect(keyOf(firstRun as unknown[])).toBe(keyOf(secondRun as unknown[]));
    expect(keyOf(firstRun as unknown[])).not.toBe(keyOf(commitCall as unknown[]));
  });
});

describe("requests", () => {
  it("never caches: commit and run go same-origin with cache no-store and the draw id in the path", async () => {
    const spy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json(commitBody(ENTRIES, 2)))
      .mockResolvedValueOnce(json(runBody()));
    render(<DrawFlow />);
    fill();
    fireEvent.click(commitButton());
    fireEvent.click(await screen.findByRole("button", { name: /run the draw/i }));
    await screen.findByRole("heading", { name: "Winners" });

    expect(spy).toHaveBeenCalledTimes(2);
    const [commitCall, runCall] = spy.mock.calls as unknown[][];
    expect(commitCall?.[0]).toBe("/api/v2/draws");
    expect(init(commitCall as unknown[])).toMatchObject({ method: "POST", cache: "no-store", credentials: "same-origin" });
    expect(JSON.parse(init(commitCall as unknown[]).body as string)).toEqual({
      title: "Launch giveaway", entries: ENTRIES, winners: 2,
    });
    expect(runCall?.[0]).toBe(`/api/v2/draws/${DRAW_ID}/run`);
    expect(init(runCall as unknown[])).toMatchObject({ method: "POST", cache: "no-store", credentials: "same-origin" });
  });

  it("sends the Clerk token when signed in", async () => {
    auth.value = { enabled: true, loaded: true, signedIn: true, getToken: async () => "tok_123" };
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(json(commitBody(ENTRIES, 2)));
    render(<DrawFlow />);
    fill();
    fireEvent.click(commitButton());
    await screen.findByText("Entries committed");
    expect((init(spy.mock.calls[0] as unknown[]).headers as Record<string, string>).authorization).toBe("Bearer tok_123");
  });
});

describe("full flow", () => {
  it("commits, shows the fingerprint and share link, runs, and shows winners with the published seed", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json(commitBody(ENTRIES, 2)))
      .mockResolvedValueOnce(json(runBody()));
    render(<DrawFlow />);
    fill();
    fireEvent.click(commitButton());

    expect(await screen.findByText("Entries committed")).toBeInTheDocument();
    expect(screen.getByText("Matches what you submitted")).toBeInTheDocument();
    expect(screen.getByText(DRAW_ID)).toBeInTheDocument();
    expect(screen.getByLabelText("Entries fingerprint (SHA-256 of the sorted list)"))
      .toHaveTextContent(entriesHash(normalizeEntries(ENTRIES)));
    expect(screen.getByLabelText("Commitment link")).toHaveTextContent(`${window.location.origin}/verify/${COMMIT_ID}`);
    expect(screen.getByRole("listitem", { current: "step" })).toHaveTextContent("Run");

    fireEvent.click(screen.getByRole("button", { name: /run the draw/i }));
    expect(await screen.findByRole("heading", { name: "Winners" })).toBeInTheDocument();
    const winners = screen.getAllByRole("listitem").filter((li) => /Winner \d:/.test(li.textContent ?? ""));
    expect(winners.map((li) => li.textContent)).toEqual([
      expect.stringContaining("dave"), expect.stringContaining("carol"),
    ]);
    expect(screen.getByLabelText("Result link")).toHaveTextContent(`${window.location.origin}/verify/${RESULT_ID}`);
    expect(screen.getByLabelText("Published selection seed (qpg-select/1)")).toHaveTextContent(SEED);
    expect(screen.getByRole("link", { name: /open the verification page/i })).toHaveAttribute("href", `/verify/${RESULT_ID}`);
    expect(screen.getByText(/not that a quantum device independently attested the entropy/i)).toBeInTheDocument();
    expect(screen.getByText("None available")).toBeInTheDocument();
    expect(screen.queryByText(/replayed/i)).not.toBeInTheDocument();
  });

  it("warns when the signed commitment does not match what was submitted", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(json(commitBody(ENTRIES, 2, { entries_sha256: "0".repeat(64) })));
    render(<DrawFlow />);
    fill();
    fireEvent.click(commitButton());
    expect(await screen.findByText("The signed commitment doesn't match your list")).toBeInTheDocument();
    expect(screen.queryByText("Matches what you submitted")).not.toBeInTheDocument();
  });

  it("labels a replayed result", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json(commitBody(ENTRIES, 2)))
      .mockResolvedValueOnce(json(runBody({ replayed: true })));
    render(<DrawFlow />);
    fill();
    fireEvent.click(commitButton());
    fireEvent.click(await screen.findByRole("button", { name: /run the draw/i }));
    expect(await screen.findByText("Result already published (replayed)")).toBeInTheDocument();
  });

  it("starts over with an empty form and a fresh commit key", async () => {
    const spy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json(commitBody(ENTRIES, 2)))
      .mockResolvedValueOnce(json(commitBody(ENTRIES, 2)));
    render(<DrawFlow />);
    fill();
    fireEvent.click(commitButton());
    fireEvent.click(await screen.findByRole("button", { name: /start over/i }));

    expect(screen.getByLabelText("Draw title")).toHaveValue("");
    expect(screen.getByLabelText("Entries")).toHaveValue("");
    fill();
    fireEvent.click(commitButton());
    await screen.findByText("Entries committed");
    expect(keyOf(spy.mock.calls[1] as unknown[])).not.toBe(keyOf(spy.mock.calls[0] as unknown[]));
  });
});

describe("run errors", () => {
  async function toRunStep() {
    render(<DrawFlow />);
    fill();
    fireEvent.click(commitButton());
    return await screen.findByRole("button", { name: /run the draw/i });
  }

  it("explains a draw interrupted after its seed was saved, and lets you check again with the same key", async () => {
    const spy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json(commitBody(ENTRIES, 2)))
      .mockResolvedValueOnce(json({ detail: "This draw is being finalised; its outcome is already fixed. Retry shortly.",
                                    status: "seeded" }, 409))
      .mockResolvedValueOnce(json(runBody({ replayed: true })));
    fireEvent.click(await toRunStep());

    expect(await screen.findByText(
      "This draw was interrupted after its seed was saved. It will not be re-run with new randomness; an operator " +
      "will complete it from the saved seed.",
    )).toBeInTheDocument();
    expect(screen.getByText(/Server message: This draw is being finalised/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Winners" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    expect(await screen.findByText("Result already published (replayed)")).toBeInTheDocument();
    expect(keyOf(spy.mock.calls[2] as unknown[])).toBe(keyOf(spy.mock.calls[1] as unknown[]));
  });

  it("explains a draw that needs an operator", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json(commitBody(ENTRIES, 2)))
      .mockResolvedValueOnce(json({ detail: "This draw was interrupted after its outcome was fixed and is awaiting an " +
                                            "operator to publish it. It will not be re-run.",
                                    status: "needs_investigation" }, 409));
    fireEvent.click(await toRunStep());
    expect(await screen.findByText("This draw needs operator attention")).toBeInTheDocument();
    expect(screen.getByText(/an operator will publish it from the saved seed/i)).toBeInTheDocument();
  });

  it("asks you to sign in on 401 when sign-in is configured", async () => {
    auth.value = { enabled: true, loaded: true, signedIn: true, getToken: async () => "tok" };
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json(commitBody(ENTRIES, 2)))
      .mockResolvedValueOnce(json({ detail: "Sign in to run draws" }, 401));
    fireEvent.click(await toRunStep());
    expect(await screen.findByText("Sign in to run draws")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", expect.stringContaining("/sign-in"));
  });

  it("shows the server's message on 401 without a sign-in link when sign-in is not configured", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(json({ detail: "Sign in to run draws" }, 401));
    render(<DrawFlow />);
    fill();
    fireEvent.click(commitButton());
    expect(await screen.findByText(/Sign in to run draws\. This deployment has no sign-in configured/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Sign in" })).not.toBeInTheDocument();
  });

  it("invites signed-out visitors to sign in before they commit", () => {
    auth.value = { enabled: true, loaded: true, signedIn: false, getToken: async () => null };
    render(<DrawFlow />);
    expect(screen.getByText("Sign in to commit a draw")).toBeInTheDocument();
  });

  it("surfaces server validation errors from the commit", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      json({ detail: [{ msg: "Value error, Duplicate entry: 'straße'" }] }, 422),
    );
    render(<DrawFlow />);
    fill();
    fireEvent.click(commitButton());
    expect(await screen.findByText(/Duplicate entry/)).toBeInTheDocument();
    expect(commitButton()).toBeEnabled();
  });
});
