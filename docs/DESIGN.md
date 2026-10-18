# Design system

The web app (`web/`) uses one small, token-based design system. Components use semantic tokens, never raw palette
colours, so light and dark themes stay consistent and accessible.

## Principles

1. **Evidence first.** Every result shows what is proven (signatures), what is asserted (provenance) and what is
   not available (independent quantum evidence). Never merge them into one "verified" badge.
2. **Honest by default.** No "certified", "unhackable", "quantum-safe" or "proves origin". Simulator output says
   "not quantum". An unavailable provider is never shown as contributing.
3. **Calm, technical, precise.** Dark-first, generous spacing, monospace for identifiers, one accent gradient
   (cyan to violet) used sparingly for primary actions and brand moments.
4. **Accessible.** WCAG AA contrast in both themes, visible focus rings, keyboard-operable controls, reduced motion
   respected, no information carried by colour alone.

## Tokens (`web/app/globals.css`)

Tokens are CSS variables redefined under `.dark` and mapped to Tailwind with `@theme inline`:

| Role | Tailwind classes | Use |
|---|---|---|
| Background | `bg-bg`, `bg-bg-subtle` | page, hover fills |
| Surfaces | `bg-surface`, `bg-surface-raised`, `bg-surface-sunken` | cards, popovers and inputs, code and secret wells |
| Borders | `border-border`, `border-border-strong` | dividers, control outlines |
| Text | `text-fg`, `text-muted`, `text-subtle` | body, secondary, tertiary and labels |
| Accent | `text-accent`, `bg-accent-soft`, `text-accent-2`, `bg-accent-2-soft` | links, highlights, receipts (violet) |
| Status | `success`, `warning`, `danger`, `info` (+ `-soft`) | verdicts, provider states, alerts |
| Brand | `bg-brand`, `text-gradient`, `bg-aurora`, `bg-grid` | primary buttons, hero headings and backdrops |
| Radius | `rounded-sm/md/lg/xl` (0.5–1.25 rem) | controls `md`, cards `xl` |
| Shadow | `shadow-card`, `shadow-pop` | cards, overlays |
| Type | `font-sans` (Inter Variable), `font-mono` (JetBrains Mono Variable) | self-hosted via @fontsource |

## Components (`web/components/ui`)

| Component | Notes |
|---|---|
| `Button`, `ButtonLink`, `buttonClass()` | variants `primary` (brand gradient), `secondary`, `ghost`, `danger`; sizes `sm`, `md`, `lg`, `icon`. `ButtonLink` defaults to `prefetch={false}` |
| `Card`, `CardHeader`, `CardBody` | `CardHeader` takes `icon`, `title`, `description`, `action` |
| `Badge`, `StatusDot` | tones `neutral`, `accent`, `violet`, `success`, `warning`, `danger`, `info` |
| `Callout` | tones `info`, `success`, `warning`, `danger`, `neutral` (dashed: "not checked by us") |
| `Field`, `Input`, `Textarea` | `Field` wires label, hint and error ids for screen readers |
| `Toggle`, `Tabs` | switch with `role="switch"`; segmented control with arrow-key navigation |
| `Stat`, `Meter`, `Table`/`Th`/`Td`, `CodeBlock`, `Kbd`, `Skeleton` | data display |
| `PageHeader`, `Section` | page layout: eyebrow, title, description, actions; max-width container |

Domain components live next to their feature: `components/secrets` (SecretDisplay, EntropyMeter),
`components/receipts` (ProvenanceBadge, ReceiptCard), `components/proof`, `components/draws`,
`components/status`, `components/dashboard`, `components/admin`, `components/marketing`.

## Rules for secrets in the UI

- Generate secrets only in Client Components, through `lib/api/client.ts` (`cache: "no-store"`, same-origin).
- Keep them in component state only. Never in URLs, `localStorage`, analytics, logs, server-rendered HTML or RSC
  props.
- Display with `SecretDisplay`: masked toggle, copy with a 30 s clipboard clear, and no live region (screen readers
  would read the secret aloud).
- Never use a secret as a React `key`.
- Links to `/generate`, `/verify`, `/draws`, `/dashboard` and `/admin` use `prefetch={false}`.
- Receipts are saved and verified from their exact received text (`losslessField`, `stringifyLossless`), so numbers
  such as `128.0` survive.

## Accessibility checklist

- Every interactive element is reachable and operable by keyboard; focus is visible (`outline-ring`).
- Form controls have labels (`Field`); errors use `role="alert"`.
- Status changes use `role="status"`; icons are `aria-hidden` when decorative.
- Colour is never the only signal: verdicts pair icon, text and colour.
- Motion is subtle and disabled under `prefers-reduced-motion`.
