/**
 * Pure helpers for the Proof Explorer: typed views of the browser-verified payload, display formatting, the checks
 * the browser and server disagree on, and the evidence export. Nothing here touches the network or the DOM.
 */
import { repoFile } from "@/components/docs/repo";
import type { Tone } from "@/components/ui";
import type { KeySet as ApiKeySet, VerifyResult } from "@/lib/api/schemas";
import { RECEIPT_ID } from "@/lib/format";
import { isObject, JsonNumber, type JsonValue, parseJson, type PlainJson, stringifyLossless } from "@/lib/verify/json";
import type { BrowserVerification, KeySet as VerifyKeySet } from "@/lib/verify/verify";

export const EVIDENCE_FORMAT = "quantumpass-evidence/1";
export const SCRIPT_URL = repoFile("backend/scripts/verify_receipt.py");

export type Remote<T> =
  | { status: "loading" }
  | { status: "ok"; data: T }
  | { status: "error"; message: string; httpStatus: number | null };
/** A request that may not be made at all (local verification never asks the server). */
export type Optional<T> = Remote<T> | { status: "idle" };

export type CheckState = "pass" | "fail" | "skip";
export type SignatureId = "ed25519" | "ml-dsa-65";
export const SIGNATURES: readonly { id: SignatureId; label: string; note: string }[] = [
  { id: "ed25519", label: "Ed25519", note: "classical" },
  { id: "ml-dsa-65", label: "ML-DSA-65", note: "post-quantum, algorithm from FIPS 204" },
];

type PlainObject = { [key: string]: PlainJson };

const asObject = (v: PlainJson | undefined): PlainObject | null =>
  v !== undefined && v !== null && typeof v === "object" && !Array.isArray(v) ? v : null;
const asString = (v: PlainJson | undefined): string | null => (typeof v === "string" ? v : null);
const asNumber = (v: PlainJson | undefined): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

// ---- keys -------------------------------------------------------------------------------------------------------

/** The API's key set (zod output) as lib/verify expects it: optional fields omitted rather than `undefined`. */
export function toVerifyKeys(keys: ApiKeySet): VerifyKeySet {
  return {
    keys: keys.keys.map((k) => ({
      key_id: k.key_id,
      ed25519: k.ed25519,
      "ml-dsa-65": k["ml-dsa-65"],
      ...(k.status !== undefined ? { status: k.status } : {}),
      ...(k.revoked_at !== undefined ? { revoked_at: k.revoked_at } : {}),
    })),
  };
}

export function keyStatusTone(status: string | null): Tone {
  if (status === "active") return "success";
  if (status === "revoked" || status === null) return "danger";
  return "neutral";
}

export function keyStatusNote(status: string | null): string {
  if (status === "active") return "This key currently signs new receipts.";
  if (status === "retired") return "Retired: it no longer signs new receipts, and receipts it signed earlier still verify.";
  if (status === "revoked") return "Revoked: receipts issued at or after the revocation time are rejected.";
  return "This key is not in the published key set.";
}

// ---- the verified payload -----------------------------------------------------------------------------------------

export interface IbmJobView {
  backend: string | null;
  jobId: string | null;
  mode: string | null;
}

export interface ProvenanceView {
  sources: string[];
  quantum: boolean;
  quantumBytes: number | null;
  mixedWith: string | null;
  health: { name: string; outcome: string }[];
  ibmJobs: IbmJobView[];
}

export interface PayloadView {
  version: string;
  receiptId: string;
  kind: string;
  keyId: string;
  issuedAt: number | null;
  entropyBits: number | null;
  commitment: string | null;
  provenance: ProvenanceView;
  details: PlainObject;
  result: PlainJson | undefined;
}

