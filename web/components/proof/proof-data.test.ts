import { describe, expect, it } from "vitest";

import { isObject, parseJson, stringifyLossless } from "@/lib/verify/json";
import { verifyReceiptText } from "@/lib/verify/verify";

import {
  browserSignatureState,
  buildEvidence,
  EVIDENCE_FORMAT,
  evidenceFileName,
  extractReceiptId,
  failedOnIssueTime,
  findDisagreements,
  fromPlain,
  humanDuration,
  parseEntries,
  payloadView,
  receiptTree,
  SCRIPT_URL,
  serverSignatureState,
  toVerifyKeys,
  truncateMiddle,
} from "./proof-data";
import { BAD_SIGNATURE, keys, serverVerdict, vector } from "./test-utils";

const verifyKeys = toVerifyKeys(keys);
const verified = (name: string) => verifyReceiptText(vector(name).text, verifyKeys);

describe("display helpers", () => {
  it("truncates the middle of long values only", () => {
    expect(truncateMiddle("short")).toBe("short");
    expect(truncateMiddle("a".repeat(40), 6, 4)).toBe("aaaaaa…aaaa");
  });

  it.each([
    [0, "under 1 s"],
    [0.4, "under 1 s"],
    [59, "59 s"],
    [200, "3 min 20 s"],
    [3_900, "1 h 5 min"],
    [90_000, "1 d 1 h"],
    [86_400, "1 d"],
  ])("formats %s seconds as %s", (seconds, text) => {
    expect(humanDuration(seconds)).toBe(text);
  });

  it("pulls a receipt ID out of what people paste", () => {
    expect(extractReceiptId("  3JGdISaLMR84RtF1 ")).toBe("3JGdISaLMR84RtF1");
    expect(extractReceiptId("https://example.com/verify/3JGdISaLMR84RtF1?x=1#top")).toBe("3JGdISaLMR84RtF1");
    expect(extractReceiptId("3JGdISaLMR84RtF")).toBeNull();
    expect(extractReceiptId("../../etc/passwd/xxxx")).toBeNull();
    expect(extractReceiptId("")).toBeNull();
  });

  it("parses entries as lines or a JSON array, keeping lines that merely start with a bracket", () => {
    expect(parseEntries("alice\n\n  bob \r\ncarol\n")).toEqual(["alice", "  bob ", "carol"]);
    expect(parseEntries('["alice","bob"]')).toEqual(["alice", "bob"]);
    expect(parseEntries("[VIP] Alice\nBob")).toEqual(["[VIP] Alice", "Bob"]);
    expect(parseEntries("[1, 2]")).toEqual(["[1, 2]"]);
  });
});

describe("payload view", () => {
  it("reads the verified payload of a vector", () => {
    const view = payloadView(verified("password with commitment").payload);
    expect(view).toMatchObject({ kind: "password", version: "qpg-receipt/2", receiptId: "hHxivlxc4bcfsTRa" });
    expect(view?.commitment).toMatch(/^[0-9a-f]{128}$/);
    expect(view?.provenance.sources.length).toBeGreaterThan(0);
  });

  it("never throws on a payload whose unchecked fields are malformed", () => {
    const view = payloadView({
      version: "qpg-receipt/2", receipt_id: 7, kind: "password", key_id: "x", issued_at: "soon", entropy_bits: "many",
      commitment: 5, provenance: { sources: ["a", 3], quantum: "yes", ibm_jobs: [1, { backend: 4 }, { job_id: "j" }],
                                   health: { a: 1, b: "pass" } },
      details: [],
    });
    expect(view).toMatchObject({ receiptId: "", issuedAt: null, entropyBits: null, commitment: null, details: {} });
    expect(view?.provenance).toEqual({
      sources: ["a"], quantum: false, quantumBytes: null, mixedWith: null,
      health: [{ name: "a", outcome: "unknown" }, { name: "b", outcome: "pass" }],
      ibmJobs: [{ backend: null, jobId: null, mode: null }, { backend: null, jobId: "j", mode: null }],
    });
    expect(payloadView(null)).toBeNull();
  });
});

describe("key set conversion", () => {
  it("omits optional fields that are absent instead of passing undefined", () => {
    const converted = toVerifyKeys({ keys: [{ key_id: "k", ed25519: "e", "ml-dsa-65": "m" }] });
    expect(Object.keys(converted.keys[0] ?? {})).toEqual(["key_id", "ed25519", "ml-dsa-65"]);
    expect(toVerifyKeys({ keys: [{ key_id: "k", ed25519: "e", "ml-dsa-65": "m", status: "revoked", revoked_at: 5 }] })
      .keys[0]).toMatchObject({ status: "revoked", revoked_at: 5 });
  });
});

