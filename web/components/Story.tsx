"use client";
import { ArrowRight, Bot, FileSignature, Gift, KeyRound, ShieldAlert, Sparkles, Timer } from "lucide-react";

/** Why now → persona story → problem/solution/innovation → comparison → use cases. */
export function Story() {
  return (
    <section className="space-y-10" aria-labelledby="story-title">
      <div className="mx-auto max-w-3xl space-y-4 text-center">
        <p className="text-sm font-medium tracking-wide text-violet-500 uppercase dark:text-violet-300">Why now</p>
        <h2 id="story-title" className="text-3xl font-bold tracking-tight">
          Data stolen today can be decrypted tomorrow
        </h2>
        <p className="text-slate-600 dark:text-slate-400">
          Attackers are already stockpiling encrypted data — <strong>“harvest now, decrypt later”</strong> — waiting for
          quantum computers that can break today’s RSA and elliptic-curve crypto. Quantum error correction crossed real
          milestones in 2026; the migration to post-quantum security is no longer optional.
        </p>
      </div>

      <article className="glass grid gap-6 p-6 sm:grid-cols-[auto_1fr] sm:p-8">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-violet-500 text-2xl font-bold text-white" aria-hidden>
          S
        </div>
        <div className="space-y-3 text-slate-700 dark:text-slate-300">
          <p className="text-sm text-slate-500">Meet Sam — security lead at a fintech startup running 40 AI agents</p>
          <p>
            Every week Sam issues new passwords, API keys and agent credentials. Auditors keep asking the same
            question: <em>“How were these secrets generated, and can you prove it?”</em> The honest answer used to be
            “a random function, trust us”. And every signature Sam relies on uses math a large quantum computer will
            break.
          </p>
          <p>
            With QuantumPass, each secret is seeded by qubits measured on an IBM quantum computer, health-tested,
            mixed with the system RNG — and comes with a receipt signed by <strong>ML-DSA</strong>, NIST’s
            lattice-based post-quantum signature. The receipt attests the server\u2019s claims without containing the secret. Sam
            hands the auditor a link.
          </p>
        </div>
      </article>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="glass space-y-2 p-6">
          <ShieldAlert className="size-5 text-rose-400" aria-hidden />
          <h3 className="font-semibold">The problem</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Secrets come from invisible random generators nobody can audit, weak RNGs have cost hundreds of millions,
            and the signatures protecting it all will fall to quantum computers.
          </p>
        </div>
        <div className="glass space-y-2 p-6">
          <Sparkles className="size-5 text-cyan-400" aria-hidden />
          <h3 className="font-semibold">The solution</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Real quantum entropy (IBM Quantum, ANU, LfD) with SP 800-90B-inspired health screening (not certified), always mixed with the OS
            RNG so it is never weaker than standard practice.
          </p>
        </div>
        <div className="glass space-y-2 p-6">
          <FileSignature className="size-5 text-violet-400" aria-hidden />
          <h3 className="font-semibold">The proof</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Hybrid <strong>Ed25519 + ML-DSA-65</strong> receipts naming the exact quantum jobs and health results, with a
            commitment instead of the secret — verifiable by anyone, even offline.
          </p>
        </div>
      </div>

      <div className="glass overflow-x-auto p-6">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <caption className="mb-4 text-left font-semibold">How it compares</caption>
          <thead className="text-slate-500">
            <tr><th className="py-2"></th><th>Password managers</th><th>QRNG APIs</th><th className="text-cyan-600 dark:text-cyan-300">QuantumPass</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-white/5">
            {[
              ["Strong randomness", "✓", "✓", "✓ never weaker than your OS RNG"],
              ["Real quantum hardware source", "—", "Some", "✓ IBM Quantum QPU + photonic QRNGs"],
              ["Continuous health tests per byte", "—", "Some", "✓ SP 800-90B RCT + APT"],
              ["Per-result provenance", "—", "Rare", "✓ exact IBM jobs, sources, health"],
              ["Post-quantum signed proof", "—", "Rare", "✓ ML-DSA-65 + Ed25519"],
              ["Proof without revealing the secret", "—", "—", "✓ SHA-512 commitment"],
              ["AI assistant that never sees secrets", "—", "—", "✓"],
            ].map(([feature, a, b, c]) => (
              <tr key={feature}><td className="py-2 font-medium">{feature}</td><td>{a}</td><td>{b}</td><td className="font-medium">{c}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: KeyRound, title: "Passwords & identity", text: "Quantum-seeded passwords, passphrases and keys with proof of origin." },
          { icon: Bot, title: "AI agent credentials", text: "Agents need fresh secrets constantly — issue them with auditable provenance." },
          { icon: Timer, title: "Post-quantum readiness", text: "Lattice-based signatures today, so proofs outlive the quantum transition." },
          { icon: Gift, title: "Provably fair draws", text: "Giveaways and loot nobody can call rigged — commit first, draw once." },
        ].map(({ icon: Icon, title, text }) => (
          <div key={title} className="glass space-y-2 p-5">
            <Icon className="size-5 text-cyan-500" aria-hidden />
            <h3 className="font-medium">{title}</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">{text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function CallToAction() {
  return (
    <section className="glass relative overflow-hidden p-8 text-center sm:p-12" aria-labelledby="cta-title">
      <div className="bg-aurora absolute inset-0 -z-10 opacity-70" aria-hidden />
      <h2 id="cta-title" className="text-3xl font-bold tracking-tight">Make your secrets quantum-era ready</h2>
      <p className="mx-auto mt-3 max-w-xl text-slate-600 dark:text-slate-400">
        Free to try. No account needed for your first quantum password.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <a href="/generate" className="btn-primary px-6 py-3 text-base">
          Generate a quantum password <ArrowRight className="size-4" aria-hidden />
        </a>
        <a href="/verify" className="btn-ghost px-6 py-3 text-base">Verify a receipt</a>
      </div>
    </section>
  );
}