function provenanceView(v: PlainJson | undefined): ProvenanceView {
  const p = asObject(v) ?? {};
  const sources = Array.isArray(p.sources) ? p.sources.filter((s): s is string => typeof s === "string") : [];
  const health = Object.entries(asObject(p.health) ?? {}).map(([name, outcome]) => ({
    name,
    outcome: typeof outcome === "string" ? outcome : "unknown",
  }));
  const ibmJobs = Array.isArray(p.ibm_jobs)
    ? p.ibm_jobs.flatMap((job) => {
        const o = asObject(job);
        return o ? [{ backend: asString(o.backend), jobId: asString(o.job_id), mode: asString(o.mode) }] : [];
      })
    : [];
  return { sources, quantum: p.quantum === true, quantumBytes: asNumber(p.quantum_bytes),
           mixedWith: asString(p.mixed_with), health, ibmJobs };
}

/** A defensive, typed read of the payload lib/verify returned. Structure was checked there; the details were not. */
export function payloadView(payload: PlainObject | null): PayloadView | null {
  if (!payload) return null;
  return {
    version: asString(payload.version) ?? "unknown",
    receiptId: asString(payload.receipt_id) ?? "",
    kind: asString(payload.kind) ?? "unknown",
    keyId: asString(payload.key_id) ?? "",
    issuedAt: asNumber(payload.issued_at),
    entropyBits: asNumber(payload.entropy_bits),
    commitment: asString(payload.commitment),
    provenance: provenanceView(payload.provenance),
    details: asObject(payload.details) ?? {},
    result: payload.result,
  };
}

export const isSecretKind = (kind: string): boolean => kind === "password" || kind === "passphrase" || kind === "random";
export const isDrawKind = (kind: string): boolean => kind === "draw_commit" || kind === "draw";

const KIND_LABELS: Record<string, string> = {
  password: "Password",
  passphrase: "Passphrase",
  random: "Random bytes",
  draw_commit: "Draw commitment",
  draw: "Draw result",
};
export const kindLabel = (kind: string): string => KIND_LABELS[kind] ?? kind;

export interface DrawView {
  title: string | null;
  entriesCount: number | null;
  winnerCount: number | null;
  entriesSha256: string | null;
  drawId: string | null;
  commitReceiptId: string | null;
  winners: { index: number; entry: string }[] | null;
  selection: { algorithm: string; seedHex: string } | null;
}

export function drawView(view: PayloadView): DrawView {
  const d = view.details;
  const result = asObject(view.result);
  const winners = result && Array.isArray(result.winners)
    ? result.winners.flatMap((w) => {
        const o = asObject(w);
        const index = o ? asNumber(o.index) : null;
        const entry = o ? asString(o.entry) : null;
        return index !== null && entry !== null ? [{ index, entry }] : [];
      })
    : null;
  const sel = asObject(result?.selection);
  const algorithm = sel ? asString(sel.algorithm) : null;
  const seedHex = sel ? asString(sel.seed_hex) : null;
  return {
    title: asString(d.title),
    entriesCount: asNumber(d.entries_count),
    winnerCount: asNumber(d.winners),
    entriesSha256: asString(d.entries_sha256),
    drawId: asString(d.draw_id),
    commitReceiptId: asString(d.commit_receipt_id),
    winners,
    selection: algorithm !== null && seedHex !== null ? { algorithm, seedHex } : null,
  };
}

const SCREENING = "SP 800-90B-style RCT/APT screening (not a NIST validation)";
export const healthLabel = (name: string): string => (name.startsWith("sp800_90b") ? SCREENING : name);

/** Sources that are labelled quantum. ibm_simulator is deliberately absent: it is not quantum. */
const QUANTUM_SOURCES = new Set(["ibm_quantum", "anu", "lfd"]);
export const isQuantumSource = (name: string): boolean => QUANTUM_SOURCES.has(name);

const DRAW_STATUS: Record<string, { label: string; tone: Tone }> = {
  committed: { label: "Committed, not run yet", tone: "info" },
  seeded: { label: "Seed drawn, result pending", tone: "warning" },
  done: { label: "Done", tone: "success" },
  needs_investigation: { label: "Needs investigation", tone: "danger" },
};
export const drawStatus = (status: string): { label: string; tone: Tone } =>
  DRAW_STATUS[status] ?? { label: status, tone: "neutral" };

