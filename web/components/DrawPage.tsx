"use client";
import { Copy, Gift, Lock, Shuffle, Trophy } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useClipboard } from "../hooks/useClipboard";
import { apiPost } from "../lib/api";
import { useAppAuth } from "../lib/auth";
import type { DrawWinner, Receipt } from "../lib/types";
import { ProvenanceBadge } from "./ProvenanceBadge";
import { ReceiptCard } from "./ReceiptCard";

interface CommitResponse {
  draw_id: string;
  commit_receipt: Receipt;
  commit_url: string;
}

interface RunResponse {
  winners: DrawWinner[];
  receipt: Receipt;
  verify_url: string;
}

const MAX_ENTRIES = 10_000;

function ShareLink({ url, label }: { url: string; label: string }) {
  const { copied, copy } = useClipboard();
  return (
    <div className="flex gap-2">
      <input readOnly value={url} aria-label={label}
        className="flex-1 rounded-xl border border-slate-200 bg-white/70 px-3 py-2 font-mono text-xs dark:border-white/10 dark:bg-black/30" />
      <button type="button" className="btn-ghost h-9 px-3 text-xs" onClick={() => copy(url)}>
        <Copy className="size-3.5" aria-hidden /> {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}

/** Two steps: lock the entries (signed commit, no randomness yet), then run once. Re-rolls are impossible. */
export function DrawPage() {
  const { getToken } = useAppAuth();
  const [title, setTitle] = useState("");
  const [rawEntries, setRawEntries] = useState("");
  const [winners, setWinners] = useState(1);
  const [commit, setCommit] = useState<CommitResponse | null>(null);
  const [result, setResult] = useState<RunResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const entries = rawEntries.split("\n").map((e) => e.trim()).filter(Boolean);
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const call = async <T,>(fn: () => Promise<T>, onOk: (v: T) => void) => {
    setLoading(true);
    setError(null);
    try {
      onOk(await fn());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const lock = (e: FormEvent) => {
    e.preventDefault();
    void call(() => apiPost<CommitResponse>("/api/v2/draws", { title, entries, winners }, getToken), setCommit);
  };

  const run = () => {
    if (!commit) return;
    void call(() => apiPost<RunResponse>(`/api/v2/draws/${commit.draw_id}/run`, {}, getToken), setResult);
  };

  const reset = () => {
    setCommit(null);
    setResult(null);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="space-y-3 text-center">
        <Gift className="mx-auto size-10 text-cyan-400" aria-hidden />
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Provably fair <span className="text-gradient">quantum draw</span>
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          Lock your entry list first, then let quantum randomness pick — once. Every step gets a post-quantum signed
          receipt, with one permitted execution. The operator still controls publication.
        </p>
      </div>

      <ol className="grid grid-cols-3 gap-2 text-center text-xs font-medium">
        {["1 · Add entries", "2 · Lock & share", "3 · Draw once"].map((step, i) => {
          const active = (i === 0 && !commit) || (i === 1 && commit && !result) || (i === 2 && result);
          return (
            <li key={step} className={`rounded-xl px-2 py-2 ${active ? "bg-gradient-to-r from-cyan-500 to-violet-500 text-white" : "bg-slate-100 text-slate-500 dark:bg-white/5"}`}>
              {step}
            </li>
          );
        })}
      </ol>

      {!commit && (
        <form onSubmit={lock} className="glass space-y-5 p-6 sm:p-8">
          <label className="block space-y-2 text-sm font-medium">
            Draw title
            <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200}
              placeholder="e.g. Launch week giveaway"
              className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-2.5 font-normal outline-none focus:ring-2 focus:ring-cyan-400 dark:border-white/10 dark:bg-black/30" />
          </label>
          <label className="block space-y-2 text-sm font-medium">
            <span className="flex justify-between">
              Entries — one per line, no duplicates <span className="font-mono text-cyan-600 dark:text-cyan-300">{entries.length}</span>
            </span>
            <textarea value={rawEntries} onChange={(e) => setRawEntries(e.target.value)} required rows={8}
              placeholder={"@alice\n@bob\n@carol"}
              className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-2.5 font-mono font-normal outline-none focus:ring-2 focus:ring-cyan-400 dark:border-white/10 dark:bg-black/30" />
          </label>
          <label className="block space-y-2 text-sm font-medium">
            <span className="flex justify-between">
              Winners <span className="font-mono text-cyan-600 dark:text-cyan-300">{winners}</span>
            </span>
            <input type="range" min={1} max={Math.max(1, Math.min(entries.length, 50))} value={winners}
              onChange={(e) => setWinners(Number(e.target.value))} className="w-full accent-cyan-500" aria-label="Number of winners" />
          </label>
          {error && <p role="alert" className="text-sm text-rose-500">{error}</p>}
          <button type="submit" className="btn-primary w-full py-3 text-base"
            disabled={loading || entries.length === 0 || entries.length > MAX_ENTRIES || winners > entries.length}>
            <Lock className="size-4" aria-hidden /> {loading ? "Locking…" : "Lock entries"}
          </button>
        </form>
      )}

      {commit && !result && (
        <section className="glass space-y-5 p-6 sm:p-8" aria-labelledby="locked-title">
          <h2 id="locked-title" className="flex items-center gap-2 text-lg font-semibold">
            <Lock className="size-5 text-violet-400" aria-hidden /> Entries locked
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {commit.commit_receipt.payload.details.entries_count} entries are fingerprinted and signed — before any
            randomness exists. For maximum trust, post this link to your audience now, then run the draw.
          </p>
          <ReceiptCard receipt={commit.commit_receipt} />
          <ShareLink url={`${origin}${commit.commit_url.replace("/#/verify/", "/verify/")}`} label="Commit verification link" />
          {error && <p role="alert" className="text-sm text-rose-500">{error}</p>}
          <button type="button" className="btn-primary w-full py-3 text-base" onClick={run} disabled={loading}>
            <Shuffle className={`size-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
            {loading ? "Measuring qubits…" : "Run the draw (once)"}
          </button>
        </section>
      )}

      {result && (
        <section className="glass space-y-5 p-6 sm:p-8" aria-labelledby="winners-title">
          <h2 id="winners-title" className="flex items-center gap-2 text-lg font-semibold">
            <Trophy className="size-5 text-amber-400" aria-hidden /> {result.winners.length === 1 ? "Winner" : "Winners"}
          </h2>
          <ol className="space-y-2">
            {result.winners.map((w, i) => (
              <li key={w.index} className="flex items-center justify-between rounded-xl bg-slate-100/70 px-4 py-3 dark:bg-white/5">
                <span className="font-medium">{i + 1}. {w.entry}</span>
                <span className="text-xs text-slate-500">entry #{w.index + 1}</span>
              </li>
            ))}
          </ol>
          <ProvenanceBadge provenance={{ ...result.receipt.payload.provenance, failures: {}, timestamp: 0 }} />
          <ReceiptCard receipt={result.receipt} />
          <ShareLink url={`${origin}${result.verify_url.replace("/#/verify/", "/verify/")}`} label="Result verification link" />
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Publish your entries list with this link. Anyone can paste it (in any order) on the verify page to confirm it
            matches the signed fingerprint — and see how many draws ever used the same list. Entry numbers refer to the
            list sorted alphabetically.
          </p>
          <button type="button" className="btn-ghost w-full" onClick={reset}>Start a new draw</button>
        </section>
      )}
    </div>
  );
}
