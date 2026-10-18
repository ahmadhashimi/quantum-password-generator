"use client";
import { Activity, RefreshCw } from "lucide-react";
import { useApi } from "../hooks/useApi";
import { apiGet } from "../lib/api";
import { sourceLabel } from "../lib/format";
import type { EntropyStatus, ProviderStatus } from "../lib/types";

function statusOf(p: ProviderStatus): { text: string; dot: string } {
  if (!p.configured) return { text: "Not configured", dot: "bg-slate-400" };
  if (p.available) return { text: p.quantum ? "Online" : "Online (simulator)", dot: p.quantum ? "bg-emerald-500" : "bg-amber-500" };
  if ((p.pool_bytes ?? 1) === 0) return { text: "Harvesting…", dot: "bg-amber-500" };
  return { text: "Unavailable", dot: "bg-rose-500" };
}

export function SourcesPanel() {
  const { data, error, reload } = useApi(() => apiGet<EntropyStatus>("/api/v2/entropy/status"));

  return (
    <section className="glass space-y-4 p-6" aria-labelledby="sources-title">
      <div className="flex items-center justify-between">
        <h2 id="sources-title" className="flex items-center gap-2 font-semibold">
          <Activity className="size-4 text-cyan-500" aria-hidden /> Entropy sources
        </h2>
        <button type="button" onClick={reload} className="btn-ghost size-8 p-0" aria-label="Refresh sources">
          <RefreshCw className="size-3.5" />
        </button>
      </div>
      {error && <p className="text-sm text-rose-500">{error}</p>}
      <ul className="space-y-2">
        {data?.providers.map((p) => {
          const s = statusOf(p);
          return (
            <li key={p.name} className="flex items-center justify-between rounded-xl bg-slate-100/70 px-3 py-2 text-sm dark:bg-white/5">
              <span className="flex items-center gap-2">
                <span className={`size-2 rounded-full ${s.dot}`} aria-hidden />
                {sourceLabel(p.name)}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400" title={p.last_error ?? undefined}>
                {s.text}
                {p.pool_bytes !== undefined && p.configured ? ` · ${p.pool_bytes.toLocaleString()} B pool` : ""}
              </span>
            </li>
          );
        })}
        <li className="flex items-center justify-between rounded-xl px-3 py-2 text-sm">
          <span className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-emerald-500" aria-hidden /> OS CSPRNG
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400">Always mixed in</span>
        </li>
      </ul>
    </section>
  );
}