// ---- formatting ---------------------------------------------------------------------------------------------------

/** "abcdef…xyz" for long hex or ids; the full value stays available through the copy button and title. */
export function truncateMiddle(value: string, head = 16, tail = 8): string {
  return value.length <= head + tail + 1 ? value : `${value.slice(0, head)}…${value.slice(-tail)}`;
}

/** "3 min 20 s", "1 h 5 min", "under 1 s". The two most significant non-zero units. */
export function humanDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  if (total < 1) return "under 1 s";
  const units: [string, number][] = [["d", 86_400], ["h", 3_600], ["min", 60], ["s", 1]];
  const parts: string[] = [];
  let rest = total;
  for (const [name, size] of units) {
    const n = Math.floor(rest / size);
    rest -= n * size;
    if (n > 0) parts.push(`${n} ${name}`);
    if (parts.length === 2) break;
  }
  return parts.join(" ");
}

/** A receipt ID from what people paste: the bare ID or a /verify/<id> link. */
export function extractReceiptId(input: string): string | null {
  const s = input.trim();
  const candidate = /\/verify\/([A-Za-z0-9_-]{16})(?:[/?#]|$)/.exec(s)?.[1] ?? s;
  return RECEIPT_ID.test(candidate) ? candidate : null;
}

/** Entry lists: one per line, or a JSON array of strings (what the offline script's --entries file holds). */
export function parseEntries(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed.startsWith("[")) {
    try {
      const json: unknown = JSON.parse(trimmed);
      if (Array.isArray(json) && json.every((e): e is string => typeof e === "string")) return json;
    } catch {
      /* a line that merely starts with "[": treat the text as lines */
    }
  }
  return text.split(/\r?\n/).filter((line) => line.trim() !== "");
}

// ---- browser vs server --------------------------------------------------------------------------------------------

export function browserSignatureState(browser: BrowserVerification, id: SignatureId): CheckState {
  if (!browser.checks.some((c) => c.id === id)) return "skip"; // verification stopped before the signatures
  return browser.signatures[id] ? "pass" : "fail";
}

/** Reasons for which the server never evaluated the signatures (its `signatures` are all-false placeholders). */
const SIGNATURES_NOT_EVALUATED = new Set(["schema_invalid", "unsupported_version", "unknown_key"]);

export function serverSignatureState(verdict: VerifyResult, id: SignatureId): CheckState {
  if (verdict.reason && SIGNATURES_NOT_EVALUATED.has(verdict.reason)) return "skip";
  const v = verdict.signatures[id];
  return v === undefined ? "skip" : v ? "pass" : "fail";
}

const REASONS: Record<string, string> = {
  bad_signature: "A signature does not verify over the receipt.",
  unknown_key: "Signed with a key this server never published.",
  revoked_key: "Signed with a key that was revoked before this receipt was issued.",
  schema_invalid: "The receipt does not match the receipt format.",
  unsupported_version: "This receipt version is not supported.",
};
export const reasonText = (reason: string | null | undefined): string =>
  reason ? (REASONS[reason] ?? `Rejected: ${reason}.`) : "The server's verifier rejects this receipt.";

/** True when verification stopped because the receipt's issue time is in the future, which a wrong device clock causes. */
export const failedOnIssueTime = (browser: BrowserVerification): boolean =>
  browser.checks.some((c) => !c.ok && c.detail?.includes("issued_at") === true);

/** A file name that is safe in a copied shell command: only a well-formed receipt ID is used verbatim. */
export const evidenceFileName = (receiptId: string): string =>
  `evidence-${RECEIPT_ID.test(receiptId) ? receiptId : "receipt"}.json`;

/** The first failing browser check, as a sentence. */
export function failureSummary(browser: BrowserVerification): string {
  const failed = browser.checks.find((c) => !c.ok);
  return failed ? `Failed check: ${failed.label}${failed.detail ? ` (${failed.detail})` : ""}` : "The receipt did not verify";
}

export function findDisagreements(input: {
  browser: BrowserVerification;
  view: PayloadView | null;
  server: Optional<VerifyResult>;
  canonicalMatch: boolean | null;
  expectedId: string | undefined;
}): string[] {
  const { browser, view, server, canonicalMatch, expectedId } = input;
  const out: string[] = [];
  if (expectedId !== undefined && view && view.receiptId !== expectedId) {
    out.push("The receipt served for this link carries a different receipt ID than the link.");
  }
  if (server.status === "ok") {
    const v = server.data;
    if (v.valid !== browser.valid) {
      out.push(`Your browser says the receipt is ${browser.valid ? "valid" : "invalid"}; the server says ` +
        `${v.valid ? "valid" : "invalid"}.`);
    }
    for (const sig of SIGNATURES) {
      const b = browserSignatureState(browser, sig.id);
      const s = serverSignatureState(v, sig.id);
      if (b !== "skip" && s !== "skip" && b !== s) {
        out.push(`${sig.label} signature: your browser says ${b === "pass" ? "valid" : "invalid"}; the server says ` +
          `${s === "pass" ? "valid" : "invalid"}.`);
      }
    }
  }
  if (canonicalMatch === false) {
    out.push("The server's canonical bytes differ from the bytes your browser computed from the receipt text.");
  }
  return out;
}

// ---- evidence export ----------------------------------------------------------------------------------------------

/** Plain JS data (the server verdict, the key set) as a JsonValue tree; numbers are not signed, so plain is fine. */
export function fromPlain(value: unknown, depth = 0): JsonValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") return Number.isFinite(value) ? new JsonNumber(String(value)) : null;
  if (depth > 12) return null;
  if (Array.isArray(value)) return value.map((v) => fromPlain(v, depth + 1));
  if (typeof value === "object") {
    const out: { [key: string]: JsonValue } = Object.create(null) as { [key: string]: JsonValue };
    for (const [k, v] of Object.entries(value)) if (v !== undefined) out[k] = fromPlain(v, depth + 1);
    return out;
  }
  return null;
}

