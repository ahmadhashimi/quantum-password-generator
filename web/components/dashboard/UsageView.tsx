import { Bot, Dices, Gauge, MessageSquare, Zap } from "lucide-react";
import type { ReactNode } from "react";

import { Badge, Callout, Card, Meter, Table, Td, Th } from "@/components/ui";
import type { MeUsage } from "@/lib/api/schemas";

import { count, formatUsd, kindLabelPlural, sortKinds, usedRatio } from "./format";

const meterTone = (ratio: number) => (ratio >= 1 ? "danger" : ratio >= 0.8 ? "warning" : "brand");

/** A cap with a meter. Colour is backed by a text label, so the state never relies on colour alone. */
function Limit({ icon, title, used, cap, usedText, capText, hint, footer }: {
  icon: ReactNode;
  title: string;
  used: number;
  cap: number;
  usedText: string;
  capText: string;
  hint: ReactNode;
  footer?: ReactNode;
}) {
  const ratio = usedRatio(used, cap);
  return (
    <Card className="p-5">
      <h3 className="flex items-center gap-2 text-xs font-medium tracking-wide text-subtle uppercase [&>svg]:size-3.5">
        {icon}
        {title}
      </h3>
      <p className="mt-2 flex flex-wrap items-baseline gap-x-2 text-2xl font-semibold text-fg tabular-nums">
        {usedText}
        <span className="text-sm font-normal text-muted">of {capText}</span>
      </p>
      <div className="mt-3">
        <Meter value={ratio} label={`${title}: ${usedText} of ${capText}`} tone={meterTone(ratio)} />
      </div>
      <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
        {ratio >= 1 && <Badge tone="danger">Limit reached</Badge>}
        {ratio >= 0.8 && ratio < 1 && <Badge tone="warning">Close to the limit</Badge>}
        <span>{hint}</span>
      </p>
      {footer}
    </Card>
  );
}

function Fact({ icon, title, value, hint }: { icon: ReactNode; title: string; value: string; hint: ReactNode }) {
  return (
    <Card className="p-5">
      <h3 className="flex items-center gap-2 text-xs font-medium tracking-wide text-subtle uppercase [&>svg]:size-3.5">
        {icon}
        {title}
      </h3>
      <p className="mt-2 text-2xl font-semibold text-fg tabular-nums">{value}</p>
      <p className="mt-3 text-xs text-muted">{hint}</p>
    </Card>
  );
}

export function UsageView({ usage }: { usage: MeUsage }) {
  const { today, month, quotas } = usage;
  const kinds = sortKinds([...Object.keys(today), ...Object.keys(month)]);
  const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
  const messagesToday = today.assistant_message ?? 0;

  return (
    <div className="space-y-10">
      <Callout tone="info" title="Password generation is never blocked by assistant caps">
        <p>
          The assistant limits below only stop assistant messages. Generating passwords, passphrases and random keys, and
          the API, keep working when an assistant limit is reached. Daily counts reset at 00:00 UTC.
        </p>
      </Callout>

      <section aria-labelledby="counts" className="space-y-4">
        <h2 id="counts" className="text-lg font-semibold tracking-tight text-fg">What you have used</h2>
        {kinds.length === 0 ? (
          <Callout tone="neutral" title="Nothing used this month">
            <p>Counts appear here as you generate secrets, run draws or use the assistant.</p>
          </Callout>
        ) : (
          <Table className="min-w-[24rem]">
            <caption className="sr-only">Results issued by kind, today and this month (UTC)</caption>
            <thead>
              <tr>
                <Th>Kind</Th>
                <Th className="text-right">Today</Th>
                <Th className="text-right">This month</Th>
              </tr>
            </thead>
            <tbody>
              {kinds.map((kind) => (
                <tr key={kind}>
                  <Td className="font-medium">{kindLabelPlural(kind)}</Td>
                  <Td className="text-right tabular-nums">{count(today[kind] ?? 0)}</Td>
                  <Td className="text-right tabular-nums">{count(month[kind] ?? 0)}</Td>
                </tr>
              ))}
              <tr>
                <Td className="font-semibold">Total</Td>
                <Td className="text-right font-semibold tabular-nums">{count(sum(today))}</Td>
                <Td className="text-right font-semibold tabular-nums">{count(sum(month))}</Td>
              </tr>
            </tbody>
          </Table>
        )}
      </section>

      <section aria-labelledby="limits" className="space-y-4">
        <h2 id="limits" className="text-lg font-semibold tracking-tight text-fg">Your limits today</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Limit icon={<Dices aria-hidden />} title="Draws today" used={usage.draws_today} cap={quotas.draws_per_day}
                 usedText={count(usage.draws_today)} capText={count(quotas.draws_per_day)}
                 hint="Draws you committed since 00:00 UTC." />
          <Limit icon={<Bot aria-hidden />} title="Assistant spend today" used={usage.assistant_spend_today_usd}
                 cap={quotas.assistant_budget_per_day_usd} usedText={formatUsd(usage.assistant_spend_today_usd)}
                 capText={`${formatUsd(quotas.assistant_budget_per_day_usd)} per day`}
                 hint={<>{formatUsd(usage.assistant_spend_month_usd)} this month.</>} />
          <Limit icon={<MessageSquare aria-hidden />} title="Assistant messages today" used={messagesToday}
                 cap={quotas.assistant_messages_per_day} usedText={count(messagesToday)}
                 capText={count(quotas.assistant_messages_per_day)} hint="Messages you sent to the assistant today." />
          <Fact icon={<Zap aria-hidden />} title="IBM pool seeds" value={`${count(quotas.ibm_seeds_per_day)} per day`}
                hint="The most seeds one signed-in account can take from the IBM pool each day. Past that, requests use the other available sources." />
          <Fact icon={<Gauge aria-hidden />} title="Request rate limit" value={quotas.rate_limit}
                hint="Applies to all API requests made as your account." />
        </div>
      </section>
    </div>
  );
}
