"use client";

import { FileQuestion } from "lucide-react";
import { useCallback, useState } from "react";
import { z } from "zod";

import { ButtonLink, Card, CardBody } from "@/components/ui";
import { api, apiWithText } from "@/lib/api/client";
import { KeySet, Receipt, VerifyResult } from "@/lib/api/schemas";

import { LoadError } from "./LoadError";
import { ProofReport } from "./ProofReport";
import { ProofSkeleton } from "./ProofSkeleton";
import { useRemote } from "./useRemote";

const VerifyMaterial = z.looseObject({ canonical_payload: z.string() });

function NotFound({ receiptId }: { receiptId: string }) {
  return (
    <Card>
      <CardBody className="flex flex-col items-center gap-3 py-12 text-center">
        <span aria-hidden className="flex size-12 items-center justify-center rounded-xl bg-bg-subtle text-subtle">
          <FileQuestion className="size-6" />
        </span>
        <h2 className="text-xl font-semibold text-fg">Receipt not found</h2>
        <p className="max-w-md text-sm text-muted">
          This server has no receipt with ID <code className="font-mono text-xs break-all text-fg">{receiptId}</code>. Check
          the ID for typos, or verify a saved receipt file in your browser.
        </p>
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <ButtonLink href="/verify">Verify a receipt file</ButtonLink>
        </div>
      </CardBody>
    </Card>
  );
}

/**
 * Opens a receipt by ID. The receipt text and the published key set are fetched; the signatures are checked in this
 * browser from the exact text received. The server's own verdict and canonical bytes load alongside, for comparison.
 */
export function ProofExplorer({ receiptId }: { receiptId: string }) {
  const [attempt, setAttempt] = useState(0);
  const tag = `${receiptId}:${attempt}`;

  const receipt = useRemote(tag, useCallback(
    (signal: AbortSignal) => apiWithText(`/api/v2/receipts/${encodeURIComponent(receiptId)}`, { schema: Receipt, signal }),
    [receiptId],
  ));
  const keys = useRemote(tag, useCallback(
    (signal: AbortSignal) => api("/.well-known/quantumpass-keys.json", { schema: KeySet, signal }),
    [],
  ));
  const server = useRemote(tag, useCallback(
    (signal: AbortSignal) => api("/api/v2/receipts/verify", { schema: VerifyResult, body: { receipt_id: receiptId }, signal }),
    [receiptId],
  ));
  const material = useRemote(tag, useCallback(
    (signal: AbortSignal) => api(`/api/v2/receipts/${encodeURIComponent(receiptId)}/verify-material`,
                                 { schema: VerifyMaterial, signal }).then((m) => m.canonical_payload),
    [receiptId],
  ));

  const retry = () => setAttempt((n) => n + 1);
  let body;
  let announcement = "Verifying the receipt in your browser…";
  if (receipt.status === "error" && receipt.httpStatus === 404) {
    announcement = "Receipt not found.";
    body = <NotFound receiptId={receiptId} />;
  } else if (receipt.status === "error") {
    announcement = "The receipt could not be loaded.";
    body = <LoadError title="Couldn't load this receipt" onRetry={retry}>{receipt.message}</LoadError>;
  } else if (keys.status === "error") {
    announcement = "The key set could not be loaded.";
    body = (
      <LoadError title="Couldn't load the published key set" onRetry={retry}>
        Your browser needs the public keys to check the signatures. {keys.message}
      </LoadError>
    );
  } else if (receipt.status === "ok" && keys.status === "ok") {
    announcement = "Verification finished.";
    body = (
      <ProofReport key={tag} receiptText={receipt.data.text} keys={keys.data} server={server} material={material}
                   expectedId={receiptId} />
    );
  } else {
    body = <ProofSkeleton />;
  }

  return (
    <div>
      <p role="status" className="sr-only">{announcement}</p>
      {body}
    </div>
  );
}
