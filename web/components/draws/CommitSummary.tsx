"use client";

import { CheckCircle2, Lock } from "lucide-react";
import type { ReactNode } from "react";

import { Badge, Callout, Card, CardBody, CardHeader } from "@/components/ui";
import { ReceiptCard } from "@/components/receipts/ReceiptCard";

import { CopyValue, ShareLink } from "./CopyValue";
import { type Committed, commitDetails, verifyPath } from "./draw-data";
import { PhaseTitle } from "./PhaseTitle";

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium tracking-wide text-subtle uppercase">{label}</dt>
      <dd className="mt-1 text-sm break-words text-fg">{children}</dd>
    </div>
  );
}

/** What was locked in step 1: the signed commitment, its fingerprint and the link to share before running. */
export function CommitSummary({ committed, focusTitle, intro }: {
  committed: Committed;
  focusTitle: boolean;
  intro?: ReactNode;
}) {
  const { receipt, receiptText, matchesSubmission } = committed;
  const d = commitDetails(receipt);
  return (
    <Card>
      <CardHeader icon={<Lock />} title={<PhaseTitle focus={focusTitle}>Entries committed</PhaseTitle>}
                  description="Signed before the server gathers any randomness for this draw. Anyone holding this receipt can tell if a different list is later presented as the committed one."
                  action={<Badge tone="success" icon={<CheckCircle2 aria-hidden />}>Step 1 done</Badge>} />
      <CardBody className="space-y-5">
        {intro}
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Title">{d.title ?? "Unavailable"}</Fact>
          <Fact label="Entries">{d.entriesCount ?? "Unavailable"}</Fact>
          <Fact label="Winners">{d.winners ?? "Unavailable"}</Fact>
          <Fact label="Draw ID"><code className="font-mono text-xs break-all">{committed.drawId}</code></Fact>
        </dl>
        {d.sha256 && <CopyValue label="Entries fingerprint (SHA-256 of the sorted list)" value={d.sha256} />}
        {matchesSubmission === true && (
          <Callout tone="success" role="status" title="Matches what you submitted">
            This browser recomputed the fingerprint from your list, and the entry count and winners agree with the
            signed commitment.
          </Callout>
        )}
        {matchesSubmission === false && (
          <Callout tone="danger" role="alert" title="The signed commitment doesn't match your list">
            The fingerprint, entry count or winners in the receipt differ from what this browser submitted. Don&apos;t
            run this draw: start over and report it if it happens again.
          </Callout>
        )}
        <ReceiptCard receipt={receipt} receiptText={receiptText} />
        <ShareLink label="Commitment link" path={verifyPath(receipt.payload.receipt_id)} />
      </CardBody>
    </Card>
  );
}
