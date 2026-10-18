import { Activity } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { SourceMonitor } from "@/components/status/SourceMonitor";
import { STATE_COPY } from "@/components/status/provider-state";
import { ButtonLink, PageHeader, Section, Table, Td, Th } from "@/components/ui";

export const metadata: Metadata = {
  title: "Source status",
  description: "Live availability of the entropy sources behind QuantumPass: IBM Quantum, ANU, LfD and the OS CSPRNG " +
    "fallback.",
};

const link = "text-accent underline underline-offset-2 hover:text-accent-strong";

export default function StatusPage() {
  return (
    <Section className="pb-20">
      <PageHeader
        eyebrow="Source monitor" icon={<Activity aria-hidden />} title="Entropy source status"
        description={"Which entropy sources can serve a request right now. This page refreshes every 30 seconds while " +
                     "it is visible."}
        actions={<ButtonLink href="/transparency#entropy" variant="secondary">How entropy works</ButtonLink>} />

      <SourceMonitor />

      <section aria-labelledby="reading" className="mt-14 space-y-8">
        <div className="space-y-2">
          <h2 id="reading" className="text-xl font-semibold tracking-tight text-fg">Reading this page</h2>
          <p className="max-w-3xl text-[0.95rem] text-pretty text-muted">
            Each source reports a state. Only a source that is available is used for new requests. A request mixes in the
            sources that are available: the IBM pool (signed-in users only), the first healthy live service (ANU, then LfD)
            and always the OS CSPRNG. When none of the quantum sources is available, requests are served from the OS CSPRNG
            alone and labelled not quantum; generation never stops.
          </p>
        </div>

        <Table className="min-w-[34rem]">
          <caption className="sr-only">Source states</caption>
          <thead>
            <tr><Th>State</Th><Th>Meaning</Th></tr>
          </thead>
          <tbody>
            {Object.values(STATE_COPY).map((s) => (
              <tr key={s.label}>
                <Td className="font-medium whitespace-nowrap">{s.label}</Td>
                <Td className="text-muted">{s.meaning}</Td>
              </tr>
            ))}
          </tbody>
        </Table>

        <ul className="max-w-3xl list-disc space-y-2 pl-5 text-[0.95rem] text-muted marker:text-subtle">
          <li>
            The IBM simulator is classical pseudo-randomness. It is always labelled not quantum, whatever else is available.
          </li>
          <li>
            A &quot;Quantum&quot; label describes what the operator says a source is. It is not independently verifiable:
            IBM does not sign job results.
          </li>
          <li>
            Error details are not shown here. Public status only says whether a recent error occurred.
          </li>
        </ul>

        <p className="max-w-3xl text-sm text-muted">
          To see which sources a particular result used, open its receipt in the{" "}
          <Link href="/verify" prefetch={false} className={link}>Proof Explorer</Link>. The assumptions and limits of the
          pipeline are on <Link href="/transparency#limits" prefetch={false} className={link}>Transparency</Link>.
        </p>
      </section>
    </Section>
  );
}
