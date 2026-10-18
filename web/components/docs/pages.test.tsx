// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import DevelopersPage from "@/app/developers/page";
import StatusPage from "@/app/status/page";
import TransparencyPage from "@/app/transparency/page";
import { STATE_COPY } from "@/components/status/provider-state";

const html = {
  developers: renderToString(<DevelopersPage />),
  transparency: renderToString(<TransparencyPage />),
  status: renderToString(<StatusPage />),
};

/** Visible text: tags and comments removed, entities decoded enough for phrase checks. */
const text = (s: string): string =>
  s.replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<").replace(/\s+/g, " ");

const ids = (s: string): string[] => [...s.matchAll(/<section[^>]* id="([^"]+)"/g)].map((m) => m[1] as string);

describe("/developers", () => {
  const page = html.developers;
  const body = text(page);

  it("has an anchored section for every topic, in order", () => {
    expect(ids(page)).toEqual(["overview", "authentication", "endpoints", "receipt", "evidence", "verification",
                               "idempotency", "errors", "rate-limits", "examples", "offline", "draws"]);
    for (const id of ids(page)) expect(page).toContain(`href="#${id}"`);
  });

  it("lists every endpoint with its method", () => {
    for (const path of [
      "/api/v2/password", "/api/v2/passphrase", "/api/v2/random", "/api/v2/entropy/status", "/api/v2/health",
      "/api/v2/receipts/{id}", "/api/v2/receipts/{id}/verify-material", "/api/v2/receipts/verify",
      "/.well-known/quantumpass-keys.json", "/api/v2/draws", "/api/v2/draws/{id}/run", "/api/v2/me",
      "/api/v2/me/receipts", "/api/v2/me/usage", "/api/v2/admin/audit", "/api/v2/admin/audit/verify",
      "/api/v2/admin/draws/investigate", "/api/v2/admin/draws/{id}/complete",
    ]) expect(body).toContain(path);
    expect(body).toContain("?receipt=true");
  });

  it("documents the receipt schema, the three evidence values and version 1", () => {
    for (const s of ["qpg-receipt/2", "qpg-receipt/1", "hybrid-signature:ed25519+ml-dsa-65", "operator-asserted",
                     "draw_commit", "selection", "entries_sha256", "evidence classes"]) {
      expect(body).toContain(s);
    }
    expect(body).toMatch(/quantum_evidence/);
    expect(body).toMatch(/No independently verifiable proof of quantum origin exists today: IBM does not sign job results/);
  });

  it("gives the exact signing domain, key id rule, revocation rule and idempotency behaviour", () => {
    expect(body).toContain("QuantumPass-hybrid-sig/1:ed25519+ml-dsa-65\\0");
    expect(body).toContain("hex(SHA-256(ed25519_pk || ml_dsa_65_pk))[:16]");
    expect(body).toContain("payload.issued_at >= key.revoked_at");
    expect(body).toContain("Idempotent-Replayed: true");
    expect(body).toMatch(/8 to 64 characters/);
    expect(body).toMatch(/different body: 422/);
  });

  it("covers errors, rate limits and the standalone verifier", () => {
    for (const s of ["X-Request-ID", "Request body too large", "30 / minute", "120 / minute", "pip install cryptography",
                     "verify_receipt.py receipt.json keys.json", "--value", "--salt", "--entries"]) {
      expect(body).toContain(s);
    }
    expect(page).toContain('id="offline"');
  });

  it("shows curl, Python and JavaScript examples and points to the browser verifier", () => {
    expect(body).toContain('curl -sS "$BASE/api/v2/password?length=24&receipt=true"');
    expect(body).toContain("from verify_receipt import verify");
    expect(body).toContain('fetch(`${BASE}/api/v2/password?length=24&receipt=true`, { cache: "no-store" })');
    expect(body).toContain("web/lib/verify");
  });

  it("explains the draw states and qpg-select/1", () => {
    for (const s of ["needs_investigation", "qpg-select/1", "KeyStream(seed) = HMAC-SHA512(seed, counter_be64)",
                     "uniform_index(n)"]) expect(body).toContain(s);
  });
});

describe("/transparency", () => {
  const page = html.transparency;
  const body = text(page);

  it("has the six anchored sections", () => {
    expect(ids(page)).toEqual(["proven", "keys", "entropy", "draws", "audit", "limits"]);
  });

  it("separates proven, asserted and not available", () => {
    for (const s of ["Proven", "Asserted", "Not available", "Integrity", "Provenance", "Independent quantum evidence"]) {
      expect(body).toContain(s);
    }
    expect(body).toContain("Valid signatures prove what this server signed, not that a quantum device independently " +
                           "attested the entropy.");
    expect(body).toContain("Generated values stay in your browser. Receipts store a salted commitment only.");
    expect(body).toContain("not an externally anchored transparency log");
  });

  it("renders the key set panel, which loads in the browser rather than on the server", () => {
    expect(body).toContain("Published signing keys");
    expect(body).toContain("Loading the key set");
    expect(body).toContain("/.well-known/quantumpass-keys.json");
  });

  it("summarises assumptions A1 to A8 and the health-test cutoffs", () => {
    for (let n = 1; n <= 8; n++) expect(body).toContain(`A${n} `);
    expect(body).toContain("SP 800-90B-style RCT/APT screening (not a NIST validation)");
    const rows = [...page.matchAll(/<tr>(.*?)<\/tr>/g)].map((m) => text(m[1] as string).trim());
    expect(rows).toContain("ANU, LfD 7 bits per byte 4 18");
    expect(rows).toContain("IBM raw bits, read as bytes 2 bits per byte 11 178");
  });

  it("works through the IBM capacity numbers and the fallback order", () => {
    for (const s of ["127 × 2,048", "260,096 bits = 32,512 bytes", "8,128 bytes", "127", "10 QPU-minutes per 28 days",
                     "2 per rolling 24 hours", "ANU, then LfD", "the OS CSPRNG alone"]) {
      expect(body).toContain(s);
    }
  });

  it("states the draw guarantees, the audit chain and every honest limit", () => {
    for (const s of ["At most once", "needs_investigation", "details.recovered: true", "No external anchoring yet",
                     "hash of the previous one", "server-operated", "can withhold", "independent cryptographic design review",
                     "has not been done yet", "operator-asserted", "IBM does not sign job results"]) {
      expect(body).toContain(s);
    }
    expect(page).toContain('href="https://github.com/ahmadhashimi/quantum-password-generator/blob/v2/docs/SECURITY.md"');
  });
});

