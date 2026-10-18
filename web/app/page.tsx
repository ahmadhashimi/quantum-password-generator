import Link from "next/link";
import { Story, CallToAction } from "../components/Story";
import { HowItWorks } from "../components/HowItWorks";
export default function Home() {
  return <div className="space-y-16">
    <header className="mx-auto max-w-3xl space-y-5 text-center">
      <p className="text-sm font-medium text-cyan-500 uppercase">Transparent cryptographic evidence</p>
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
        Secrets built for the <span className="text-gradient">quantum era</span>
      </h1>
      <p className="text-lg text-slate-600 dark:text-slate-400">
        Generate strong credentials, issue hybrid-signed receipts, and inspect precisely
        what the evidence verifies—and what remains an operator assertion.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link href="/generate" className="btn-primary">Generate securely</Link>
        <Link href="/verify" className="btn-ghost">Verify a receipt</Link>
        <Link href="/transparency" className="btn-ghost">Evidence limitations</Link>
      </div>
    </header>
    <Story/><HowItWorks/><CallToAction/>
  </div>;
}
