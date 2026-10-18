/**
 * Independent, in-browser receipt verification. Mirrors backend/scripts/verify_receipt.py check for check.
 *
 * The bytes that were signed are rebuilt here from the receipt text (see json.ts), never taken from the server.
 * Pages must render the payload this module returns — the exact data the signatures cover — not a separately
 * fetched copy. The public keys still come from the issuer's /.well-known/quantumpass-keys.json: compare the
 * key_id with a copy you trust for full independence.
 */
import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256, sha512 } from "@noble/hashes/sha2.js";
import { ml_dsa65 } from "@noble/post-quantum/ml-dsa.js";

import { entriesHash, normalizeEntries, selectWinners } from "./draws";
import { b64urlDecode, concat, fromHex, safeEqual, toHex, utf8 } from "./encoding";
import { canonicalize, isInt, isObject, JsonError, JsonNumber, type JsonValue, parseJson, type PlainJson, toPlain }
  from "./json";

export const SIGNING_DOMAIN = "QuantumPass-hybrid-sig/1:ed25519+ml-dsa-65\u0000";
const VERSIONS = ["qpg-receipt/1", "qpg-receipt/2"] as const;
const KINDS = ["password", "passphrase", "random", "draw_commit", "draw"] as const;
const SECRET_KINDS = ["password", "passphrase", "random"];
const EVIDENCE_V2 = { integrity: "hybrid-signature:ed25519+ml-dsa-65", provenance: "operator-asserted",
                      quantum_evidence: "none" } as const;
const CLOCK_SKEW_S = 300;
const LENGTHS = { edPub: 32, edSig: 64, mlPub: 1952, mlSig: 3309 } as const;

export interface PublicKeyEntry {
  key_id: string;
  ed25519: string;
  "ml-dsa-65": string;
  status?: string;
  revoked_at?: number;
}

export interface KeySet {
  keys: PublicKeyEntry[];
}

export type CheckId = "parse" | "structure" | "key" | "revocation" | "ed25519" | "ml-dsa-65" | "commitment" | "entries"
  | "selection";

export interface Check {
  id: CheckId;
  label: string;
  ok: boolean;
  detail?: string;
}

export interface BrowserVerification {
  valid: boolean;
  checks: Check[];
  /** The verified payload (numbers converted for display); null if the receipt couldn't be parsed. */
  payload: { [key: string]: PlainJson } | null;
  /** The exact canonical JSON the signatures cover. */
  canonical: string | null;
  keyId: string | null;
  keyStatus: string | null;
  signatures: { ed25519: boolean; "ml-dsa-65": boolean };
}

export interface VerifyOptions {
  value?: string;
  salt?: string;
  entries?: string[];
  now?: number;
}

const str = (v: JsonValue | undefined): string | null => (typeof v === "string" ? v : null);

/** Accept a bare receipt, an API response with "receipt" (draw run), or an evidence export. */
export function extractReceipt(doc: JsonValue): { payload: JsonValue; signatures: JsonValue } | null {
  if (!isObject(doc)) return null;
  const inner = isObject(doc.receipt) ? doc.receipt : isObject(doc.commit_receipt) ? doc.commit_receipt : doc;
  if (!("payload" in inner)) return null;
  return { payload: inner.payload as JsonValue, signatures: (inner.signatures ?? null) as JsonValue };
}

