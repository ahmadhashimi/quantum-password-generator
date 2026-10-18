import { Atom, Cpu } from "lucide-react";
import { type ReactNode, useId } from "react";

import { Badge, StatusDot } from "@/components/ui";
import { formatUnix, sourceLabel, timeAgo } from "@/lib/format";

import { meaningOf, type ProviderView } from "./provider-state";

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-subtle uppercase">{label}</dt>
      <dd className="mt-1 text-sm text-fg tabular-nums">{children}</dd>
    </div>
  );
}

/**
 * One entropy source. It reports live availability only: it never says a source contributed to anything, because
 * availability now says nothing about which sources a past receipt used.
 */
export function ProviderCard({ view, now }: { view: ProviderView; now: number }) {
  const titleId = useId();
  const meaning = meaningOf(view);
  const lastLabel = view.isPool ? "Last harvest" : "Last success";
  return (
    <article aria-labelledby={titleId} className="flex h-full flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow-card">
      <header className="flex items-start justify-between gap-3">
        <h3 id={titleId} className="font-semibold text-fg">{sourceLabel(view.name)}</h3>
        {view.quantum ? (
          <Badge tone="violet" icon={<Atom aria-hidden />} title="Reported by the operator; not independently verifiable">
            Quantum
          </Badge>
        ) : (
          <Badge tone="neutral" icon={<Cpu aria-hidden />}>{view.simulator ? "Classical (simulator)" : "Classical"}</Badge>
        )}
      </header>

      <div className="space-y-1">
        <p className="flex items-center gap-2 text-sm">
          <StatusDot tone={view.tone} />
          <span className="font-medium text-fg">{view.stateLabel}</span>
          <span aria-hidden className="text-subtle">·</span>
          <span className="text-muted">{view.available ? "Available now" : "Not available"}</span>
        </p>
        {meaning && <p className="text-xs text-muted">{meaning}</p>}
      </div>

      <dl className="mt-auto grid grid-cols-2 gap-x-4 gap-y-3">
        <Item label={lastLabel}>
          {view.lastSuccessAt ? (
            <>
              {timeAgo(view.lastSuccessAt, now)}
              <span className="block text-xs text-muted">{formatUnix(view.lastSuccessAt)}</span>
            </>
          ) : "None recorded"}
        </Item>
        <Item label="Recent error">
          {view.recentError ? "Yes" : "No"}
          {view.recentError && <span className="block text-xs text-muted">Details are not public</span>}
        </Item>
        {view.isPool && (
          <>
            <Item label="Mode">{view.simulator ? "Simulator: not quantum" : "Hardware"}</Item>
            <Item label="Jobs in last 24 h">{view.jobsLast24h ?? "Not reported"}</Item>
            <Item label="Pool">
              {view.poolBytes?.toLocaleString("en-US")} bytes
              <span className="block text-xs text-muted">{view.poolSeeds?.toLocaleString("en-US")} seeds of 64 bytes</span>
            </Item>
          </>
        )}
      </dl>
    </article>
  );
}
