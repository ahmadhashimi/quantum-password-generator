import { Atom, Dices, FileSearch, Fingerprint, Hash, ShieldCheck, Sparkles } from "lucide-react";

import { ButtonLink, Callout, Card, CardBody, CardHeader, Stat } from "@/components/ui";
import type { Me } from "@/lib/api/schemas";

import { count, formatShare, kindLabelPlural, sortKinds } from "./format";

/** The kinds that are secrets or draws a user asks for; assistant messages are usage, not an issued result. */
const ISSUED_KINDS = ["password", "passphrase", "random", "draw"];

export function OverviewView({ me }: { me: Me }) {
  const counts = me.stats?.counts ?? {};
  const assistant = counts.assistant_message ?? 0;
  const issued = Object.entries(counts).reduce((n, [kind, c]) => (kind === "assistant_message" ? n : n + c), 0);
  // `quantum` counts usage events flagged quantum-seeded; clamp so odd data can never show more than 100%.
  const quantum = Math.min(me.stats?.quantum ?? 0, issued);
  const kinds = sortKinds([...ISSUED_KINDS, ...Object.keys(counts).filter((k) => k !== "assistant_message")]);

  return (
    <div className="space-y-10 pb-4">
      {issued === 0 && assistant === 0 ? (
        <Callout tone="neutral" title="Nothing issued yet">
          <p>
            Passwords, passphrases, random keys and draws you create while signed in show up here as counts, and as
            receipts you can check later.
          </p>
        </Callout>
      ) : (
        <>
          <section aria-labelledby="totals" className="space-y-4">
            <h2 id="totals" className="text-lg font-semibold tracking-tight text-fg">Everything you have issued</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Stat icon={<Hash aria-hidden />} label="Total issued" value={count(issued)}
                    hint="Passwords, passphrases, random keys and draws." />
              <Stat icon={<Atom aria-hidden />} label="Quantum-seeded"
                    value={issued === 0 ? "None yet" : formatShare(quantum / issued)}
                    hint={`${count(quantum)} of ${count(issued)} reported a quantum source. Reported by the server, not independently verifiable.`} />
            </div>
          </section>

          <section aria-labelledby="by-kind" className="space-y-4">
            <h2 id="by-kind" className="text-lg font-semibold tracking-tight text-fg">By kind</h2>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {kinds.map((kind) => (
                <Stat key={kind} label={kindLabelPlural(kind)} value={count(counts[kind] ?? 0)} />
              ))}
              {assistant > 0 && <Stat label={kindLabelPlural("assistant_message")} value={count(assistant)} />}
            </div>
          </section>
        </>
      )}

      <Card>
        <CardHeader icon={<Sparkles />} title="Quick actions"
                    description="Generated values stay in your browser. Receipts store a salted commitment only." />
        <CardBody className="flex flex-wrap gap-3">
          <ButtonLink href="/generate"><Fingerprint className="size-4" aria-hidden /> Generate a secret</ButtonLink>
          <ButtonLink href="/draws" variant="secondary"><Dices className="size-4" aria-hidden /> Run a fair draw</ButtonLink>
          <ButtonLink href="/verify" variant="secondary"><FileSearch className="size-4" aria-hidden /> Verify a receipt</ButtonLink>
          {me.is_admin && (
            <ButtonLink href="/admin" variant="secondary"><ShieldCheck className="size-4" aria-hidden /> Operations</ButtonLink>
          )}
        </CardBody>
      </Card>

      <Callout tone="neutral" title="What these numbers are">
        <p>
          Counts come from this server&apos;s own usage records. A valid receipt proves what this server signed, not that a
          quantum device independently attested the entropy: IBM does not sign job results, so independent quantum evidence
          is not available.
        </p>
      </Callout>
    </div>
  );
}
