import { Atom, Blend, FileSignature, Gauge } from "lucide-react";
import type { ReactNode } from "react";

import { Callout, Card } from "@/components/ui";

import { Block } from "./Block";

const STEPS: { icon: ReactNode; title: string; tag: string; body: string }[] = [
  {
    icon: <Atom />,
    title: "Quantum entropy in",
    tag: "IBM Quantum · ANU · LfD",
    body: "Qubits on IBM Quantum processors are put in superposition and measured, and the ANU and LfD services " +
      "supply quantum random numbers. Everything a provider returns is treated as untrusted input.",
  },
  {
    icon: <Gauge />,
    title: "Screened for gross failures",
    tag: "SP 800-90B-style RCT/APT screening",
    body: "Repetition-count and adaptive-proportion tests run on every batch. A source that fails contributes " +
      "nothing, and repeated failures open a circuit breaker. This is screening, not a NIST validation: it catches " +
      "stuck or biased output, not a clean-looking fake.",
  },
  {
    icon: <Blend />,
    title: "Mixed with the OS CSPRNG",
    tag: "HKDF-SHA512 · rejection sampling",
    body: "Quantum bytes and 64 bytes from the operating system's CSPRNG go through HKDF-SHA512, then characters " +
      "are drawn without modulo bias. Mixing is designed so a bad quantum source adds nothing rather than " +
      "weakening the result, and that holds only while the OS CSPRNG itself is sound.",
  },
  {
    icon: <FileSignature />,
    title: "Signed receipt out",
    tag: "Ed25519 + ML-DSA-65",
    body: "The receipt records the sources reported, the screening status, the entropy of the output space and a " +
      "salted SHA-512 commitment to the secret. Both signatures cover it. The salt goes only to you; the secret " +
      "is never in the receipt.",
  },
];

export function HowItWorks() {
  return (
    <Block id="how-it-works" eyebrow="How it works" title="From quantum measurement to a receipt you can check"
           description="Four steps, each one labelled on the result so you can see what actually happened.">
      <ol className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step, i) => (
          <li key={step.title} className="flex">
            <Card className="flex w-full flex-col p-6">
              <div className="flex items-center justify-between">
                <span aria-hidden
                      className="flex size-10 items-center justify-center rounded-md bg-accent-soft text-accent
                                 [&>svg]:size-5">
                  {step.icon}
                </span>
                <span aria-hidden className="font-mono text-sm text-subtle">{String(i + 1).padStart(2, "0")}</span>
              </div>
              <h3 className="mt-4 text-lg font-semibold text-fg">
                <span className="sr-only">Step {i + 1}: </span>
                {step.title}
              </h3>
              <p className="mt-1 font-mono text-xs text-accent-2">{step.tag}</p>
              <p className="mt-3 text-sm leading-relaxed text-muted">{step.body}</p>
            </Card>
          </li>
        ))}
      </ol>
      <Callout tone="info" title="Quantum sourcing does not make a password stronger than a correctly used OS CSPRNG"
               className="mt-6">
        Strength is length: pick 256-bit secrets for margin against Grover-style search. What the quantum input adds
        is defence in depth and provenance you can inspect, and that provenance is asserted by the operator.
      </Callout>
    </Block>
  );
}
