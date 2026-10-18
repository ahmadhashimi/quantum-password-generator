import { sha256 } from "@noble/hashes/sha2.js";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { formatUnix } from "@/lib/format";
import { b64urlEncode, concat, toHex } from "@/lib/verify/encoding";

import { KeySetPanel } from "./KeySetPanel";

/** A key entry with a correct key_id: test bytes, not real key material. */
function keyEntry(fill: number, extra: Record<string, unknown> = {}) {
  const ed = new Uint8Array(32).fill(fill);
  const ml = new Uint8Array(1952).fill(fill + 1);
  return {
    key_id: toHex(sha256(concat(ed, ml))).slice(0, 16),
    ed25519: b64urlEncode(ed),
    "ml-dsa-65": b64urlEncode(ml),
    ...extra,
  };
}

const json = (body: unknown, status = 200): Response =>
  ({ ok: status < 400, status, headers: new Headers({ "x-request-id": "req-1" }), json: async () => body }) as Response;

const spyFetch = (impl: () => Response) => vi.spyOn(globalThis, "fetch").mockImplementation(async () => impl());

describe("KeySetPanel", () => {
  afterEach(() => vi.restoreAllMocks());

  it("fetches the key set from /.well-known with no-store and shows each key", async () => {
    const active = keyEntry(1, { status: "active" });
    const spy = spyFetch(() => json({ algorithms: ["ed25519", "ml-dsa-65"], keys: [active] }));
    render(<KeySetPanel />);

    expect(screen.getByText("Loading the key set")).toBeInTheDocument();
    expect(await screen.findByText(active.key_id)).toBeInTheDocument();

    const [url, init] = spy.mock.calls[0] ?? [];
    expect(String(url)).toBe("/.well-known/quantumpass-keys.json");
    expect(init?.cache).toBe("no-store");

    const key = screen.getByRole("listitem");
    expect(within(key).getByText("Active")).toBeInTheDocument();
    expect(within(key).getByText("43 base64url characters")).toBeInTheDocument();
    expect(within(key).getByText("32 bytes")).toBeInTheDocument();
    expect(within(key).getByText("2,603 base64url characters")).toBeInTheDocument();
    expect(within(key).getByText("1,952 bytes")).toBeInTheDocument();
    expect(within(key).getByText(/Key ID matches SHA-256 of the two public keys/)).toBeInTheDocument();
    expect(screen.getByText(/Algorithms: ed25519 \+ ml-dsa-65/)).toBeInTheDocument();
    expect(screen.queryByText("A signing key has been revoked")).not.toBeInTheDocument();
  });

  it("warns when a key_id does not match the published public keys", async () => {
    const mislabelled = { ...keyEntry(2, { status: "active" }), key_id: "0000000000000000" };
    spyFetch(() => json({ keys: [mislabelled] }));
    render(<KeySetPanel />);
    expect(await screen.findByText(/Key ID does not match SHA-256 of the two public keys/)).toBeInTheDocument();
    expect(screen.queryByText(/Key ID matches/)).not.toBeInTheDocument();
  });

  it("flags a revoked key with its revocation time, and shows retired keys as retired", async () => {
    const revokedAt = 1_792_000_000;
    const revoked = keyEntry(3, { status: "revoked", revoked_at: revokedAt });
    const retired = keyEntry(5, { status: "retired" });
    spyFetch(() => json({ keys: [revoked, retired] }));
    render(<KeySetPanel />);

    const items = await screen.findAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0] as HTMLElement).getByText("Revoked")).toBeInTheDocument();
    expect(within(items[0] as HTMLElement).getByText(formatUnix(revokedAt))).toBeInTheDocument();
    expect(within(items[1] as HTMLElement).getByText("Retired")).toBeInTheDocument();

    const callout = screen.getByText("A signing key has been revoked").closest("div") as HTMLElement;
    expect(callout).toHaveTextContent(revoked.key_id);
    expect(callout).not.toHaveTextContent(retired.key_id);
    expect(callout).toHaveTextContent("Receipts issued before it stay valid");
  });

  it("flags an entry with malformed base64url instead of throwing", async () => {
    const broken = { ...keyEntry(7, { status: "active" }), ed25519: "not base64url!" };
    spyFetch(() => json({ keys: [broken] }));
    render(<KeySetPanel />);
    expect(await screen.findByText("Not valid base64url")).toBeInTheDocument();
    expect(screen.getByText(/Key ID does not match/)).toBeInTheDocument();
  });

  it("shows an error and reloads on request", async () => {
    let calls = 0;
    const spy = spyFetch(() => (++calls === 1 ? json({ detail: "Service unavailable" }, 503) : json({ keys: [keyEntry(9)] })));
    render(<KeySetPanel />);

    expect(await screen.findByRole("alert")).toHaveTextContent("The key set could not be loaded");
    expect(screen.getByRole("alert")).toHaveTextContent("Service unavailable");

    fireEvent.click(screen.getByRole("button", { name: /Reload/ }));
    await waitFor(() => expect(screen.getByRole("listitem")).toBeInTheDocument());
    expect(spy).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps the Reload button focusable while it reloads, and ignores a second click", async () => {
    let release: (r: Response) => void = () => undefined;
    let calls = 0;
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      calls += 1;
      return calls === 1 ? Promise.resolve(json({ keys: [keyEntry(3)] })) : new Promise<Response>((r) => { release = r; });
    });
    render(<KeySetPanel />);
    await screen.findByRole("listitem");

    const reload = screen.getByRole("button", { name: /Reload/ });
    reload.focus();
    fireEvent.click(reload);
    expect(reload).toHaveAttribute("aria-disabled", "true");
    expect(reload).not.toBeDisabled();
    expect(reload).toHaveFocus();
    fireEvent.click(reload);
    expect(spy).toHaveBeenCalledTimes(2);

    release(json({ keys: [keyEntry(3)] }));
    await waitFor(() => expect(screen.getByRole("listitem")).toBeInTheDocument());
    expect(reload).toHaveAttribute("aria-disabled", "false");
  });

  it("treats a response of the wrong shape as an error", async () => {
    spyFetch(() => json({ nothing: true }));
    render(<KeySetPanel />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Unexpected response from the server");
  });
});
