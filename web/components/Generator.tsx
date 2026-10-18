"use client";
import { KeyRound, RefreshCw, Text } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { apiGet } from "../lib/api";
import { useAppAuth } from "../lib/auth";
import type { PassphraseResult, PasswordResult, Provenance, Receipt } from "../lib/types";
import { EntropyMeter } from "./EntropyMeter";
import { ProvenanceBadge } from "./ProvenanceBadge";
import { ReceiptCard } from "./ReceiptCard";
import { SecretDisplay } from "./SecretDisplay";
import { Toggle } from "./Toggle";

type Mode = "password" | "passphrase";

export interface Generated {
  value: string;
  kind: Mode;
  entropyBits: number;
  provenance: Provenance;
  receipt?: Receipt;
  receiptSalt?: string;
}

const SEPARATORS = [
  { value: "-", label: "Dash" },
  { value: " ", label: "Space" },
  { value: ".", label: "Dot" },
  { value: "_", label: "Underscore" },
];

export function Generator({ onGenerated }: { onGenerated: (g: Generated) => void }) {
  const { getToken } = useAppAuth();
  const [mode, setMode] = useState<Mode>("password");
  const [length, setLength] = useState(20);
  const [charsets, setCharsets] = useState({ upper: true, lower: true, digits: true, symbols: true });
  const [excludeAmbiguous, setExcludeAmbiguous] = useState(false);
  const [words, setWords] = useState(6);
  const [separator, setSeparator] = useState("-");
  const [capitalize, setCapitalize] = useState(false);
  const [addNumber, setAddNumber] = useState(false);
  const [signed, setSigned] = useState(true);
  const [result, setResult] = useState<Generated | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const noCharset = !Object.values(charsets).some(Boolean);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let g: Generated;
      if (mode === "password") {
        const r = await apiGet<PasswordResult>(
          "/api/v2/password",
          { length, ...charsets, exclude_ambiguous: excludeAmbiguous, receipt: signed },
          getToken,
        );
        g = { value: r.password, kind: mode, entropyBits: r.entropy_bits, provenance: r.provenance,
          receipt: r.receipt, receiptSalt: r.receipt_salt };
      } else {
        const r = await apiGet<PassphraseResult>(
          "/api/v2/passphrase",
          { words, separator, capitalize, add_number: addNumber, receipt: signed },
          getToken,
        );
        g = { value: r.passphrase, kind: mode, entropyBits: r.entropy_bits, provenance: r.provenance,
          receipt: r.receipt, receiptSalt: r.receipt_salt };
      }
      setResult(g);
      onGenerated(g);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [mode, length, charsets, excludeAmbiguous, words, separator, capitalize, addNumber, signed, getToken, onGenerated]);

  // Clear a stale result when switching modes.
  useEffect(() => setResult(null), [mode]);

  return (
    <section className="glass space-y-6 p-6 sm:p-8" aria-labelledby="generator-title">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 id="generator-title" className="text-lg font-semibold">Generate</h2>
        <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-white/5" role="tablist">
          {(
            [
              ["password", "Password", KeyRound],
              ["passphrase", "Passphrase", Text],
            ] as const
          ).map(([value, label, Icon]) => (
            <button key={value} role="tab" type="button" aria-selected={mode === value} onClick={() => setMode(value)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                mode === value ? "bg-white shadow dark:bg-white/15" : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
              }`}>
              <Icon className="size-4" aria-hidden /> {label}
            </button>
          ))}
        </div>
      </div>

      <SecretDisplay value={result?.value ?? null} placeholder="Press generate to collapse a qubit…" />

      {result && (
        <div className="space-y-4">
          <ProvenanceBadge provenance={result.provenance} />
          <EntropyMeter bits={result.entropyBits} />
          {result.receipt && <ReceiptCard receipt={result.receipt} salt={result.receiptSalt} />}
        </div>
      )}
      {error && <p role="alert" className="text-sm text-rose-500">{error}</p>}

      {mode === "password" ? (
        <div className="space-y-4">
          <label className="block space-y-2">
            <span className="flex justify-between text-sm font-medium">
              Length <span className="font-mono text-cyan-600 dark:text-cyan-300">{length}</span>
            </span>
            <input type="range" min={8} max={128} value={length} onChange={(e) => setLength(Number(e.target.value))}
              className="w-full accent-cyan-500" aria-label="Password length" />
          </label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Toggle label="A–Z" checked={charsets.upper} onChange={(v) => setCharsets((c) => ({ ...c, upper: v }))} />
            <Toggle label="a–z" checked={charsets.lower} onChange={(v) => setCharsets((c) => ({ ...c, lower: v }))} />
            <Toggle label="0–9" checked={charsets.digits} onChange={(v) => setCharsets((c) => ({ ...c, digits: v }))} />
            <Toggle label="!@#$" checked={charsets.symbols} onChange={(v) => setCharsets((c) => ({ ...c, symbols: v }))} />
            <Toggle label="No look-alikes" checked={excludeAmbiguous} onChange={setExcludeAmbiguous} />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <label className="block space-y-2">
            <span className="flex justify-between text-sm font-medium">
              Words <span className="font-mono text-cyan-600 dark:text-cyan-300">{words}</span>
            </span>
            <input type="range" min={3} max={16} value={words} onChange={(e) => setWords(Number(e.target.value))}
              className="w-full accent-cyan-500" aria-label="Number of words" />
          </label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <label className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-white/10">
              Separator
              <select value={separator} onChange={(e) => setSeparator(e.target.value)}
                className="rounded-md bg-transparent text-right outline-none">
                {SEPARATORS.map((s) => (
                  <option key={s.label} value={s.value}>{s.label}</option>
                ))}
              </select>
            </label>
            <Toggle label="Capitalize" checked={capitalize} onChange={setCapitalize} />
            <Toggle label="Add number" checked={addNumber} onChange={setAddNumber} />
          </div>
        </div>
      )}

      <Toggle label="Post-quantum signed receipt" checked={signed} onChange={setSigned} />

      <button type="button" className="btn-primary w-full py-3 text-base" onClick={generate}
        disabled={loading || (mode === "password" && noCharset)}>
        <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
        {loading ? "Measuring qubits…" : "Generate"}
      </button>
    </section>
  );
}
