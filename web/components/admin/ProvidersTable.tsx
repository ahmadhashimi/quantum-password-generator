import { Atom, Cpu } from "lucide-react";

import { count } from "@/components/dashboard/format";
import { Badge, StatusDot, Table, Td, Th } from "@/components/ui";
import { formatUnix, sourceLabel, timeAgo } from "@/lib/format";

import type { AdminProvider } from "./providers";

const dash = <span className="text-subtle">-</span>;

function Source({ p }: { p: AdminProvider }) {
  const { view } = p;
  return (
    <div className="space-y-1.5">
      <p className="font-medium text-fg">{sourceLabel(view.name)}</p>
      {view.quantum ? (
        <Badge tone="violet" icon={<Atom aria-hidden />} title="Reported by the operator; not independently verifiable">
          Quantum
        </Badge>
      ) : (
        <Badge tone="neutral" icon={<Cpu aria-hidden />}>{view.simulator ? "Simulator: not quantum" : "Classical"}</Badge>
      )}
    </div>
  );
}

function Health({ p }: { p: AdminProvider }) {
  const h = p.health;
  if (!h) return dash;
  return (
    <div className="space-y-0.5 text-xs whitespace-nowrap">
      <p>
        <span className="text-subtle">RCT cutoff</span> {h.rctCutoff ?? "-"}
        <span aria-hidden className="text-subtle"> · </span>
        <span className="text-subtle">APT cutoff</span> {h.aptCutoff ?? "-"}
      </p>
      <p>
        {h.samples === null ? "-" : count(h.samples)} <span className="text-subtle">samples</span>
        <span aria-hidden className="text-subtle"> · </span>
        <span className={h.failures ? "font-medium text-warning" : undefined}>
          {h.failures === null ? "-" : count(h.failures)} {h.failures === 1 ? "failure" : "failures"}
        </span>
      </p>
    </div>
  );
}

/**
 * Operator detail for every entropy source. State and availability are live telemetry about now: they say nothing
 * about which sources contributed to a past receipt.
 */
export function ProvidersTable({ providers, now }: { providers: AdminProvider[]; now: number | null }) {
  return (
    <Table className="min-w-[60rem]">
      <caption className="sr-only">Entropy sources: state, counters, health screening and pool</caption>
      <thead>
        <tr>
          <Th>Source</Th>
          <Th>State</Th>
          <Th className="text-right">Successes</Th>
          <Th>Last error</Th>
          <Th>Health screening</Th>
          <Th>Pool</Th>
          <Th className="text-right">Jobs, 24 h</Th>
          <Th>Mode</Th>
        </tr>
      </thead>
      <tbody>
        {providers.map((p) => {
          const { view } = p;
          return (
            <tr key={view.name}>
              <Td><Source p={p} /></Td>
              <Td>
                <p className="flex items-center gap-2 whitespace-nowrap">
                  <StatusDot tone={view.tone} />
                  <span className="font-medium">{view.stateLabel}</span>
                </p>
                <p className="mt-1 text-xs text-muted">{view.available ? "Available now" : "Not available"}</p>
                {view.lastSuccessAt && (
                  <p className="mt-1 text-xs text-muted" title={formatUnix(view.lastSuccessAt)}>
                    {view.isPool ? "Harvested" : "Succeeded"}{" "}
                    {now === null ? formatUnix(view.lastSuccessAt) : timeAgo(view.lastSuccessAt, now)}
                  </p>
                )}
              </Td>
              <Td className="text-right tabular-nums">{p.successes === null ? dash : count(p.successes)}</Td>
              <Td className="max-w-64">
                {p.lastError
                  ? <p title={p.lastError} className="line-clamp-3 font-mono text-xs break-words text-danger">{p.lastError}</p>
                  : <span className="text-muted">None</span>}
              </Td>
              <Td><Health p={p} /></Td>
              <Td className="text-xs tabular-nums whitespace-nowrap">
                {view.poolBytes === null ? dash : (
                  <>
                    {count(view.poolBytes)} bytes
                    <span className="block text-muted">{count(view.poolSeeds ?? 0)} seeds</span>
                  </>
                )}
              </Td>
              <Td className="text-right tabular-nums">{view.jobsLast24h === null ? dash : count(view.jobsLast24h)}</Td>
              <Td className="whitespace-nowrap">
                {p.mode === "hardware" ? "Hardware" : p.mode === "simulator" ? "Simulator" : dash}
              </Td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}
