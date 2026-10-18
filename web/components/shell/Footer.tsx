import Link from "next/link";

import { Logo } from "./Logo";
import { FOOTER_NAV } from "./nav";

export function Footer() {
  return (
    <footer className="mt-24 border-t border-border">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="space-y-3">
          <p className="flex items-center gap-2 font-semibold text-fg"><Logo className="size-6" /> QuantumPass</p>
          <p className="max-w-sm text-sm text-muted">
            Quantum-assisted secrets with post-quantum signed evidence. Signed evidence is not independent quantum
            attestation: receipts prove what this service signed, and we say exactly what that covers.
          </p>
        </div>
        {FOOTER_NAV.map((col) => (
          <div key={col.title}>
            <p className="text-xs font-semibold tracking-widest text-subtle uppercase">{col.title}</p>
            <ul className="mt-3 space-y-2 text-sm">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} prefetch={false} className="text-muted hover:text-fg">{l.label}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border">
        <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-subtle sm:px-6">
          Not FIPS, NIST or GLI certified. Health tests are SP 800-90B-style screening, not a validation. Do not use
          for regulated gambling.{" "}
          <a href="https://github.com/ahmadhashimi/quantum-password-generator" className="underline hover:text-fg"
             rel="noopener noreferrer" target="_blank">Source on GitHub</a>
        </p>
      </div>
    </footer>
  );
}
