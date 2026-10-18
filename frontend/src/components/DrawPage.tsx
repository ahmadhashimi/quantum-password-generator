import { Copy, Gift, Shuffle, Trophy } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useClipboard } from "../hooks/useClipboard";
import { apiPost } from "../lib/api";
import { useAppAuth } from "../lib/auth";
import type { DrawResult, Receipt } from "../lib/types";
import { ProvenanceBadge } from "./ProvenanceBadge";
import { ReceiptCard } from "./ReceiptCard";

interface DrawResponse {
  winners: DrawResult["winners"];
  receipt: Receipt;
  verify_url: string;
}

const MAX_ENTRIES = 10_000;

export function DrawPage() {
  const { getToken } = useAppAuth();
  const [title, setTitle] = useState("");
  const [rawEntries, setRawEntries] = useState("");
  const [winners, setWinners] = useState(1);
  const [result, setResult] = useState<DrawResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { copied, copy } = useClipboard();

  const entries = rawEntries.split("\n").map((e) => e.trim()).filter(Boolean);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      setResult(await apiPost<DrawResponse>("/api/v2/draw", { title, entries, winners }, getToken));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const shareUrl = result ? `${window.location.origin}${result.verify_url}` : "";

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="space-y-3 text-center">
        <Gift className="mx-auto size-10 text-cyan-400" aria-hidden />
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Provably fair <span className="text-gradient">quantum draw</span>
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          Pick giveaway winners with quantum randomness and get a post-quantum signed receipt anyone can verify — so
          nobody can say it was rigged.
        </p>
      </div>

      <form onSubmit={submit} className="glass space-y-5 p-6 sm:p-8">
        <label className="block space-y-2 text-sm font-medium">
          Draw title
          <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200}
            placeholder="e.g. Launch week giveaway"
            className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-2.5 font-normal outline-none focus:ring-2 focus:ring-cyan-400 dark:border-white/10 dark:bg-black/30" />
        </label>
        <label className="block space-y-2 text-sm font-medium">
          <span className="flex justify-between">
            Entries — one per line <span className="font-mono text-cyan-600 dark:text-cyan-300">{entries.length}</span>
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
          <Shuffle className={`size-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
          {loading ? "Measuring qubits…" : "Run the draw"}
        </button>
      </form>

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
          <div className="flex gap-2">
            <input readOnly value={shareUrl} aria-label="Public verification link"
              className="flex-1 rounded-xl border border-slate-200 bg-white/70 px-3 py-2 font-mono text-xs dark:border-white/10 dark:bg-black/30" />
            <button type="button" className="btn-ghost h-9 px-3 text-xs" onClick={() => copy(shareUrl)}>
              <Copy className="size-3.5" aria-hidden /> {copied ? "Copied" : "Copy link"}
            </button>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Publish your entries list together with this link. Anyone can paste the list on the verify page to confirm it
            matches the signed receipt exactly.
          </p>
        </section>
      )}
    </div>
  );
}