/**
 * The receipt exactly as received (lossless numbers) from a bare receipt, a draw response or an earlier export.
 * Only payload, signatures and algorithms are copied, so anything else in the text (such as a private `salt`) can
 * never end up in a file someone might share.
 */
export function receiptTree(text: string): JsonValue | null {
  try {
    const doc = parseJson(text);
    if (!isObject(doc)) return null;
    const inner = isObject(doc.receipt) ? doc.receipt : isObject(doc.commit_receipt) ? doc.commit_receipt : doc;
    if (inner.payload === undefined) return null;
    const tree: { [key: string]: JsonValue } = { payload: inner.payload, signatures: inner.signatures ?? null };
    if (inner.algorithms !== undefined) tree.algorithms = inner.algorithms;
    return tree;
  } catch {
    return null;
  }
}

/** The `quantumpass-evidence/1` document, pretty-printed with every receipt number lexeme intact. */
export function buildEvidence(input: {
  receiptText: string;
  keys: ApiKeySet;
  browser: BrowserVerification;
  server: VerifyResult | null;
  exportedAt: Date;
}): string | null {
  const receipt = receiptTree(input.receiptText);
  if (!receipt) return null;
  // The server's copy of the payload is left out: the signed payload is `receipt`, byte for byte.
  const verdict = input.server
    ? fromPlain(Object.fromEntries(Object.entries(input.server).filter(([k]) => k !== "payload")))
    : null;
  const doc: JsonValue = {
    format: EVIDENCE_FORMAT,
    exported_at: input.exportedAt.toISOString(),
    receipt,
    keys: fromPlain(input.keys),
    canonical_payload: input.browser.canonical,
    browser_checks: input.browser.checks.map((c) => ({
      id: c.id,
      label: c.label,
      ok: c.ok,
      ...(c.detail !== undefined ? { detail: c.detail } : {}),
    })),
    server_verdict: verdict,
  };
  return stringifyLossless(doc, 2);
}
