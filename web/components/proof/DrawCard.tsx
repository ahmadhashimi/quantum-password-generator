"use client";

import { Dices } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";

import { Badge, Button, ButtonLink, Callout, Card, CardBody, CardHeader, Field, Skeleton, Stat, Textarea }
  from "@/components/ui";
import type { VerifyResult } from "@/lib/api/schemas";
import { RECEIPT_ID } from "@/lib/format";
import { type Check, type KeySet, verifyReceiptText } from "@/lib/verify/verify";

import { CheckRow, CopyableValue, SectionBadges, Term } from "./parts";
import { drawStatus, drawView, humanDuration, type Optional, parseEntries, type PayloadView, truncateMiddle }
  from "./proof-data";

interface EntriesOutcome {
  pasted: number;
  checks: Check[];
}

function RelatedReceipt({ label, id, current }: { label: string; id: string; current: string }) {
  if (id === current) return <Badge tone="violet">{label}: this receipt</Badge>;
  // The ID comes from signed (but possibly unverified) data or the server: only well-formed IDs become links.
  if (!RECEIPT_ID.test(id)) return <Badge>{label}: <span className="font-mono">{truncateMiddle(id, 12, 4)}</span></Badge>;
  return (
    <ButtonLink href={`/verify/${id}`} variant="secondary" size="sm">
      {label}: <span className="font-mono">{id}</span>
    </ButtonLink>
  );
}

function ServerDraw({ server }: { server: Optional<VerifyResult> }) {
  if (server.status === "idle") return null;
  if (server.status === "loading") return <Skeleton className="h-28 w-full" />;
  if (server.status === "error") {
    return <p className="text-sm text-muted">The server&apos;s draw record is unavailable ({server.message}).</p>;
  }
  const draw = server.data.draw;
  if (!draw) return <p className="text-sm text-muted">The server has no draw record for this receipt.</p>;
  const status = drawStatus(draw.status);
  const owner = draw.draws_by_same_owner_over_same_entries;
  const anyone = draw.draws_by_anyone_over_same_entries;
  const seconds = draw.committed_seconds_before_run;
  return (
    <div className="space-y-4 border-t border-border pt-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-fg">The server&apos;s draw record</h3>
        <Badge tone={status.tone}>{status.label}</Badge>
        <span className="text-xs text-subtle">Draw <span className="font-mono">{draw.draw_id}</span></span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Draws by this organiser" value={owner.toLocaleString("en-US")}
              hint={owner <= 1 ? "No re-rolls recorded over this entry list." : "Re-rolls recorded: this list was drawn more than once."} />
        <Stat label="Draws by anyone" value={anyone.toLocaleString("en-US")}
              hint={anyone <= 1 ? "No other draw used this entry list." : "Other draws used this exact entry list."} />
        <Stat label="Committed before run" value={seconds === null || seconds === undefined ? "—" : humanDuration(seconds)}
              hint={seconds === null || seconds === undefined ? "The draw has not run yet." : "Between the commitment and the draw."} />
      </div>
      <p className="text-xs text-subtle">
        These figures come from this server&apos;s own records. A server that withholds draws can understate the counts.
      </p>
    </div>
  );
}

