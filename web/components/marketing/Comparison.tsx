import { Check, CircleDot, Minus, X } from "lucide-react";
import type { ReactNode } from "react";

import { Td } from "@/components/ui";
import { cn } from "@/lib/cn";

import { Block } from "./Block";

type Mark = "yes" | "partial" | "no" | "na";

interface Cell {
  mark: Mark;
  text: string;
}

const MARKS: Record<Mark, { icon: ReactNode; label: string }> = {
  yes: { icon: <Check className="text-success" />, label: "Yes" },
  partial: { icon: <CircleDot className="text-warning" />, label: "Partly" },
  no: { icon: <X className="text-subtle" />, label: "No" },
  na: { icon: <Minus className="text-subtle" />, label: "Not stated or not applicable" },
};

const y = (text: string): Cell => ({ mark: "yes", text });
const p = (text: string): Cell => ({ mark: "partial", text });
const n = (text: string): Cell => ({ mark: "no", text });
const na = (text: string): Cell => ({ mark: "na", text });

const COLUMNS = ["QuantumPass", "Typical password generator", "Public QRNG API", "random.org draws"] as const;

const ROWS: { feature: string; cells: [Cell, Cell, Cell, Cell] }[] = [
  {
    feature: "Quantum hardware in the entropy path",
    cells: [
      y("IBM Quantum, ANU and LfD when available, labelled per result"),
      n("The OS CSPRNG"),
      y("One provider, the one you call"),
      n("Atmospheric noise"),
    ],
  },
  {
    feature: "Always mixed with the OS CSPRNG",
    cells: [
      y("Every request, through HKDF-SHA512"),
      p("Uses the OS CSPRNG directly, when well built"),
      n("Raw output; any mixing is up to you"),
      na("Not stated"),
    ],
  },
  {
    feature: "Signed receipt for each result",
    cells: [
      y("Ed25519 and ML-DSA-65, both must verify"),
      n("No receipt"),
      n("Not typical"),
      y("Signed results and public draw records"),
    ],
  },
  {
    feature: "Post-quantum signatures",
    cells: [y("ML-DSA-65 alongside Ed25519"), na("Not applicable"), n("Not typical"), na("Not stated")],
  },
  {
    feature: "Receipt that never contains the secret",
    cells: [y("A salted SHA-512 commitment only"), na("No receipt"), na("No receipt"), na("Draw results are public")],
  },
  {
    feature: "Verify offline with published keys",
    cells: [y("Python and TypeScript reference verifiers"), na("Not applicable"), na("Not applicable"), na("Not stated")],
  },
  {
    feature: "Commit-then-run draws with recomputable winners",
    cells: [
      y("Entries signed first, one run, winners recomputed from the published seed"),
      na("Not applicable"),
      na("You would build it"),
      p("Public draw records hosted by random.org"),
    ],
  },
  {
    feature: "Independent proof the bytes came from quantum hardware",
    cells: [n("Not available. IBM does not sign job results"), na("Not applicable"), n("Provider-asserted only"),
            na("Not applicable")],
  },
  {
    feature: "Established track record",
    cells: [n("New project, no public track record yet"), p("Varies by tool"), p("Varies by provider"),
            y("Operating for over 20 years")],
  },
];

function CellView({ cell }: { cell: Cell }) {
  const m = MARKS[cell.mark];
  return (
    <div className="flex items-start gap-2 text-sm">
      <span aria-hidden className="mt-0.5 shrink-0 [&>svg]:size-4">{m.icon}</span>
      <span className="text-muted">
        <span className="sr-only">{m.label}: </span>
        {cell.text}
      </span>
    </div>
  );
}

export function Comparison() {
  return (
    <Block id="comparison" eyebrow="Comparison" title="An honest comparison"
           description="Where the differences are real, and where QuantumPass is the weaker choice.">
      <p className="mb-2 text-xs text-subtle sm:hidden">Scroll sideways to see every column.</p>
      <div role="region" aria-labelledby="comparison-title" tabIndex={0}
           className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[56rem] text-left text-sm">
          <caption className="sr-only">
            QuantumPass compared with a typical password generator, a public QRNG API and random.org draws
          </caption>
          <thead>
            <tr>
              <th scope="col" className="w-[22%] bg-surface-sunken px-4 py-3">
                <span className="sr-only">Feature</span>
              </th>
              {COLUMNS.map((col, i) => (
                <th key={col} scope="col"
                    className={cn("px-4 py-3 text-xs font-medium tracking-wide uppercase",
                                  i === 0 ? "bg-accent-soft text-accent" : "bg-surface-sunken text-subtle")}>
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.feature}>
                <th scope="row" className="border-t border-border px-4 py-3 text-left align-top text-sm font-medium text-fg">
                  {row.feature}
                </th>
                {row.cells.map((cell, i) => (
                  <Td key={COLUMNS[i]} className={cn(i === 0 && "bg-accent-soft/40")}>
                    <CellView cell={cell} />
                  </Td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 max-w-3xl text-xs text-subtle">
        Other services are described from their public documentation as we read it, and they change. &quot;Not
        stated&quot; means we found no claim, not that the feature is absent. A typical password generator means the
        one in a browser or password manager. QuantumPass is not certified by FIPS, NIST or GLI, and random.org is the
        better-established name.
      </p>
    </Block>
  );
}
