import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProofExplorer } from "./ProofExplorer";
import { BAD_SIGNATURE, bareReceipt, jsonResponse, keys, receiptIdOf, serverVerdict, vector } from "./test-utils";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

type Handler = () => Response;

/** A fake FastAPI: the receipt, the key set, the server's verdict and its canonical bytes. */
function serve(id: string, handlers: { receipt: Handler; keys?: Handler; verify?: Handler; material?: Handler }) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const path = String(input);
    const method = init?.method ?? "GET";
    if (path === `/api/v2/receipts/${id}` && method === "GET") return handlers.receipt();
    if (path === "/.well-known/quantumpass-keys.json") return (handlers.keys ?? (() => jsonResponse(keys)))();
    if (path === "/api/v2/receipts/verify" && method === "POST") return (handlers.verify ?? (() => jsonResponse(serverVerdict())))();
    if (path === `/api/v2/receipts/${id}/verify-material`) {
      return (handlers.material ?? (() => jsonResponse({ detail: "Receipt not found" }, 404)))();
    }
    return jsonResponse({ detail: "unexpected request" }, 500);
  });
}

const receiptOf = (name: string) => {
  const c = vector(name);
  return { id: receiptIdOf(c.text), text: bareReceipt(c.text), canonical: c.canonical ?? "" };
};
const sigRow = (name: RegExp) => screen.getByRole("row", { name });