describe("/status", () => {
  const body = text(html.status);

  it("server-renders the monitor shell and the explanation of every state", () => {
    expect(body).toContain("Entropy source status");
    expect(body).toContain("Loading source status");
    expect(body).toContain("Availability is live telemetry, not evidence of a source's contribution to a past receipt; " +
                           "each receipt lists the sources actually used.");
    for (const s of Object.values(STATE_COPY)) {
      expect(body).toContain(s.label);
      expect(body).toContain(s.meaning);
    }
    expect(body).toContain("The IBM simulator is classical pseudo-randomness. It is always labelled not quantum");
  });
});

describe("links into the repository", () => {
  it.each(Object.entries(html))("%s links every repository file and raw download to the same branch", (name, page) => {
    const urls = [...page.matchAll(/https:\/\/(?:github\.com\/ahmadhashimi\/quantum-password-generator\/blob|raw\.githubusercontent\.com\/ahmadhashimi\/quantum-password-generator)\/([\w.-]+)\//g)];
    if (name !== "status") expect(urls.length).toBeGreaterThan(0);
    for (const m of urls) expect(m[1]).toBe("v2");
  });

  it("points the offline download at the same branch as the file links", () => {
    expect(text(html.developers)).toContain("raw.githubusercontent.com/ahmadhashimi/quantum-password-generator/v2/backend/scripts/verify_receipt.py");
  });
});

describe("evidence classes stay separate in the copy", () => {
  it("does not describe the post-quantum signature as protecting how a secret was made, or as a certification", () => {
    const body = text(html.transparency);
    expect(body).toContain("this implementation is not FIPS validated");
    expect(body).toContain("The signatures say nothing about how a secret was generated.");
    expect(body).not.toContain("Quantum-assisted");
  });

  it("says that sources add to each other instead of listing a strict fallback chain", () => {
    expect(text(html.status)).toContain("A request mixes in the sources that are available");
    expect(text(html.status)).not.toContain("The fallback order is");
  });

  it("is honest about what the offline script does with duplicate keys", () => {
    expect(text(html.developers)).toContain("the offline Python script does not");
  });
});

describe("honesty and secret rules across the trust pages", () => {
  const pages = Object.entries(html).map(([name, h]) => [name, text(h)] as const);

  it.each(pages)("%s makes none of the banned claims", (_name, body) => {
    const lower = body.toLowerCase();
    for (const banned of ["unhackable", "quantum-safe", "proves quantum origin", "never weaker", "nist compliant",
                          "fips compliant", "fips-compliant"]) {
      expect(lower).not.toContain(banned);
    }
  });

  it.each(pages)("%s only mentions certification to deny it", (_name, body) => {
    for (const m of body.matchAll(/certif\w*/gi)) {
      const before = body.slice(Math.max(0, m.index - 70), m.index);
      expect(before, `"${body.slice(Math.max(0, m.index - 70), m.index + 20)}"`).toMatch(/\b(not|no|nor|without)\b/i);
    }
  });

  it.each(pages)("%s renders no inline script or event handler attributes", (name) => {
    const raw = html[name as keyof typeof html];
    expect(raw).not.toMatch(/<script/i);
    expect(raw).not.toMatch(/\son[a-z]+=/i);
  });
});

describe("source rules for the trust pages", () => {
  const root = join(__dirname, "..", "..");
  const dirs = ["components/docs", "components/status", "app/developers", "app/transparency", "app/status"];
  const sources = dirs.flatMap((d) =>
    readdirSync(join(root, d))
      .filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith(".test.ts") && !f.endsWith(".test.tsx"))
      .map((f) => [`${d}/${f}`, readFileSync(join(root, d, f), "utf8")] as const));

  it("finds the files it is meant to check", () => {
    expect(sources.length).toBeGreaterThan(15);
  });

  it.each(sources)("%s: no dangerouslySetInnerHTML, eval, console.log, storage or external assets", (_file, src) => {
    expect(src).not.toMatch(/dangerouslySetInnerHTML|\beval\(|new Function\(|console\.log|localStorage|sessionStorage/);
    expect(src).not.toMatch(/<script|<img|<iframe|@import|src="https?:/);
  });

  it.each(sources)("%s: every next/link has prefetch off", (_file, src) => {
    for (const m of src.matchAll(/<Link\b[^>]*>/gs)) expect(m[0]).toContain("prefetch={false}");
  });
});
