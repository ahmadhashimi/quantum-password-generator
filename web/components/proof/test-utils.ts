/** Shared fixtures for the Proof Explorer tests: the cross-language receipt vectors and a server verdict builder. */
import type { KeySet, VerifyResult } from "@/lib/api/schemas";
import { losslessField } from "@/lib/verify/json";
import vectors from "@/tests/vectors/receipts.json";

export interface Vector {
  name: string;
  text: string;
  valid: boolean;
  canonical: string | null;
  value?: string;
  salt?: string;
  entries?: string[];
}

export const keys = vectors.keys as KeySet;
export const cases = vectors.cases as Vector[];

export function vector(prefix: string): Vector {
  const found = cases.find((c) => c.name.startsWith(prefix));
  if (!found) throw new Error(`No receipt vector named "${prefix}"`);
  return found;
}

/** The receipt ID inside a vector (which may be a bare receipt or a draw response). */
export function receiptIdOf(text: string): string {
  const doc = JSON.parse(text) as { receipt?: { payload: { receipt_id: string } }; payload?: { receipt_id: string } };
  return (doc.receipt?.payload ?? doc.payload)?.receipt_id ?? "";
}

/** The bare receipt text a GET /api/v2/receipts/{id} would return for a vector (numbers such as 256.0 intact). */
export function bareReceipt(text: string): string {
  return losslessField(text, "receipt") ?? text;
}

export function serverVerdict(overrides: Record<string, unknown> = {}): VerifyResult {
  return {
    valid: true,
    reason: null,
    signatures: { ed25519: true, "ml-dsa-65": true },
    key_status: "active",
    key_id_matches: true,
    in_public_log: true,
    payload: {},
    ...overrides,
  } as VerifyResult;
}

export const BAD_SIGNATURE = {
  valid: false,
  reason: "bad_signature",
  signatures: { ed25519: false, "ml-dsa-65": false },
};

export const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
