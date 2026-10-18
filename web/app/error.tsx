"use client";

import { Button, Section } from "@/components/ui";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Section className="py-24 text-center">
      <h1 className="text-2xl font-semibold text-fg">Something went wrong</h1>
      <p className="mt-3 text-muted">
        The page failed to load. No secret was stored{error.digest ? ` (reference ${error.digest})` : ""}.
      </p>
      <Button className="mt-8" onClick={reset}>Try again</Button>
    </Section>
  );
}
