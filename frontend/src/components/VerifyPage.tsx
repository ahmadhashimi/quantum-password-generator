import { CheckCircle2, FileSearch, XCircle } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { apiPost } from "../lib/api";
import { sourceLabel } from "../lib/format";
import type { VerifyResult } from "../lib/types";

function Check({ ok, label }: { ok: boolean | undefined; label: string }) {
  if (ok === undefined) return null;
  return (
    <li className="flex items-center gap-2">
      {ok ? <CheckCircle2 className="size-4 text-emerald-500" aria-hidden /> : <XCircle className="size-4 text-rose-500" aria-hidden />}
      <span>{label}</span>
      <span className="sr-only">{ok ? "passed" : "failed"}</span>
    </li>
  );
}

export function VerifyPage({ receiptId }: { receiptId: string }) {
  const [id, setId] = useState(receiptId);
  const [entries, setEntries] = useState("");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const verify = async (rid: string, entryText = "") => {
    setError(null);
    try {
      const list = entryText.split("\n").map((e) => e.trim()).filter(Boolean);
      setResult(await apiPost<VerifyResult>("/api/v2/receipts/verify", {
        receipt_id: rid.trim(),
        ...(list.length ? { entries: list } : {}),
      }));
    } catch (e) {
      setResult(null);
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    if (receiptId) void verify(receiptId);
  }, [receiptId]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void verify(id, entries);
  };

  const p = result?.payload;
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="space-y-3 text-center">
        <FileSearch className="mx-auto size-10 text-violet-400" aria-hidden />
        <h1 className="text-3xl font-bold tracking-tight">Verify a receipt</h1>
        <p className="text-slate-600 dark:text-slate-400">
          Check the two signatures and inspect the entropy sources reported by this service. Hardware provenance is not independently attested.
        </p>
      </div>

      <form onSubmit={onSubmit} className="glass space-y-4 p-6">
        <label className="block space-y-2 text-sm font-medium">
          Receipt ID
          <input value={id} onChange={(e) => setId(e.target.value)} required maxLength={64}
            className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-2.5 font-mono font-normal outline-none focus:ring-2 focus:ring-cyan-400 dark:border-white/10 dark:bg-black/30" />
        </label>
        {(p?.kind === "draw" || p?.kind === "draw_commit") && (
          <label className="block space-y-2 text-sm font-medium">
            Published entries list (optional) — one per line
            <textarea value={entries} onChange={(e) => setEntries(e.target.value)} rows={5}
              className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-2.5 font-mono font-normal outline-none focus:ring-2 focus:ring-cyan-400 dark:border-white/10 dark:bg-black/30" />
          </label>
        )}
        <button type="submit" className="btn-primary w-full">Verify</button>
      </form>

      {error && <p role="alert" className="glass p-4 text-rose-500">{error}</p>}

      {result && p && (
        <section className="glass space-y-5 p-6" aria-labelledby="verdict">
          <h2 id="verdict" className={`flex items-center gap-2 text-xl font-semibold ${result.valid ? "text-emerald-500" : "text-rose-500"}`}>
            {result.valid ? <CheckCircle2 className="size-6" aria-hidden /> : <XCircle className="size-6" aria-hidden />}
            {result.valid ? "Signed receipt verified" : "Verification failed"}
          </h2>
          <ul className="space-y-1.5 text-sm">
            <Check ok={result.signatures["ed25519"]} label="Ed25519 signature (classical)" />
            <Check ok={result.signatures["ml-dsa-65"]} label="ML-DSA-65 signature (post-quantum, NIST FIPS 204)" />
            <Check ok={result.key_id_matches} label="Signed by this server's published key" />
            <Check ok={result.in_public_log} label="Present in the server-controlled receipt log" />
            <Check ok={result.entries_match} label="Entries list matches the signed fingerprint" />
            {result.draw && (
              <Check ok={result.draw.draws_by_anyone_over_same_entries === 1}
                label={result.draw.draws_by_anyone_over_same_entries === 1
                  ? "No other draw anywhere used this entry list"
                  : `${result.draw.draws_by_anyone_over_same_entries} draws in total used this entry list`} />
            )}
            {result.draw && (
              <Check ok={result.draw.draws_by_same_owner_over_same_entries === 1}
                label={result.draw.draws_by_same_owner_over_same_entries === 1
                  ? "Only draw this organiser ran over this entry list (no re-rolls)"
                  : `Organiser ran ${result.draw.draws_by_same_owner_over_same_entries} draws over this entry list`} />
            )}
          </ul>
          {result.reason === "revoked_key" && <p className="text-sm text-rose-500">Signed with a key that has since been revoked.</p>}
          {result.reason === "unknown_key" && <p className="text-sm text-rose-500">Signed with a key this server never published.</p>}
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-slate-500">Type</dt><dd className="font-medium capitalize">{p.kind}</dd></div>
            <div><dt className="text-slate-500">Issued</dt><dd className="font-medium">{new Date(p.issued_at * 1000).toLocaleString()}</dd></div>
            <div><dt className="text-slate-500">Entropy sources</dt><dd className="font-medium">{p.provenance.sources.map(sourceLabel).join(" + ")}</dd></div>
            <div><dt className="text-slate-500">Quantum</dt><dd className="font-medium">{p.provenance.quantum ? `Yes · ${p.provenance.quantum_bytes} bytes` : "No"}</dd></div>
            {p.provenance.ibm_jobs?.map((job) => (
              <div key={job.job_id} className="sm:col-span-2"><dt className="text-slate-500">IBM Quantum job</dt>
                <dd className="font-mono text-xs">{job.backend} · {job.job_id} ({job.mode})</dd></div>
            ))}
            {p.kind === "draw_commit" && (
              <div className="sm:col-span-2"><dt className="text-slate-500">Commitment</dt>
                <dd className="font-medium">Entries locked before randomness: {p.details.entries_count} entries, {p.details.winners} winner(s)
                  {result.draw && ` · status: ${result.draw.status}`}</dd></div>
            )}
            {p.entropy_bits !== null && <div><dt className="text-slate-500">Entropy</dt><dd className="font-medium">{p.entropy_bits} bits</dd></div>}
          </dl>
          {result.draw?.committed_seconds_before_run != null && (
            <p className="text-sm text-slate-500">Entries were locked {result.draw.committed_seconds_before_run} s before the draw ran.</p>
          )}
          {p.result && (
            <div className="space-y-2 rounded-xl border border-dashed border-slate-300 p-3 text-sm dark:border-white/15">
              <p className="text-xs tracking-wide text-slate-500 uppercase">Text supplied by the organiser — not checked by us</p>
              <p className="font-medium">{p.details.title} — {p.details.entries_count} entries</p>
              <ol className="list-decimal space-y-1 pl-5">
                {p.result.winners.map((w) => <li key={w.index}>{w.entry} <span className="text-slate-500">(entry #{w.index + 1})</span></li>)}
              </ol>
            </div>
          )}
          {p.commitment && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              This receipt holds only a SHA-512 fingerprint of a secret. Its owner can prove it matches with their private
              salt; nobody else can learn the secret from it.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
