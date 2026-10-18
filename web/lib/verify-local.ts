/** Public-only, browser-local validation of Ed25519 + ML-DSA-65 receipts.
 * The public keys come from the service, so a green result is NOT independent key trust
 * or authenticated quantum device provenance. The signed byte sequence must be exact.
 */
import { ed25519 } from "@noble/curves/ed25519.js";
import { ml_dsa65 } from "@noble/post-quantum/ml-dsa.js";

const DOMAIN = "QuantumPass-hybrid-sig/1:ed25519+ml-dsa-65\u0000";
type KeyMaterial = {
  key_id: string; ed25519: string; "ml-dsa-65": string; status: string;
};
export type BrowserProof = {
  ed25519: boolean;
  mlDsa65: boolean;
  payloadMatches: boolean;
  keyFingerprintMatches: boolean;
  keyStatus: string;
  valid: boolean;
  warning: string;
};
export type VerifyMaterial = {
  receipt: { payload: Record<string, unknown>; signatures: Record<string, string> };
  canonical_payload: string;
  signing_domain: string;
  public_key: KeyMaterial;
  trust: string;
};

function base64url(s: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(s)) throw new Error("Invalid base64url signature or key");
  const padded = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort()
      .map((key) => [key, sorted((value as Record<string, unknown>)[key])]));
  }
  return value;
}

function equalSemanticJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
}

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (n) => n.toString(16).padStart(2, "0")).join("");
}

export async function verifyReceiptInBrowser(material: VerifyMaterial): Promise<BrowserProof> {
  if (material.signing_domain !== DOMAIN) throw new Error("Unrecognized signature domain");
  const { receipt, canonical_payload: raw, public_key: key } = material;
  if (typeof raw !== "string" || raw.length > 256_000)
    throw new Error("Canonical payload is missing or exceeds browser verification limit");
  const parsed = JSON.parse(raw) as unknown;
  const payloadMatches = equalSemanticJson(parsed, receipt.payload);
  const edPub = base64url(key.ed25519);
  const mlPub = base64url(key["ml-dsa-65"]);
  const joined = new Uint8Array(edPub.length + mlPub.length);
  joined.set(edPub);
  joined.set(mlPub, edPub.length);
  const fingerprint = hex(await crypto.subtle.digest("SHA-256", joined));
  const keyFingerprintMatches = key.key_id === fingerprint.slice(0, 16)
    && receipt.payload.key_id === key.key_id;
  const message = new TextEncoder().encode(DOMAIN + raw);

  let classical = false;
  let postQuantum = false;
  if (payloadMatches && keyFingerprintMatches) {
    try {
      classical = ed25519.verify(base64url(receipt.signatures.ed25519), message, edPub,
                                  { zip215: false });
      postQuantum = ml_dsa65.verify(base64url(receipt.signatures["ml-dsa-65"]), message, mlPub);
    } catch {
      classical = false;
      postQuantum = false;
    }
  }
  return {
    ed25519: classical,
    mlDsa65: postQuantum,
    payloadMatches,
    keyFingerprintMatches,
    keyStatus: key.status,
    valid: classical && postQuantum && keyFingerprintMatches && payloadMatches
      && key.status !== "revoked",
    warning: "The public key and receipt log are published by QuantumPass. "
      + "Local signature verification does not independently attest IBM quantum origin. "
      + "Validate public-key fingerprints against an external trusted record.",
  };
}