function EntriesCheck({ receiptText, keys, expected, enabled }: {
  receiptText: string;
  keys: KeySet;
  expected: number | null;
  enabled: boolean;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<EntriesOutcome | null>(null);

  function run(e: FormEvent) {
    e.preventDefault();
    const entries = parseEntries(text);
    if (!entries.length) {
      setError("Paste at least one entry.");
      setOutcome(null);
      return;
    }
    setError(null);
    try {
      const result = verifyReceiptText(receiptText, keys, { entries });
      setOutcome({ pasted: entries.length, checks: result.checks.filter((c) => c.id === "entries" || c.id === "selection") });
    } catch {
      setError("That list couldn't be checked. Remove unusual characters and try again.");
      setOutcome(null);
    }
  }

  let summary: ReactNode = null;
  if (outcome) {
    if (outcome.checks.length === 0) {
      summary = <Callout tone="neutral" title="Nothing to compare">The entry list can&apos;t be checked until the receipt itself verifies.</Callout>;
    } else {
      const entriesCheck = outcome.checks.find((c) => c.id === "entries");
      summary = (
        <div className="space-y-3">
          <ul className="space-y-2.5">
            {outcome.checks.map((c) => (
              <CheckRow key={c.id} state={c.ok ? "pass" : "fail"} label={c.label} detail={c.detail} />
            ))}
          </ul>
          {entriesCheck && !entriesCheck.ok && !entriesCheck.detail && (
            <p className="text-xs text-muted">
              You pasted {outcome.pasted.toLocaleString("en-US")} entries; the receipt commits to{" "}
              {expected === null ? "an unknown number" : expected.toLocaleString("en-US")}. Spelling, spacing and
              duplicates all change the fingerprint.
            </p>
          )}
        </div>
      );
    }
  }

  return (
    <form onSubmit={run} noValidate className="space-y-4 border-t border-border pt-5">
      <Field label="Check the entry list" error={error ?? undefined}
             hint="One entry per line, in any order. Your browser compares its SHA-256 fingerprint with the signed one and, for results, recomputes the winners from the published seed. Nothing is sent.">
        {({ id, describedBy, invalid }) => (
          <Textarea id={id} rows={6} spellCheck={false} className="font-mono" value={text} disabled={!enabled}
                    aria-describedby={describedBy} aria-invalid={invalid}
                    onChange={(e) => {
                      setText(e.target.value);
                      setOutcome(null);
                    }} />
        )}
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="secondary" disabled={!enabled}>Check entry list</Button>
        {!enabled && <p className="text-xs text-subtle">Available once the receipt verifies.</p>}
      </div>
      <div role="status">{summary}</div>
    </form>
  );
}

/** Section 7 (draw_commit, draw): the committed list, the winners, the published seed and a local re-check. */
export function DrawCard({ view, receiptText, keys, server, verified }: {
  view: PayloadView;
  receiptText: string;
  keys: KeySet;
  server: Optional<VerifyResult>;
  verified: boolean;
}) {
  const d = drawView(view);
  const isResult = view.kind === "draw";
  const record = server.status === "ok" ? server.data.draw : undefined;
  // The signed result names its commit receipt; the server's record can also name the result from a commit receipt.
  const commitId = d.commitReceiptId ?? record?.commit_receipt_id ?? null;
  const resultId = record?.result_receipt_id ?? null;
  return (
    <Card id="draw">
      <CardHeader icon={<Dices />} title={isResult ? "Draw result" : "Draw commitment"}
                  description={isResult
                    ? "The winners follow from the committed entry list and the published seed, so anyone can recompute them."
                    : "The entry list is fingerprinted and signed before any randomness is drawn, so a later swap is detectable."}
                  action={<SectionBadges verified={verified}><Badge tone="violet">Signed by this server</Badge></SectionBadges>} />
      <CardBody className="space-y-6">
        <div className="space-y-2">
          <dl className="grid gap-4 sm:grid-cols-2">
            <Term label="Title">{d.title ?? "—"}</Term>
            <Term label="Entries committed">{d.entriesCount === null ? "—" : d.entriesCount.toLocaleString("en-US")}</Term>
            <Term label="Number of winners">{d.winnerCount === null ? "—" : d.winnerCount.toLocaleString("en-US")}</Term>
            <Term label="Entry list fingerprint (SHA-256)">
              {d.entriesSha256 ? (
                <CopyableValue value={d.entriesSha256} label="entry list fingerprint" display={truncateMiddle(d.entriesSha256, 20, 10)} />
              ) : "—"}
            </Term>
          </dl>
          <p className="text-xs text-subtle">
            The title and entries are text the organiser supplied. The signature proves the server recorded them, not that
            they are true.
          </p>
        </div>

        {isResult && d.winners && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-fg">{d.winners.length === 1 ? "Winner" : "Winners"}, in draw order</h3>
            <ol className="space-y-2">
              {d.winners.map((w, i) => (
                <li key={w.index} className="flex items-center gap-3 rounded-lg border border-border bg-surface-sunken px-4 py-2.5">
                  <span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand text-xs
                                               font-semibold text-white tabular-nums">{i + 1}</span>
                  <span className="min-w-0 flex-1 font-medium break-words text-fg">{w.entry}</span>
                  <span className="shrink-0 text-xs text-subtle" title="Position in the sorted entry list">
                    position {(w.index + 1).toLocaleString("en-US")}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {isResult ? (
          d.selection ? (
            <dl>
              <Term label={`Published selection seed (${d.selection.algorithm})`}>
                <CopyableValue value={d.selection.seedHex} label="selection seed" display={truncateMiddle(d.selection.seedHex, 24, 12)} />
              </Term>
            </dl>
          ) : (
            <p className="text-sm text-muted">This older receipt publishes no selection seed, so the winners can&apos;t be recomputed.</p>
          )
        ) : (
          <p className="text-sm text-muted">
            A commitment carries no selection seed. The result receipt publishes it.
          </p>
        )}

        {(commitId || resultId) && (
          <div className="flex flex-wrap gap-2">
            {commitId && <RelatedReceipt label="Commit receipt" id={commitId} current={view.receiptId} />}
            {resultId && <RelatedReceipt label="Result receipt" id={resultId} current={view.receiptId} />}
          </div>
        )}

        <EntriesCheck receiptText={receiptText} keys={keys} expected={d.entriesCount} enabled={verified} />
        <ServerDraw server={server} />
      </CardBody>
    </Card>
  );
}
