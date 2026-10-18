"use client";
import { crackTime, strengthFromBits, type StrengthLevel } from "../lib/format";

const LEVELS: Record<StrengthLevel, { label: string; bar: string; width: string }> = {
  weak: { label: "Weak", bar: "bg-rose-500", width: "w-1/4" },
  fair: { label: "Fair", bar: "bg-amber-500", width: "w-2/4" },
  strong: { label: "Strong", bar: "bg-emerald-500", width: "w-3/4" },
  excellent: { label: "Excellent", bar: "bg-gradient-to-r from-cyan-400 to-violet-400", width: "w-full" },
};

export function EntropyMeter({ bits }: { bits: number }) {
  const level = LEVELS[strengthFromBits(bits)];
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{level.label}</span>
        <span className="font-mono text-slate-500 dark:text-slate-400">{bits.toFixed(1)} bits of entropy</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10" role="meter"
        aria-valuemin={0} aria-valuemax={128} aria-valuenow={Math.round(bits)} aria-label="Entropy">
        <div className={`h-full rounded-full transition-all duration-500 ${level.bar} ${level.width}`} />
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Brute force at 10¹² guesses/s: <span className="font-medium text-slate-700 dark:text-slate-200">{crackTime(bits)}</span>
      </p>
    </div>
  );
}
