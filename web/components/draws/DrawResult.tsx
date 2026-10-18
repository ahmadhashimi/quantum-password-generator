"use client";

import { Ban, FileSignature, History, ListChecks, RotateCcw, ShieldQuestion, Trophy } from "lucide-react";
import type { ReactNode } from "react";

import { ReceiptCard } from "@/components/receipts/ReceiptCard";
import { ProvenanceBadge } from "@/components/receipts/ProvenanceBadge";
import { Badge, Button, ButtonLink, Callout, Card, CardBody, CardHeader } from "@/components/ui";

import { CopyValue, ShareLink } from "./CopyValue";
import { type DrawResult, verifyPath } from "./draw-data";
import { PhaseTitle } from "./PhaseTitle";

const HEALTH_LABELS: Record<string, string> = {
  sp800_90b: "SP 800-90B-style RCT/APT screening (not a NIST validation)",
};

function EvidenceRow({ icon, title, badge, children }: { icon: ReactNode; title: string; badge: ReactNode;
                                                         children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span aria-hidden className="mt-0.5 shrink-0 text-subtle [&>svg]:size-4">{icon}</span>
      <div className="min-w-0 space-y-1.5">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-fg">{title} {badge}</p>
        <div className="space-y-1.5 text-sm text-muted">{children}</div>
      </div>
    </li>
  );
}

/** Proven, asserted and unavailable evidence, kept apart on purpose (docs/DESIGN.md principle 1). */
function Evidence({ result }: { result: DrawResult }) {
  const { provenance } = result.receipt.payload;
  const health = Object.entries(provenance.health ?? {});
  return (
    <ul className="space-y-4">
      <EvidenceRow icon={<FileSignature />} title="Integrity" badge={<Badge tone="violet">Signed by this server</Badge>}>
        <p>
          The result is signed with Ed25519 and ML-DSA-65. Open the verification page to check both signatures; valid
          signatures prove what this server signed, not that a quantum device independently attested the entropy.
        </p>
      </EvidenceRow>
      <EvidenceRow icon={<ShieldQuestion />} title="Provenance" badge={<Badge tone="warning">Operator-asserted</Badge>}>
        <ProvenanceBadge provenance={provenance} />
        {health.length > 0 && (
          <ul className="list-disc pl-4">
            {health.map(([name, outcome]) => <li key={name}>{HEALTH_LABELS[name] ?? name}: {outcome}</li>)}
          </ul>
        )}
        <p>
          Sources and health tests are reported by the server and covered by its signature, but not independently
          authenticated.
        </p>
      </EvidenceRow>
      <EvidenceRow icon={<Ban />} title="Independent quantum evidence" badge={<Badge>None available</Badge>}>
        <p>IBM does not sign job results, so no independently authenticated evidence of quantum origin is attached.</p>
      </EvidenceRow>
    </ul>
  );
}

/** Steps 2 and 3: the winners, and everything someone else needs to check them. */
export function DrawResultCards({ result, focusTitle, onStartOver }: {
  result: DrawResult;
  focusTitle: boolean;
  onStartOver: () => void;
}) {
  const id = result.receipt.payload.receipt_id;
  const plural = result.winners.length !== 1;
  return (
    <>
      <Card>
        <CardHeader icon={<Trophy />} title={<PhaseTitle focus={focusTitle}>{plural ? "Winners" : "Winner"}</PhaseTitle>}
                    description="In the order they were drawn."
                    action={result.replayed ? <Badge tone="info" icon={<History aria-hidden />}>Replayed</Badge> : undefined} />
        <CardBody className="space-y-5">
          {result.replayed && (
            <Callout tone="info" role="status" title="Result already published (replayed)">
              This draw had already been run. This is the original result; nothing was drawn again.
            </Callout>
          )}
          <ol className="space-y-2">
            {result.winners.map((w, i) => (
              <li key={w.index} className="flex items-center gap-3 rounded-lg border border-border bg-surface-sunken px-4 py-3">
                <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand text-xs
                                             font-semibold text-white tabular-nums">{i + 1}</span>
                <span className="min-w-0 flex-1 font-medium break-words text-fg">
                  <span className="sr-only">Winner {i + 1}: </span>{w.entry}
                </span>
                <span className="shrink-0 text-xs text-subtle">position {(w.index + 1).toLocaleString("en-US")}</span>
              </li>
            ))}
          </ol>
          <ReceiptCard receipt={result.receipt} receiptText={result.receiptText} />
          <ShareLink label="Result link" path={verifyPath(id)} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader icon={<ListChecks />} title="How anyone can check this"
                    description="No account needed: the check runs in the visitor's browser." />
        <CardBody className="space-y-5">
          <ol className="list-decimal space-y-2 pl-5 text-sm text-muted marker:text-subtle">
            <li>Publish your entry list (one per line) next to the result link. Order doesn&apos;t matter.</li>
            <li>
              Visitors open the link and paste the list. Their browser recomputes its SHA-256 fingerprint and compares it
              with the signed commitment.
            </li>
            <li>
              It then re-derives the winners from the published seed and compares them with the signed result. The page
              also shows how many draws have ever used the same list, which exposes re-rolling.
            </li>
          </ol>
          {result.selection && (
            <CopyValue label={`Published selection seed (${result.selection.algorithm})`} value={result.selection.seedHex} />
          )}
          <p className="text-xs text-subtle">
            The seed appears in the signed result only after the draw ran, when the list was already committed.
          </p>
          <ButtonLink href={verifyPath(id)} variant="secondary">Open the verification page</ButtonLink>
          <div className="border-t border-border pt-5">
            <Evidence result={result} />
          </div>
        </CardBody>
      </Card>

      <div className="flex justify-center">
        <Button variant="secondary" onClick={onStartOver}>
          <RotateCcw className="size-4" aria-hidden /> Start a new draw
        </Button>
      </div>
    </>
  );
}