export function structureErrors(p: JsonValue, now: number): string[] {
  if (!isObject(p)) return ["payload is not an object"];
  const version = str(p.version);
  if (!version || !(VERSIONS as readonly string[]).includes(version)) return [`unsupported version ${String(version)}`];
  const errs: string[] = [];
  const required = ["version", "receipt_id", "issued_at", "kind", "key_id", "provenance", "entropy_bits",
                    "commitment", "result", "details", ...(version === "qpg-receipt/2" ? ["evidence"] : [])];
  const keys = Object.keys(p);
  const missing = required.filter((k) => !keys.includes(k));
  const extra = keys.filter((k) => !required.includes(k));
  if (missing.length) errs.push(`missing fields: ${missing.join(", ")}`);
  if (extra.length) errs.push(`unexpected fields: ${extra.join(", ")}`);
  const kind = str(p.kind);
  if (!kind || !(KINDS as readonly string[]).includes(kind)) errs.push(`unknown kind ${String(kind)}`);
  if (!/^[A-Za-z0-9_-]{16}$/.test(str(p.receipt_id) ?? "")) errs.push("malformed receipt_id");
  if (!/^[0-9a-f]{16}$/.test(str(p.key_id) ?? "")) errs.push("malformed key_id");
  if (!isInt(p.issued_at) || p.issued_at.toNumber() > now + CLOCK_SKEW_S) errs.push("issued_at is not a past unix time");
  if (version === "qpg-receipt/2") {
    const ev = p.evidence;
    const ok = isObject(ev) && Object.keys(ev).length === 3 &&
      (Object.keys(EVIDENCE_V2) as (keyof typeof EVIDENCE_V2)[]).every((k) => ev[k] === EVIDENCE_V2[k]);
    if (!ok) errs.push("evidence block does not match qpg-receipt/2");
  }
  if (!isObject(p.details)) {
    errs.push("details is not an object");
    return errs;
  }
  const commitment = p.commitment;
  const result = p.result;
  if (kind && SECRET_KINDS.includes(kind) &&
      (typeof commitment !== "string" || !/^[0-9a-f]{128}$/.test(commitment) || result !== null)) {
    errs.push("secret receipts carry a 128-hex commitment and no result");
  }
  if (kind === "draw_commit" && (commitment !== null || result !== null)) {
    errs.push("draw_commit receipts carry neither a commitment nor a result");
  }
  if (kind === "draw") {
    if (commitment !== null || !isObject(result) || !Array.isArray(result.winners)) {
      errs.push("draw receipts carry a public result and no commitment");
    } else if (version === "qpg-receipt/2") {
      const sel = result.selection;
      if (!isObject(sel) || sel.algorithm !== "qpg-select/1" || !/^[0-9a-f]{128}$/.test(str(sel.seed_hex) ?? "")) {
        errs.push("v2 draw receipts publish a qpg-select/1 selection seed");
      }
    }
  }
  if ((kind === "draw_commit" || kind === "draw") && !/^[0-9a-f]{64}$/.test(str(p.details.entries_sha256) ?? "")) {
    errs.push("draw receipts carry details.entries_sha256");
  }
  return errs;
}

function findKey(keyset: KeySet, keyId: string): { key: PublicKeyEntry | null; error?: string } {
  const key = keyset.keys.find((k) => k.key_id === keyId);
  if (!key) return { key: null, error: "this key is not in the published key set" };
  try {
    const ed = b64urlDecode(key.ed25519);
    const ml = b64urlDecode(key["ml-dsa-65"]);
    if (ed.length !== LENGTHS.edPub || ml.length !== LENGTHS.mlPub) return { key: null, error: "malformed public key" };
    if (toHex(sha256(concat(ed, ml))).slice(0, 16) !== keyId) {
      return { key: null, error: "published key does not match its key_id (mislabelled key set)" };
    }
  } catch {
    return { key: null, error: "malformed public key" };
  }
  return { key };
}

function verifySignature(alg: "ed25519" | "ml-dsa-65", sigText: JsonValue | undefined, msg: Uint8Array,
                         key: PublicKeyEntry): boolean {
  if (typeof sigText !== "string") return false;
  try {
    const sig = b64urlDecode(sigText);
    if (alg === "ed25519") {
      // Strict RFC 8032 verification, matching Python's `cryptography` (noble defaults to the laxer ZIP-215).
      return sig.length === LENGTHS.edSig && ed25519.verify(sig, msg, b64urlDecode(key.ed25519), { zip215: false });
    }
    return sig.length === LENGTHS.mlSig && ml_dsa65.verify(sig, msg, b64urlDecode(key["ml-dsa-65"]));
  } catch {
    return false;
  }
}

export function checkCommitment(commitment: string, value: string, saltB64: string): boolean {
  try {
    const salt = b64urlDecode(saltB64);
    return salt.length === 32 && safeEqual(commitment, toHex(sha512(concat(salt, utf8(value)))));
  } catch {
    return false;
  }
}

