import { Bot, Gift, KeyRound, SearchCheck } from "lucide-react";
import type { ReactNode } from "react";

import { Callout, Card } from "@/components/ui";

import { Block } from "./Block";
import { TextLink } from "./links";

const CASES: { icon: ReactNode; title: string; body: string; gives: string; link: ReactNode }[] = [
  {
    icon: <KeyRound />,
    title: "Secrets platforms and key infrastructure",
    body: "Keep the vault you have. Ask QuantumPass for the credential at issuance and store the receipt beside it, " +
      "so \"where did this key come from?\" has an answer you can hand to someone else.",
    gives: "A signed record per credential: sources reported, screening result, a commitment, no secret.",
    link: <TextLink href="/enterprise">How it fits an existing stack</TextLink>,
  },
  {
    icon: <Bot />,
    title: "AI agent credential issuance",
    body: "Agents ask for fresh credentials all day. Issue each one through the Evidence API and keep a receipt " +
      "per credential, so a review can see how every agent secret was made without ever holding one.",
    gives: "Machine-readable receipts with a versioned schema and a documented verification algorithm.",
    link: <TextLink href="/developers">Read the Evidence API</TextLink>,
  },
  {
    icon: <SearchCheck />,
    title: "Key ceremonies and audits",
    body: "Give an auditor a receipt and the offline verifier. They check both signatures and the key's status " +
      "without your systems or the credential. A commitment opens only for whoever holds the secret and its salt.",
    gives: "Evidence that survives the system that produced it, checked against published public keys.",
    link: <TextLink href="/verify">Open the Proof Explorer</TextLink>,
  },
  {
    icon: <Gift />,
    title: "Fair giveaways and draws",
    body: "Lock and sign the entry list before any randomness exists, run the draw exactly once, and let anyone " +
      "recompute the winners from the published seed. Re-rolls stay visible because every run over a list is counted.",
    gives: "A commit receipt, a run receipt and a public recomputation of the winners.",
    link: <TextLink href="/draws">Run a commit-then-run draw</TextLink>,
  },
];

export function UseCases() {
  return (
    <Block id="use-cases" eyebrow="Use cases" title="Where evidence about issuance earns its keep"
           description="The common thread: someone other than you needs to check how a secret or a result was produced.">
      <ul className="grid gap-4 md:grid-cols-2">
        {CASES.map((c) => (
          <li key={c.title} className="flex">
            <Card className="flex w-full flex-col p-6">
              <span aria-hidden
                    className="flex size-10 items-center justify-center rounded-md bg-accent-2-soft text-accent-2
                               [&>svg]:size-5">
                {c.icon}
              </span>
              <h3 className="mt-4 text-lg font-semibold text-fg">{c.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{c.body}</p>
              <p className="mt-4 text-sm text-fg">
                <span className="font-medium">You keep: </span>
                <span className="text-muted">{c.gives}</span>
              </p>
              <p className="mt-auto pt-5 text-sm font-medium">{c.link}</p>
            </Card>
          </li>
        ))}
      </ul>
      <Callout tone="warning" title="Not for regulated gambling" className="mt-6">
        QuantumPass carries no gambling, FIPS, NIST or GLI certification. Use it for credentials, key material and
        informal draws, not for games of chance that a regulator oversees.
      </Callout>
    </Block>
  );
}
