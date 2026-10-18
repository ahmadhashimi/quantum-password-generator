"use client";

import { CheckCircle2, RefreshCw, SearchCheck } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

import { formatIso } from "@/components/dashboard/format";
import { Badge, Button, buttonClass, Callout, Card, CardBody, CardHeader, Skeleton } from "@/components/ui";
import { api, ApiError } from "@/lib/api/client";
import { DrawRunResponse, Investigations as InvestigationList } from "@/lib/api/schemas";
import { useAppAuth } from "@/lib/auth/client";
import { RECEIPT_ID, sourceLabel } from "@/lib/format";

type Draw = InvestigationList["draws"][number];
type Winner = DrawRunResponse["winners"][number];

type Step =
  | { step: "confirm" }
  | { step: "running" }
  | { step: "done"; winners: Winner[]; resultReceiptId: string }
  | { step: "failed"; message: string; conflict: boolean };

const messageOf = (e: unknown): string =>
  e instanceof ApiError ? e.message
    : e instanceof TypeError ? "The server could not be reached."
    : "Something went wrong.";

/** What the persisted seed's provenance says. The shape is the operator's record, so read it defensively. */
function seedSources(provenance: Draw["seed_provenance"]): { sources: string[]; quantum: boolean } | null {
  if (!provenance) return null;
  const sources = Array.isArray(provenance.sources)
    ? provenance.sources.filter((s): s is string => typeof s === "string")
    : [];
  return { sources, quantum: provenance.quantum === true };
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-subtle uppercase">{label}</dt>
      <dd className="mt-1 text-sm text-fg">{children}</dd>
    </div>
  );
}

