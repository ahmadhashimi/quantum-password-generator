import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { isObject, parseJson, stringifyLossless } from "@/lib/verify/json";
import { verifyReceiptText } from "@/lib/verify/verify";

import { LogCard } from "./LogCard";
import { ProofReport } from "./ProofReport";
import { toVerifyKeys } from "./proof-data";
import { BAD_SIGNATURE, bareReceipt, keys, serverVerdict, vector } from "./test-utils";

const download = vi.hoisted(() => vi.fn());
vi.mock("@/lib/download", () => ({ downloadText: download }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  download.mockReset();
});

const idle = { status: "idle" } as const;

function renderReport(text: string, props: Partial<Parameters<typeof ProofReport>[0]> = {}) {
  return render(<ProofReport receiptText={text} keys={keys} server={idle} material={idle} {...props} />);
}

const sigRow = (name: RegExp) => screen.getByRole("row", { name });

describe("verdict and integrity", () => {
  it("shows a valid receipt with both signatures valid, rendered from the verified payload", () => {
    const c = vector("password with commitment");
    renderReport(c.text);
    expect(screen.getByRole("heading", { name: "Valid receipt" })).toBeInTheDocument();
    expect(within(sigRow(/Ed25519/)).getByText("Valid")).toBeInTheDocument();
    expect(within(sigRow(/ML-DSA-65/)).getByText("Valid")).toBeInTheDocument();
    expect(screen.getByText("hHxivlxc4bcfsTRa")).toBeInTheDocument();
    expect(screen.getByText("qpg-receipt/2")).toBeInTheDocument();
    expect(screen.getByText("Password")).toBeInTheDocument();
    expect(screen.getByText(/UTC$/)).toBeInTheDocument();
    expect(screen.getByText("Verified in your browser")).toBeInTheDocument();
    expect(screen.getAllByText("Server says").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Not asked")).toHaveLength(3); // the server panel and its two signature cells
    expect(screen.queryByText("Unverified")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows an edited receipt as invalid and flags every claim below it as unverified", () => {
    renderReport(vector("winner edited").text);
    expect(screen.getByRole("heading", { name: "Invalid receipt" })).toBeInTheDocument();
    expect(within(sigRow(/Ed25519/)).getByText("Invalid")).toBeInTheDocument();
    expect(screen.getByText("Nothing below is authenticated")).toBeInTheDocument();
    expect(screen.getAllByText("Unverified").length).toBeGreaterThanOrEqual(3);
    expect(screen.getByRole("button", { name: "Check entry list" })).toBeDisabled();
  });

  it("explains a receipt that fails before any payload can be trusted, without rendering claims", () => {
    renderReport(vector("validly signed, forbidden evidence claim").text);
    expect(screen.getByRole("heading", { name: "Invalid receipt" })).toBeInTheDocument();
    expect(screen.getAllByText(/evidence block does not match/).length).toBeGreaterThan(0);
    expect(within(sigRow(/Ed25519/)).getByText("Not checked")).toBeInTheDocument();
    expect(screen.queryByText("Provenance (operator-asserted)")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Download evidence/ })).not.toBeInTheDocument();
  });

  it("does not crash on text that is not JSON", () => {
    renderReport("<html>not a receipt</html>");
    expect(screen.getByRole("heading", { name: "Invalid receipt" })).toBeInTheDocument();
    expect(screen.getByText("Receipt is well-formed JSON")).toBeInTheDocument();
  });

  it("explains a duplicate-key document and a float rewritten from 256.0 to 256", () => {
    renderReport(vector("duplicate key").text);
    expect(screen.getAllByText(/Duplicate key/).length).toBeGreaterThan(0);
    cleanup();
    renderReport(vector("float rewritten").text);
    expect(screen.getByRole("heading", { name: "Invalid receipt" })).toBeInTheDocument();
    expect(within(sigRow(/Ed25519/)).getByText("Invalid")).toBeInTheDocument();
  });

  it("copies the receipt ID", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderReport(vector("password with commitment").text);
    fireEvent.click(screen.getByRole("button", { name: "Copy receipt ID" }));
    expect(writeText).toHaveBeenCalledWith("hHxivlxc4bcfsTRa");
    expect(await screen.findByText("receipt ID copied")).toBeInTheDocument();
  });
});

