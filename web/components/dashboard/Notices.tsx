import { ButtonLink, Callout } from "@/components/ui";
import { clerkEnabled } from "@/lib/auth/config";

import type { Loaded } from "./load";

function SignedOut({ what }: { what: string }) {
  if (clerkEnabled) {
    return (
      <Callout tone="info" title={`Sign in to see ${what}`}>
        <p>Your account keeps the receipts and usage that belong to you. Nothing here is visible without signing in.</p>
        <div className="flex flex-wrap gap-2 pt-3">
          <ButtonLink href="/sign-in" size="sm">Sign in</ButtonLink>
          <ButtonLink href="/sign-up" size="sm" variant="secondary">Create an account</ButtonLink>
        </div>
      </Callout>
    );
  }
  return (
    <Callout tone="warning" title="Start the backend in development mode">
      <p>
        This site has no sign-in configured, so the API only answers account requests when it runs with{" "}
        <code>ENVIRONMENT=development</code>, where it treats you as a local developer. Set that in{" "}
        <code>backend/.env</code>, restart the API and reload this page.
      </p>
    </Callout>
  );
}

function AdminOnly() {
  return (
    <Callout tone="warning" title="Admins only (and a second factor verified in the last hour)">
      <p>
        This page is for operators. If you are one, verify your second factor again, then reload. Denied attempts are
        recorded in the audit log.
      </p>
    </Callout>
  );
}

/** What a page shows instead of its content when `load` did not return data. */
export function Unavailable({ result, what, admin = false }: {
  result: Exclude<Loaded<unknown>, { state: "ok" }>;
  /** Noun phrase for the sign-in prompt: "your receipts". */
  what: string;
  admin?: boolean;
}) {
  if (result.state === "failed") {
    return (
      <Callout tone="danger" role="alert" title="Could not load this page">
        <p>
          {result.message}
          {result.requestId && <> Request ID: <code>{result.requestId}</code>.</>} Reload to try again.
        </p>
      </Callout>
    );
  }
  if (result.status === 401) return <SignedOut what={what} />;
  if (result.status === 403 && admin) return <AdminOnly />;
  return (
    <Callout tone="neutral" title="Not available">
      <p>The API has nothing to show for {what}.</p>
    </Callout>
  );
}
