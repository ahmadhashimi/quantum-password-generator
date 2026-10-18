import { formatUnix } from "@/lib/format";

const KINDS: Record<string, { one: string; many: string }> = {
  password: { one: "Password", many: "Passwords" },
  passphrase: { one: "Passphrase", many: "Passphrases" },
  random: { one: "Random key", many: "Random keys" },
  draw: { one: "Draw", many: "Draws" },
  draw_commit: { one: "Draw commit", many: "Draw commits" },
  assistant_message: { one: "Assistant message", many: "Assistant messages" },
};

const titleCase = (s: string): string => (s.charAt(0).toUpperCase() + s.slice(1)).replace(/_/g, " ");

export const kindLabel = (kind: string): string => KINDS[kind]?.one ?? titleCase(kind);
export const kindLabelPlural = (kind: string): string => KINDS[kind]?.many ?? titleCase(kind);

/** Known kinds first, in their natural order, then any others alphabetically. */
export function sortKinds(kinds: Iterable<string>): string[] {
  const known = Object.keys(KINDS);
  const rank = (k: string): number => {
    const i = known.indexOf(k);
    return i === -1 ? known.length : i;
  };
  return [...new Set(kinds)].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

export const count = (n: number): string => n.toLocaleString("en-US");

/** Tiny amounts stay visible: assistant spend is often a fraction of a cent. */
export function formatUsd(n: number): string {
  if (n <= 0) return "$0.00";
  if (n < 0.01) return "<$0.01";
  return `$${n.toFixed(2)}`;
}

/** Whole percent of a 0..1 share; a non-zero share never rounds down to "0%". */
export function formatShare(share: number): string {
  const pct = Math.max(0, Math.min(1, share)) * 100;
  if (pct > 0 && pct < 1) return "<1%";
  return `${Math.round(pct)}%`;
}

export function formatBits(bits: number): string {
  return bits.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/** "2026-10-18 06:28:58 UTC" from an ISO timestamp; the input is returned unchanged if it isn't a date. */
export function formatIso(iso: string): string {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? iso : formatUnix(ms / 1000);
}

/** Share of `used` in `cap` as 0..1; no cap means no meter. */
export const usedRatio = (used: number, cap: number): number => (cap > 0 ? used / cap : 0);
