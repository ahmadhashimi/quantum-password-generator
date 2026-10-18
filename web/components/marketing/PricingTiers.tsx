import { Check, CircleDashed } from "lucide-react";
import type { Route } from "next";
import type { ReactNode } from "react";

import { Badge, ButtonLink, Callout, Card, type Tone } from "@/components/ui";
import { clerkEnabled } from "@/lib/auth/config";
import { cn } from "@/lib/cn";

import { Block } from "./Block";
import { TextLink } from "./links";

interface Tier {
  id: string;
  name: string;
  audience: string;
  status: { tone: Tone; label: string };
  prefix?: string;
  price: string;
  unit?: string;
  priceNote: string;
  cta: { href: Route; label: string; primary?: boolean };
  /** Things the service does now. */
  today: string[];
  /** Things this plan would add. Not sold and not built unless it says otherwise. */
  planned: string[];
  footnote?: ReactNode;
  span: string;
  featured?: boolean;
}

const FREE_HREF: Route = clerkEnabled ? "/sign-up" : "/generate";

const TIERS: Tier[] = [
  {
    id: "free",
    name: "Free",
    audience: "Try it, verify receipts and run small draws.",
    status: { tone: "success", label: "Available today" },
    price: "$0",
    priceNote: "No card needed.",
    cta: { href: FREE_HREF, label: clerkEnabled ? "Sign up free" : "Start free", primary: true },
    today: [
      "Passwords, passphrases and random keys, with no account",
      "Receipts signed with Ed25519 and ML-DSA-65, checked in your browser or offline",
      "Proof Explorer for any receipt",
      "Signed in: 50 signed draws a day, up to 10,000 entries and 100 winners each",
      "Signed in: 20 IBM-pool seeds a day, labelled per result",
      "Signed in: receipt history and usage in your dashboard",
      "Signed in: security assistant, up to 50 messages a day within a $1.00 spend cap, when enabled",
    ],
    planned: [],
    footnote: (
      <>
        Generating needs no account. <TextLink href="/generate">Open the generator</TextLink>.
      </>
    ),
    span: "lg:col-span-2",
    featured: true,
  },
  {
    id: "creator",
    name: "Creator",
    audience: "Regular draws and bulk secrets with stricter sourcing.",
    status: { tone: "violet", label: "Proposed" },
    price: "$12",
    unit: "/ month",
    priceNote: "or $120 billed yearly. Illustrative price.",
    cta: { href: FREE_HREF, label: "Try it free first" },
    today: ["Everything in Free, at Free limits"],
    planned: [
      "Strict quantum mode: fail instead of falling back when no quantum source is available",
      "Bulk generation, up to 1,000 secrets per batch",
      "Branded public verify page for your draws",
      "Larger IBM-pool and assistant allowances",
    ],
    span: "lg:col-span-2",
  },
  {
    id: "studio",
    name: "Studio",
    audience: "Small teams that run draws and keep audit records.",
    status: { tone: "violet", label: "Proposed" },
    price: "$49",
    unit: "/ month",
    priceNote: "or $490 billed yearly. Illustrative price.",
    cta: { href: FREE_HREF, label: "Try it free first" },
    today: ["Everything in Free, at Free limits"],
    planned: [
      "Everything in Creator",
      "Scheduled commit-then-run draws",
      "Embeddable verify badge",
      "CSV audit export of receipts and draws",
      "Bulk generation, up to 5,000 secrets per batch",
      "Two seats",
    ],
    span: "lg:col-span-2",
  },
  {
    id: "api",
    name: "API",
    audience: "Developers who issue secrets and receipts from code.",
    status: { tone: "violet", label: "Proposed" },
    prefix: "From",
    price: "$19",
    unit: "/ month",
    priceNote: "Illustrative price. A free development tier is planned.",
    cta: { href: "/developers", label: "Read the Evidence API" },
    today: [
      "Documented, versioned Evidence API and receipt schema",
      "Reference verifiers in Python and TypeScript, tested against shared vectors",
      "Idempotency keys on draw commit and run",
    ],
    planned: [
      "API keys for server-to-server calls",
      "100,000 requests a month included, at 120 a minute",
      "Usage dashboard with hard stops instead of surprise overage",
    ],
    span: "lg:col-span-3",
  },
  {
    id: "enterprise",
    name: "Enterprise evaluation",
    audience: "Teams adding auditable evidence to credential issuance.",
    status: { tone: "info", label: "By evaluation" },
    price: "Custom",
    priceNote: "Starts with a 30-day technical evaluation.",
    cta: { href: "/enterprise", label: "See the evaluation plan" },
    today: [
      "Public Evidence API, offline verifier and transparency page to evaluate against",
      "Idempotent draws and a hash-chained audit log",
    ],
    planned: [
      "Integration call and verification walkthrough",
      "Volume-capped pilot on shared infrastructure",
      "Support terms, DPA and a security questionnaire pack",
    ],
    footnote: "No SLA and no certification is offered or implied. The V3 roadmap items are not available.",
    span: "md:col-span-2 lg:col-span-3",
  },
];

function FeatureList({ items, kind }: { items: string[]; kind: "today" | "planned" }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h4 className="text-xs font-semibold tracking-widest text-subtle uppercase">
        {kind === "today" ? "Available today" : "Planned for this plan"}
      </h4>
      <ul className="mt-3 space-y-2.5">
        {items.map((item) => (
          <li key={item} className="flex gap-2.5 text-sm text-muted">
            {kind === "today" ? (
              <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
            ) : (
              <CircleDashed aria-hidden className="mt-0.5 size-4 shrink-0 text-subtle" />
            )}
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TierCard({ tier }: { tier: Tier }) {
  return (
    <li className={cn("flex", tier.span)}>
      <Card className={cn("flex w-full flex-col p-6", tier.featured && "bg-surface-raised ring-1 ring-accent/50")}>
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold text-fg">{tier.name}</h3>
          <Badge tone={tier.status.tone}>{tier.status.label}</Badge>
        </div>
        <p className="mt-1 text-sm text-muted">{tier.audience}</p>
        <p className="mt-6 flex items-baseline gap-1.5">
          {tier.prefix && <span className="text-sm text-muted">{tier.prefix}</span>}
          <span className="text-4xl font-semibold tracking-tight text-fg tabular-nums">{tier.price}</span>
          {tier.unit && <span className="text-sm text-muted">{tier.unit}</span>}
        </p>
        <p className="mt-1 text-xs text-muted">{tier.priceNote}</p>
        <ButtonLink href={tier.cta.href} variant={tier.cta.primary ? "primary" : "secondary"} className="mt-6 w-full">
          {tier.cta.label}
        </ButtonLink>
        <div className="mt-6 space-y-6 border-t border-border pt-6">
          <FeatureList items={tier.today} kind="today" />
          <FeatureList items={tier.planned} kind="planned" />
        </div>
        {tier.footnote && <p className="mt-auto pt-6 text-xs text-muted">{tier.footnote}</p>}
      </Card>
    </li>
  );
}

export function PricingTiers() {
  return (
    <Block id="plans" tight eyebrow="Plans" title="Five ways to use it, one evidence model"
           description="Each card separates what the service does today from what the plan would add.">
      <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
        {TIERS.map((tier) => <TierCard key={tier.id} tier={tier} />)}
      </ul>
      <Callout tone="neutral" title="Plans change limits and features, never what a receipt means" className="mt-6">
        Every plan uses the same evidence model: integrity is proven, provenance is asserted by the operator, and
        independent quantum evidence is not available. Valid signatures prove what this server signed, not that a
        quantum device independently attested the entropy.
      </Callout>
    </Block>
  );
}
