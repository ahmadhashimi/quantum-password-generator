// @vitest-environment node
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import EnterprisePage from "@/app/enterprise/page";
import HomePage from "@/app/page";
import PricingPage from "@/app/pricing/page";

const html = { home: renderToString(<HomePage />), pricing: renderToString(<PricingPage />),
               enterprise: renderToString(<EnterprisePage />) };

/** Visible text: React's text-node separators and tags removed, and the entities it emits decoded. */
const text = (s: string): string =>
  s.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

const body = { home: text(html.home), pricing: text(html.pricing), enterprise: text(html.enterprise) };
const NEGATION = /\b(no|not|none|never|without|nor)\b|n't/i;

describe("honesty rules across the marketing pages", () => {
  for (const [name, t] of Object.entries(body)) {
    it(`${name} makes none of the banned claims`, () => {
      for (const banned of [/unhackable/i, /quantum-safe/i, /proves? (a )?quantum origin/i, /never weaker/i,
                            /post-quantum (password|passphrase)/i]) {
        expect(t).not.toMatch(banned);
      }
    });

    it(`${name} only mentions certification to deny it`, () => {
      const sentences = t.split(/(?<=[.!])\s+/).filter((s) => /certif|compliant|fedramp/i.test(s));
      for (const s of sentences) expect(s, s).toMatch(NEGATION);
    });
  }

  it("names no prospective customers", () => {
    for (const t of Object.values(body)) {
      expect(t).not.toMatch(/akeyless|infisical|doppler|fireblocks|bitgo|keyfactor|viralsweep|sweepwidget|easypromos/i);
    }
  });

  it("loads no external scripts, images or inline HTML injection", () => {
    for (const page of Object.values(html)) {
      expect(page).not.toMatch(/<script|<img|<iframe|dangerouslySetInnerHTML/);
      expect(page).not.toMatch(/(src|href)="https?:\/\//);
    }
  });
});

describe("/", () => {
  const t = body.home;

  it("leads with the eyebrow, headline and both calls to action", () => {
    expect(t).toContain("Transparent cryptographic evidence");
    expect(t).toContain("Secrets with evidence you can check yourself");
    expect(html.home).toContain('href="/generate"');
    expect(html.home).toContain('href="/verify"');
  });

  it("covers every story section in order", () => {
    const ids = [...html.home.matchAll(/<section[^>]* id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toEqual(["why-now", "how-it-works", "evidence", "use-cases", "comparison"]);
  });

  it("keeps proven, asserted and not available apart, with the standing caveat", () => {
    for (const label of ["Proven", "Asserted", "Not available"]) expect(t).toContain(label);
    expect(t).toContain("Valid signatures prove what this server signed, not that a quantum device independently attested the entropy.");
    expect(t).toContain("IBM does not sign job results");
    expect(t).toContain("SP 800-90B-style RCT/APT screening");
  });

  it("compares four options and admits where it is weaker", () => {
    for (const col of ["QuantumPass", "Typical password generator", "Public QRNG API", "random.org draws"]) {
      expect(t).toContain(col);
    }
    expect(t).toContain("Not available. IBM does not sign job results");
    expect(t).toContain("New project, no public track record yet");
  });
});

describe("/pricing", () => {
  const t = body.pricing;

  it("says plainly that nothing can be bought", () => {
    expect(t).toContain("Proposed plans: paid checkout isn't available yet. Prices are illustrative.");
  });

  it("lists the five tiers", () => {
    for (const tier of ["Free", "Creator", "Studio", "API", "Enterprise evaluation"]) expect(t).toContain(tier);
    expect(t).toContain("$12");
    expect(t).toContain("$49");
    expect(t).toContain("$19");
  });

  it("states the limits the backend enforces", () => {
    expect(t).toContain("50 signed draws a day");
    expect(t).toContain("20 IBM-pool seeds a day");
    expect(t).toContain("50 messages per day");
  });

  it("answers the hard questions", () => {
    for (const q of ["What is quantum about it?", "Is it certified?", "What happens when IBM time runs out?",
                     "Can you see my secrets?"]) {
      expect(t).toContain(q);
    }
    expect(t).toContain("never shown as contributing");
    expect(t).toContain("salted SHA-512 commitment");
  });

  it("offers no purchase link", () => {
    expect(html.pricing).not.toMatch(/checkout\?|stripe|mailto:/i);
  });
});

describe("/enterprise", () => {
  const t = body.enterprise;

  it("leads with the positioning message verbatim", () => {
    expect(t).toContain("An embedded cryptographic evidence system");
    expect(t).toContain("Keep your existing secrets infrastructure. Add QuantumPass to make credential issuance " +
                        "independently auditable, with post-quantum signed evidence and transparent security guarantees.");
  });

  it("walks the diagram from secrets manager to auditor", () => {
    const order = ["Step 1: Your secrets manager", "Step 2: Issuance policy", "Step 3: QuantumPass",
                   "Step 4: Signed receipt", "Step 5: Auditor verifies"];
    const at = order.map((s) => t.indexOf(s));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("separates V2.1 from the V3 roadmap and says what is not claimed", () => {
    expect(t).toContain("Available in V2.1");
    expect(t).toContain("V3 roadmap");
    expect(t).toContain("Customer-hosted SDK or sidecar");
    expect(t).toContain("Externally anchored transparency log");
    expect(t).toContain("Independent design review");
    expect(t).toContain("No FIPS, FedRAMP, GLI-19, or independently attested quantum-origin certification is claimed.");
    expect(t).toContain("Quantum Origin from Quantinuum is deployed with large enterprises");
    expect(t).toContain("We don't compete on certification");
  });

  it("ends with the evaluation calls to action and no mailto link", () => {
    expect(html.enterprise).toContain('href="/developers"');
    expect(html.enterprise).toContain('href="/transparency"');
    expect(t).toContain("Read the Evidence API");
    expect(t).toContain("See the transparency page");
    expect(html.enterprise).not.toContain("mailto:");
  });
});