function DrawItem({ draw, getToken, onReload }: { draw: Draw; getToken: () => Promise<string | null>;
                                                   onReload: () => void }) {
  const [state, setState] = useState<Step | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const inFlight = useRef(false);
  const seed = seedSources(draw.seed_provenance);

  useEffect(() => {
    if (state?.step === "confirm") cancel.current?.focus();
    if (state === null && restoreFocus.current) {
      restoreFocus.current = false;
      trigger.current?.focus();
    }
  }, [state]);

  async function complete() {
    if (inFlight.current) return;
    inFlight.current = true;
    setState({ step: "running" });
    try {
      const res = await api(`/api/v2/admin/draws/${encodeURIComponent(draw.draw_id)}/complete`,
                            { schema: DrawRunResponse, method: "POST", getToken });
      setState({ step: "done", winners: res.winners, resultReceiptId: res.receipt.payload.receipt_id });
    } catch (e) {
      setState({ step: "failed", message: messageOf(e), conflict: e instanceof ApiError && e.status === 409 });
    } finally {
      inFlight.current = false;
    }
  }

  const titleId = `draw-${draw.draw_id}-title`;
  return (
    <li className="rounded-lg border border-border bg-surface-sunken p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={titleId} className="font-medium text-fg">{draw.title || "Untitled draw"}</h3>
          <p className="mt-0.5 font-mono text-xs break-all text-muted">{draw.draw_id}</p>
        </div>
        <Badge tone="warning">Needs investigation</Badge>
      </div>

      <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        <Fact label="Owner"><span className="font-mono text-xs break-all">{draw.owner_id ?? "Anonymous"}</span></Fact>
        <Fact label="Entries and winners">{draw.entries_count.toLocaleString("en-US")} entries, {draw.winners} {draw.winners === 1 ? "winner" : "winners"}</Fact>
        <Fact label="Committed"><time dateTime={draw.created_at}>{formatIso(draw.created_at)}</time></Fact>
        <Fact label="Run started">
          {draw.run_started_at ? <time dateTime={draw.run_started_at}>{formatIso(draw.run_started_at)}</time> : "Not recorded"}
        </Fact>
        <Fact label="Seed sources (operator-asserted)">
          {seed === null ? "No provenance recorded" : (
            <span className="flex flex-wrap items-center gap-1.5">
              {seed.sources.length > 0 ? seed.sources.map(sourceLabel).join(", ") : "None listed"}
              <Badge tone={seed.quantum ? "accent" : "warning"}>{seed.quantum ? "Reported quantum" : "Not quantum"}</Badge>
            </span>
          )}
        </Fact>
        <Fact label="Commit receipt">
          {RECEIPT_ID.test(draw.commit_receipt_id) ? (
            <Link href={`/verify/${draw.commit_receipt_id}`} prefetch={false}
                  className="font-mono text-xs text-accent underline underline-offset-2 hover:text-accent-strong">
              {draw.commit_receipt_id}
            </Link>
          ) : <span className="font-mono text-xs break-all">{draw.commit_receipt_id}</span>}
        </Fact>
      </dl>

      <div className="mt-4 space-y-3">
        {state === null && (
          <button ref={trigger} type="button" aria-describedby={titleId} className={buttonClass("primary", "sm")}
                  onClick={() => setState({ step: "confirm" })}>
            Complete from saved seed
          </button>
        )}

        {(state?.step === "confirm" || state?.step === "running") && (
          <div role="group" aria-label={`Confirm completing ${draw.title || "this draw"}`}
               className="space-y-3 rounded-lg border border-warning/30 bg-warning-soft p-4 text-sm">
            <p className="font-medium text-fg">Publish this draw&apos;s result?</p>
            <p className="text-muted">
              This recomputes the winners from the seed saved when the draw ran. No new randomness is drawn, so the winners
              are the ones this draw was always going to have. The result receipt is signed and published, and the action is
              recorded in the audit log as <code>draw.admin_complete</code>. It cannot be undone.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={complete} disabled={state.step === "running"}>
                {state.step === "running" ? "Publishing..." : "Confirm and publish"}
              </Button>
              <button ref={cancel} type="button" className={buttonClass("secondary", "sm")}
                      disabled={state.step === "running"}
                      onClick={() => { restoreFocus.current = true; setState(null); }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {state?.step === "failed" && (
          <Callout tone={state.conflict ? "warning" : "danger"} role="alert"
                   title={state.conflict ? "This draw can no longer be completed" : "Could not complete the draw"}>
            <p>{state.message}</p>
            <div className="flex flex-wrap gap-2 pt-2">
              {state.conflict
                ? <Button variant="secondary" size="sm" onClick={onReload}>Reload the list</Button>
                : <Button variant="secondary" size="sm" onClick={() => setState({ step: "confirm" })}>Try again</Button>}
            </div>
          </Callout>
        )}

        {state?.step === "done" && (
          <Callout tone="success" role="status" title="Result published">
            <p>
              The winners below were computed from the saved seed; nothing was re-rolled. The audit log records this as{" "}
              <code>draw.admin_complete</code>.
            </p>
            <ol className="mt-2 space-y-1">
              {state.winners.map((w, i) => (
                <li key={`${w.index}-${i}`} className="flex flex-wrap items-baseline gap-2 text-fg">
                  <span className="tabular-nums text-muted">{i + 1}.</span>
                  <span className="font-medium break-all">{w.entry}</span>
                  <span className="text-xs text-subtle">index {w.index}</span>
                </li>
              ))}
            </ol>
            <p className="pt-2">
              {RECEIPT_ID.test(state.resultReceiptId) ? (
                <Link href={`/verify/${state.resultReceiptId}`} prefetch={false}
                      className="inline-flex items-center gap-1.5 text-accent underline underline-offset-2 hover:text-accent-strong">
                  <CheckCircle2 className="size-3.5" aria-hidden /> Open the result receipt
                </Link>
              ) : <>Result receipt <code>{state.resultReceiptId}</code></>}
            </p>
          </Callout>
        )}
      </div>
    </li>
  );
}

/** Draws interrupted after their outcome was fixed, which an operator can publish from the saved seed. */
export function Investigations() {
  const { loaded, getToken } = useAppAuth();
  const [draws, setDraws] = useState<Draw[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  const fetchDraws = useCallback(
    (signal: AbortSignal) =>
      api("/api/v2/admin/draws/investigate", { schema: InvestigationList, getToken, signal }).then((r) => r.draws),
    [getToken],
  );

  useEffect(() => {
    if (!loaded) return;
    const controller = new AbortController();
    fetchDraws(controller.signal).then(
      (list) => {
        if (controller.signal.aborted) return;
        setDraws(list);
        setError(null);
        setRefreshing(false);
      },
      (e: unknown) => {
        if (controller.signal.aborted) return;
        setError(messageOf(e));
        setRefreshing(false);
      },
    );
    return () => controller.abort();
  }, [loaded, fetchDraws, reloadKey]);

  /** Keeps the current list on screen until the new one arrives, so a draw being completed stays put. */
  const reload = () => {
    setError(null);
    setRefreshing(true);
    setReloadKey((k) => k + 1);
  };

  return (
    <Card id="investigations">
      <CardHeader icon={<SearchCheck />} title="Draws needing investigation"
                  description="A draw lands here when it was interrupted after its outcome was fixed. The seed stays on the server; you only choose whether to publish the result it already determines."
                  action={
                    <Button variant="ghost" size="sm" onClick={reload} disabled={refreshing}>
                      <RefreshCw className="size-3.5" aria-hidden /> Refresh
                    </Button>
                  } />
      <CardBody className="space-y-4">
        {error !== null && (
          <Callout tone="danger" role="alert" title="Could not load interrupted draws">
            <p>{error}</p>
            <div className="pt-2">
              <Button variant="secondary" size="sm" onClick={reload}><RefreshCw className="size-3.5" aria-hidden /> Try again</Button>
            </div>
          </Callout>
        )}

        {error === null && draws === null && (
          <div role="status" aria-busy="true">
            <span className="sr-only">Loading interrupted draws</span>
            <Skeleton className="h-32" />
          </div>
        )}

        {draws !== null && draws.length === 0 && (
          <Callout tone="success" title="Nothing to investigate">
            <p>No draw is waiting for an operator.</p>
          </Callout>
        )}

        {draws !== null && draws.length > 0 && (
          <ul className="space-y-4" aria-label="Interrupted draws">
            {draws.map((d) => <DrawItem key={d.draw_id} draw={d} getToken={getToken} onReload={reload} />)}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
