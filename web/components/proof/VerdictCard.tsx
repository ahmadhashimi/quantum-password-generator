import { Monitor, Server, ShieldCheck, ShieldX } from "lucide-react";
import type { ReactNode } from "react";

import { Card, CardBody, Skeleton } from "@/components/ui";
import type { VerifyResult } from "@/lib/api/schemas";
import { cn } from "@/lib/cn";
import { formatUnix } from "@/lib/format";
import type { BrowserVerification } from "@/lib/verify/verify";

import { CopyableValue, StateIcon, stateTextClass, Term } from "./parts";
import { type CheckState, failureSummary, kindLabel, type Optional, type PayloadView, reasonText } from "./proof-data";

function Panel({ icon, title, state, headline, note, loading = false }: {
  icon: ReactNode;
  title: string;
  state: CheckState;
  headline: string;
  note: ReactNode;
  loading?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-sunken p-4">
      <p className="flex items-center gap-2 text-xs font-medium tracking-wide text-subtle uppercase [&>svg]:size-3.5">
        {icon}
        {title}
      </p>
      {loading ? (
        <>
          <Skeleton className="mt-3 h-7 w-28" />
          <span role="status" className="sr-only">{headline}</span>
        </>
      ) : (
        <p className={cn("mt-2 flex items-center gap-2 text-lg font-semibold", stateTextClass(state))}>
          <StateIcon state={state} className="size-5" />
          {headline}
        </p>
      )}
      <p className="mt-1.5 text-xs text-muted">{note}</p>
    </div>
  );
}

function ServerPanel({ server }: { server: Optional<VerifyResult> }) {
  const icon = <Server aria-hidden />;
  switch (server.status) {
    case "idle":
      return <Panel icon={icon} title="Server says" state="skip" headline="Not asked"
                    note="This document was checked only in your browser. Nothing was sent to the server." />;
    case "loading":
      return <Panel icon={icon} title="Server says" state="skip" headline="Asking…" loading
                    note="The server's own verifier, for comparison. Your browser's result doesn't wait for it." />;
    case "error":
      return <Panel icon={icon} title="Server says" state="skip" headline="Unavailable"
                    note={`The server's verifier didn't answer (${server.message}). Your browser's result doesn't depend on it.`} />;
    case "ok": {
      const v = server.data;
      return <Panel icon={icon} title="Server says" state={v.valid ? "pass" : "fail"} headline={v.valid ? "Valid" : "Invalid"}
                    note={v.valid ? "The server's own verifier accepts this receipt." : reasonText(v.reason)} />;
    }
  }
}

/** Section 1: the verdict, and the browser's result next to (never replaced by) the server's. */
export function VerdictCard({ browser, view, server }: {
  browser: BrowserVerification;
  view: PayloadView | null;
  server: Optional<VerifyResult>;
}) {
  const valid = browser.valid;
  const Icon = valid ? ShieldCheck : ShieldX;
  return (
    <Card id="verdict">
      <div aria-hidden className={cn("h-1 rounded-t-xl", valid ? "bg-success" : "bg-danger")} />
      <CardBody className="space-y-6">
        <div className="flex items-start gap-4">
          <span aria-hidden className={cn("flex size-14 shrink-0 items-center justify-center rounded-xl",
                                          valid ? "bg-success-soft text-success" : "bg-danger-soft text-danger")}>
            <Icon className="size-7" />
          </span>
          <div className="min-w-0 space-y-1.5">
            <h2 className={cn("text-3xl font-semibold tracking-tight", valid ? "text-success" : "text-danger")}>
              {valid ? "Valid receipt" : "Invalid receipt"}
            </h2>
            <p className="text-sm text-muted">
              {valid
                ? "Both signatures verify over the receipt's exact bytes under a published, unrevoked key. That proves " +
                  "what this server signed, not that a quantum device independently attested the entropy."
                : `${failureSummary(browser)}. Treat this document as unverified.`}
            </p>
          </div>
        </div>

        {view && (
          <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
            <Term label="Receipt ID">
              {view.receiptId ? <CopyableValue value={view.receiptId} label="receipt ID" /> : "—"}
            </Term>
            <Term label="Version"><code className="font-mono text-xs">{view.version}</code></Term>
            <Term label="Kind">{kindLabel(view.kind)}</Term>
            <Term label="Issued">{view.issuedAt === null ? "—" : formatUnix(view.issuedAt)}</Term>
          </dl>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          <Panel icon={<Monitor aria-hidden />} title="Verified in your browser" state={valid ? "pass" : "fail"}
                 headline={valid ? "Valid" : "Invalid"}
                 note={valid
                   ? "Ed25519 and ML-DSA-65 both verify. Computed here from the receipt text, not taken from the server."
                   : failureSummary(browser)} />
          <ServerPanel server={server} />
        </div>
      </CardBody>
    </Card>
  );
}
