import { count } from "@/components/dashboard/format";

export interface DailyCount {
  date: string;
  count: number;
}

const DAY_MS = 86_400_000;
const isoDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const utcToday = (): string => isoDay(Date.now());

/**
 * The API only returns days that had events. Fill the window so quiet days show as zero instead of vanishing,
 * ending today (UTC) or at the newest returned day if that is later.
 */
export function fillDays(daily: DailyCount[], days: number, today: string = utcToday()): DailyCount[] {
  const byDate = new Map(daily.map((d) => [d.date, d.count]));
  const newest = [today, ...byDate.keys()].reduce((a, b) => (a > b ? a : b));
  const end = Date.parse(`${newest}T00:00:00Z`);
  return Array.from({ length: days }, (_, i) => {
    const date = isoDay(end - (days - 1 - i) * DAY_MS);
    return { date, count: byDate.get(date) ?? 0 };
  });
}

const shortDate = (date: string): string =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/**
 * Usage events per day as plain CSS bars. The bars are decorative to assistive technology: the same numbers are in
 * a visually hidden table, which is the accessible version of this chart.
 */
export function ActivityChart({ daily, days = 30, today }: { daily: DailyCount[]; days?: number; today?: string }) {
  const series = fillDays(daily, days, today);
  const max = Math.max(1, ...series.map((d) => d.count));
  const total = series.reduce((n, d) => n + d.count, 0);
  const peak = series.reduce((best, d) => (d.count > best.count ? d : best), series[0] ?? { date: "", count: 0 });
  const first = series[0];
  const last = series[series.length - 1];
  const summary = total === 0
    ? `No usage events in the last ${days} days.`
    : `${count(total)} usage events in the last ${days} days. Busiest day ${shortDate(peak.date)} with ${count(peak.count)}.`;

  return (
    <figure className="space-y-2">
      <div className="flex gap-3">
        <div aria-hidden className="flex h-44 flex-col justify-between text-right text-[0.7rem] text-subtle tabular-nums">
          <span>{count(max)}</span>
          <span>0</span>
        </div>
        <div className="relative min-w-0 flex-1">
          <div aria-hidden className="pointer-events-none absolute inset-0 flex flex-col justify-between">
            <div className="border-t border-dashed border-border" />
            <div className="border-t border-dashed border-border" />
            <div className="border-t border-border-strong" />
          </div>
          <div role="img" aria-label={summary} className="relative flex h-44 items-end gap-[3px]">
            {series.map((d) => (
              <div key={d.date} title={`${d.date}: ${count(d.count)} ${d.count === 1 ? "event" : "events"}`}
                   className="flex h-full min-w-0 flex-1 items-end">
                <div className={d.count > 0 ? "w-full rounded-t-sm bg-brand" : "h-0.5 w-full bg-border-strong"}
                     style={d.count > 0 ? { height: `${Math.max(2, (d.count / max) * 100)}%` } : undefined} />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div aria-hidden className="flex justify-between pl-9 text-[0.7rem] text-subtle">
        <span>{first ? shortDate(first.date) : ""}</span>
        <span>{last ? shortDate(last.date) : ""}</span>
      </div>
      <figcaption className="text-sm text-muted">{summary} Days are UTC.</figcaption>
      <table className="sr-only">
        <caption>Usage events per day, UTC, last {days} days</caption>
        <thead>
          <tr><th scope="col">Date</th><th scope="col">Events</th></tr>
        </thead>
        <tbody>
          {series.map((d) => (
            <tr key={d.date}><th scope="row">{d.date}</th><td>{d.count}</td></tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
