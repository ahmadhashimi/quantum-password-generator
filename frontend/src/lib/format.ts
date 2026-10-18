const SOURCE_LABELS: Record<string, string> = {
  ibm_quantum: "IBM Quantum",
  ibm_simulator: "IBM simulator",
  anu: "ANU QRNG",
  lfd: "LfD QRNG",
  os_csprng: "OS CSPRNG",
};

export const sourceLabel = (name: string) => SOURCE_LABELS[name] ?? name;

export type StrengthLevel = "weak" | "fair" | "strong" | "excellent";

export function strengthFromBits(bits: number): StrengthLevel {
  if (bits < 50) return "weak";
  if (bits < 80) return "fair";
  if (bits < 128) return "strong";
  return "excellent";
}

/** Expected brute-force time at `rate` guesses/second (half the keyspace). */
export function crackTime(bits: number, rate = 1e12): string {
  const seconds = 2 ** (bits - 1) / rate;
  if (seconds < 1) return "instantly";
  const units: [string, number][] = [
    ["years", 31_557_600],
    ["days", 86_400],
    ["hours", 3_600],
    ["minutes", 60],
    ["seconds", 1],
  ];
  for (const [name, size] of units) {
    if (seconds >= size) {
      const v = seconds / size;
      if (name === "years" && v >= 1e6) return `10^${Math.floor(Math.log10(v))} years`;
      return `${Math.round(v).toLocaleString()} ${name}`;
    }
  }
  return "instantly";
}
