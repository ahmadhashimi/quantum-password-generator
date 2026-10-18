import { Meter } from "@/components/ui";
import { crackTime, strengthFromBits } from "@/lib/format";

const LABELS = { weak: "Weak", fair: "Fair", strong: "Strong", excellent: "Excellent" } as const;

export function EntropyMeter({ bits }: { bits: number }) {
  const level = strengthFromBits(bits);
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium text-fg">{LABELS[level]}</span>
        <span className="font-mono text-muted">{bits.toFixed(1)} bits</span>
      </div>
      <Meter value={Math.min(bits, 128) / 128} label="Entropy"
             tone={level === "weak" ? "danger" : level === "fair" ? "warning" : "brand"} />
      <p className="text-xs text-muted">
        Output space: 2<sup>{Math.round(bits)}</sup>. Brute force at 10¹² guesses/s:{" "}
        <span className="font-medium text-fg">{crackTime(bits)}</span>
      </p>
    </div>
  );
}
