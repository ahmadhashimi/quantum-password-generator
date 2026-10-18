const SOURCE_LABELS: Record<string, string> = {
  ibm_quantum: "IBM Quantum",
  ibm_simulator: "IBM simulator (not quantum)",
  anu: "ANU QRNG",
  lfd: "LfD QRNG",
  os_csprng: "OS CSPRNG",
};

export const sourceLabel = (name: string): string => SOURCE_LABELS[name] ?? name;

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
  const units: [string, number][] = [["years", 31_557_600], ["days", 86_400], ["hours", 3_600], ["minutes", 60],
                                     ["seconds", 1]];
  for (const [name, size] of units) {
    if (seconds >= size) {
      const v = seconds / size;
      if (name === "years" && v >= 1e6) return `10^${Math.floor(Math.log10(v))} years`;
      return `${Math.round(v).toLocaleString("en-US")} ${name}`;
    }
  }
  return "instantly";
}

/** "3 min ago" style relative time from unix seconds. */
export function timeAgo(unixSeconds: number | null | undefined, now = Date.now() / 1000): string {
  if (!unixSeconds) return "never";
  const d = Math.max(0, now - unixSeconds);
  if (d < 45) return "just now";
  if (d < 3600) return `${Math.round(d / 60)} min ago`;
  if (d < 86_400) return `${Math.round(d / 3600)} h ago`;
  return `${Math.round(d / 86_400)} d ago`;
}

export function formatUnix(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
}

/** Mask a secret for history lists: first 3 and last 2 characters. */
export function maskSecret(value: string): string {
  return value.length <= 6 ? "•".repeat(value.length) : `${value.slice(0, 3)}${"•".repeat(8)}${value.slice(-2)}`;
}

export const RECEIPT_ID = /^[A-Za-z0-9_-]{16}$/;
