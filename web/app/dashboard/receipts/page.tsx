import { ReceiptText } from "lucide-react";
import type { Metadata } from "next";

import { Unavailable } from "@/components/dashboard/Notices";
import { ReceiptsView } from "@/components/dashboard/ReceiptsView";
import { load } from "@/components/dashboard/load";
import { Callout, PageHeader } from "@/components/ui";
import { MeReceipts } from "@/lib/api/schemas";

export const metadata: Metadata = { title: "Your receipts" };

const PAGE_SIZE = 25;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})$/;

/** `before` is a created_at cursor echoed back from the API; anything that isn't a timestamp is ignored. */
function cursorOf(value: string | string[] | undefined): string | null {
  return typeof value === "string" && TIMESTAMP.test(value) && !Number.isNaN(Date.parse(value)) ? value : null;
}

export default async function ReceiptsPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const before = cursorOf((await searchParams).before);
  const query = new URLSearchParams({ limit: String(PAGE_SIZE), ...(before ? { before } : {}) });
  const receipts = await load(`/api/v2/me/receipts?${query}`, MeReceipts);

  return (
    <>
      <PageHeader eyebrow="Issuance history" icon={<ReceiptText aria-hidden />} title="Your receipts"
                  description="Metadata for every receipt issued to your account. Generated values stay in your browser. Receipts store a salted commitment only." />
      {receipts.state === "ok" ? (
        <div className="space-y-6">
          <ReceiptsView data={receipts.data} paged={before !== null} />
          <Callout tone="neutral" title="Sources are asserted by the operator">
            <p>
              The sources listed on each row are what this server reported when it signed the receipt. A valid signature
              proves what this server signed, not that a quantum device independently attested the entropy. The receipt
              log is operated by this server and is not an externally anchored transparency log.
            </p>
          </Callout>
        </div>
      ) : (
        <Unavailable result={receipts} what="your receipts" />
      )}
    </>
  );
}
