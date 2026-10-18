import { Download, ExternalLink, FileSignature } from "lucide-react";
import { downloadJson } from "../lib/download";
import type { Receipt } from "../lib/types";

interface Props {
  receipt: Receipt;
  /** Only present for secret results; lets the owner prove the receipt matches their value. */
  salt?: string;
}

export function ReceiptCard({ receipt, salt }: Props) {
  const id = receipt.payload.receipt_id;
  return (
    <div className="space-y-3 rounded-xl border border-violet-400/30 bg-violet-500/5 p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-medium">
          <FileSignature className="size-4 text-violet-400" aria-hidden /> Post-quantum signed receipt
        </p>
        <code className="font-mono text-xs text-slate-500">{id}</code>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Signed with <strong>Ed25519 + ML-DSA-65</strong> (NIST FIPS 204). Anyone can verify what this service signed about where the randomness came
        from{salt ? " — the receipt holds only a fingerprint of your secret, never the secret itself" : ""}.
      </p>
      <div className="flex flex-wrap gap-2">
        <a href={`#/verify/${id}`} className="btn-ghost h-8 px-3 text-xs">
          <ExternalLink className="size-3.5" aria-hidden /> Verify
        </a>
        <button type="button" className="btn-ghost h-8 px-3 text-xs"
          onClick={() => downloadJson(`receipt-${id}.json`, salt ? { ...receipt, salt } : receipt)}>
          <Download className="size-3.5" aria-hidden /> Download{salt ? " (keep private)" : ""}
        </button>
      </div>
    </div>
  );
}
