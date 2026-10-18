/**
 * Client-side mirror of the backend's draw input rules (backend/app/api/receipts.py: normalize_entry,
 * normalize_entries, DrawCommit). The server stays authoritative; this only gives live feedback and avoids sending a
 * request that is certain to be refused. Normalisation matches lib/verify/draws.normalizeEntries, so the fingerprint
 * the browser computes for a list equals the one the server signs.
 */

export const MAX_TITLE_CHARS = 200;
export const MAX_ENTRY_CHARS = 200;
export const MAX_ENTRIES = 10_000;
export const MAX_ENTRIES_BYTES = 256_000;
export const MAX_WINNERS = 100;

// Python's str.strip() whitespace (str.isspace), which differs from String.prototype.trim(). Code points, not escapes.
const PY_SPACE = new Set([0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x1c, 0x1d, 0x1e, 0x1f, 0x20, 0x85, 0xa0, 0x1680, 0x2000, 0x2001,
                          0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029,
                          0x202f, 0x205f, 0x3000]);
const LINE_BREAKS = [0x0a, 0x0b, 0x0c, 0x0d, 0x85, 0x2028, 0x2029];
const LINE_BREAK = new RegExp(`\\r\\n|[${String.fromCharCode(...LINE_BREAKS)}]`);
// Control characters (any Unicode "C" category) plus the line separators the backend also refuses.
const CONTROL = new RegExp(`\\p{C}|[${String.fromCharCode(0x2028, 0x2029)}]`, "u");
// Same pattern as the backend: titles are shown under a signed banner, so links are refused.
const URLISH = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|xyz|app|co|gg|me|link|ru|cn)\b)/i;

export type TextProblem = "empty" | "too-long" | "control";
export type Cleaned = { ok: true; value: string } | { ok: false; problem: TextProblem };

const isSpace = (s: string, i: number): boolean => PY_SPACE.has(s.charCodeAt(i));

function pyStrip(s: string): string {
  let a = 0;
  let b = s.length;
  while (a < b && isSpace(s, a)) a++;
  while (b > a && isSpace(s, b - 1)) b--;
  return s.slice(a, b);
}

const charCount = (s: string): number => Array.from(s).length;

/** NFC-normalise and trim one title or entry, as the backend does before it fingerprints. */
export function cleanText(raw: string, maxChars: number): Cleaned {
  const value = pyStrip(raw.normalize("NFC"));
  if (!value) return { ok: false, problem: "empty" };
  if (charCount(value) > maxChars) return { ok: false, problem: "too-long" };
  if (CONTROL.test(value)) return { ok: false, problem: "control" };
  return { ok: true, value };
}

/** The server compares duplicates case-insensitively (Python casefold); lower-casing is the closest local match. */
export const foldKey = (entry: string): string => entry.toLowerCase();

export interface DuplicateGroup {
  /** First spelling seen. */
  entry: string;
  /** 1-based line numbers, in order. */
  lines: number[];
}

export interface InvalidLine {
  line: number;
  problem: Exclude<TextProblem, "empty">;
}

export interface ParsedEntries {
  /** Cleaned entries in the order typed, empty lines dropped. Only usable when `invalid` is empty. */
  entries: string[];
  emptyLines: number;
  duplicates: DuplicateGroup[];
  invalid: InvalidLine[];
  bytes: number;
}

export function parseEntries(raw: string): ParsedEntries {
  const entries: string[] = [];
  const invalid: InvalidLine[] = [];
  const seen = new Map<string, DuplicateGroup>();
  let emptyLines = 0;
  let bytes = 0;
  const encoder = new TextEncoder();

  if (raw.length > 0) {
    raw.split(LINE_BREAK).forEach((line, i) => {
      const lineNo = i + 1;
      const cleaned = cleanText(line, MAX_ENTRY_CHARS);
      if (!cleaned.ok) {
        if (cleaned.problem === "empty") emptyLines++;
        else invalid.push({ line: lineNo, problem: cleaned.problem });
        return;
      }
      entries.push(cleaned.value);
      bytes += encoder.encode(cleaned.value).length;
      const key = foldKey(cleaned.value);
      const group = seen.get(key);
      if (group) group.lines.push(lineNo);
      else seen.set(key, { entry: cleaned.value, lines: [lineNo] });
    });
  }
  const duplicates = [...seen.values()].filter((g) => g.lines.length > 1);
  return { entries, emptyLines, duplicates, invalid, bytes };
}

export type TitleProblem = TextProblem | "link";

/** The request body for POST /api/v2/draws, already cleaned. */
export interface DrawBody {
  title: string;
  entries: string[];
  winners: number;
}

export function cleanTitle(raw: string): { ok: true; value: string } | { ok: false; problem: TitleProblem } {
  const cleaned = cleanText(raw, MAX_TITLE_CHARS);
  if (!cleaned.ok) return cleaned;
  if (URLISH.test(cleaned.value)) return { ok: false, problem: "link" };
  return cleaned;
}

export const TITLE_MESSAGES: Record<TitleProblem, string> = {
  empty: "Enter a title.",
  "too-long": `Titles can be at most ${MAX_TITLE_CHARS} characters.`,
  control: "Titles can't contain control characters.",
  link: "Titles can't contain links.",
};

export const LINE_MESSAGES: Record<Exclude<TextProblem, "empty">, string> = {
  "too-long": `is longer than ${MAX_ENTRY_CHARS} characters`,
  control: "contains a control character",
};

/** Whole-list problems that block submitting. */
export function listProblems(parsed: ParsedEntries): string[] {
  const out: string[] = [];
  if (parsed.entries.length > MAX_ENTRIES) out.push(`At most ${MAX_ENTRIES.toLocaleString("en-US")} entries.`);
  if (parsed.bytes > MAX_ENTRIES_BYTES) out.push("The entry list is too large (256 KB maximum).");
  return out;
}

/** Winner count as typed: an integer from 1 to the entries available (capped by the server), else null. */
export function parseWinners(raw: string, entryCount: number): number | null {
  if (!/^\d{1,4}$/.test(raw.trim())) return null;
  const n = Number(raw);
  return n >= 1 && n <= Math.min(entryCount, MAX_WINNERS) ? n : null;
}
