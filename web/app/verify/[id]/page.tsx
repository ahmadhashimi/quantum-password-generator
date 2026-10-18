import { FileSearch } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProofExplorer } from "@/components/proof/ProofExplorer";
import { ButtonLink, PageHeader, Section } from "@/components/ui";
import { RECEIPT_ID } from "@/lib/format";

export const metadata: Metadata = {
  title: "Proof Explorer",
  robots: { index: false, follow: false },
};

export default async function ProofPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!RECEIPT_ID.test(id)) notFound();
  return (
    <Section className="pb-20">
      <PageHeader eyebrow="Proof Explorer" icon={<FileSearch aria-hidden />} title="Check this receipt yourself"
                  description={"Your browser re-checks both signatures from the receipt's exact text. The server's verdict " +
                               "appears beside yours, never instead of it."}
                  actions={<ButtonLink href="/verify" variant="secondary">Verify another</ButtonLink>} />
      <ProofExplorer receiptId={id} />
    </Section>
  );
}
