import { describe, expect, it } from "vitest";

import { entriesHash, normalizeEntries } from "@/lib/verify/draws";

import { cleanText, cleanTitle, listProblems, MAX_ENTRIES_BYTES, parseEntries, parseWinners } from "./entries";

describe("parseEntries", () => {
  it("counts trimmed entries and ignores empty lines", () => {
    const p = parseEntries("  alice \n\nbob\r\n \t \ncarol\n");
    expect(p.entries).toEqual(["alice", "bob", "carol"]);
    expect(p.emptyLines).toBe(3);
    expect(p.duplicates).toEqual([]);
    expect(p.invalid).toEqual([]);
  });

  it("is empty for an empty textarea", () => {
    expect(parseEntries("")).toMatchObject({ entries: [], emptyLines: 0, duplicates: [], invalid: [] });
  });

  it("detects duplicates ignoring case and reports every line", () => {
    const p = parseEntries("Alice\nbob\nalice\n\nBOB\ncarol\nALICE");
    expect(p.duplicates).toEqual([
      { entry: "Alice", lines: [1, 3, 7] },
      { entry: "bob", lines: [2, 5] },
    ]);
  });

  it("treats Unicode-equivalent spellings as the same entry (NFC)", () => {
    const precomposed = `caf${String.fromCharCode(0xe9)}`;
    const decomposed = `cafe${String.fromCharCode(0x301)}`;
    const p = parseEntries(`${precomposed}\n${decomposed}`);
    expect(p.entries).toEqual([precomposed, precomposed]);
    expect(p.duplicates).toHaveLength(1);
  });

  it("flags entries that are too long or contain control characters", () => {
    const p = parseEntries(`ok\n${"x".repeat(201)}\nbad${String.fromCharCode(7)}bell\nfine`);
    expect(p.invalid).toEqual([{ line: 2, problem: "too-long" }, { line: 3, problem: "control" }]);
    expect(p.entries).toEqual(["ok", "fine"]);
  });

  it("counts a 200 character entry of astral symbols as valid (length is in characters, not UTF-16 units)", () => {
    expect(parseEntries("\u{1F600}".repeat(200)).invalid).toEqual([]);
  });

  it("splits on Unicode line separators the browser can paste", () => {
    const p = parseEntries(`a${String.fromCharCode(0x2028)}b${String.fromCharCode(0x85)}c`);
    expect(p.entries).toEqual(["a", "b", "c"]);
  });

  it("agrees with lib/verify's normalisation, so the local fingerprint equals the server's", () => {
    const accented = `${String.fromCharCode(0xc9)}lodie`;
    const raw = `  Zoe\nalice\n${accented}\nbob  `;
    expect(normalizeEntries(parseEntries(raw).entries)).toEqual(["Zoe", "alice", "bob", accented]);
    expect(entriesHash(normalizeEntries(parseEntries(raw).entries))).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("listProblems", () => {
  it("rejects lists over the byte limit", () => {
    const entry = "x".repeat(200);
    const many = Array.from({ length: Math.ceil(MAX_ENTRIES_BYTES / 200) + 1 }, (_, i) => `${i}${entry}`.slice(0, 200));
    const parsed = parseEntries(many.join("\n"));
    expect(listProblems(parsed).join(" ")).toMatch(/too large/);
  });

  it("is quiet for a normal list", () => {
    expect(listProblems(parseEntries("a\nb"))).toEqual([]);
  });
});

describe("cleanTitle", () => {
  it("accepts a plain title and trims it", () => {
    expect(cleanTitle("  Launch giveaway ")).toEqual({ ok: true, value: "Launch giveaway" });
  });

  it.each(["Win at https://evil.example/x", "see www.example", "claim at prizes.com now"])("rejects links: %s", (t) => {
    expect(cleanTitle(t)).toEqual({ ok: false, problem: "link" });
  });

  it("rejects empty and over-long titles", () => {
    expect(cleanTitle("   ")).toEqual({ ok: false, problem: "empty" });
    expect(cleanTitle("t".repeat(201))).toEqual({ ok: false, problem: "too-long" });
    expect(cleanText("t".repeat(200), 200).ok).toBe(true);
  });
});

describe("parseWinners", () => {
  it("accepts whole numbers from 1 to the entry count", () => {
    expect(parseWinners("1", 5)).toBe(1);
    expect(parseWinners("5", 5)).toBe(5);
  });

  it.each(["0", "6", "", "1.5", "-1", "abc", "1e2"])("rejects %j for 5 entries", (raw) => {
    expect(parseWinners(raw, 5)).toBeNull();
  });

  it("is capped at the server's winner limit", () => {
    expect(parseWinners("100", 500)).toBe(100);
    expect(parseWinners("101", 500)).toBeNull();
  });

  it("rejects everything when there are no entries", () => {
    expect(parseWinners("1", 0)).toBeNull();
  });
});