describe("browser and server comparison", () => {
  it("reports no disagreement when both say valid", () => {
    const browser = verified("password with commitment");
    const out = findDisagreements({ browser, view: payloadView(browser.payload), server: { status: "ok", data: serverVerdict() },
                                    canonicalMatch: true, expectedId: "hHxivlxc4bcfsTRa" });
    expect(out).toEqual([]);
  });

  it("flags a verdict, signature, canonical-bytes and receipt-ID disagreement", () => {
    const browser = verified("password with commitment");
    const out = findDisagreements({ browser, view: payloadView(browser.payload),
                                    server: { status: "ok", data: serverVerdict(BAD_SIGNATURE) }, canonicalMatch: false,
                                    expectedId: "someOtherReceipt" });
    expect(out.join("\n")).toMatch(/different receipt ID/);
    expect(out.join("\n")).toMatch(/browser says the receipt is valid; the server says invalid/);
    expect(out.join("\n")).toMatch(/Ed25519 signature: your browser says valid; the server says invalid/);
    expect(out.join("\n")).toMatch(/ML-DSA-65 signature/);
    expect(out.join("\n")).toMatch(/canonical bytes differ/);
  });

  it("ignores a server that did not answer, and signatures the server never evaluated", () => {
    const browser = verified("winner edited");
    const base = { browser, view: payloadView(browser.payload), canonicalMatch: null, expectedId: undefined };
    expect(findDisagreements({ ...base, server: { status: "error", message: "down", httpStatus: 500 } })).toEqual([]);
    expect(findDisagreements({ ...base, server: { status: "idle" } })).toEqual([]);
    const unknownKey = serverVerdict({ valid: false, reason: "unknown_key", signatures: { ed25519: false, "ml-dsa-65": false } });
    expect(serverSignatureState(unknownKey, "ed25519")).toBe("skip");
    expect(findDisagreements({ ...base, server: { status: "ok", data: unknownKey } })).toEqual([]);
  });

  it("distinguishes failed signatures from checks that never ran", () => {
    expect(browserSignatureState(verified("password with commitment"), "ml-dsa-65")).toBe("pass");
    expect(browserSignatureState(verified("winner edited"), "ed25519")).toBe("fail");
    expect(browserSignatureState(verifyReceiptText("nope", verifyKeys), "ed25519")).toBe("skip");
  });
});

describe("evidence export", () => {
  it("keeps only the receipt fields, so a private salt can never be exported", () => {
    const doc = parseJson(vector("password with commitment").text);
    if (!isObject(doc)) throw new Error("vector is not an object");
    doc.salt = "PRIVATE-SALT-VALUE";
    doc.extra = "unrelated";
    const tree = receiptTree(stringifyLossless(doc));
    expect(isObject(tree) && Object.keys(tree).sort()).toEqual(["algorithms", "payload", "signatures"]);
    expect(stringifyLossless(tree ?? null)).not.toContain("PRIVATE-SALT-VALUE");
    expect(receiptTree("not json")).toBeNull();
    expect(receiptTree('{"a":1}')).toBeNull();
  });

  it("round-trips: the export verifies again, with 256.0 intact", () => {
    const c = vector("random bytes");
    const browser = verifyReceiptText(c.text, verifyKeys);
    const text = buildEvidence({ receiptText: c.text, keys, browser, server: null, exportedAt: new Date("2026-10-18T10:00:00Z") });
    expect(text).not.toBeNull();
    const doc = parseJson(text ?? "");
    expect(isObject(doc) && doc.format).toBe(EVIDENCE_FORMAT);
    expect(text).toContain('"exported_at": "2026-10-18T10:00:00.000Z"');
    expect(text).toContain('"entropy_bits": 256.0');
    expect(text).toContain('"server_verdict": null');
    const again = verifyReceiptText(text ?? "", verifyKeys);
    expect(again.valid).toBe(true);
    expect(again.canonical).toBe(c.canonical);
    expect(isObject(doc) && doc.canonical_payload).toBe(c.canonical);
  });

  it("includes the checks and the server verdict, without the server's copy of the payload", () => {
    const c = vector("draw run response");
    const browser = verifyReceiptText(c.text, verifyKeys);
    const verdict = serverVerdict({ draw: { draw_id: "d", status: "done", draws_by_same_owner_over_same_entries: 1,
                                            draws_by_anyone_over_same_entries: 1, committed_seconds_before_run: 0.5 },
                                    payload: { kind: "draw" } });
    const text = buildEvidence({ receiptText: c.text, keys, browser, server: verdict, exportedAt: new Date(0) }) ?? "";
    const doc = parseJson(text);
    if (!isObject(doc) || !isObject(doc.server_verdict)) throw new Error("no server verdict");
    expect(Object.keys(doc.server_verdict)).not.toContain("payload");
    expect(text).toContain('"committed_seconds_before_run": 0.5');
    expect(text).toContain('"id": "ed25519"');
    expect(verifyReceiptText(text, verifyKeys, { entries: c.entries ?? [] }).valid).toBe(true);
  });

  it("converts plain data without losing structure or emitting NaN", () => {
    expect(stringifyLossless(fromPlain({ a: [1, 2.5, "x", null, true], b: { c: undefined, d: Number.NaN }, e: 1e21 })))
      .toBe('{"a":[1,2.5,"x",null,true],"b":{"d":null},"e":1e+21}');
  });
});

describe("shell-safe names and links", () => {
  it("names the evidence file after a well-formed receipt ID only", () => {
    expect(evidenceFileName("3JGdISaLMR84RtF1")).toBe("evidence-3JGdISaLMR84RtF1.json");
    for (const hostile of ["x; rm -rf ~", "$(reboot)AAAAAAAAAA", "../../etc/passwd", "a b", "", "3JGdISaLMR84RtF1\n"]) {
      expect(evidenceFileName(hostile)).toBe("evidence-receipt.json");
    }
  });

  it("points the offline script at the branch the docs use", () => {
    expect(SCRIPT_URL).toBe("https://github.com/ahmadhashimi/quantum-password-generator/blob/v2/backend/scripts/verify_receipt.py");
  });

  it("recognises a failure caused by the issue time and no other", () => {
    expect(failedOnIssueTime(verified("winner edited"))).toBe(false);
    expect(failedOnIssueTime(verified("password with commitment"))).toBe(false);
    const future = verifyReceiptText(vector("password with commitment").text, verifyKeys, { now: 1_000 });
    expect(future.valid).toBe(false);
    expect(failedOnIssueTime(future)).toBe(true);
  });
});
