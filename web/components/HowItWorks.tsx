"use client";
import { Atom, Blend, Gauge, ShieldCheck } from "lucide-react";

const STEPS = [
  {
    icon: Atom,
    title: "Measure real quantum systems",
    body: "Qubits on IBM Quantum processors are placed in superposition and measured; the ANU and LfD QRNGs sample vacuum fluctuations and photon detection. The outcomes are fundamentally unpredictable.",
  },
  {
    icon: Gauge,
    title: "Health-test every byte",
    body: "NIST SP 800-90B repetition-count and adaptive-proportion tests run continuously. A source that gets stuck or biased is quarantined automatically.",
  },
  {
    icon: Blend,
    title: "Mix, never trust blindly",
    body: "Quantum bytes are combined with your server's OS CSPRNG through HKDF-SHA512, so a tampered remote source can never weaken a password.",
  },
  {
    icon: ShieldCheck,
    title: "Sample without bias",
    body: "Characters are picked with rejection sampling, so every character is exactly equally likely. Each result shows its true entropy and where its randomness came from.",
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="space-y-6" aria-labelledby="how-title">
      <h2 id="how-title" className="text-center text-2xl font-semibold">How it works</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {STEPS.map(({ icon: Icon, title, body }) => (
          <article key={title} className="glass space-y-2 p-5">
            <Icon className="size-5 text-cyan-500" aria-hidden />
            <h3 className="font-medium">{title}</h3>
            <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">{body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
