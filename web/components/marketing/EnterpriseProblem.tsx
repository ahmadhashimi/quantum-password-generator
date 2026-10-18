import { FileQuestion, History, Link2Off } from "lucide-react";
import type { ReactNode } from "react";

import { Card } from "@/components/ui";

import { Block } from "./Block";

const POINTS: { icon: ReactNode; title: string; body: string }[] = [
  {
    icon: <FileQuestion />,
    title: "Auditors ask where credentials came from",
    body: "Security questionnaires and reviews ask how keys and passwords were generated, from what entropy, under " +
      "which controls. The honest answer today is usually a description of policy.",
  },
  {
    icon: <Link2Off />,
    title: "There is no portable evidence",
    body: "Logs say a credential was issued. They live inside the system being audited, and a third party cannot " +
      "check them without trusting that system or being handed the credential.",
  },
  {
    icon: <History />,
    title: "Records have to outlast the system",
    body: "Issuing systems get rotated and retired. A record signed only with classical cryptography could also be " +
      "forged once a large quantum computer exists, which weakens old evidence exactly when it is needed.",
  },
];

export function EnterpriseProblem() {
  return (
    <Block id="problem" eyebrow="The problem" title="Credential issuance is hard to audit after the fact"
           description="Not because the generators are bad, but because nothing portable survives the moment of issuance.">
      <ul className="grid gap-4 lg:grid-cols-3">
        {POINTS.map((p) => (
          <li key={p.title} className="flex">
            <Card className="w-full p-6">
              <span aria-hidden
                    className="flex size-10 items-center justify-center rounded-md bg-accent-soft text-accent [&>svg]:size-5">
                {p.icon}
              </span>
              <h3 className="mt-4 text-lg font-semibold text-fg">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{p.body}</p>
            </Card>
          </li>
        ))}
      </ul>
    </Block>
  );
}