describe("what the verdict claims", () => {
  const text = vector("password with commitment").text;

  it("reports integrity, provenance and quantum evidence as three separate classes next to the headline", () => {
    renderReport(text);
    const classes = within(screen.getByRole("list", { name: "Evidence classes, reported separately" }));
    expect(classes.getByText("Integrity: valid")).toBeInTheDocument();
    expect(classes.getByText("Provenance: operator-asserted")).toBeInTheDocument();
    expect(classes.getByText("Quantum evidence: none")).toBeInTheDocument();
  });

  it("does not call the provenance of an invalid receipt operator-asserted", () => {
    renderReport(vector("winner edited").text);
    const classes = within(screen.getByRole("list", { name: "Evidence classes, reported separately" }));
    expect(classes.getByText("Integrity: invalid")).toBeInTheDocument();
    expect(classes.getByText("Provenance: not authenticated")).toBeInTheDocument();
    expect(classes.queryByText("Provenance: operator-asserted")).not.toBeInTheDocument();
  });

  it("shows no classes when nothing could be read from the document", () => {
    renderReport("<html>not a receipt</html>");
    expect(screen.queryByRole("list", { name: "Evidence classes, reported separately" })).not.toBeInTheDocument();
  });

  it("says a valid result against the site's published keys rests on those keys", () => {
    renderReport(text);
    expect(screen.getByText(/under a published, unrevoked key\. That proves what this server signed/)).toBeInTheDocument();
  });

  it("does not say the key was published when it came from the file itself", () => {
    renderReport(text, { keySource: "bundled" });
    expect(screen.getByRole("heading", { name: "Valid receipt" })).toBeInTheDocument();
    expect(screen.getByText(/under the key bundled in your file/)).toBeInTheDocument();
    expect(screen.getByText(/self-consistent, not that the issuer signed it/)).toBeInTheDocument();
    expect(screen.queryByText(/under a published, unrevoked key/)).not.toBeInTheDocument();
  });

  it("suggests checking the device clock when the issue time is in the future", () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2020-01-01T00:00:00Z") });
    try {
      renderReport(text);
    } finally {
      vi.useRealTimers();
    }
    expect(screen.getByRole("heading", { name: "Invalid receipt" })).toBeInTheDocument();
    expect(screen.getAllByText(/issued_at is not a past unix time/).length).toBeGreaterThan(0);
    expect(screen.getByText(/check that your device's clock is correct/)).toBeInTheDocument();
  });

  it("does not mention the clock for a receipt that fails for another reason", () => {
    renderReport(vector("winner edited").text);
    expect(screen.queryByText(/device's clock/)).not.toBeInTheDocument();
  });
});

describe("server verdict beside the browser's", () => {
  it("shows both verdicts and no warning when they agree", () => {
    renderReport(vector("password with commitment").text, {
      server: { status: "ok", data: serverVerdict() }, material: { status: "ok", data: vector("password with commitment").canonical ?? "" },
    });
    expect(screen.getByText("The server's own verifier accepts this receipt.")).toBeInTheDocument();
    expect(screen.getByText("Server's canonical bytes match what your browser computed")).toBeInTheDocument();
    expect(screen.getByText("Present in the server-operated receipt log")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("raises a prominent alert when the server disagrees with the browser", () => {
    renderReport(vector("password with commitment").text, { server: { status: "ok", data: serverVerdict(BAD_SIGNATURE) } });
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Your browser and the server disagree");
    expect(alert).toHaveTextContent("your browser says valid; the server says invalid");
    expect(screen.getByRole("heading", { name: "Valid receipt" })).toBeInTheDocument(); // the browser's own result stands
  });

  it("raises the same alert when the server accepts a receipt the browser rejects", () => {
    renderReport(vector("winner edited").text, { server: { status: "ok", data: serverVerdict() } });
    expect(screen.getByRole("alert")).toHaveTextContent("Your browser says the receipt is invalid; the server says valid.");
  });

  it("raises an alert when the server's canonical bytes differ", () => {
    renderReport(vector("password with commitment").text, {
      server: { status: "ok", data: serverVerdict() }, material: { status: "ok", data: "{}" },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("canonical bytes differ");
  });

  it("flags a payload whose receipt ID is not the one the link asked for", () => {
    renderReport(vector("password with commitment").text, { expectedId: "AnotherReceipt01" });
    expect(screen.getByRole("alert")).toHaveTextContent("different receipt ID than the link");
  });

  it("copes with a server that is loading, unavailable or reports no log status", () => {
    const text = vector("password with commitment").text;
    const { rerender } = renderReport(text, { server: { status: "loading" } });
    expect(screen.getByText("Asking…")).toBeInTheDocument();
    rerender(<ProofReport receiptText={text} keys={keys} material={idle}
                          server={{ status: "error", message: "Request failed (500)", httpStatus: 500 }} />);
    expect(screen.getAllByText("Unavailable")).toHaveLength(3);
    expect(screen.getByText("Couldn't check")).toBeInTheDocument();
    rerender(<ProofReport receiptText={text} keys={keys} material={idle}
                          server={{ status: "ok", data: serverVerdict({ in_public_log: false }) }} />);
    expect(screen.getByText("Not found in this server's log")).toBeInTheDocument();
    expect(screen.getByText(/not an externally anchored transparency log/)).toBeInTheDocument();
  });

  it("says the log was not consulted for a locally verified document", () => {
    renderReport(vector("password with commitment").text);
    expect(screen.getByText("Not checked")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Look this receipt up by ID" })).toHaveAttribute("href", "/verify/hHxivlxc4bcfsTRa");
  });
});

describe("receipt log", () => {
  it("is titled as the server's own log, not a transparency log", () => {
    renderReport(vector("password with commitment").text);
    expect(screen.getByRole("heading", { name: "Receipt log (server-operated)" })).toBeInTheDocument();
    expect(screen.queryByText("Public log")).not.toBeInTheDocument();
  });

  it.each(["../admin", "short", "x/../../y", "3JGdISaLMR84RtF1/extra", ""])(
    "links a lookup only for a well-formed receipt ID, never for %j", (id) => {
      render(<LogCard server={idle} receiptId={id} />);
      expect(screen.queryByRole("link", { name: "Look this receipt up by ID" })).not.toBeInTheDocument();
      cleanup();
    });

  it("links a lookup, without prefetching, for a well-formed ID", () => {
    render(<LogCard server={idle} receiptId="3JGdISaLMR84RtF1" />);
    expect(screen.getByRole("link", { name: "Look this receipt up by ID" })).toHaveAttribute("href", "/verify/3JGdISaLMR84RtF1");
  });
});

describe("secret commitment", () => {
  const c = vector("password with commitment");
  const fill = (value: string, salt: string) => {
    fireEvent.change(screen.getByLabelText("Your value"), { target: { value } });
    fireEvent.change(screen.getByLabelText("Salt"), { target: { value: salt } });
    fireEvent.click(screen.getByRole("button", { name: "Check commitment" }));
  };

  it("opens the commitment locally and sends nothing", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    renderReport(c.text);
    expect(screen.getByText("Checked in your browser; nothing is sent.")).toBeInTheDocument();
    fill(c.value ?? "", c.salt ?? "");
    expect(screen.getByText("Commitment matches")).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reports a wrong value, a malformed salt and a missing value", () => {
    renderReport(c.text);
    fill(`${c.value}x`, c.salt ?? "");
    expect(screen.getByText("Commitment does not match")).toBeInTheDocument();
    fill(c.value ?? "", "not-a-salt");
    expect(screen.getByText(/43-character base64url/)).toBeInTheDocument();
    expect(screen.queryByText("Commitment does not match")).not.toBeInTheDocument();
    fill("", c.salt ?? "");
    expect(screen.getByText("Enter the value you generated.")).toBeInTheDocument();
  });

  it("keeps the value masked and uses the salt offered from a supplied file", () => {
    renderReport(c.text, { initialSalt: c.salt });
    expect(screen.getByLabelText("Your value")).toHaveAttribute("type", "password");
    expect(screen.getByLabelText("Salt")).toHaveValue(c.salt);
  });

  it("masks the salt too, and shows it only on request", () => {
    renderReport(c.text, { initialSalt: c.salt });
    const salt = screen.getByLabelText("Salt");
    expect(salt).toHaveAttribute("type", "password");
    const toggle = screen.getByRole("button", { name: "Show salt" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(toggle);
    expect(screen.getByLabelText("Salt")).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide salt" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Hide salt" }));
    expect(screen.getByLabelText("Salt")).toHaveAttribute("type", "password");
  });

  it("still checks the commitment while the salt is masked", () => {
    renderReport(c.text);
    fill(c.value ?? "", c.salt ?? "");
    expect(screen.getByLabelText("Salt")).toHaveAttribute("type", "password");
    expect(screen.getByText("Commitment matches")).toBeInTheDocument();
  });

  it("is not offered for draws", () => {
    renderReport(vector("draw commit").text);
    expect(screen.queryByLabelText("Your value")).not.toBeInTheDocument();
  });
});

describe("provenance", () => {
  const base = vector("password with commitment");
  function withProvenance(provenance: unknown): string {
    const doc = parseJson(base.text);
    if (!isObject(doc) || !isObject(doc.payload)) throw new Error("unexpected vector");
    doc.payload.provenance = parseJson(JSON.stringify(provenance));
    return stringifyLossless(doc);
  }

  it("labels sources, a simulator job and the health screening honestly", () => {
    renderReport(withProvenance({
      sources: ["ibm_simulator", "os_csprng"], quantum: false, quantum_bytes: 0, mixed_with: "os_csprng",
      ibm_jobs: [{ backend: "aer_simulator", job_id: "job-123", mode: "simulator" }],
      health: { sp800_90b_style: "pass" },
    }));
    expect(screen.getByText("IBM simulator (not quantum)")).toBeInTheDocument();
    expect(screen.getAllByText("Simulator: not quantum").length).toBeGreaterThan(0);
    expect(screen.getByText("job-123")).toBeInTheDocument();
    expect(screen.getByText("aer_simulator")).toBeInTheDocument();
    expect(screen.getByText("SP 800-90B-style RCT/APT screening (not a NIST validation)")).toBeInTheDocument();
    expect(screen.getByText("OS CSPRNG (via HKDF)")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "How sources are screened" })).toHaveAttribute("href", "/transparency#entropy");
    expect(screen.getByText("Operator-asserted", { selector: "span" })).toBeInTheDocument();
  });

  it("does not show the reported health screening as a green, verified pass", () => {
    renderReport(base.text);
    const badge = screen.getByText("pass", { selector: "span" });
    expect(badge.className).not.toMatch(/success/);
    expect(badge.className).toMatch(/text-muted/);
  });

  it("shows quantum sources as reported, with the byte count, and never claims independent evidence", () => {
    renderReport(base.text);
    expect(screen.getByText("LfD QRNG")).toBeInTheDocument();
    expect(screen.getByText("64 bytes from quantum sources")).toBeInTheDocument();
    expect(screen.getByText(/IBM does not sign job results, so quantum origin can't be independently authenticated today/))
      .toBeInTheDocument();
    expect(screen.getByText("None available", { selector: "p" })).toBeInTheDocument();
  });

  it("renders a receipt with malformed provenance instead of crashing", () => {
    renderReport(withProvenance("surprise"));
    expect(screen.getByText("Provenance (operator-asserted)")).toBeInTheDocument();
    expect(screen.getByText(/None: this receipt did not draw any randomness/)).toBeInTheDocument();
  });
});

describe("draws", () => {
  it("lists the winners and the seed of a draw result, and checks the entry list locally", () => {
    const c = vector("draw run response");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    renderReport(c.text);
    expect(screen.getByRole("heading", { name: "Draw result" })).toBeInTheDocument();
    expect(screen.getByText(/Published selection seed \(qpg-select\/1\)/)).toBeInTheDocument();
    const signed = (JSON.parse(bareReceipt(c.text)) as { payload: { result: { winners: { entry: string }[] } } })
      .payload.result.winners;
    const winners = screen.getAllByRole("listitem").filter((li) => li.textContent?.includes("position"));
    expect(winners).toHaveLength(signed.length);
    signed.forEach((w, i) => expect(winners[i]).toHaveTextContent(w.entry));

    fireEvent.change(screen.getByLabelText("Check the entry list"), { target: { value: (c.entries ?? []).join("\n") } });
    fireEvent.click(screen.getByRole("button", { name: "Check entry list" }));
    expect(screen.getByText("Entry list matches the receipt")).toBeInTheDocument();
    expect(screen.getByText("Winners recomputed from the published seed (qpg-select/1)")).toBeInTheDocument();
    expect(screen.queryByText(/Failed:/)).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fails the entry check for a different list, and says how many entries were pasted", () => {
    const c = vector("draw run, wrong entries");
    renderReport(c.text);
    fireEvent.change(screen.getByLabelText("Check the entry list"), { target: { value: (c.entries ?? []).join("\n") } });
    fireEvent.click(screen.getByRole("button", { name: "Check entry list" }));
    expect(screen.getByText(/Failed:/)).toBeInTheDocument();
    expect(screen.getByText(/You pasted 9 entries; the receipt commits to 10/)).toBeInTheDocument();
    expect(screen.queryByText("Winners recomputed from the published seed (qpg-select/1)")).not.toBeInTheDocument();
  });

  it("accepts the entry list as a JSON array", () => {
    const c = vector("draw commit");
    renderReport(c.text);
    fireEvent.change(screen.getByLabelText("Check the entry list"), { target: { value: JSON.stringify(c.entries) } });
    fireEvent.click(screen.getByRole("button", { name: "Check entry list" }));
    expect(screen.getByText("Entry list matches the receipt")).toBeInTheDocument();
  });

  it("catches a seed that does not produce the signed winners", () => {
    const c = vector("validly signed, seed does not produce winners");
    renderReport(c.text);
    expect(screen.getByRole("heading", { name: "Valid receipt" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Check the entry list"), { target: { value: (c.entries ?? []).join("\n") } });
    fireEvent.click(screen.getByRole("button", { name: "Check entry list" }));
    expect(screen.getByText("Winners recomputed from the published seed (qpg-select/1)").closest("li"))
      .toHaveTextContent(/^Failed:/);
    expect(screen.getByText("Entry list matches the receipt").closest("li")).toHaveTextContent(/^Passed:/);
  });

  it("links only well-formed receipt IDs from the server's record", () => {
    renderReport(vector("draw commit").text, {
      server: { status: "ok", data: serverVerdict({ draw: {
        draw_id: "d", status: "committed", commit_receipt_id: "../../admin", result_receipt_id: null,
        draws_by_same_owner_over_same_entries: 1, draws_by_anyone_over_same_entries: 1, committed_seconds_before_run: null,
      } }) },
    });
    expect(screen.getByText("Committed, not run yet")).toBeInTheDocument();
    expect(screen.getByText("The draw has not run yet.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Commit receipt/ })).not.toBeInTheDocument();
  });

  it("asks for at least one entry", () => {
    renderReport(vector("draw commit").text);
    fireEvent.click(screen.getByRole("button", { name: "Check entry list" }));
    expect(screen.getByText("Paste at least one entry.")).toBeInTheDocument();
  });

  it("shows the server's draw record, with re-roll counters and links that are not prefetched", () => {
    const c = vector("draw run response");
    renderReport(c.text, {
      server: { status: "ok", data: serverVerdict({ draw: {
        draw_id: "0GWyxha4hPAsX-8S", status: "done", commit_receipt_id: "uSu0tjQopFLL3THW", result_receipt_id: "IAsU65MaJQ2WhLcM",
        draws_by_same_owner_over_same_entries: 2, draws_by_anyone_over_same_entries: 3, committed_seconds_before_run: 200,
      } }) },
    });
    expect(screen.getByText("Done")).toBeInTheDocument();
    expect(screen.getByText("Re-rolls recorded: this list was drawn more than once.")).toBeInTheDocument();
    expect(screen.getByText("3 min 20 s")).toBeInTheDocument();
    expect(screen.getByText(/A server that withholds draws can understate the counts/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Commit receipt/ })).toHaveAttribute("href", "/verify/uSu0tjQopFLL3THW");
    expect(screen.getByText("Result receipt: this receipt")).toBeInTheDocument();
  });
});

describe("evidence export", () => {
  it("downloads a lossless evidence document that verifies again and never contains a supplied salt", () => {
    const c = vector("random bytes");
    const doc = parseJson(c.text);
    if (!isObject(doc)) throw new Error("unexpected vector");
    doc.salt = "PRIVATE-SALT-VALUE";
    renderReport(stringifyLossless(doc), { server: { status: "ok", data: serverVerdict() } });
    fireEvent.click(screen.getByRole("button", { name: "Download evidence (JSON)" }));
    expect(download).toHaveBeenCalledTimes(1);
    const [filename, text] = download.mock.calls[0] as [string, string];
    expect(filename).toBe("evidence-zUQaEWs2kVu2PKBa.json");
    expect(text).toContain('"format": "quantumpass-evidence/1"');
    expect(text).toContain('"entropy_bits": 256.0');
    expect(text).not.toContain("PRIVATE-SALT-VALUE");
    expect(verifyReceiptText(text, toVerifyKeys(keys)).valid).toBe(true);
    expect(screen.getByText(/Saved evidence-zUQaEWs2kVu2PKBa.json/)).toBeInTheDocument();
  });

  it("explains the offline check and links to the script and the guide", () => {
    renderReport(vector("password with commitment").text);
    expect(screen.getByText(/pip install --upgrade cryptography/)).toBeInTheDocument();
    expect(screen.getByText(/a recent release of the/)).toBeInTheDocument();
    expect(screen.getByText(/--value "YOUR VALUE" --salt "YOUR SALT"/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "verify_receipt.py on GitHub" })).toHaveAttribute(
      "href", "https://github.com/ahmadhashimi/quantum-password-generator/blob/v2/backend/scripts/verify_receipt.py");
    expect(screen.getByRole("link", { name: "Offline verification guide" })).toHaveAttribute("href", "/developers#offline");
  });

  it("names the file after the receipt ID, in the command as well as the download", () => {
    renderReport(vector("password with commitment").text);
    const commands = screen.getByText(/pip install --upgrade cryptography/).textContent ?? "";
    expect(commands).toContain("python verify_receipt.py evidence-hHxivlxc4bcfsTRa.json keys.json");
    expect(commands).not.toMatch(/[;&|`$(]\s*rm\b/);
  });

  it("works from a draw response too, and offers the entries flag for draws", () => {
    const c = vector("draw run response");
    renderReport(c.text);
    expect(screen.getByText(/--entries entries.json/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Download evidence (JSON)" }));
    const [, text] = download.mock.calls[0] as [string, string];
    expect(verifyReceiptText(text, toVerifyKeys(keys), { entries: c.entries ?? [] }).valid).toBe(true);
    expect(bareReceipt(c.text)).not.toContain("verify_url");
  });
});

describe("key information", () => {
  it("shows the key ID, its status and the transparency link", () => {
    renderReport(vector("password with commitment").text);
    expect(screen.getByText("active")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Key history and rotation" })).toHaveAttribute("href", "/transparency#keys");
    expect(screen.getByText(/Compare this key ID with a copy of the key set you trust for full independence/))
      .toBeInTheDocument();
  });

  it("warns that keys supplied in a file are not independent", () => {
    renderReport(vector("password with commitment").text, { keySource: "bundled" });
    expect(screen.getByText(/whoever made the file chose them/)).toBeInTheDocument();
  });
});
