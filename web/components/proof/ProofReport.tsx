"use client";

import { useMemo } from "react";

import { Callout } from "@/components/ui";
import type { KeySet, VerifyResult } from "@/lib/api/schemas";
import { verifyReceiptText } from "@/lib/verify/verify";

import { CommitmentCard } from "./CommitmentCard";
import { DrawCard } from "./DrawCard";
import { ExportCard } from "./ExportCard";
import { IntegrityCard, type KeySource } from "./IntegrityCard";
import { LogCard } from "./LogCard";
import { ProvenanceCard, QuantumEvidenceCard } from "./ProvenanceCards";
import { findDisagreements, isDrawKind, isSecretKind, type Optional, payloadView, toVerifyKeys } from "./proof-data";
import { VerdictCard } from "./VerdictCard";

/**
 * The report for one receipt. The signatures are verified here, in the browser, from `receiptText`, and every section
 * renders the payload that verification returned: the server's verdict is shown beside it, never instead of it.
 *
 * `server` and `material` are idle for documents verified locally (nothing is sent to the server).
 */
export function ProofReport({ receiptText, keys, keySource = "published", server, material, expectedId, initialSalt }: {
  receiptText: string;
  keys: KeySet;
  keySource?: KeySource;
  server: Optional<VerifyResult>;
  /** The canonical bytes the server says it signed, for comparison with the ones the browser computed. */
  material: Optional<string>;
  /** The receipt ID the page was opened for; a different ID in the payload is flagged. */
  expectedId?: string | undefined;
  /** A salt found in a file the user supplied (kept in the browser, offered to the commitment form). */
  initialSalt?: string | undefined;
}) {
  const verifyKeys = useMemo(() => toVerifyKeys(keys), [keys]);
  const browser = useMemo(() => verifyReceiptText(receiptText, verifyKeys), [receiptText, verifyKeys]);
  const view = useMemo(() => payloadView(browser.payload), [browser.payload]);

  const canonicalMatch = material.status === "ok" && browser.canonical !== null ? material.data === browser.canonical : null;
  const disagreements = findDisagreements({ browser, view, server, canonicalMatch, expectedId });
  const verified = browser.valid;

  return (
    <div className="space-y-6">
      {disagreements.length > 0 && (
        <Callout tone="danger" role="alert" title="Your browser and the server disagree">
          <ul className="list-disc space-y-1 pl-4">
            {disagreements.map((d) => <li key={d}>{d}</li>)}
          </ul>
          <p className="pt-1">
            Don&apos;t rely on this receipt until the difference is explained. You can re-check it offline with the
            evidence export below.
          </p>
        </Callout>
      )}
      <VerdictCard browser={browser} view={view} server={server} keySource={keySource} />
      <IntegrityCard browser={browser} server={server} keys={keys} keySource={keySource} material={material}
                     canonicalMatch={canonicalMatch} />
      {view && !verified && (
        <Callout tone="warning" title="Nothing below is authenticated">
          The receipt did not verify, so the sections below show what the document claims, not what the server signed.
        </Callout>
      )}
      {view && isSecretKind(view.kind) && view.commitment && (
        <CommitmentCard commitment={view.commitment} initialSalt={initialSalt} verified={verified} />
      )}
      {view && <ProvenanceCard view={view} verified={verified} />}
      {view && <QuantumEvidenceCard view={view} verified={verified} />}
      {view && <LogCard server={server} receiptId={view.receiptId || null} />}
      {view && isDrawKind(view.kind) && (
        <DrawCard view={view} receiptText={receiptText} keys={verifyKeys} server={server} verified={verified} />
      )}
      {view && <ExportCard view={view} receiptText={receiptText} keys={keys} browser={browser} server={server} />}
    </div>
  );
}
