"use client";
import { Check, Copy, History as HistoryIcon, Trash2 } from "lucide-react";
import { useState } from "react";
import { useClipboard } from "../hooks/useClipboard";
import type { Generated } from "./Generator";

export interface HistoryItem extends Generated {
  id: string;
  at: Date;
}

function mask(value: string) {
  return value.length <= 6 ? "•".repeat(value.length) : `${value.slice(0, 3)}${"•".repeat(8)}${value.slice(-2)}`;
}

/** Session-only history: kept in memory, gone on reload, never stored. */
export function History({ items, onClear }: { items: HistoryItem[]; onClear: () => void }) {
  const { copy } = useClipboard();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  if (items.length === 0) return null;

  return (
    <section className="glass space-y-3 p-6" aria-labelledby="history-title">
      <div className="flex items-center justify-between">
        <h2 id="history-title" className="flex items-center gap-2 font-semibold">
          <HistoryIcon className="size-4 text-cyan-500" aria-hidden /> This session
        </h2>
        <button type="button" onClick={onClear} className="btn-ghost h-8 px-2 text-xs">
          <Trash2 className="size-3.5" aria-hidden /> Clear
        </button>
      </div>
      <ul className="divide-y divide-slate-200 dark:divide-white/5">
        {items.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-3 py-2 text-sm">
            <code className="truncate font-mono text-slate-600 dark:text-slate-300">{mask(item.value)}</code>
            <span className="flex shrink-0 items-center gap-2 text-xs text-slate-500">
              {item.entropyBits.toFixed(0)} bits
              <span className={item.provenance.quantum ? "text-cyan-500" : "text-amber-500"}>
                {item.provenance.quantum ? "quantum" : "classical"}
              </span>
              <button type="button" className="btn-ghost size-7 p-0" aria-label="Copy"
                onClick={() => copy(item.value).then(() => setCopiedId(item.id))}>
                {copiedId === item.id ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              </button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