describe("ProofExplorer", () => {
  it("verifies a valid receipt in the browser and shows the server's verdict and canonical bytes beside it", async () => {
    const r = receiptOf("password with commitment");
    const fetchSpy = serve(r.id, {
      receipt: () => new Response(r.text),
      material: () => jsonResponse({ canonical_payload: r.canonical, signing_domain: "d", public_key: null, trust: "t" }),
    });
    render(<ProofExplorer receiptId={r.id} />);
    expect(screen.getByText("Verifying the receipt in your browser…")).toBeInTheDocument();

    expect(await screen.findByRole("heading", { name: "Valid receipt" })).toBeInTheDocument();
    expect(within(sigRow(/Ed25519/)).getAllByText("Valid")).toHaveLength(2); // browser and server
    expect(within(sigRow(/ML-DSA-65/)).getAllByText("Valid")).toHaveLength(2);
    expect(await screen.findByText("The server's own verifier accepts this receipt.")).toBeInTheDocument();
    expect(await screen.findByText("Server's canonical bytes match what your browser computed")).toBeInTheDocument();
    expect(await screen.findByText("Present in the server-operated receipt log")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("Verification finished.")).toBeInTheDocument();

    // Every request is same-origin and uncached; the receipt is read as text, the verdict is asked for by ID only.
    const calls = fetchSpy.mock.calls.map(([url, init]) => ({ url: String(url), init: init as RequestInit }));
    expect(calls.map((c) => c.url).sort()).toEqual([
      "/.well-known/quantumpass-keys.json", `/api/v2/receipts/${r.id}`, `/api/v2/receipts/${r.id}/verify-material`,
      "/api/v2/receipts/verify",
    ].sort());
    for (const c of calls) expect(c.init).toMatchObject({ cache: "no-store", credentials: "same-origin" });
    const post = calls.find((c) => c.init.method === "POST");
    expect(JSON.parse(String(post?.init.body))).toEqual({ receipt_id: r.id });
  });

  it("shows an edited receipt as invalid in both columns, with no disagreement when the server agrees", async () => {
    const r = receiptOf("winner edited");
    serve(r.id, { receipt: () => new Response(r.text), verify: () => jsonResponse(serverVerdict(BAD_SIGNATURE)) });
    render(<ProofExplorer receiptId={r.id} />);
    expect(await screen.findByRole("heading", { name: "Invalid receipt" })).toBeInTheDocument();
    expect(await screen.findByText("A signature does not verify over the receipt.")).toBeInTheDocument();
    expect(within(sigRow(/Ed25519/)).getAllByText("Invalid")).toHaveLength(2);
    expect(within(sigRow(/ML-DSA-65/)).getAllByText("Invalid")).toHaveLength(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("Nothing below is authenticated")).toBeInTheDocument();
  });

  it("raises a prominent alert, and still trusts its own verification, when the server disagrees", async () => {
    const r = receiptOf("winner edited");
    serve(r.id, { receipt: () => new Response(r.text) }); // the default server verdict says "valid"
    render(<ProofExplorer receiptId={r.id} />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Your browser and the server disagree");
    expect(alert).toHaveTextContent("Your browser says the receipt is invalid; the server says valid.");
    expect(screen.getByRole("heading", { name: "Invalid receipt" })).toBeInTheDocument();
  });

  it("flags a server whose canonical bytes differ from the browser's", async () => {
    const r = receiptOf("password with commitment");
    serve(r.id, { receipt: () => new Response(r.text), material: () => jsonResponse({ canonical_payload: "{}" }) });
    render(<ProofExplorer receiptId={r.id} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("canonical bytes differ");
  });

  it("flags a receipt served under a different ID than the link", async () => {
    const r = receiptOf("password with commitment");
    const other = "AnotherReceipt01";
    serve(other, { receipt: () => new Response(r.text) });
    render(<ProofExplorer receiptId={other} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("different receipt ID than the link");
  });

  it("renders the browser's verdict when the server's verifier and canonical bytes are unavailable", async () => {
    const r = receiptOf("password with commitment");
    serve(r.id, { receipt: () => new Response(r.text), verify: () => jsonResponse({ detail: "boom" }, 500) });
    render(<ProofExplorer receiptId={r.id} />);
    expect(await screen.findByRole("heading", { name: "Valid receipt" })).toBeInTheDocument();
    expect((await screen.findAllByText("Unavailable")).length).toBeGreaterThan(0);
    expect(await screen.findByText("Couldn't check")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("verifies a draw result served as a bare receipt and shows the server's draw record", async () => {
    const r = receiptOf("draw run response");
    serve(r.id, {
      receipt: () => new Response(r.text),
      verify: () => jsonResponse(serverVerdict({ draw: {
        draw_id: "0GWyxha4hPAsX-8S", status: "done", commit_receipt_id: "uSu0tjQopFLL3THW", result_receipt_id: r.id,
        draws_by_same_owner_over_same_entries: 1, draws_by_anyone_over_same_entries: 1, committed_seconds_before_run: 0,
      } })),
    });
    render(<ProofExplorer receiptId={r.id} />);
    expect(await screen.findByRole("heading", { name: "Draw result" })).toBeInTheDocument();
    expect(await screen.findByText("No re-rolls recorded over this entry list.")).toBeInTheDocument();
    expect(screen.getByText("under 1 s")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Commit receipt/ })).toHaveAttribute("href", "/verify/uSu0tjQopFLL3THW");
  });

  it("reports a stored receipt that no longer fits the schema as invalid, not as a load failure", async () => {
    const r = receiptOf("password with commitment");
    const doc = JSON.parse(r.text) as { payload: Record<string, unknown> };
    delete doc.payload.provenance; // the API's own response schema would reject this; the browser verifier explains it
    serve(r.id, { receipt: () => new Response(JSON.stringify(doc)) });
    render(<ProofExplorer receiptId={r.id} />);
    expect(await screen.findByRole("heading", { name: "Invalid receipt" })).toBeInTheDocument();
    expect(screen.getAllByText(/missing fields: provenance/).length).toBeGreaterThan(0);
    expect(screen.queryByText("Couldn't load this receipt")).not.toBeInTheDocument();
  });

  it("shows a not-found state for a receipt the server does not have", async () => {
    serve("0000000000000000", { receipt: () => jsonResponse({ detail: "Receipt not found" }, 404) });
    render(<ProofExplorer receiptId="0000000000000000" />);
    expect(await screen.findByRole("heading", { name: "Receipt not found" })).toBeInTheDocument();
    expect(screen.getByText("0000000000000000")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Verify a receipt file" })).toHaveAttribute("href", "/verify");
    expect(screen.getByText(/pruned after 30 days/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Valid receipt" })).not.toBeInTheDocument();
  });

  it("offers a retry when the key set cannot be loaded, then verifies", async () => {
    const r = receiptOf("password with commitment");
    let keysUp = false;
    serve(r.id, {
      receipt: () => new Response(r.text),
      keys: () => (keysUp ? jsonResponse(keys) : jsonResponse({ detail: "down" }, 503)),
    });
    render(<ProofExplorer receiptId={r.id} />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn't load the published key set");
    expect(screen.queryByRole("heading", { name: "Valid receipt" })).not.toBeInTheDocument();
    keysUp = true;
    fireEvent.click(screen.getByRole("button", { name: /Try again/ }));
    expect(await screen.findByRole("heading", { name: "Valid receipt" })).toBeInTheDocument();
  });

  it("reports a server error and a non-JSON body instead of crashing", async () => {
    const r = receiptOf("password with commitment");
    serve(r.id, { receipt: () => jsonResponse({ detail: "database unavailable" }, 503) });
    const { unmount } = render(<ProofExplorer receiptId={r.id} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("database unavailable");
    unmount();
    vi.restoreAllMocks();
    serve(r.id, { receipt: () => new Response("<html>proxy error</html>") });
    render(<ProofExplorer receiptId={r.id} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("isn't JSON");
  });
});
