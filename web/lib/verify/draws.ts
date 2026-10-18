/**
 * Draw checks, mirroring backend/app/api/receipts.py (normalize_entries, entries_hash) and
 * backend/app/generator.py (select_winners, `qpg-select/1`).
 */
import { hmac } from "@noble/hashes/hmac.js";
import { sha256, sha512 } from "@noble/hashes/sha2.js";

import { compareCodePoints } from "./json";
import { toHex, utf8 } from "./encoding";

// Python's str.strip() whitespace (str.isspace), which differs from String.prototype.trim().
const PY_SPACE = "\u0009\u000a\u000b\u000c\u000d\u001c\u001d\u001e\u001f\u0020\u0085\u00a0\u1680\u2000" +
  "\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000";
const CONTROL = /[\p{C}\u2028\u2029\u0085]/u;

function pyStrip(s: string): string {
  let a = 0;
  let b = s.length;
  while (a < b && PY_SPACE.includes(s[a] as string)) a++;
  while (b > a && PY_SPACE.includes(s[b - 1] as string)) b--;
  return s.slice(a, b);
}

/** NFC-normalise, trim, reject empty/oversized/control-character entries, then sort by code point. */
export function normalizeEntries(raw: string[]): string[] {
  const entries = raw.map((e) => {
    const n = pyStrip(e.normalize("NFC"));
    if (!n || Array.from(n).length > 200) throw new Error("Entries must be 1-200 characters");
    if (CONTROL.test(n)) throw new Error("Entries can't contain control characters or line breaks");
    return n;
  });
  return entries.sort(compareCodePoints);
}

/** SHA-256 of the compact JSON array (Python: json.dumps(entries, ensure_ascii=False, separators=(",", ":"))). */
export function entriesHash(entries: string[]): string {
  return toHex(sha256(utf8(JSON.stringify(entries))));
}

class KeyStream {
  private counter = 0n;
  private buf = new Uint8Array(0);
  constructor(private readonly seed: Uint8Array) {}

  read(n: number): Uint8Array {
    while (this.buf.length < n) {
      const ctr = new Uint8Array(8);
      new DataView(ctr.buffer).setBigUint64(0, this.counter);
      const block = hmac(sha512, this.seed, ctr);
      const next = new Uint8Array(this.buf.length + block.length);
      next.set(this.buf);
      next.set(block, this.buf.length);
      this.buf = next;
      this.counter++;
    }
    const out = this.buf.slice(0, n);
    this.buf = this.buf.slice(n);
    return out;
  }
}

function uniformIndex(stream: KeyStream, n: number): number {
  const nbytes = n <= 256 ? 1 : 2;
  const space = 1 << (8 * nbytes);
  const limit = space - (space % n);
  for (;;) {
    const b = stream.read(nbytes);
    const v = nbytes === 1 ? (b[0] as number) : ((b[0] as number) << 8) | (b[1] as number);
    if (v < limit) return v % n;
  }
}

/** qpg-select/1: partial Fisher-Yates over indexes of the sorted list, driven by HMAC-SHA512(seed, counter). */
export function selectWinners(seed: Uint8Array, nEntries: number, winners: number): number[] {
  if (seed.length !== 64) throw new Error("Selection seed must be 64 bytes");
  if (winners < 1 || winners > nEntries || nEntries > 1 << 16) throw new Error("Invalid draw size");
  const stream = new KeyStream(seed);
  const idx = Array.from({ length: nEntries }, (_, k) => k);
  for (let i = 0; i < winners; i++) {
    const j = i + uniformIndex(stream, nEntries - i);
    [idx[i], idx[j]] = [idx[j] as number, idx[i] as number];
  }
  return idx.slice(0, winners);
}
