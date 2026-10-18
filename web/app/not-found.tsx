import { ButtonLink, Section } from "@/components/ui";

export default function NotFound() {
  return (
    <Section className="py-24 text-center">
      <p className="font-mono text-sm text-accent">404</p>
      <h1 className="mt-2 text-3xl font-semibold text-fg">Nothing here</h1>
      <p className="mt-3 text-muted">That page or receipt doesn&apos;t exist.</p>
      <div className="mt-8 flex justify-center gap-3">
        <ButtonLink href="/">Home</ButtonLink>
        <ButtonLink href="/verify" variant="secondary">Verify a receipt</ButtonLink>
      </div>
    </Section>
  );
}
