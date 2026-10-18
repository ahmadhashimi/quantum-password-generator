"use client";

import { Activity, Atom, RefreshCw, ShieldCheck } from "lucide-react";

import { Badge, Button, Callout, Card, CardBody, Skeleton, StatusDot } from "@/components/ui";
import type { EntropyStatus } from "@/lib/api/schemas";
import { formatUnix, sourceLabel, timeAgo } from "@/lib/format";

import { ProviderCard } from "./ProviderCard";
import { summarize } from "./provider-state";
import { type HealthResult, type StatusError, useSourceStatus } from "./useSourceStatus";

const names = (views: { name: string }[]): string => views.map((v) => sourceLabel(v.name)).join(", ");

function Banner({ status }: { status: EntropyStatus }) {
  const { availableQuantum, unavailableQuantum, simulatorAvailable } = summarize(status);
  // The server's flag is not taken on its own: a source is only named as available if its own entry says so.
  if (status.quantum_available && availableQuantum.length > 0) {
    return (
      <Callout tone="success" role="status" title="Quantum source available">
        <p>
          Available now: {names(availableQuantum)}.
          {unavailableQuantum.length > 0 && <> Not available: {names(unavailableQuantum)}.</>}{" "}
          New requests that use an available quantum source also mix in the OS CSPRNG.
          {availableQuantum.every((v) => v.isPool) && " The IBM pool serves signed-in users only."}
        </p>
      </Callout>
    );
  }
  return (
    <Callout tone="warning" role="status"
             title="Fallback in use: results come from the OS CSPRNG only and are labelled not quantum">
      <p>
        No quantum source is available right now. Receipts issued meanwhile list <code>os_csprng</code> as the only source
        and say <code>quantum: false</code>.
        {simulatorAvailable && (
          <> The IBM simulator is classical: anything seeded from it is labelled <code>ibm_simulator</code> and is not
            quantum.</>
        )}
      </p>
    </Callout>
  );
}

function ApiHealth({ health }: { health: HealthResult | null }) {
  if (!health) return <Skeleton className="h-16" />;
  const ok = health.ok && health.status === "ok";
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 shadow-card">
      <StatusDot tone={ok ? "success" : "danger"} />
      <div className="min-w-0 text-sm">
        <p className="font-medium text-fg">Evidence API</p>
        <p className="text-muted">
          {health.ok
            ? <>Health check {ok ? "passed" : `reported "${health.status}"`} · version <code>{health.version}</code></>
            : "Health check failed"}
        </p>
      </div>
    </div>
  );
}

function Failure({ error, stale, checkedAt, now }: {
  error: StatusError;
  stale: boolean;
  checkedAt: number | null;
  now: number | null;
}) {
  const reqId = error.requestId && <> Request ID: <code>{error.requestId}</code>.</>;
  if (!stale) {
    return (
      <Callout tone="danger" role="alert" title="Source status is unavailable">
        <p>{error.message}{reqId}</p>
      </Callout>
    );
  }
  return (
    <Callout tone="warning" role="status" title="Could not refresh">
      <p>
        {error.message} Showing the last result, checked {timeAgo(checkedAt, now ?? undefined)}.{reqId}
      </p>
    </Callout>
  );
}

function Loading() {
  return (
    <div role="status" aria-busy="true" className="space-y-4">
      <span className="sr-only">Loading source status</span>
      <Skeleton className="h-24" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-56" />
        <Skeleton className="h-56" />
      </div>
    </div>
  );
}

/**
 * Live view of the entropy sources, polled every 30 s while the page is visible. It shows availability only, which
 * is telemetry about now and not evidence that a source contributed to any past receipt.
 */
export function SourceMonitor() {
  const { status, health, error, refreshing, serverNow, checkedAt, refresh } = useSourceStatus();
  const views = status ? summarize(status).views : [];

  return (
    <div className="space-y-6">
      {status && <Banner status={status} />}
      {error && <Failure error={error} stale={status !== null} checkedAt={checkedAt} now={serverNow} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm text-muted">
          <Activity aria-hidden className="size-4 text-accent" />
          {checkedAt === null ? (
            <span>{refreshing ? "Checking sources" : "Not checked yet"}</span>
          ) : (
            <span>
              Checked {timeAgo(checkedAt, serverNow ?? undefined)}
              <span className="text-subtle"> · {formatUnix(checkedAt)}</span>
            </span>
          )}
        </p>
        {/* aria-disabled, not disabled: a disabled button would drop keyboard focus mid-refresh. */}
        <Button variant="secondary" size="sm" onClick={refreshing ? undefined : refresh} aria-disabled={refreshing}
                aria-busy={refreshing} className="aria-disabled:pointer-events-none aria-disabled:opacity-50">
          <RefreshCw aria-hidden className={refreshing ? "size-3.5 animate-spin" : "size-3.5"} />
          {refreshing ? "Refreshing" : "Refresh"}
        </Button>
      </div>

      {!status && !error && <Loading />}

      {status && (
        <>
          {views.length === 0 ? (
            <Callout tone="neutral" title="No entropy providers reported" />
          ) : (
            <section aria-labelledby="sources-heading" className="space-y-3">
              <h2 id="sources-heading" className="sr-only">Entropy sources</h2>
              <ul className="grid gap-4 sm:grid-cols-2">
                {views.map((v) => (
                  <li key={v.name}><ProviderCard view={v} now={serverNow ?? 0} /></li>
                ))}
              </ul>
            </section>
          )}

          <Card>
            <CardBody className="flex flex-wrap items-center gap-x-4 gap-y-2 p-5 text-sm">
              <Badge tone="neutral" icon={<ShieldCheck aria-hidden />}>Baseline</Badge>
              <p className="min-w-0 text-muted">
                <span className="font-medium text-fg">OS CSPRNG</span> is mixed into every request and is the only source
                when no quantum source is available.
              </p>
            </CardBody>
          </Card>
        </>
      )}

      <ApiHealth health={health} />

      <Callout tone="neutral">
        <p className="flex items-start gap-2">
          <Atom aria-hidden className="mt-0.5 size-4 shrink-0 text-subtle" />
          <span>
            Availability is live telemetry, not evidence of a source&apos;s contribution to a past receipt; each receipt
            lists the sources actually used.
          </span>
        </p>
      </Callout>
    </div>
  );
}
