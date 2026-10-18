"use client";

import { Download, ExternalLink, FileSignature } from "lucide-react";
import Link from "next/link";

import { buttonClass } from "@/components/ui";
import type { Receipt } from "@/lib/api/schemas";
import { downloadText } from "@/lib/download";
import { isObject, parseJson, stringifyLossless } from "@/lib/verify/json";

/** Receipt JSON for saving: the exact received text (numbers such as 128.0 intact) plus the salt, if any. */
function savedReceipt(receiptText: string, salt?: string): string {
  const tree = parseJson(receiptText);
  if (salt && isObject(tree)) tree.salt = salt;
  return stringifyLossless(tree, 2);
}

/**
 * A freshly issued receipt. `receiptText` is the receipt's lossless JSON from the response (see losslessField), so the
 * download verifies byte-exactly offline. The salt (if any) stays in the browser and is only in the private download.
 */
export function ReceiptCard({ receipt, receiptText, salt }: {
  receipt: Receipt;
  receiptText: string;
  salt?: string | undefined;
}) {
  const id = receipt.payload.receipt_id;
  return (
    <div className="space-y-3 rounded-lg border border-accent-2/30 bg-accent-2-soft p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-medium text-fg">
          <FileSignature className="size-4 text-accent-2" aria-hidden /> Signed receipt
        </p>
        <code className="font-mono text-xs text-muted">{id}</code>
      </div>
      <p className="text-xs text-muted">
        Signed with Ed25519 and ML-DSA-65 (FIPS 204). Anyone can verify what this service signed about the entropy
        {salt ? "; the receipt holds only a salted fingerprint of your secret, never the secret itself" : ""}.
      </p>
      <div className="flex flex-wrap gap-2">
        <Link href={`/verify/${id}`} prefetch={false} className={buttonClass("secondary", "sm")}>
          <ExternalLink className="size-3.5" aria-hidden /> Verify
        </Link>
        <button type="button" className={buttonClass("secondary", "sm")}
                onClick={() => downloadText(`receipt-${id}.json`, savedReceipt(receiptText, salt))}>
          <Download className="size-3.5" aria-hidden /> Download{salt ? " (keep private: includes salt)" : ""}
        </button>
      </div>
    </div>
  );
}
