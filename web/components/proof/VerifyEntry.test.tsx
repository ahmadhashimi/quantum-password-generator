import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";

import { isObject, parseJson, stringifyLossless } from "@/lib/verify/json";
import { verifyReceiptText } from "@/lib/verify/verify";

import { buildEvidence, toVerifyKeys } from "./proof-data";
import { jsonResponse, keys, vector } from "./test-utils";
import { VerifyEntry } from "./VerifyEntry";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const KEYS_URL = "/.well-known/quantumpass-keys.json";
const PASTE = "Receipt, draw response or evidence export (JSON)";

let keysOk = true;
let fetchSpy: MockInstance<typeof fetch>;

beforeEach(() => {
  keysOk = true;
  fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
    String(input) === KEYS_URL && keysOk ? jsonResponse(keys) : jsonResponse({ detail: "unavailable" }, 503));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  push.mockReset();
});

const paste = (text: string) => fireEvent.change(screen.getByLabelText(PASTE), { target: { value: text } });
const verifyButton = () => screen.getByRole("button", { name: "Verify in my browser" });

describe("open by receipt ID", () => {
  const submit = (value: string) => {
    fireEvent.change(screen.getByLabelText("Receipt ID"), { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: "Open receipt" }));
  };

  it("goes to the real route for a well-formed ID", () => {
    render(<VerifyEntry />);
    submit("3JGdISaLMR84RtF1");
    expect(push).toHaveBeenCalledWith("/verify/3JGdISaLMR84RtF1");
  });

  it("accepts a pasted /verify link", () => {
    render(<VerifyEntry />);
    submit(" https://quantumpass.example/verify/3JGdISaLMR84RtF1?utm=x ");
    expect(push).toHaveBeenCalledWith("/verify/3JGdISaLMR84RtF1");
  });

  it.each(["", "short", "has spaces in it!!", "3JGdISaLMR84RtF1extra"])("rejects %j without navigating", (value) => {
    render(<VerifyEntry />);
    submit(value);
    expect(screen.getByRole("alert")).toHaveTextContent("Receipt IDs are 16 characters");
    expect(screen.getByLabelText("Receipt ID")).toHaveAttribute("aria-invalid", "true");
    expect(push).not.toHaveBeenCalled();
  });
});

