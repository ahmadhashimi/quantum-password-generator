import { Atom, Cpu, ReceiptText } from "lucide-react";
import Link from "next/link";

import { Badge, ButtonLink, Callout, Table, Td, Th } from "@/components/ui";
import type { MeReceipts } from "@/lib/api/schemas";
import { sourceLabel } from "@/lib/format";

import { formatBits, formatIso, kindLabel } from "./format";

type Item = MeReceipts["items"][number];

/** Hardware or live QRNG sources the operator reports as quantum. The simulator is classical, whatever else is listed. */
const QUANTUM_SOURCES = ["ibm_quantum", "anu", "lfd"];

function QuantumBadge({ item }: { item: Item }) {
  if (item.sources.length === 0 && !item.quantum) {
    return <Badge tone="neutral" title="This receipt records no entropy: it commits to an input list">No entropy used</Badge>;
  }
  const quantum = item.quantum && item.sources.some((s) => QUANTUM_SOURCES.includes(s));
  if (quantum) {
    return (
      <Badge tone="accent" icon={<Atom aria-hidden />} title="Reported by the server when it issued the receipt; not independently verifiable">
        Quantum-seeded
      </Badge>
    );
  }
  return (
    <Badge tone="warning" icon={<Cpu aria-hidden />} title="No quantum source contributed to this result">
      Not quantum
    </Badge>
  );
}

/** One page of receipt metadata. Receipts hold commitments only, never the generated values. */
export function ReceiptsView({ data, paged }: {
  data: MeReceipts;
  /** True when this page was reached with ?before=, so a way back to the newest receipts is shown. */
  paged: boolean;
}) {
  const newest = (
    <ButtonLink href="/dashboard/receipts" variant="ghost" size="sm">Back to newest</ButtonLink>
  );

  if (data.items.length === 0) {
    return (
      <div className="space-y-4">
        <Callout tone="neutral" title={paged ? "No older receipts" : "No receipts yet"}>
          <p>
            {paged
              ? "You have reached the start of your history."
              : "Every password, passphrase, random key and draw you create while signed in gets a signed receipt, listed here."}
          </p>
          <div className="flex flex-wrap gap-2 pt-3">
            {paged ? newest : <ButtonLink href="/generate" size="sm">Generate a secret</ButtonLink>}
          </div>
        </Callout>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Table className="min-w-[56rem]">
        <caption className="sr-only">Receipts issued to your account, newest first</caption>
        <thead>
          <tr>
            <Th>Receipt</Th>
            <Th>Kind</Th>
            <Th>Created (UTC)</Th>
            <Th>Version</Th>
            <Th>Sources</Th>
            <Th>Quantum</Th>
            <Th className="text-right">Entropy</Th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((r) => (
            <tr key={r.receipt_id}>
              <Td className="font-mono text-xs whitespace-nowrap">
                <Link href={`/verify/${r.receipt_id}`} prefetch={false}
                      className="text-accent underline underline-offset-2 hover:text-accent-strong">
                  {r.receipt_id}
                </Link>
              </Td>
              <Td className="whitespace-nowrap">{kindLabel(r.kind)}</Td>
              <Td className="text-muted tabular-nums whitespace-nowrap">
                <time dateTime={r.created_at}>{formatIso(r.created_at)}</time>
              </Td>
              <Td className="font-mono text-xs text-muted whitespace-nowrap">{r.version}</Td>
              <Td className="text-muted">
                {r.sources.length > 0 ? r.sources.map(sourceLabel).join(", ") : <span className="text-subtle">None</span>}
              </Td>
              <Td><QuantumBadge item={r} /></Td>
              <Td className="text-right tabular-nums whitespace-nowrap">
                {r.entropy_bits === null
                  ? <><span aria-hidden className="text-subtle">-</span><span className="sr-only">Not applicable</span></>
                  : <>{formatBits(r.entropy_bits)} <span className="text-xs text-subtle">bits</span></>}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm text-muted">
          <ReceiptText aria-hidden className="size-4 text-accent" />
          {data.items.length} {data.items.length === 1 ? "receipt" : "receipts"} on this page, newest first
        </p>
        <div className="flex gap-2">
          {paged && newest}
          {data.next_before !== null && (
            <ButtonLink href={{ pathname: "/dashboard/receipts", query: { before: data.next_before } }}
                        variant="secondary" size="sm">
              Load older
            </ButtonLink>
          )}
        </div>
      </div>
    </div>
  );
}
