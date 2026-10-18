import { Atom, Coins, Cpu, Hash, Users } from "lucide-react";
import type { ReactNode } from "react";

import { count, formatIso, formatShare, formatUsd, kindLabelPlural, sortKinds } from "@/components/dashboard/format";
import { Callout, Card, CardBody, Meter, Stat, Table, Td, Th } from "@/components/ui";
import type { AdminStats } from "@/lib/api/schemas";
import { formatUnix, sourceLabel } from "@/lib/format";

import { ActivityChart } from "./ActivityChart";
import { ProvidersTable } from "./ProvidersTable";
import { adminProviders, entropyFacts } from "./providers";

function Block({ id, title, description, children }: { id: string; title: string; description?: ReactNode;
                                                         children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-4">
      <div>
        <h2 id={id} className="text-lg font-semibold tracking-tight text-fg">{title}</h2>
        {description && <p className="mt-1 max-w-3xl text-sm text-muted">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function EventsByKind({ events, total }: { events: Record<string, number>; total: number }) {
  const kinds = sortKinds(Object.keys(events));
  if (kinds.length === 0) {
    return <Callout tone="neutral" title="No events yet"><p>Usage events appear after the first request.</p></Callout>;
  }
  return (
    <Table className="min-w-[24rem]">
      <caption className="sr-only">Usage events by kind</caption>
      <thead>
        <tr><Th>Kind</Th><Th className="text-right">Events</Th><Th>Share</Th></tr>
      </thead>
      <tbody>
        {kinds.map((kind) => {
          const n = events[kind] ?? 0;
          const share = total > 0 ? n / total : 0;
          return (
            <tr key={kind}>
              <Td className="font-medium">{kindLabelPlural(kind)}</Td>
              <Td className="text-right tabular-nums">{count(n)}</Td>
              <Td className="w-48">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1"><Meter value={share} label={`${kindLabelPlural(kind)} share of events`} /></div>
                  <span className="w-10 text-right text-xs text-muted tabular-nums">{formatShare(share)}</span>
                </div>
              </Td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}

/** Everything on /admin that is plain metadata, rendered on the server. */
export function AdminOverview({ stats }: { stats: AdminStats }) {
  const providers = adminProviders(stats);
  const facts = entropyFacts(stats);
  // The API's own clock: "ago" labels and the chart's last day agree with how the API bucketed the data.
  const now = facts.checkedAt;
  const today = now === null ? undefined : new Date(now * 1000).toISOString().slice(0, 10);
  const interrupted = stats.draws_needing_investigation.length;

  return (
    <div className="space-y-12">
      {interrupted > 0 && (
        <Callout tone="warning" role="status"
                 title={`${interrupted} ${interrupted === 1 ? "draw needs" : "draws need"} investigation`}>
          <p>
            {interrupted === 1 ? "It was" : "They were"} interrupted after the outcome was fixed.{" "}
            <a href="#investigations" className="text-accent underline underline-offset-2 hover:text-accent-strong">
              Review {interrupted === 1 ? "it" : "them"} below.
            </a>
          </p>
        </Callout>
      )}

      <Block id="stats" title="Stats">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <Stat icon={<Users aria-hidden />} label="Users" value={count(stats.users)} />
          <Stat icon={<Hash aria-hidden />} label="Total events" value={count(stats.total_events)} />
          <Stat icon={<Atom aria-hidden />} label="Quantum share" value={formatShare(stats.quantum_share)}
                hint="Share of usage events the server flagged as quantum-seeded. Operator-reported." />
          <Stat icon={<Coins aria-hidden />} label="AI spend today" value={formatUsd(stats.assistant_cost_today_usd)} />
          <Stat icon={<Coins aria-hidden />} label="AI spend total" value={formatUsd(stats.assistant_cost_usd)} />
        </div>
      </Block>

      <Block id="activity" title="Last 30 days" description="Usage events per day.">
        <Card>
          <CardBody><ActivityChart daily={stats.daily} {...(today ? { today } : {})} /></CardBody>
        </Card>
      </Block>

      <Block id="kinds" title="Events by kind">
        <EventsByKind events={stats.events} total={stats.total_events} />
      </Block>

      <Block id="providers" title="Entropy sources"
             description="Live operator view of every source. State and availability are telemetry about now, not evidence of a source's contribution to a past receipt.">
        <div className="space-y-3">
          {(facts.quantumAvailable !== null || facts.checkedAt !== null || facts.fallback !== null) && (
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
              <Cpu aria-hidden className="size-4 text-accent" />
              {facts.quantumAvailable !== null && (
                <span>{facts.quantumAvailable ? "A quantum source is available" : "No quantum source is available"}</span>
              )}
              {facts.fallback && <span>Fallback: {sourceLabel(facts.fallback)}</span>}
              {facts.checkedAt !== null && (
                <span>Checked {formatUnix(facts.checkedAt)}</span>
              )}
            </p>
          )}
          {providers.length === 0 ? (
            <Callout tone="neutral" title="No source detail">
              <p>The API did not report any entropy sources.</p>
            </Callout>
          ) : (
            <ProvidersTable providers={providers} now={now} />
          )}
          <p className="max-w-3xl text-xs text-muted">
            Health screening is SP 800-90B-style RCT/APT screening (not a NIST validation). Last error text is shown to
            operators only and is never part of public status.
          </p>
        </div>
      </Block>

      <Block id="users" title="Recent users">
        {stats.recent_users.length === 0 ? (
          <Callout tone="neutral" title="No signed-in users yet"><p>Users appear here after their first signed-in request.</p></Callout>
        ) : (
          <Table className="min-w-[32rem]">
            <caption className="sr-only">Most recently seen users</caption>
            <thead>
              <tr><Th>Name</Th><Th>Email</Th><Th>Last seen (UTC)</Th></tr>
            </thead>
            <tbody>
              {stats.recent_users.map((u) => (
                <tr key={u.id}>
                  <Td>{u.name ?? <span className="text-subtle">-</span>}</Td>
                  <Td className="break-all">{u.email ?? <span className="text-subtle">-</span>}</Td>
                  <Td className="text-muted tabular-nums whitespace-nowrap">
                    <time dateTime={u.last_seen}>{formatIso(u.last_seen)}</time>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Block>
    </div>
  );
}