describe("verify locally", () => {
  it("verifies a pasted receipt with no request except the public key set", async () => {
    render(<VerifyEntry />);
    expect(verifyButton()).toBeDisabled();
    paste(vector("password with commitment").text);
    fireEvent.click(verifyButton());

    expect(await screen.findByRole("heading", { name: "Valid receipt" })).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]?.[0])).toBe(KEYS_URL);
    expect(screen.getAllByText("Not asked").length).toBeGreaterThan(0);
    expect(screen.getByRole("region", { name: "Verification report" })).toHaveFocus();
    expect(push).not.toHaveBeenCalled();
  });

  it("verifies a draw response and checks its entries locally", async () => {
    const c = vector("draw run response");
    render(<VerifyEntry />);
    paste(c.text);
    fireEvent.click(verifyButton());
    expect(await screen.findByRole("heading", { name: "Draw result" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Check the entry list"), { target: { value: (c.entries ?? []).join("\n") } });
    fireEvent.click(screen.getByRole("button", { name: "Check entry list" }));
    expect(screen.getByText("Winners recomputed from the published seed (qpg-select/1)")).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("explains text that is not a receipt", async () => {
    render(<VerifyEntry />);
    paste("hello world");
    fireEvent.click(verifyButton());
    expect(await screen.findByRole("heading", { name: "Invalid receipt" })).toBeInTheDocument();
    expect(screen.getByText("Receipt is well-formed JSON")).toBeInTheDocument();
    expect(screen.queryByText("Provenance (operator-asserted)")).not.toBeInTheDocument();
  });

  it("rejects a tampered receipt", async () => {
    render(<VerifyEntry />);
    paste(vector("winner edited").text);
    fireEvent.click(verifyButton());
    expect(await screen.findByRole("heading", { name: "Invalid receipt" })).toBeInTheDocument();
    expect(screen.getByText("Nothing below is authenticated")).toBeInTheDocument();
  });

  it("reads an uploaded .json file in the browser and verifies it", async () => {
    const text = vector("passphrase").text;
    render(<VerifyEntry />);
    const input = screen.getByLabelText("Or choose a .json file");
    expect(input).toHaveAttribute("accept", ".json,application/json");
    fireEvent.change(input, { target: { files: [new File([text], "receipt.json", { type: "application/json" })] } });
    expect(await screen.findByRole("heading", { name: "Valid receipt" })).toBeInTheDocument();
    expect(screen.getByLabelText(PASTE)).toHaveValue(text);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("refuses an oversized file without reading it", () => {
    render(<VerifyEntry />);
    const big = new File(["x".repeat(2_000_001)], "big.json", { type: "application/json" });
    fireEvent.change(screen.getByLabelText("Or choose a .json file"), { target: { files: [big] } });
    expect(screen.getByRole("alert")).toHaveTextContent("over 2 MB");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("offers the salt from a receipt download to the commitment check, which stays local", async () => {
    const c = vector("password with commitment");
    const doc = parseJson(c.text);
    if (!isObject(doc)) throw new Error("unexpected vector");
    doc.salt = c.salt ?? "";
    render(<VerifyEntry />);
    paste(stringifyLossless(doc));
    fireEvent.click(verifyButton());
    await screen.findByRole("heading", { name: "Valid receipt" });
    expect(screen.getByLabelText("Salt")).toHaveValue(c.salt);
    fireEvent.change(screen.getByLabelText("Your value"), { target: { value: c.value } });
    fireEvent.click(screen.getByRole("button", { name: "Check commitment" }));
    expect(screen.getByText("Commitment matches")).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("also accepts the salt under the name the generation API uses", async () => {
    const c = vector("password with commitment");
    const doc = parseJson(c.text);
    if (!isObject(doc)) throw new Error("unexpected vector");
    doc.receipt_salt = c.salt ?? "";
    render(<VerifyEntry />);
    paste(stringifyLossless(doc));
    fireEvent.click(verifyButton());
    await screen.findByRole("heading", { name: "Valid receipt" });
    expect(screen.getByLabelText("Salt")).toHaveValue(c.salt);
    expect(screen.getByLabelText("Salt")).toHaveAttribute("type", "password");
  });

  it("verifies an evidence export, and reports a key set that cannot be loaded with a retry", async () => {
    const c = vector("password with commitment");
    const browser = verifyReceiptText(c.text, toVerifyKeys(keys));
    const evidence = buildEvidence({ receiptText: c.text, keys, browser, server: null, exportedAt: new Date() }) ?? "";
    keysOk = false;
    render(<VerifyEntry />);
    paste(evidence);
    fireEvent.click(verifyButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load the published key set");
    expect(screen.getByRole("alert")).toHaveTextContent("keys in the file");

    keysOk = true;
    fireEvent.click(screen.getByRole("button", { name: /Try again/ }));
    expect(await screen.findByRole("heading", { name: "Valid receipt" })).toBeInTheDocument();
    expect(screen.getByText(/The key set was fetched from the server that issued the receipt/)).toBeInTheDocument();
  });

  it("lets keys bundled in an evidence export be used, and says they are not independent", async () => {
    const c = vector("password with commitment");
    const browser = verifyReceiptText(c.text, toVerifyKeys(keys));
    const evidence = buildEvidence({ receiptText: c.text, keys, browser, server: null, exportedAt: new Date() }) ?? "";
    keysOk = false;
    render(<VerifyEntry />);
    paste(evidence);
    fireEvent.click(verifyButton());
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("tab", { name: "Keys in the file" }));
    expect(await screen.findByRole("heading", { name: "Valid receipt" })).toBeInTheDocument();
    expect(screen.getByText(/whoever made the file chose them/)).toBeInTheDocument();
    expect(screen.getByText(/self-consistent, not that the issuer signed it/)).toBeInTheDocument();
    expect(screen.queryByText(/under a published, unrevoked key/)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("clears the text and the report", async () => {
    render(<VerifyEntry />);
    paste(vector("passphrase").text);
    fireEvent.click(verifyButton());
    await screen.findByRole("heading", { name: "Valid receipt" });
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByLabelText(PASTE)).toHaveValue("");
    expect(screen.queryByRole("heading", { name: "Valid receipt" })).not.toBeInTheDocument();
  });
});
