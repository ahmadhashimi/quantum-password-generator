import { KeyRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Generator } from "@/components/generate/Generator";
import { HistoryProvider, SessionHistory } from "@/components/generate/SessionHistory";
import { StrengthChecker } from "@/components/generate/StrengthChecker";
import { Callout, PageHeader, Section } from "@/components/ui";

export const metadata: Metadata = {
  title: "Generate",
  description: "Generate passwords, passphrases and random keys with quantum-assisted entropy and optional signed " +
    "receipts. Generated values stay in your browser.",
};

export default function Page() {
  return (
    <Section>
      <PageHeader eyebrow="Generate" icon={<KeyRound aria-hidden />} title="Generate a secret"
                  description="Generated values stay in your browser. Receipts store a salted commitment only." />
      <HistoryProvider>
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <Generator />
          <div className="space-y-6">
            <StrengthChecker />
            <SessionHistory />
            <Callout title="What a receipt proves">
              Valid signatures prove what this server signed, not that a quantum device independently attested the
              entropy. Sources and health screening are operator-asserted.{" "}
              <Link href="/transparency" prefetch={false} className="font-medium text-accent underline underline-offset-2">
                How to read a receipt
              </Link>
            </Callout>
          </div>
        </div>
      </HistoryProvider>
    </Section>
  );
}