export function verifyReceiptText(text: string, keyset: KeySet, opts: VerifyOptions = {}): BrowserVerification {
  const checks: Check[] = [];
  const out: BrowserVerification = { valid: false, checks, payload: null, canonical: null, keyId: null,
                                     keyStatus: null, signatures: { ed25519: false, "ml-dsa-65": false } };
  const add = (c: Check) => {
    checks.push(c);
    return c.ok;
  };

  let receipt: { payload: JsonValue; signatures: JsonValue } | null;
  try {
    receipt = extractReceipt(parseJson(text));
  } catch (e) {
    add({ id: "parse", label: "Receipt is well-formed JSON", ok: false,
          detail: e instanceof JsonError ? e.message : "not valid JSON" });
    return out;
  }
  if (!receipt) {
    add({ id: "parse", label: "Receipt is well-formed JSON", ok: false, detail: 'expected {"payload", "signatures"}' });
    return out;
  }
  const p = receipt.payload;
  const errs = structureErrors(p, opts.now ?? Math.floor(Date.now() / 1000));
  if (!add({ id: "structure", label: "Receipt version and structure", ok: errs.length === 0,
             ...(errs.length ? { detail: errs.join("; ") } : {}) }) || !isObject(p)) {
    return out;
  }
  const keyId = p.key_id as string;
  out.keyId = keyId;
  const canonical = canonicalize(p);
  out.canonical = canonical;
  out.payload = toPlain(p) as { [key: string]: PlainJson };

  const { key, error } = findKey(keyset, keyId);
  if (!add({ id: "key", label: "Signing key is published and correctly labelled", ok: key !== null,
             detail: error ?? keyId }) || !key) {
    return out;
  }
  out.keyStatus = key.status ?? "active";
  const issuedAt = (p.issued_at as { toNumber(): number }).toNumber();
  const revoked = key.status === "revoked" && issuedAt >= (key.revoked_at ?? 0);
  if (!add({ id: "revocation", label: "Key was not revoked when this receipt was issued", ok: !revoked,
             detail: revoked ? `revoked at ${key.revoked_at}` : out.keyStatus })) {
    return out;
  }

  const msg = concat(utf8(SIGNING_DOMAIN), utf8(canonical));
  const sigs = isObject(receipt.signatures) ? receipt.signatures : {};
  out.signatures.ed25519 = verifySignature("ed25519", sigs.ed25519, msg, key);
  out.signatures["ml-dsa-65"] = verifySignature("ml-dsa-65", sigs["ml-dsa-65"], msg, key);
  let ok = add({ id: "ed25519", label: "Ed25519 signature (classical)", ok: out.signatures.ed25519 });
  ok = add({ id: "ml-dsa-65", label: "ML-DSA-65 signature (post-quantum, FIPS 204)", ok: out.signatures["ml-dsa-65"] })
    && ok;

  if (opts.value !== undefined && opts.salt !== undefined && typeof p.commitment === "string") {
    ok = add({ id: "commitment", label: "Commitment opens to your secret (checked locally)",
               ok: checkCommitment(p.commitment, opts.value, opts.salt) }) && ok;
  }
  const details = p.details as { [key: string]: JsonValue };
  if (opts.entries && (p.kind === "draw_commit" || p.kind === "draw")) {
    let canon: string[] | null = null;
    try {
      canon = normalizeEntries(opts.entries);
    } catch (e) {
      ok = add({ id: "entries", label: "Entry list matches the receipt", ok: false, detail: (e as Error).message }) && ok;
    }
    if (canon) {
      ok = add({ id: "entries", label: "Entry list matches the receipt",
                 ok: entriesHash(canon) === details.entries_sha256 }) && ok;
      const result = p.result;
      if (ok && isObject(result) && isObject(result.selection) && Array.isArray(result.winners)) {
        const seed = fromHex(result.selection.seed_hex as string);
        const picked = selectWinners(seed, canon.length, result.winners.length);
        const expected: JsonValue = picked.map((i) => ({ entry: canon[i] as string, index: new JsonNumber(String(i)) }));
        ok = add({ id: "selection", label: "Winners recomputed from the published seed (qpg-select/1)",
                   ok: canonicalize(expected) === canonicalize(result.winners) }) && ok;
      }
    }
  }
  out.valid = ok;
  return out;
}
