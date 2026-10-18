# Quantum Password Generator v2: Business Plan

**Owner:** Mujtaba Hashimi (solo developer) · **Codebase:** `github.com/ahmadhashimi/quantum-password-generator`, branch `v2` · **Date:** 2026-10-18

> **Note:** this plan was researched against an earlier snapshot of the code. Since then the product gained hybrid post-quantum (ML-DSA-65 + Ed25519) receipts, commit-then-run draws, batched/throttled QRNG calls, atomic AI spend reservations and the other guardrails listed in `docs/SECURITY.md`. Where the plan says "Ed25519 signature" or recommends batching ANU calls, treat that as already done. Prices remain assumptions to validate.

**How sourcing works in this plan.** Every external fact has a URL. The research sandbox blocked direct page loads for ibm.com, quantum.ibm.com, aws.amazon.com, api.random.org, csrc.nist.gov, clerk.com, stripe.com, lfdr.de and quantumnumbers.anu.edu.au. Prices from those vendors therefore come from search-engine snippets of the vendor pages. **Check them on the live pages before you publish prices.** Anything not sourced is labelled **[Assumption]**. Where the four research sections disagreed, this plan picks one figure and says why under **Conflict:**.

---

## 1. Executive summary

- **Passwords are not the product. Provable randomness is.** Every password manager gives away a generator: Bitwarden Free has unlimited passwords ([toolradar](https://toolradar.com/tools/bitwarden/pricing)). And because your output is mixed through HKDF-SHA512 with the OS CSPRNG, quantum input adds no security a user could measure over a correctly used CSPRNG. People pay for randomness they can **verify after the fact**. random.org already sells signed randomness, with a gambling-licence tier at $30/mo for 30k requests ([random.org pricing](https://api.random.org/pricing)).
- **Start with verifiable giveaways and draws.** The buyers are streamers, community managers, esports organisations, and indie or web3 game studios. They pay by card, no certification is needed outside regulated gambling, and the pain is concrete: "the draw was rigged" disputes. Second segment: a quantum-sourced entropy API with signed provenance for dev-tool startups. **Do not sell to** consumers, regulated iGaming, fintech, government or IoT. Each of those needs FIPS 140-3, ESV or GLI certification, or enterprise sales.
- **Treat this as a small niche SaaS, not a venture-scale business.** Quantum eMotion, a funded public QRNG company, booked about CAD 10.6k of revenue against a CAD 3.6M quarterly loss in Q1 2026 ([QCR](https://quantumcomputingreport.com/quantum-emotion-reports-q1-2026-financial-results-entry-into-early-commercialization-and-strategic-u-s-cybersecurity-acquisition/)). A realistic year-1 target is **about $300–$1,000 MRR**. That figure is illustrative, not a forecast.
- **Three code defaults could cost more than you earn. Fix them before charging.**
  1. The assistant defaults to Opus 5.5. Its worst case is about $0.67 per message; Haiku's is about $0.017.
  2. The ANU source is called once per request at $0.005. At 50k MAU that is about $7,500/mo, which equals all revenue in the cost model. Batching would cut it to about $469.
  3. The `PRICING` table has a wrong cache-read price.

  With Haiku as default and batched ANU, monthly cost is about **$42 at 100 MAU, $185 at 5k and $1,359 at 50k**.
- **The biggest risk is legal: the supplier terms.** An older IBM Quantum agreement limited Open Plan use to "non-commercial testing and evaluation" ([Scribd copy, unverified](https://www.scribd.com/document/442945845/ibm-q-end-user-agreement-1-pdf)). LfD has no published terms. Until both are confirmed in writing, paid tiers run on paid ANU plus CSPRNG. IBM is used only in a free demo pool or on a capped Pay-As-You-Go instance.

---

## 2. Problem → solution

**Problem.**
- Anyone who runs a draw, awards a prize, or issues keys and tokens cannot *prove afterwards* where the randomness came from, or that nobody (including themselves) tampered with it.
- "We used a random picker" cannot be audited, and participants don't believe it.
- Badly implemented RNGs have caused large losses:
  - Wintermute lost about $160M in 2022 through brute-forceable Profanity vanity keys ([The Block](https://www.theblock.co/news/defi/2022-09-20-experts-blame-a-vanity-address-bug-for-wintermutes-160-million-hack-171192)).
  - Libbitcoin `bx seed` (CVE-2023-39910, "Milk Sad") seeded a Mersenne Twister with 32 bits of system time ([OpenCVE](https://www.opencve.io/cve/CVE-2023-39910)).
- These failures came from bad implementations, not from the lack of a quantum source.

**Solution.**
- A randomness API and draw tool that attaches a **signed provenance receipt** to every result. The receipt records:
  - which entropy sources were used (IBM job ID, or ANU plus a timestamp)
  - SP 800-90B health-test status (RCT and APT, already implemented)
  - a commit-reveal hash of the entrant list
  - an Ed25519 signature that anyone can check on a public verify page
- Output is always mixed with the OS CSPRNG, so it is never weaker than standard practice. "Quantum" is a provenance fact you can verify, not a claim of extra strength.

**What exists today:** multi-source harvesting, health tests, a circuit breaker, honest per-result "Quantum" / "Not quantum" labels, Clerk auth and metering.

**What is missing before any of this can be sold:** signing, a public verify page, a draw engine, billing, plan-aware limits, and confirmed supplier terms.

**What we will never claim:** "unhackable", "more secure than CSPRNG", "quantum-safe" or "post-quantum", "NIST-certified", or GLI-compliant. See §7.4.

---

## 3. Target industries and personas

### 3.1 Industries

| Industry | Why they pay | Hard requirements | Fit now |
|---|---|---|---|
| Giveaways, raffles, esports, Discord/Twitch draws, web3 mints | Public proof of a fair draw; disputes cost them reputation | Signed results, public verify page, audit log | **High** |
| Security and dev-tool SaaS that issues keys, seeds or tokens | A differentiation story backed by evidence | API keys, uptime, honest provenance | **Medium–High** |
| Research and education (quantum courses, randomisation) | Inspectable real-QPU randomness; documented randomisation | Low price, citable logs | Medium (small budgets) |
| Crypto custody and wallets | Key-generation failures are catastrophic | Offline generation; won't trust a remote API | Low |
| Regulated iGaming and lotteries | Must use a certified RNG | GLI-19 or lab certification per jurisdiction ([agbrief](https://agbrief.com/news/01/02/2021/gli-guaranteeing-randomness/)) | Low until certified |
| Fintech, government, defense | PQC programmes; CNSA 2.0 requires new NSS acquisitions to be compliant from 1 Jan 2027 ([SafeLogic](https://www.safelogic.com/blog/cnsa-2.0-and-the-2027-inflection-point)) | FIPS 140-3 / ESV ([NIST ESV](https://csrc.nist.gov/Projects/cryptographic-module-validation-program/entropy-validations)), FedRAMP | Very low |
| IoT provisioning | Weak entropy at first boot | Factory or HSM integration | Low |
| Consumer password generation | Novelty | None | Very low willingness to pay |

### 3.2 Personas

| # | Persona | Pain | What makes them buy | Budget | Realistic spend |
|---|---|---|---|---|---|
| P1 | Community or marketing manager (brand, streamer, esports org, NFT project) | "Rigged winner" accusations; screenshots prove nothing | A public dispute, or a large prize draw | Can put it on a card | $10–$100/mo [Assumption, anchored to random.org's $30/mo] |
| P2 | Indie or web3 game studio CTO | Players want fairness proofs; Chainlink VRF charges variable gas per request ([Chainlink](https://docs.chain.link/vrf/v2-5/billing.md)) | A launch or player complaints | CTO decides | $50–$500/mo [Assumption] |
| P3 | Founder or PM at a security / dev-tool startup | Product looks like everyone else's | Launch, fundraise, or a competitor's PQC news | Founder decides | $19–$299/mo [Assumption] |
| P4 | Enterprise PQC programme lead | Entropy inventory; board asks about "quantum readiness" | Procurement | Needs FIPS/ESV | $10k+/yr, **not reachable today** |
| P5 | Lecturer or research PI | Wants real QPU randomness students can inspect | Start of semester | Department card | $0–$50/mo |
| P6 | Clinical research coordinator | Randomisation must be defensible to auditors | Protocol submission | PI or CRO | $50–$300 per study (**unvalidated**) |

### 3.3 Recommended beachhead

**P1 and P2: verifiable draws for giveaways and games, excluding real-money gambling.**
- No procurement and no certification.
- Proven willingness to pay for signed randomness (random.org).
- The verify page carries your brand to everyone who checks a result.
- Uses the stack you already have.

**Second wave:** the P3 entropy API, plus a free academic tier for P5 to build credibility.

**Validation gate:** 10–15 interviews and a landing-page test **before** building past the receipt and verify page (see §8). Willingness to pay for P1, P2 and P6 has not been validated.

---

## 4. Competitors and positioning

| Offering | What it is | Public price | Relevance |
|---|---|---|---|
| **random.org API** | Atmospheric-noise TRNG with signed results | Virtual-item gambling tier $30/mo including 30k requests, then $0.001/request; 10–25% bulk discount at $250–$3,000/mo; free development and non-profit tiers ([pricing](https://api.random.org/pricing), [billing](https://api.random.org/billing)). Old quota price about $8/MB ([Network World](https://www.networkworld.com/article/817265/software-randomness-and-random-org.html)) | **Main competitor for P1 and P2.** Already does signed draws. |
| **ANU Quantum Numbers** | Vacuum-fluctuation QRNG | $0.005/request (≤1,024 numbers), 100 req/s, free trial ([AWS](https://aws.amazon.com/marketplace/pp/B09SFWPDRJ)). Listing dated about 2021–22 | Also **our supplier**; our prices must cover it |
| **Cisco Outshift QRNG** | Free API, 100k bits/day | Free; evaluation and non-production only; serves pre-generated numbers ([offer PDF](https://www.cisco.com/c/dam/en_us/about/doing_business/legal/OfferDescriptions/Outshift-QRNG-Offer-Description.pdf)) | Makes "free" the reference price for demos |
| **QCI uQRNG** | Free at launch, 1B bits/mo | Free ([QCI](https://learn.quantumcomputinginc.com/learn/tutorials-and-use-cases/qrng-api-quickstart-guide)) | Raw bits are close to worthless to resell |
| **Quantinuum Quantum Origin** | Software QRNG, NIST SP 800-90B #E214 | Not public; priced per key per month at launch ([HPCwire](https://www.hpcwire.com/2021/12/07/quantinuum-debuts-quantum-based-cryptographic-key-service-is-this-quantum-advantage/), [Quantinuum PR](https://www.quantinuum.com/press-releases/quantinuums-quantum-origin-becomes-first-software-quantum-random-number-generator-to-achieve-nist-validation)) | Enterprise channel; don't compete |
| **ID Quantique Quantis** | Hardware QRNG, ESV certificate 2023 | PCIe €1,355 / €3,136 ([IDQ](https://www.idquantique.com/random-number-generation/how-to-buy/)) | Substitute for heavy enterprise users |
| **Qrypt, QuintessenceLabs, Quantropi** | Entropy-as-a-service / appliances | Sales-led, not public ([Qrypt](https://docs.qrypt.com/eaas), [qStream](https://www.carahsoft.com/resources/29618-qstream), [Quantropi](https://www.quantropi.com/wp-content/uploads/2025/06/QEaaS.pdf)) | Enterprise |
| **Chainlink VRF** | On-chain verifiable randomness | Gas + callback gas + flat fee ([docs](https://docs.chain.link/vrf/v2-5/billing.md)) | Default for on-chain games; we sit off-chain or alongside it |
| **Password managers** | Built-in generator | 1Password Business $7.99/user; Bitwarden Teams $4 / Enterprise $6 per user ([toolradar](https://toolradar.com/blog/best-password-managers-2026), [tech-insider](https://tech-insider.org/proton-pass-vs-bitwarden-vs-1password-2026/)), third-party figures | Nobody pays separately for a generator |

**Positioning statement:** *"Draw winners and generate secrets with a receipt anyone can verify: the entropy sources (including real quantum hardware), the health tests, and a signature. Always at least as strong as your OS's cryptographic RNG."*

**How we beat random.org:**
1. Receipts that combine several sources, including quantum, and are built to be shared.
2. Commit-reveal draws with a public verify page and an embeddable badge.
3. A Discord/Twitch bot.
4. An AI assistant that explains the result.

**Where random.org beats us:** brand trust, 20+ years of history, and existing gambling licences.

---

## 5. Pricing and packaging

**Conflict (tiers):**
- The monetization section proposed a consumer **Pro at $5/mo** and **Team at $8/seat**.
- The market section found almost no willingness to pay for standalone generators. It proposed draw tiers of $9–19 and $49, and API tiers of $49 and $299 with an SLA.
- Guardrails says **no SLA below Enterprise** for a solo operator.

**Resolution:**
- Fold the generator "Pro" features (strict quantum mode, bulk generation, more assistant use) into a draw-led **Creator** tier.
- **Defer Team.** It would compete with Bitwarden at $4/user, and Clerk Organizations pricing is unverified.
- Use the monetization section's API prices, because its margins are worked out. Test the market section's $49 and $299 price points later as upside.

### 5.1 Draw and app tiers

| | **Free** | **Creator: $12/mo or $120/yr** | **Studio: $49/mo or $490/yr** | **One-off draw certificate** |
|---|---|---|---|---|
| Signed draws | 3/mo, ≤500 entrants, watermarked verify page | 30/mo, ≤10k entrants, no watermark | Fair use 500/mo, ≤250k entrants, scheduled commit-reveal | 1 draw: **$4.99** (≤10k entrants) / **$19** (>10k) |
| Verify page, badge | Public verify page | Branded page, Discord/Twitch bot | Embeddable badge, draw API, CSV audit export, 2 seats | Public verify page + PDF |
| Password/passphrase generator | Unlimited within rate limits; quantum-mixed when the pool has entropy, labelled per result | + **strict quantum mode** (fail instead of falling back), 1,000 per batch | + 5,000 per batch | — |
| IBM-attested results* | — | 20/mo | 100/mo | — |
| Assistant | Signed in only: Haiku, $0.30/mo cap (about 10 msgs/day) | Haiku 1,000/mo + Sonnet 50/mo | Haiku 1,000/mo + Sonnet 200/mo | — |

*Only after IBM commercial terms are cleared, or a Pay-As-You-Go instance exists (§7.1). Until then these show as "coming soon" and are not sold.

**Price anchors:**
- Creator sits below random.org's $30/mo gambling tier. Studio is set for small studios.
- Lead with annual pricing. On a $12 charge, Stripe takes 6.1% ($0.73). On $120/yr it takes 3.85%. Fee formula: 2.9% + $0.30 + 0.7% Billing ([Stripe Billing](https://stripe.com/en-us/billing/pricing), [NerdWallet](https://www.nerdwallet.com/business/software/learn/stripe-fees)).
- All three paid price points are **[Assumption]**. Validate them in interviews.

### 5.2 Entropy API pricing

Three SKUs, each named for what it actually is:
- **Seeded:** a DRBG reseeded from the QRNG pool. Labelled "quantum-seeded", never "quantum".
- **Quantum-direct:** every byte is backed by conditioned QRNG bytes. Fails closed if those are unavailable.
- **IBM-attested:** bytes from the harvested IBM pool, with the job ID in a signed attestation.

| Plan | Price | Included per month | Rate limit | Overage |
|---|---|---|---|---|
| Dev Free | $0 | 1k requests, 1 MB seeded, no quantum-direct | 10/min, ≤1 KB per request | Hard stop |
| Developer | $19/mo | 100k requests, 50 MB seeded, 0.5 MB quantum-direct | 120/min | $0.50 per 1k requests; $1/MB seeded; **$25/MB quantum-direct**; **$3/KB IBM-attested** |
| Scale | $99/mo | 1M requests, 500 MB seeded, 5 MB quantum-direct, 10 KB IBM-attested | 600/min | Same; $20/MB quantum-direct above 20 MB |
| Academic | $0–$10/mo | Developer limits, non-commercial | 120/min | — |
| Enterprise | from $1,500/mo, annual | SLA 99.9% with credits, KMS/HSM-held signing key, DPA, whitepaper; dedicated IBM instance as pass-through + about 20% (IBM Flex alone is at least 400 min × $72 = $28,800/yr) ([IBM pricing](https://www.ibm.com/quantum/pricing)) | Custom | Custom |

**Positioning check.**
- Quantum-direct at $25/MB is about 5–10× ANU's raw cost (about $2.4–4.9/MB).
- The premium is for failover, health tests and signed provenance.
- **Assume weak demand until you see real orders.** Developers can call ANU directly, and Cisco and QCI give bits away.

---

## 6. Cost model and margins

### 6.1 Input prices

| Item | Price | Source / confidence |
|---|---|---|
| IBM Open Plan | Free, 10 QPU-min per 28-day rolling window (the pricing page says "per month"); us-east only | [IBM plans](https://quantum.cloud.ibm.com/docs/en/guides/plans-overview), [IBM pricing](https://www.ibm.com/quantum/pricing) |
| IBM Pay-As-You-Go / Flex / Premium | $96/min ($1.60/s) / $72 (400-min minimum) / $48 | [IBM pricing](https://www.ibm.com/quantum/pricing) via snippet; the guardrails section could confirm only through a [third-party blog](https://www.publish0x.com/veritya-daily/ibm-quantum-pay-as-you-go-pricing-how-runtime-seconds-affect-xjyleop). **Verify.** |
| IBM job time | ≈ 2 s + 0.00035 s × (circuits × shots); docs example about 4.1 s | [IBM estimate](https://quantum.cloud.ibm.com/docs/en/guides/estimate-job-run-time) |
| ANU | $0.005/request (≤1,024 numbers), free trial 100 requests/mo | [AWS](https://aws.amazon.com/marketplace/pp/B09SFWPDRJ), [Startup Daily](https://www.startupdaily.net/?p=102055). Low confidence: dated listing, and one review reports a paid key that did not work ([reviews](https://aws.amazon.com/marketplace/reviews/reviews-list/B09SFWPDRJ)). A "$3/mo unlimited" licence is mentioned on GitHub but unverified. |
| LfD | Free, keyless; **no terms, SLA or rate limit found** | — |
| Claude | Opus 5.5 $4/$20; Sonnet 5.5 $2/$10; Haiku 5.5 $0.10/$0.50 per MTok | Task brief |
| Prompt cache | Write 1.25× (5 min) / 2× (1 h); read **0.05×** on Opus and Sonnet 5.5, 0.1× on others; minimum 512 tokens | [Anthropic caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) |
| Clerk | Free up to 50k monthly retained users (since Feb 2026); MFA needs Pro at $25/mo; about $0.02 per user over the allowance | [Clerk](https://clerk.com/articles/clerk-pricing-explained.md) (an older 10k figure appears at [WorkOS](https://workos.com/blog/clerk-pricing)) |
| Hosting | Render Starter $7 + Postgres $6; Neon $0.106/CU-h; Fly Managed Postgres $38 | [Render](https://render.com/pricing), [Neon](https://neon.com/pricing), [Fly](https://fly.io/docs/mpg) |
| Domain / email | about $10.46/yr; Resend free up to 3k/mo, Pro $20 | [domainoffer](https://domainoffer.net/tld/com/cloudflare), [Resend](https://resend.com/blog/new-free-tier.md) |
| Payments | Stripe 2.9% + $0.30 (+1.5% international, +1% FX) + Billing 0.7%; Paddle / Lemon Squeezy as merchant of record about 5% + $0.50 | [NerdWallet](https://www.nerdwallet.com/business/software/learn/stripe-fees), [Stripe Billing](https://stripe.com/en-us/billing/pricing), [Rework](https://resources.rework.com/tools/billing-revenue/paddle-vs-lemon-squeezy) |

**Conflict (cache-read price):**
- The cost-model section used 0.1× for cache reads. On that basis it said Opus's `$0.20` in `agent.py` was a bug.
- The guardrails section cites Anthropic's 5.5-specific table: 0.05× for Opus and Sonnet 5.5. On that basis Opus `$0.20` is **correct** and Sonnet `$0.20` should be **$0.10**.
- **Resolution:** go with the more specific primary source (guardrails). Confirm on the docs page before changing code. The cached cost figures below used 0.1×, so they are slightly **conservative**.

### 6.2 Per-unit costs

**IBM job: 127 qubits × 2048 shots, 32,512 raw bytes, 4:1 conditioning, 8,128 bytes out**

**Conflict (job time):** the formula gives 2.72 s, IBM's docs example shows about 4.1 s, and the guardrails section assumed about 5 s. This plan uses a **2.7–4 s** range. Measure the real figure with `job.usage()` before setting prices.

| Metric | Value |
|---|---|
| Pay-As-You-Go cost per job | $4.35–$6.40 |
| Cost per KB | $0.54–$0.79 (planning figure: $0.79) |
| Per 64-byte seed | $0.034–$0.05 |
| Per 32-byte result | about $0.025 |
| Open Plan at the code's cap of 2 jobs/day | 56 jobs per 28 days, about 152–230 s (25–38% of quota), about 455 KB, about 7.6k 64-byte seeds, $0 |
| If every generation were IBM-backed on Pay-As-You-Go | about $34 per 1k generations. **Not viable as a default.** |

**ANU**

| Usage pattern | Cost per 1k generations |
|---|---|
| As coded today (one live 64-byte fetch per request) | **$5.00** |
| Prefetched in 1,024-byte batches into the pool | **$0.31** |

**Assistant per message** (typical: 6k input / 600 output, uncached)

| Model | Typical | Worst case at current settings (6 iterations × 4,000 output + about 48k input) | Worst case with recommended caps (3 iterations, `max_tokens` 1,024 / 1,500, about 24k input) [Assumption] |
|---|---|---|---|
| Haiku 5.5 | $0.0009 | $0.017 | about $0.004 |
| Sonnet 5.5 | $0.018 | about $0.34 | about $0.09 |
| Opus 5.5 | $0.036 | **$0.67** | about $0.19 |

- **Conflict:** the monetization section's worst case for Opus was $0.20, computed from 30k input and 4k output. The guardrails figure of $0.67 is used here because it applies the real loop cap (6 calls × 4,000 output tokens).
- A 3-turn cached conversation costs about **$0.073 on Opus, $0.037 on Sonnet and $0.0018 on Haiku**. Opus is about 40× Haiku.

**Compute:** under $0.01 per 1k generations. Requests are I/O-bound.

### 6.3 Three monthly scenarios (USD)

Source: cost-model section. **[Assumptions]:**
- 30 generations per MAU per month
- 20% of MAU use the assistant, 3 conversations each
- IBM on the Open Plan, capped at 2 jobs/day
- ANU batched
- Clerk Pro from day one
- Stripe line computed at 3% of MAU paying $5

Anonymous traffic and bandwidth overage are excluded.

| Line item | 100 MAU | 5,000 MAU | 50,000 MAU |
|---|---|---|---|
| Generations | 3,000 | 150,000 | 1,500,000 |
| App hosting | $7 | $14 | $28 |
| Postgres | $6.30 | about $20 (Neon) | $41 (Fly MPG + 10 GB) |
| Clerk Pro | $25 | $25 | $25 (at cap; +$20 per extra 1k users) |
| Domain + email | $0.87 | $0.87 | $20.87 |
| IBM (Open Plan) | $0 | $0 | $0 |
| ANU (batched) | $0.94 | $46.88 | $468.75 |
| *ANU as coded (per request)* | *$15* | *$750* | *$7,500* |
| Assistant: **Haiku** (cached) | $0.11 | $5.52 | $55.20 |
| Assistant: Opus (cached) | $4.40 | $220.20 | $2,202 |
| Stripe fees | $1.44 | $72 | $720 |
| **Total, Haiku default (recommended)** | **≈ $42** | **≈ $185** | **≈ $1,359** |
| Total, Opus default (as shipped) | ≈ $46 | ≈ $399 | ≈ $3,506 |
| Revenue A: cost-model assumption (3% × $5) | $15 | $750 | $7,500 |
| Revenue B: this plan's assumption (2% paying × $15 blended ARPU) [Assumption] | $30 | $1,500 | $15,000 |
| Gross margin, Haiku, revenue A | −$27 | $565 (75%) | $6,141 (82%) |
| Gross margin, Haiku, revenue B (Stripe line not re-computed) | −$12 | $1,315 (88%) | $13,641 (91%) |
| *What-if: IBM Pay-As-You-Go for every generation* | *+$103* | *+$5,134* | *+$51,341* |

**What dominates the cost:**
1. **At 100 MAU, fixed costs** (about $39). The product loses money until roughly 4–7 Creator subscribers, using about $10.68 net contribution each at typical use.
2. **At 5k–50k MAU on Opus, the assistant** is 55–63% of total cost. A Haiku default cuts the total by 54–61%.
3. **ANU billed per request.** Batching is mandatory.
4. **IBM** is only affordable while capped. A Pay-As-You-Go budget of 4 jobs/day costs about $522/mo for about 15k seeds.

### 6.4 Margins per tier

| Tier | Revenue/mo | Cost at full caps | Margin at caps | Cost at about 20% typical use | Margin typical |
|---|---|---|---|---|---|
| Free (signed in) | $0 | ≤ $0.30 (AI cap) + about $0.01 entropy | — | about $0.03 | — |
| Creator $12 (monthly) | $12.00 | AI $1.80 + ANU $0.15 + IBM 20 × 32 B $0.50 + Stripe $0.73 + infra $0.10 = **$3.28** | **73%** | $1.32 | **89%** |
| Creator $120/yr | $10.00 | Same, with Stripe $0.39/mo = **$2.94** | 71% | $0.98 | 90% |
| Studio $49 | $49.00 | AI $4.50 + ANU $2.50 + IBM 3.1 KB $2.47 + Stripe $2.06 + infra $1.00 = **$12.53** | **74%** | $4.95 | **90%** |
| Draw certificate $4.99 / $19 | $4.99 / $19 | Stripe $0.48 / $0.98 + about $0.03 | 90% / 95% | — | — |
| API Developer $19 | $19.00 | ANU $2.50 + fee $0.43 + infra about $1 = about $3.90 | **about 79%** | — | — |
| API Scale $99 | $99.00 | ANU $25 + IBM $8 + fee $3.30 + infra about $3 = about $39 | **about 60%** | — | — |
| IBM-attested overage $3/KB | — | $0.79/KB on Pay-As-You-Go | 74% (80% on Flex) | — | — |

**Targets:** gross margin of at least 75% at typical use and at least 35% at hard caps. **Opus never goes in a flat tier.** At 1,000 messages it would cost about $36 per user. Opus is Enterprise-only or bring-your-own-key.

**Break-even:** fixed costs of about $42–75/mo are covered by about 7 Creator subscriptions, or 4 Developer plans.

**Illustrative year-1 scenario** (monetization section, re-tiered) **[Assumption]:**
- 30 Creators ($330)
- 3 Studios ($147)
- 10 Developer ($190)
- 2 Scale ($198)
- 30 certificates ($150)

That is **about $1,000 MRR at 75–85% gross margin**. Not a forecast.

---

## 7. Guardrails, with default values

### 7.1 Cost

| # | Guardrail | Default |
|---|---|---|
| C1 | Model routing | **Haiku 5.5 default** (change `assistant_model` in `backend/app/config.py`). Sonnet only on paid tiers within monthly quota. Opus only for Enterprise or bring-your-own-key. Unknown model names are billed at Opus prices (already the case). |
| C2 | Per-request budget | `max_tokens` 1,024 on Haiku, 1,500 on Sonnet. Input ≤ 2,000 characters. History limited to the last 8 turns or 6k tokens. |
| C3 | Tool loop | `max_tool_iterations` 3 (currently 6) |
| C4 | Per-user **dollar** ledger (the current cap of 50 messages/day on Opus can cost about $33 per user per day) | Free: $0.02/day and $0.30/mo. Creator: $0.25/day and $3/mo. Studio: $0.50/day and $8/mo. Anonymous: no assistant. |
| C5 | Global kill switch | $10/day (existing). Monthly cap = **max($150, 25% of MRR)** [Assumption: scales with paying users]. Returns HTTP 503 "assistant paused"; generation is never affected. |
| C6 | Provider backstop | Dedicated Anthropic workspace with a spend limit of 1.2× the monthly cap, plus an org-level monthly limit ([Anthropic rate limits](https://platform.claude.com/docs/en/api/rate-limits.md)) |
| C7 | Prompt caching | `cache_control` on the system prompt and tools. Alert if the hit rate falls below 50%. Prompts under 512 tokens silently don't cache. |
| C8 | Alerts | 50%, 80% and 100% of the daily and monthly caps. Any user above 3× the tier median. More than 5 Anthropic 429/529 responses in 10 min. |
| C9 | IBM Open Plan | `ibm_max_jobs_per_day = 2`. Track `usage.quantum_seconds` per job. Stop at 480 s per 28 days. **Open Plan output is not used in paid tiers until §7.4 L7 is resolved.** |
| C10 | IBM Pay-As-You-Go (if adopted) | Instance "Total cost limit" of **$50/mo** ([IBM manage cost](https://quantum.cloud.ibm.com/docs/en/guides/manage-cost.md)). That buys about 31 s, or 7–11 jobs, or about 57–89 KB of IBM-attested supply per month. Sell IBM-attested only within this supply. |
| C11 | Never start a QPU job from a user request | Pool-only; minimum pool 4 KiB (current) |
| C12 | ANU | **Batch refill only** (1,024 bytes per request). Paid key with a code-enforced hard cap of **2,000 requests/mo ($10)**, raised by plan revenue. Free key: ≤3 requests/day. |
| C13 | LfD | ≤1 request/min, 1 KiB per request, circuit breaker after 3 failures. Best effort. Off for paid tiers until permission is granted. |
| C14 | Runtime kill flags (read every 60 s from the DB) | `ASSISTANT_ENABLED`, `IBM_ENABLED`, `ANU_ENABLED`, `LFD_ENABLED`, `SIGNUPS_ENABLED`, `API_KEYS_ENABLED`, `BILLING_ENABLED` |

### 7.2 Abuse

| # | Guardrail | Default |
|---|---|---|
| B1 | Clerk bot protection | "Smart" mode ([Clerk](https://clerk.com/docs/security/bot-protection)) |
| B2 | Email hygiene | Block disposable addresses and subaddresses ([Clerk restrictions](https://clerk.com/docs/authentication/allowlist); which plan includes this is unverified). Verified email required for the assistant, draws and API keys. |
| B3 | Free-tier farming | Assistant opens 24 h after signup, or immediately once a card is on file. ≤3 accounts per IP per day. |
| B4 | API keys | Paid plans only. Shown once. SHA-256 hash stored. Prefix `qpg_live_`. ≤2 keys (Scale: 5). Scopes `generate`, `random`, `draw`, `status`. Auto-revoke if used from more than 20 distinct IPs in 24 h. |
| B5 | `/random` scraping | ≤1,024 bytes per request. Daily byte quotas (table below). Free users get ≤256 B/day of quantum-attributed bytes. |
| B6 | Rate limits | slowapi keyed by API key, then user, then IP, with **Redis** storage in production |
| B7 | Prompt injection (OWASP LLM01; unbounded consumption is LLM10) ([F5](https://www.f5.com/resources/infographic/owasp-llm-top10)) | Model never sees secrets (existing). Read-only tools with no network access. Plain-text or sanitized markdown output with no images or auto-links. Unit test that no tool result contains a secret. Alert above 20 injection hits/day. |
| B8 | Denial of service on generation | Passphrase ≤20 words. Password ≤256 characters. Batch ≤50 per request (bulk CSV runs as an async job). Body ≤8 KB (draw CSV upload ≤5 MB on Studio). |
| B9 | Gambling misuse of draws | ToS bans real-money gambling and lotteries that need a certified RNG. Checkbox at draw creation. Geo-block sanctioned countries. **[Assumption: needs legal review of sweepstakes law per country.]** |

**Tier rate limits**

| Tier | Generate | `/random` bytes per day | Draws | API keys |
|---|---|---|---|---|
| Anonymous | 30/min, 300/day per IP | 4 KiB | — | no |
| Free | 60/min, 1,000/day | 16 KiB | 3/mo | no |
| Creator / Studio | 120/min, 10,000/day | 256 KiB | 30 / 500 per mo | Studio: 2 |
| API Developer / Scale | 120 / 600 per min | Plan quota (10 MiB/day ceiling on Developer) | via API | 2 / 5 |

### 7.3 Security and trust

| # | Guardrail | Default |
|---|---|---|
| S1 | No secrets in logs | No bodies logged for `/password`, `/passphrase`, `/random`. `Cache-Control: no-store`. Sentry with `send_default_pii=False` and a scrubber. **CI test** asserting log output contains no generated value. |
| S2 | Signed receipts | Ed25519 signature over `{request_id, timestamp, sources_used, quantum, health_test_status, pool_job_ids, entrants_hash?, commitment?}`. **Never a hash of a secret**, because that gives attackers an offline guessing oracle. Public key at `/.well-known/qpg-provenance.pub`. Key held in the secret manager, rotated yearly. Old public keys stay published. |
| S3 | Build provenance | `actions/attest-build-provenance` on every Docker release ([action](https://github.com/MachineNativeOps/attest-build-provenance)) |
| S4 | Supply chain | Dependabot weekly. `pip-audit` and `npm audit --audit-level=high` fail CI. gitleaks. Actions pinned to commit SHAs. |
| S5 | SOC2-lite | MFA everywhere. Secrets in the host's secret manager. Separate production and staging. Daily backups with a quarterly restore test. One-page incident runbook. `security.txt`. |
| S6 | RNG health | Keep RCT/APT and the circuit breaker. If all quantum sources fail, serve CSPRNG output labelled "Not quantum". In strict mode, fail. If the OS CSPRNG check fails, return HTTP 503. |
| S7 | Web hardening | Strict CSP. HSTS for 1 year with preload. `allowed_hosts` set to the real domain (currently `*`). `allowed_origins` set to the production origin. |

### 7.4 Legal and claims

**D1. Claim substantiation.** The FTC requires a "reasonable basis" for a claim *before* the ad runs ([FTC policy](https://www.ftc.gov/node/52431)). The Tapplock settlement over "unbreakable" locks is the relevant precedent ([Ifrah Law](https://www.ifrahlaw.com/ftc-beat/ftc-enforcement-reminds-companies-to-live-up-their-promises/)).

| Claim | Status | Safe wording |
|---|---|---|
| "Unhackable", "unbreakable", "100% secure" | **Banned** | — |
| "Quantum-safe", "post-quantum", "quantum-proof" | **Banned**. Post-quantum means PQC algorithms such as FIPS 203/204/205 ([summary](https://www.encryptionconsulting.com/nist-pqc-standards-fips-203-204-205/), [NCSC](https://www.ncsc.gov.uk/whitepaper/quantum-networking-technologies)). | — |
| "NIST-certified", "FIPS", "GLI" | **Banned** (no certificate) | "Implements the continuous health tests (RCT/APT) described in NIST SP 800-90B." |
| "Truly random" | Avoid | "Seeded with quantum entropy when available, always mixed with your OS's cryptographic RNG; every result says whether quantum entropy was used." |
| IBM or ANU logos | Avoid | "Uses entropy from IBM Quantum hardware", as text only |
| "The AI never sees your passwords" | OK if tested | Backed by the S1 and B7 tests |

Keep health-test and source logs for 12 months as substantiation.

**D2. Supplier terms. This blocks paid launch.**

| # | Provider | Status | Default |
|---|---|---|---|
| L7 | IBM Open Plan | Current EULA (June 2025) at [quantum.ibm.com/terms](https://quantum.ibm.com/terms) was not read. The older version said "non-commercial testing and evaluation" ([Scribd](https://www.scribd.com/document/442945845/ibm-q-end-user-agreement-1-pdf)). IBM calls the plan "getting started" ([IBM blog](https://www.ibm.com/quantum/blog/open-plan-updates)). | Free demo pool only, until the EULA is read or IBM confirms in writing. Paid IBM-attested runs on Pay-As-You-Go with C10. |
| L8 | ANU | Paid keys and an AWS listing suggest commercial use is intended; EULA not read | Paid key. Read the AWS EULA's redistribution clause. Email ANU to confirm you may serve mixed output to customers. |
| L9 | LfD | No terms found | Off for paid tiers until the operator gives permission |

**D3. Export control.** Probably low burden, but **not verified**. The app generates secrets and uses HKDF and TLS. It does not encrypt user data, so it may fall outside Cat. 5 Part 2. Conservative fallback: self-classify as mass market 5D992.c under §740.17(b)(1) ([BIS](https://www.bis.gov/learn-support/encryption-controls/encryption-items-not-subject-to-ear), [15 CFR 740.17](https://www.law.cornell.edu/cfr/text/15/740.17)). Geo-block sanctioned jurisdictions.

**D4. GDPR**
- Lawful basis: contract for accounts and billing; legitimate interest for security logs (*Breyer*, C-582/14) ([Bird & Bird](https://twobirds.com/en/insights/2016/global/cjeu-decision-on-dynamic-ip-addresses-touches-fundamental-dp-law-questions)).
- Retention defaults: IP and rate-limit logs 30 days; usage metadata 13 months, then aggregated; assistant transcripts 30 days (none for Free users); purge within 30 days of account deletion.
- Breach notification within 72 h (Art. 33) ([GDPR](https://eur-lex.europa.eu/eli/reg/2016/679/oj)).
- Publish a sub-processor list: Clerk, Anthropic, Stripe, the host, ANU, IBM.
- Draw entrant lists are personal data. Store only the hash plus the winner records. Delete uploaded CSVs after 30 days.

**D5. Your Terms of Service must include:**
- no warranty of security
- quantum sourcing is best effort and labelled per result
- no real-money gambling
- no reselling below the API tier
- right to suspend for abuse
- liability capped at 12 months of fees
- the assistant is informational, not security advice

**D6. Billing and tax.** Use **Stripe directly** (Checkout, Customer Portal, Meters API with usage events included up to 100M/mo, and Stripe Tax). Keep Clerk for auth only. Clerk Billing is Beta, has no tax/VAT support, no 3DS and no documented metering ([Clerk docs](https://clerk.com/docs/billing/overview)). If handling VAT yourself is too much, use Paddle as merchant of record at about 5% + $0.50 and push annual plans. Stripe Tax's fee and your own country's tax obligations are **unknown**.

---

## 8. 90-day go-to-market plan and engineering backlog

### 8.1 Week by week

All targets are **[Assumption]**: goals to measure against, not forecasts.

| Week | Product | Go-to-market | Exit milestone |
|---|---|---|---|
| 1 | Backlog items 1–4 (cost guardrails, pricing-table fix, IBM off for paid, kill flags) | Email IBM (EULA clarification), ANU (resale), LfD (permission). Landing page "Verifiable giveaways with quantum receipts" with waitlist and a price-test toggle ($9 / $12 / $19). | Haiku default live; three supplier emails sent |
| 2 | Item 5 (ANU batch prefetch); item 6 (Redis limits) | Book 15 interviews: 8 P1 (streamers, Discord admins, esports), 5 P2 (indie or web3 studios), 2 P3. Post in r/discordapp-style communities and indie-game Discords (follow each community's rules). | ≥8 interviews done |
| 3 | Item 7 (Ed25519 receipts + `/.well-known` key + verify page) | Publish an "How to prove your giveaway was fair" explainer showing a live receipt | Public verify page works |
| 4 | Item 8 (draw engine: CSV upload, commit-reveal, winner selection, verify link) | Interviews complete. **Go/no-go 1:** ≥100 waitlist signups and ≥5 interviewees say they'd pay at least $9/mo. Otherwise pivot to P3 API-first. | Decision recorded |
| 5 | Items 9–10 (Stripe Checkout + webhooks + `plan` field; plan-aware limits) | Write ToS, privacy policy and sub-processor list (§7.4) | Test-mode payments work |
| 6 | Item 11 (one-off certificates $4.99 / $19); legal pages live | **Soft launch** to the waitlist. 3 free Creator months for the first 20 draw hosts in exchange for a testimonial. | First paid certificate |
| 7 | Item 12 (Discord bot: `/draw`, posts the verify link) | List on Discord bot directories. DM 30 mid-size streamers or community managers. | 50 draws run by external users |
| 8 | Item 13 (embeddable fairness badge + branded verify page) | "Show HN" and Product Hunt launch, honest framing (no quantum hype) | **10 paying customers** (any SKU) |
| 9 | Items 14–15 (API keys, Developer/Scale plans, Stripe Meters) | API docs, a quickstart and a free academic tier announcement to 10 quantum-computing lecturers | API in beta |
| 10 | Item 16 (strict quantum mode, bulk CSV) | Outreach to 20 dev-tool founders (P3). One case study from a P1 customer. | 2 API sign-ups on a paid plan |
| 11 | Item 17 (IBM-attested SKU), **only if** L7 is cleared or a Pay-As-You-Go cost limit is set | Content: monthly public "entropy transparency report" (source mix, health-test stats) | — |
| 12 | Hardening: S3–S5, alert tuning, restore test | Review funnel: visit → signup → draw → paid | — |
| 13 | Retrospective | **Go/no-go 2:** **≥$300 MRR or ≥25 paying customers**, and gross margin ≥75% → continue and plan Studio and team features. Otherwise, freeze it as a portfolio project, keep the free tier with caps, and stop paid spend. | Decision recorded |

### 8.2 Engineering backlog: changes needed to charge money, in order

1. **Assistant cost defaults** (`backend/app/config.py`): `assistant_model="claude-haiku-5-5"`, `assistant_max_tokens=1024`, `max_tool_iterations=3`. Input limited to 2,000 characters. History trimmed.
2. **Pricing table** (`backend/app/assistant/agent.py`): check the 5.5 cache-read prices on the docs. Per the guardrails source, set Sonnet 5.5 cache read to $0.10 and keep Opus at $0.20. Add a per-user dollar ledger (C4) and a monthly global cap (C5).
3. **Supplier gating:** source eligibility depends on plan. IBM and LfD are excluded from paid-tier provenance until L7 and L9 are cleared. Receipts list only eligible sources.
4. **Runtime kill flags** (C14), read from the DB every 60 s.
5. **ANU batch prefetch** (`backend/app/entropy/anu.py`, `service.py`): refill the pool with 1,024-byte requests. Remove per-request live fetches. Add a monthly request cap counter.
6. **Redis-backed slowapi** keyed by API key, then user, then IP. Daily byte quotas. Body-size limits (B5, B6, B8).
7. **Ed25519 receipts** using the `cryptography` library: canonical JSON, the `/.well-known/qpg-provenance.pub` endpoint, and a public `/verify/{id}` page. Receipts are stored without secrets. Unit test that no secret or secret hash appears in a receipt.
8. **Draw engine:** CSV upload (store hash only, delete the file after 30 days), commit (publish the entrants hash and seed commitment), reveal (seed from the pool, selection via HKDF), signed result, and verify-page rendering.
9. **Billing:** add `plan`, `stripe_customer_id` and `plan_renews_at` to User. Stripe Checkout and Customer Portal. A webhook handler (`checkout.session.completed`, `customer.subscription.*`, `invoice.payment_failed`) that writes the plan to the DB and mirrors it into Clerk `publicMetadata`.
10. **Plan-aware limits:** one `PLAN_LIMITS` dict drives rate limits, draw quotas, assistant model and budget, and batch size.
11. **One-off payments:** Stripe Checkout in payment mode for draw certificates, plus a PDF certificate export.
12. **Discord bot** (a separate small service calling the draw API with a scoped key).
13. **Badge and branding:** embeddable JS/SVG badge, custom logo and colour on the verify page (Creator and above).
14. **API keys table:** SHA-256 hash, visible prefix, scopes, `last_used_ip`, auto-revoke rule (B4). Key management UI.
15. **Usage metering:** batch Stripe meter events for overage (quantum-direct MB, IBM-attested KB, requests).
16. **Strict quantum mode** (a `strict_quantum` flag; fails with HTTP 503 when no eligible quantum entropy is available) and bulk CSV generation as an async job.
17. **IBM Pay-As-You-Go instance** with a $50/mo cost limit. Per-job `usage()` logging. IBM-attested SKU limited to the measured supply.
18. **Compliance and hardening:** no-secret-logging CI test (S1), Sentry scrubber, build attestations (S3), Dependabot / pip-audit / gitleaks (S4), `allowed_hosts` and `allowed_origins` locked down (S7), data-retention jobs (D4).

**Out of scope:** team vaults or any secret storage, a browser extension (treat it as a funnel only, later), Enterprise SLA, FIPS/ESV.

---

## 9. Risks and open questions

### 9.1 Risks

| Risk | Likelihood / impact | Mitigation |
|---|---|---|
| IBM Open Plan forbids commercial use | High / High | Paid tiers launch without IBM. Pay-As-You-Go with a $50 cap for the attested SKU. |
| ANU's price has changed, the paid key fails, or the service goes away | Medium / Medium | Batching, a monthly cap, and CSPRNG mixing so the service still runs. Evaluate Qrypt or other paid sources. Price quantum-direct with margin to spare. |
| Weak demand (cf. Quantum eMotion's revenue) | High / High | Two go/no-go gates (weeks 4 and 13). Build only after interviews. |
| random.org adds quantum or matches features | Low–Medium / Medium | Compete on receipt user experience, the Discord bot and the badge, not on bits |
| A draw is used for regulated gambling | Medium / High | ToS ban, checkbox, geo-blocking, no GLI claims, legal review |
| Signing key compromise invalidates receipts | Low / High | Secret manager, rotation, published key history, revocation notice |
| FTC or consumer claims risk | Low if §7.4 is followed / High | Copy review against the D2 table before every launch |
| AI cost blow-up | Low after backlog items 1–2 / Medium | Dollar ledgers, kill switch, Anthropic workspace limit |
| Solo-operator bandwidth and support | High / Medium | No SLA below Enterprise. Self-serve docs. Async support only. |
| VAT or sales-tax non-compliance | Medium / Medium | Stripe Tax or Paddle as merchant of record. Confirm obligations in the owner's country. |

### 9.2 Open questions

1. Does the current IBM End User Agreement (June 2025) allow commercial use or redistribution of Open Plan output?
2. What are ANU's current pricing and EULA, and is resale of mixed output allowed? (Only a 2021–22 AWS listing was found. A "$3/mo unlimited" licence is mentioned but unverified.) Contact: qrng@anu.edu.au.
3. What are LfD's terms of use?
4. How many QPU-seconds does one 127q × 2048-shot job actually use? Run `job.usage()`; current estimates are 2.7–4 s.
5. Is the IBM Pay-As-You-Go rate of $96/min confirmed, and is there a per-job minimum charge?
6. Are the Claude 5.5 cache-read multipliers 0.05× (guardrails section) or 0.1× (cost-model section)? Confirm before fixing `agent.py`.
7. Clerk: is the free allowance 50k retained users or 10k MAU? Which plan includes disposable-email blocking? What does Organizations cost?
8. What does Stripe Tax cost, and what tax obligations apply in the owner's country of residence?
9. Which jurisdictions treat free or paid giveaways as gambling that requires a certified RNG?
10. What is the right export classification: outside Cat. 5 Part 2, or 5D992.c?
11. What are the NIST ESV cost-recovery fee and typical lab quotes? Needed only if certification is pursued later.
12. Will people pay for P1, P2 and P6 at all? The $12, $49, $19 and $99 price points are unvalidated.
13. What are random.org's non-gambling commercial licence tiers? Only search summaries were seen.
14. Are the usage assumptions right (30 generations/MAU, 20% assistant adoption, 2–3% paid conversion)? They are guesses.

---

## 10. Sources

**Market, competitors, incidents**
- https://api.random.org/pricing · https://api.random.org/billing · https://api.random.org/features · https://www.random.org/quota/
- https://www.networkworld.com/article/817265/software-randomness-and-random-org.html
- https://aws.amazon.com/marketplace/pp/B09SFWPDRJ · https://aws.amazon.com/marketplace/pp/prodview-246kyrfjo3bag · https://aws.amazon.com/marketplace/reviews/reviews-list/B09SFWPDRJ
- https://www.innovationaus.com/anu-sells-quantum-random-numbers-through-aws/ · https://www.startupdaily.net/?p=102055 · https://corestage-cdn.startupdaily.net/?p=102055 · https://pypi.org/project/quantum-random/1.2.2/
- https://www.cisco.com/c/dam/en_us/about/doing_business/legal/OfferDescriptions/Outshift-QRNG-Offer-Description.pdf · https://outshift.cisco.com/quantum-random-number-generator
- https://learn.quantumcomputinginc.com/learn/tutorials-and-use-cases/qrng-api-quickstart-guide
- https://www.hpcwire.com/2021/12/07/quantinuum-debuts-quantum-based-cryptographic-key-service-is-this-quantum-advantage/ · https://www.quantinuum.com/press-releases/quantinuums-quantum-origin-becomes-first-software-quantum-random-number-generator-to-achieve-nist-validation · https://www.carahsoft.com/quantinuum/solutions · https://Quantinuum.com/cybersecurity/usecases · https://www.quantinuum.com/news/keyfactor-and-quantinuum-announce-integration-to-future-proof-digital-certificates
- https://www.idquantique.com/random-number-generation/how-to-buy/ · https://thequantuminsider.com/2024/09/02/sk-telecom-partners-with-id-quantique-for-samsung-galaxy-quantum-5/
- https://docs.qrypt.com/eaas · https://docs.qrypt.com/eaas/appliance/ · https://www.qrypt.com/s/EaaS-Data-Sheet.pdf · https://www.carahsoft.com/resources/29618-qstream · https://docs.keyfactor.com/ejbca/latest/crypto4a-qxhsm · https://www.quantropi.com/wp-content/uploads/2025/06/QEaaS.pdf
- https://quantumcomputingreport.com/quantum-emotion-reports-q1-2026-financial-results-entry-into-early-commercialization-and-strategic-u-s-cybersecurity-acquisition/
- https://docs.chain.link/vrf/v2-5/billing.md
- https://tech-insider.org/proton-pass-vs-bitwarden-vs-1password-2026/ · https://toolradar.com/blog/best-password-managers-2026 · https://toolradar.com/tools/bitwarden/pricing · https://password-manager.cybernews.com/1password-review/1password-pricing/ · https://subger.com/en/gb/service/1password-nordic
- https://market.us/report/quantum-random-number-generator-market/ · https://www.nasdaq.com/press-release/quantum-emotion-makes-major-advances-in-creating-its-first-generation-quantum-random · https://www.giiresearch.com/report/moi2117994-quantum-random-number-generation-software-market.html · https://prnewswire.co.uk/news-releases/true-random-number-generator-trng-market-worth-7-71-billion-by-2030---exclusive-report-by-marketsandmarkets-302405661.html · https://www.marketsandmarkets.com/Market-Reports/quantum-random-number-generator-market-208446014.html
- https://csrc.nist.gov/Projects/cryptographic-module-validation-program/entropy-validations · https://csrc.nist.gov/Projects/cryptographic-module-validation-program/nist-cost-recovery-fees
- https://www.safelogic.com/blog/cnsa-2.0-and-the-2027-inflection-point · https://postquantum.com/quantum-policy/nsa-cnsa-2-0-pqc/ · https://agbrief.com/news/01/02/2021/gli-guaranteeing-randomness/
- https://nobsbitcoin.com/milk-sad-vulnerability-disclosure · https://www.opencve.io/cve/CVE-2023-39910 · https://www.theblock.co/news/defi/2022-09-20-experts-blame-a-vanity-address-bug-for-wintermutes-160-million-hack-171192 · https://support.safeheron.com/blog/insights/safeheron-originals/a-deep-dive-of-how-profanity-caused-wintermute-to-lose-usd160m

**IBM Quantum**
- https://www.ibm.com/quantum/pricing · https://www.ibm.com/quantum/products · https://www.ibm.com/quantum/blog/open-plan-updates
- https://quantum.cloud.ibm.com/docs/en/guides/plans-overview · https://quantum.cloud.ibm.com/docs/guides/plans-overview · https://eu-de.quantum.cloud.ibm.com/docs/en/guides/plans-overview · https://eu-de.quantum.cloud.ibm.com/docs/guides/instances
- https://quantum.cloud.ibm.com/docs/en/guides/estimate-job-run-time · https://docs.quantum.ibm.com/run/estimate-job-run-time · https://quantum.cloud.ibm.com/docs/en/guides/manage-cost.md
- https://quantum.ibm.com/terms · https://www.scribd.com/document/442945845/ibm-q-end-user-agreement-1-pdf · https://quantum.cloud.ibm.com/announcements/product-updates/2023-08-26-upcoming-updates-to-open-plan-access-and-terms
- https://www.publish0x.com/veritya-daily/ibm-quantum-pay-as-you-go-pricing-how-runtime-seconds-affect-xjyleop

**Infrastructure, AI, billing**
- https://platform.claude.com/docs/en/build-with-claude/prompt-caching · https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching · https://platform.claude.com/docs/en/api/rate-limits.md
- https://clerk.com/pricing · https://clerk.com/billing · https://clerk.com/articles/clerk-pricing-explained · https://clerk.com/articles/clerk-pricing-explained.md · https://workos.com/blog/clerk-pricing · https://clerk.com/docs/billing/overview · https://clerk.com/docs/nextjs/guides/billing/for-b2c · https://clerk.com/docs/security/bot-protection · https://clerk.com/docs/authentication/allowlist · https://clerk.com/docs/reference/backend/instance/update-restrictions.md
- https://render.com/pricing · https://render-web.onrender.com/pricing · https://jwatte.com/blog/render-com-platform-review.md · https://fly.io/docs/about/pricing/ · https://fly.io/docs/mpg · https://neon.com/pricing · https://costbench.com/software/database-as-service/railway-postgres/free-plan/
- https://domainoffer.net/tld/com/cloudflare · https://www.whtop.com/plans/cloudflare.com/135912 · https://resend.com/blog/new-free-tier.md · https://www.resend.com/pricing.md · https://automationatlas.io/answers/resend-pricing-explained-2026/
- https://stripe.com/en-us/billing/pricing · https://www.nerdwallet.com/business/software/learn/stripe-fees · https://checkoutpage.com/blog/stripe-processing-fees · https://resources.rework.com/tools/billing-revenue/paddle-vs-lemon-squeezy · https://9to5google.com/2020/03/12/chrome-web-store-fee/

**Security, legal, claims**
- https://www.f5.com/resources/infographic/owasp-llm-top10 · https://coralogix.com/ai-blog/owasp-top-10-for-llm-applications/
- https://github.com/MachineNativeOps/attest-build-provenance · https://www.npmjs.com/package/@actions/attest
- https://www.ftc.gov/sites/default/files/attachments/training-materials/policy_substantiation.pdf · https://www.ftc.gov/node/52431 · https://www.ifrahlaw.com/ftc-beat/ftc-enforcement-reminds-companies-to-live-up-their-promises/
- https://www.ncsc.gov.uk/whitepaper/quantum-networking-technologies · https://blog.ipspace.net/kb/QuantumCrypto/040-hype/ · https://postquantum.com/post-quantum/qrng-buyers-guide/ · https://www.encryptionconsulting.com/nist-pqc-standards-fips-203-204-205/
- https://media.bis.gov/learn-support/encryption/decontrol · https://www.gov.uk/government/publications/notice-to-exporters-201803-updates-to-controls-on-information-security-products-using-cryptography/notice-to-exporters-201803-updates-to-controls-on-information-security-products-using-cryptography · https://www.bis.gov/learn-support/encryption-controls/encryption-items-not-subject-to-ear · https://www.thompsonhine.com/publications/bis-eliminates-most-mass-market-encryption-reporting-obligations · https://www.law.cornell.edu/cfr/text/15/740.17
- https://twobirds.com/en/insights/2016/global/cjeu-decision-on-dynamic-ip-addresses-touches-fundamental-dp-law-questions · https://vlex.com/vid/ecj-confirms-dynamic-ip-652611773 · https://www.matheson.com/insights/detail/edpb-publishes-draft-guidelines-on-legitimate-interests · https://eur-lex.europa.eu/eli/reg/2016/679/oj

**Internal (code reviewed by the research sections):** `backend/app/config.py`, `backend/app/assistant/agent.py`, `backend/app/entropy/{service,ibm,mixer,anu,lfd}.py` on branch `v2`.

---

## Appendix: independent review notes

A second agent re-checked prices, arithmetic and claims. Items it flagged are listed here with its suggested fix; numbers marked below should be treated as unverified until re-checked.

| Severity | Claim | Problem | Suggested fix |
|---|---|---|---|
| high | §4 lists random.org as the main competitor but only for its API ($30/mo gambling tier). §5.1 prices a one-off draw certificate at $4.99 for up to 10k entrants and $19 above that, and gives Free users 3 signed draws a month. | The plan leaves out random.org's Third-Party Draw Service, which is the closest competitor to this product. It already sells public, auditable draws. Its live calculator (page footer dated 2024) charges $4.95 for up to 500 entries, $8.95 for 1k, $54.95 for 10k and $249.95 for 100k (https://random.org/draws/pricing). RandomPicker charges $49 for a single draw of up to 1k entries and $129–$499 a year for plans (https://www.randompicker.com/pricing/). So this plan's Free tier hands out what random.org sells for $4.95 a draw, and its $4.99 certificate undercuts random.org's 10k-entry price about 11 times against a 20-year-old brand. That signals low quality, not a bargain. Free Discord giveaway bots and Wheel of Names are also missing, and they set what P1 buyers expect to pay. | Add random.org Draws, RandomPicker and the free Discord giveaway bots to §4. Re-price certificates on an entrant-count scale near random.org's (for example $4.99 up to 500, $9.99 up to 1k, $39 up to 10k, $149 up to 100k). Cut Free to 1 draw a month with up to 100 entrants and a watermark. Re-test whether Creator at $12 is too cheap. |
| high | §2 and the positioning statement say "Quantum" is a provenance fact you can verify and that the receipt is one anyone can verify, listing the IBM job ID, ANU plus timestamp, and the health-test status. | An Ed25519 signature proves only that the operator's server signed the statement. It does not prove that the bytes came from IBM or ANU, that the health tests ran, or that the operator did not choose or re-roll the seed. A third party cannot look up an IBM job ID or replay an ANU call. With commit-reveal on a seed the server holds, the operator can still grind seeds before committing, or collude with the host. Calling this verifiable is the same kind of unsubstantiated claim §7.4 warns about under the FTC's reasonable-basis standard. It also undercuts the core value proposition, because the buyer is trusting the operator just as they would with random.org. | Narrow the wording to "signed by us, tamper-evident after publication". For draws the operator cannot rig, derive the winner from a public beacon round fixed in advance after entries close, such as drand/League of Entropy (free, publicly verifiable: https://drand.love) or the NIST beacon, hashed together with the entrant list. A verifier can then recompute the winner without trusting you. Keep quantum entropy as a secondary label that is explicitly vouched for by the operator, not verifiable. |
| high | §8 says the validation gate comes before building past the receipt and verify page. §8.1 still builds the draw engine in week 4, before go/no-go 1 at the end of week 4. It also schedules 18 backlog items, 15 interviews, legal pages, a Discord bot, HN and Product Hunt launches and an API beta for one solo developer in 13 weeks, with 10 paying customers by week 8. | The plan contradicts its own gate. The timeline is also not credible for one person who presumably has other commitments. The plan never states hours available per week. Week 8 sets a 10-customer target only 2 weeks after the soft launch. | Move the draw engine after go/no-go 1, or do a manual concierge draw for the first users. State weekly hours. Cut the scope to receipts, verify page, draw engine, Stripe and certificates. Push the assistant, API tiers, IBM-attested, badge and strict mode beyond day 90. Move the 10-paying target to week 12–13. |
| medium | §6.3 and the executive summary say ANU batched costs $46.88 at 5k MAU and $468.75 at 50k MAU (one request per 16 generations). C12 sets an ANU hard cap of 2,000 requests a month ($10). | These figures contradict each other. 2,000 requests × 1,024 B is about 2 MB a month, or about 32k 64-byte seeds. The 5k-MAU scenario needs about 9.4k requests and the 50k scenario about 94k. The cap also cannot cover the API plans' included quantum-direct volume: Developer's 0.5 MB is about 512 requests each, and Scale's 5 MB is about 5,120 requests, which is more than the whole cap from one customer. The model also assumes every generation needs fresh ANU bytes. With CSPRNG mixing, free-tier generations don't need fresh ANU bytes at all. Charging that cost to every generation inflates cost, while the cap makes the quantum labels false at scale. | Choose one model. Either free and anonymous generations draw on a small pool that is refilled under the cap and is labelled "Not quantum" when empty, or ANU spend scales with paid quantum-direct volume. Model ANU cost per paid MB, not per MAU. Make C12's cap a formula tied to the quantum-direct MB sold. |
| medium | §5.2 says quantum-direct at $25/MB is 5–10× ANU's raw cost of about $2.4–4.9/MB, and "every byte is backed by conditioned QRNG bytes". | Raw ANU cost is $2.56–5.12/MiB (1,024 requests × $0.005 for uint8, or half that for uint16). If ANU bytes go through the same 4:1 conditioning used for IBM, cost becomes about $10–20/MB, and the margin on the $25 price falls to roughly 0–60%. The Scale-tier cost of $25 for 5 MB assumes no conditioning. The ANU price also comes from a 2022 AWS listing with a no-refund policy and a review reporting a broken key (https://aws.amazon.com/marketplace/pp/B09SFWPDRJ). | State the conditioning ratio for ANU. Recompute quantum-direct and Scale costs with it. Buy a paid key and test it end to end before advertising quantum-direct. |
| medium | §6.4 says Creator's cost at full caps is $3.28 with AI at $1.80, and Studio's is $12.53 with AI at $4.50. The margins at caps are 73% and 74%. | "At caps" is calculated with typical per-message costs: 1,000 Haiku × $0.0009 plus 50 Sonnet × $0.018 gives $1.80. Using §6.2's worst case with the recommended caps, Creator's entitlement costs about $4 + $4.50 = $8.50, which would put margin near 10%. Only the C4 dollar ledger ($3/mo Creator, $8/mo Studio) actually limits it. The ledger will also cut heavy users off before the advertised "1,000 Haiku + 50 Sonnet", which is a mismatch with what is advertised. | Recompute cost at caps using the C4 ledger ceilings ($3 and $8). Advertise the assistant as "included with fair use" rather than as a message count, or make the counts match the ledger. |
| medium | The executive summary, §6.2 and C3/C4 describe the code as shipping max_tool_iterations 6, 4,000 output tokens and 50 messages a day on Opus, costing about $33 per user per day. They give a worst case of $0.67 per message. | The code on branch v2 has moved on. backend/app/config.py now sets assistant_max_tool_iterations=3, assistant_max_tokens=1500, assistant_user_daily_budget_usd=0.50 and assistant_monthly_budget_usd=150. So the "as shipped" worst cases and the $33/day figure are stale. Two problems are still real. The default is still assistant_model="claude-opus-5-5". agent.py line 50 still prices Sonnet 5.5 cache reads at $0.20 when it should be $0.10. Third-party mirrors of Anthropic's pricing list Opus 5.5 cache reads at $0.20 (0.05×) and Haiku 5.5 at $0.01 (0.1×), which settles open question 6 in favour of the guardrails section. allowed_hosts is still ["*"]. | Update §1, §6.2 and §7.1 to match the current code. Backlog items 1 and 2 shrink to: switching the default to Haiku, fixing the Sonnet cache-read price, adding plan-based ledgers, and locking down allowed_hosts. |
| medium | The year-1 illustration is 30 Creators ($330) + 3 Studios + 10 Developer + 2 Scale + 30 certificates ($150), giving about $1,000 MRR. Revenue B models 2% paying at a $15 ARPU across 50k MAU, giving $15,000/mo. | 30 × $12 is $360, not $330. The $330 implies an $11 blend that is never explained. One-off certificates are not recurring revenue, so counting them as MRR inflates it. The 50k-MAU and $15k scenarios have no acquisition plan behind them. Distribution amounts to DMs, a Show HN post and bot directories. The plan uses Quantum eMotion's CAD 10.6k of quarterly revenue to argue that demand is weak, then shows revenue lines that are 1,000 times larger. On the developer side, P3 has free alternatives: ANU direct, Cisco, QCI, drand, and the OS CSPRNG. Ten paying Developer customers in year 1 is a guess with nothing behind it. | Report recurring MRR and one-off revenue separately. Fix the arithmetic. Drop the 50k-MAU revenue line or label it clearly as a hypothetical. Base the year-1 scenario on funnel numbers from the weeks 1–4 landing-page test. |
| medium | §3.3 says the P1/P2 beachhead has proven willingness to pay for signed randomness (random.org). | random.org's paying customers are mostly regulated or virtual-item gambling buyers who need a licence, and organisations that need an independent third party. Neither group is served here, because gambling is excluded and the operator is a solo founder, not an independent body. Streamers mostly use free bots. That random.org has paying customers does not show that P1 creators will pay a new, unknown brand. | Change "proven" to "adjacent evidence". Make the week-4 gate test real pre-orders or deposits, not stated intent to pay $9. |
| low | §6.1 gives IBM Flex at $72/min with a 400-minute minimum ($28,800/yr) and Pay-As-You-Go at $96/min. | Search snippets of IBM's pricing page give the same rates. Pay-As-You-Go is billed per second with a 1-second minimum, which answers open question 5. Flex needs a contract, and an older analysis cites a $30k minimum commitment. Minutes must be used within a year. One unchecked point: Open Plan is described as 10 minutes "per month" on the pricing page and "per 28 days" in the docs. Use the 28-day figure, as the plan already does. | Mark Pay-As-You-Go as confirmed with a 1-second minimum. Add the contract and expiry terms to the Enterprise pass-through note. |
| low | §7.4 D6 says Clerk Billing is Beta, with no tax/VAT, no 3DS and no metering. §6.1 says Clerk is free up to 50k monthly retained users since February 2026, with Pro at $25/mo. | Clerk's own guide confirms the 50k MRU figure from the February 5, 2026 change, Pro at $25/mo ($20 billed annually), about $0.02 per MRU over the allowance, and Business at $300/mo (https://clerk.com/articles/clerk-pricing-explained). I could not confirm Clerk Billing's current Beta or GA status. An aggregator lists a 0.7% fee on top of Stripe. The decision to use Stripe directly does not depend on this. It is also unclear whether MFA and disposable-email blocking need Pro, so Clerk Pro from day 1 may be an unnecessary $25/mo at 100 MAU, which is 60% of total cost. | Keep Stripe direct. Confirm which Clerk features actually need Pro, and defer Pro until the first paying customer if none do. |
| low | The certificate price of $4.99 through Stripe Checkout has a margin of 90%. | Low-price, one-off card checkouts without login are a common target for card testing, which brings disputes at $15 each and puts the Stripe account at risk. Chargebacks from draw hosts or entrants unhappy with the result are not modelled. | Require a signed-in, verified account to buy. Turn on Stripe Radar rules. Budget for a dispute rate. Consider a credit-pack minimum (for example $10). |
| low | The AI assistant is included in every tier as a differentiator ("an AI assistant that explains the result"). | It is the largest variable cost and abuse surface (C1–C8, B7), a GDPR sub-processor, and a source of claims risk. Nothing shows that draw hosts want it. For a solo founder it pulls scope away from the receipt and draw core. | Turn off the assistant for v1 using ASSISTANT_ENABLED. Bring it back only if interviews ask for it. |

**Missing from the plan, per the reviewer:**

- The owner and the codebase may not match. The plan names Mujtaba Hashimi as the owner, but the git remote is github.com/ahmadhashimi/quantum-password-generator. Before charging, settle who owns the IP and who has signing authority, and check the repo licence. Contributor terms are needed if anyone else has committed.
- There is no legal entity, country of residence or business banking plan. Stripe is not available in every country. Confirm the country first, because it decides Stripe vs Paddle, VAT/GST registration and sweepstakes exposure. The plan treats the country as unknown in several places.
- There is no liability or E&O/cyber insurance, even though the product decides prize winners. A wrong or failed draw during a live stream is a realistic claim.
- There is no operational plan for live-draw reliability: what happens when the service is down mid-stream, status page, on-call. Even without an SLA, P1 buyers depend on the service at a specific moment.
- There is no continuity plan for the receipt signing key. Receipts must keep verifying if the founder stops the project. Publish the key history and a static verifier that doesn't need the service, and say so in the ToS.
- Market sizing is missing. The plan cites QRNG and TRNG market reports in §10 but gives no figure, and it gives no bottom-up count of reachable P1/P2 buyers (for example, how many Discord servers or streamers run paid-prize giveaways a month). Add a bottom-up estimate. Ignore top-down QRNG market figures, which don't apply to this segment.
- Platform rules for distribution are missing. The Discord bot needs verification beyond 100 servers. Twitch, Instagram and YouTube have their own giveaway and promotion rules, and US sweepstakes law requires no purchase necessary and has registration and bonding rules in NY/FL for large prizes. Hosts will ask about these.
- Free public randomness beacons (drand/League of Entropy, the NIST Randomness Beacon) are not in the competitor list. They are free, verifiable alternatives, and they are also an opportunity to build on.
- Customer acquisition cost and channel economics are missing. There is no estimate of conversion from DMs and launches, and no budget for paid acquisition.
- The founder's time and opportunity cost, plus a kill criterion for personal spend (total cash at risk across the 90 days), are missing.
- Entrant-side verification is missing. With only the hash of the entrant list stored, entrants cannot check that they were included. Consider publishing a Merkle root plus per-entrant inclusion proofs. A list of emails hashed together is low-entropy and may be guessable, which raises a GDPR point.
