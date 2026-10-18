import { ClipboardCheck, Hourglass, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";

import { Card } from "@/components/ui";

import { Block } from "./Block";

const POINTS: { icon: ReactNode; title: string; body: string; note: string }[] = [
  {
    icon: <Hourglass />,
    title: "Harvest now, decrypt later",
    body: "Adversaries can record encrypted data today and read it once a large quantum computer exists. Signed " +
      "records face a parallel risk: a classical-only signature could be forged after that point. Every receipt " +
      "here carries two signatures, Ed25519 and ML-DSA-65, and both must verify.",
    note: "This protects the receipt. It does not make a password stronger: strength is length.",
  },
  {
    icon: <ClipboardCheck />,
    title: "Auditors ask where credentials came from",
    body: "Reviews and security questionnaires increasingly ask how a key or password was generated, and whether " +
      "you can show it. \"A random function, trust us\" leaves nothing to hand over. A receipt is a portable record: " +
      "the sources reported, the screening status, a commitment and signatures, with no secret inside.",
    note: "What it records is asserted by the operator. The next sections say exactly how far to trust it.",
  },
  {
    icon: <ShieldAlert />,
    title: "Weak randomness fails quietly",
    body: "Generators with hidden flaws have caused real losses: a vanity-address tool whose keys could be " +
      "brute-forced (about $160M stolen in 2022) and a wallet CLI that seeded a Mersenne Twister with 32 bits of " +
      "system time (CVE-2023-39910).",
    note: "Those were implementation failures, not a lack of quantum hardware. Evidence does not fix a weak " +
      "generator; it makes issuance inspectable.",
  },
];

export function WhyNow() {
  return (
    <Block id="why-now" eyebrow="Why now" title="Credentials get audited, and the evidence has to last"
           description="Three pressures meet in how secrets are issued today.">
      <ul className="grid gap-4 lg:grid-cols-3">
        {POINTS.map((p) => (
          <li key={p.title} className="flex">
            <Card className="flex w-full flex-col p-6">
              <span aria-hidden
                    className="flex size-10 items-center justify-center rounded-md bg-accent-soft text-accent [&>svg]:size-5">
                {p.icon}
              </span>
              <h3 className="mt-4 text-lg font-semibold text-fg">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{p.body}</p>
              <div className="mt-auto pt-5">
                <p className="border-t border-border pt-4 text-sm text-muted">{p.note}</p>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </Block>
  );
}
