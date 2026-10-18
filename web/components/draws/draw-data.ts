/** Typed reads of the signed draw receipts and the errors the draw endpoints return. */
import { z } from "zod";

import { ApiError } from "@/lib/api/client";
import type { Receipt } from "@/lib/api/schemas";
import { entriesHash, normalizeEntries } from "@/lib/verify/draws";

import type { DrawBody } from "./entries";

export interface Committed {
  drawId: string;
  receipt: Receipt;
  /** Lossless JSON text of the commit receipt, for byte-exact downloads. */
  receiptText: string;
  /** Does the signed commitment match the list submitted from this browser? null when it couldn't be checked. */
  matchesSubmission: boolean | null;
}

export interface DrawResult {
  winners: { index: number; entry: string }[];
  receipt: Receipt;
  receiptText: string;
  /** The server returned a result that already existed instead of drawing. */
  replayed: boolean;
  selection: { algorithm: string; seedHex: string } | null;
}

export const verifyPath = (receiptId: string) => `/verify/${encodeURIComponent(receiptId)}` as const;

/** The fields of a commit receipt this page shows (all signed by the server). */
export function commitDetails(receipt: Receipt) {
  const d = receipt.payload.details;
  return {
    title: typeof d.title === "string" ? d.title : null,
    entriesCount: typeof d.entries_count === "number" ? d.entries_count : null,
    winners: typeof d.winners === "number" ? d.winners : null,
    sha256: typeof d.entries_sha256 === "string" ? d.entries_sha256 : null,
  };
}

/** Compare the signed commitment with what this browser submitted, recomputing the fingerprint locally. */
export function matchesSubmission(receipt: Receipt, body: DrawBody): boolean | null {
  let local: string;
  try {
    local = entriesHash(normalizeEntries(body.entries));
  } catch {
    return null;
  }
  const signed = commitDetails(receipt);
  return signed.sha256 === local && signed.entriesCount === body.entries.length && signed.winners === body.winners;
}

const Selected = z.object({
  selection: z.object({ algorithm: z.string(), seed_hex: z.string().regex(/^[0-9a-f]{128}$/) }),
});

/** The published selection seed. It is public by design: the result receipt contains it so anyone can re-derive winners. */
export function readSelection(receipt: Receipt): DrawResult["selection"] {
  const parsed = Selected.safeParse(receipt.payload.result);
  return parsed.success
    ? { algorithm: parsed.data.selection.algorithm, seedHex: parsed.data.selection.seed_hex }
    : null;
}

export type ConflictKind = "seeded" | "needs_investigation";

export const CONFLICT_COPY: Record<ConflictKind, { title: string; body: string }> = {
  seeded: {
    title: "This draw is being finalised",
    body: "Its outcome is already fixed and it will not be re-run with new randomness. If a run is still in progress, " +
      "checking again in a moment shows the result. If it was interrupted, an operator completes it from the saved seed.",
  },
  needs_investigation: {
    title: "This draw needs operator attention",
    body: "This draw was interrupted after its outcome was fixed and is awaiting an operator. It will not be re-run " +
      "with new randomness; an operator will publish it from the saved seed.",
  },
};

/**
 * A 409 from /run carries `status` ("seeded" | "needs_investigation") next to `detail`, but ApiError only keeps the
 * message, so the hint is read from the server's wording for the two states.
 */
export function conflictKind(err: ApiError): ConflictKind {
  if (err.hint === "needs_investigation" || err.hint === "seeded") return err.hint;
  return /operator|investigat/i.test(err.message) ? "needs_investigation" : "seeded";
}

/** A message for the person at the keyboard. Network failures say that retrying is safe (same idempotency key). */
export function describeError(err: unknown, retryNote: string): string {
  if (err instanceof ApiError) return err.requestId ? `${err.message} (request ${err.requestId})` : err.message;
  if (err instanceof TypeError) return `Couldn't reach the server. ${retryNote}`;
  return "Something went wrong. Try again.";
}
