import { KeyRound } from "lucide-react";
import Link from "next/link";

import { Badge, Card, CardBody, CardHeader, Skeleton, Table, Th } from "@/components/ui";
import type { KeySet, VerifyResult } from "@/lib/api/schemas";
import { formatUnix } from "@/lib/format";
import type { BrowserVerification } from "@/lib/verify/verify";

import { CheckRow, CopyableValue, linkClass, StateBadge, Term } from "./parts";
import {
  browserSignatureState,
  type CheckState,
  keyStatusNote,
  keyStatusTone,
  type Optional,
  serverSignatureState,
  SIGNATURES,
} from "./proof-data";

export type KeySource = "published" | "bundled";

function ServerCell({ server, sig }: { server: Optional<VerifyResult>; sig: (typeof SIGNATURES)[number] }) {
  switch (server.status) {
    case "idle":
      return <span className="text-sm text-subtle">Not asked</span>;
    case "loading":
      return <Skeleton className="h-6 w-20" />;
    case "error":
      return <span className="text-sm text-subtle">Unavailable</span>;
    case "ok":
      return <StateBadge state={serverSignatureState(server.data, sig.id)} />;
  }
}

function canonicalState(canonicalMatch: boolean | null, material: Optional<string>): { state: CheckState; detail?: string } | null {
  if (material.status === "idle") return null;
  if (canonicalMatch !== null) return { state: canonicalMatch ? "pass" : "fail" };
  if (material.status === "loading") return { state: "skip", detail: "Waiting for the server's copy." };
  return { state: "skip", detail: "The server's canonical bytes weren't available, so there was nothing to compare." };
}

/** Section 2: what the signatures prove, computed in the browser and compared with the server's verdict. */
export function IntegrityCard({ browser, server, keys, keySource, material, canonicalMatch }: {
  browser: BrowserVerification;
  server: Optional<VerifyResult>;
  keys: KeySet;
  keySource: KeySource;
  material: Optional<string>;
  canonicalMatch: boolean | null;
}) {
  const entry = browser.keyId ? keys.keys.find((k) => k.key_id === browser.keyId) : undefined;
  const status = browser.keyStatus;
  const otherChecks = browser.checks.filter((c) => c.id !== "ed25519" && c.id !== "ml-dsa-65");
  const canonical = canonicalState(canonicalMatch, material);
  return (
    <Card id="integrity">
      <CardHeader icon={<KeyRound />} title="Integrity (cryptographic)"
                  description="Both signatures must verify over the receipt's canonical bytes. Your browser rebuilds those bytes from the exact text it received."
                  action={<Badge tone="violet">Cryptographic</Badge>} />
      <CardBody className="space-y-6">
        <Table>
          <caption className="sr-only">Signature results from your browser and from the server</caption>
          <thead>
            <tr><Th>Signature</Th><Th>Your browser</Th><Th>Server says</Th></tr>
          </thead>
          <tbody>
            {SIGNATURES.map((sig) => (
              <tr key={sig.id}>
                <th scope="row" className="border-t border-border px-4 py-3 text-left align-top font-medium text-fg">
                  {sig.label}
                  <span className="block text-xs font-normal text-subtle">{sig.note}</span>
                </th>
                <td className="border-t border-border px-4 py-3 align-top">
                  <StateBadge state={browserSignatureState(browser, sig.id)} />
                </td>
                <td className="border-t border-border px-4 py-3 align-top"><ServerCell server={server} sig={sig} /></td>
              </tr>
            ))}
          </tbody>
        </Table>

        {(otherChecks.length > 0 || canonical) && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-fg">Other checks in your browser</h3>
            <ul className="space-y-2.5">
              {otherChecks.map((c) => (
                <CheckRow key={c.id} state={c.ok ? "pass" : "fail"} label={c.label} detail={c.ok ? undefined : c.detail} />
              ))}
              {canonical && (
                <CheckRow state={canonical.state} label="Server's canonical bytes match what your browser computed"
                          detail={canonical.detail} />
              )}
            </ul>
          </div>
        )}

        {browser.keyId && (
          <div className="space-y-3 border-t border-border pt-5">
            <dl className="grid gap-4 sm:grid-cols-2">
              <Term label="Signing key ID (fingerprint)">
                <CopyableValue value={browser.keyId} label="key ID" />
              </Term>
              <Term label="Key status">
                <span className="flex flex-wrap items-center gap-2">
                  <Badge tone={keyStatusTone(status)}>{status ?? "not published"}</Badge>
                  {status === "revoked" && entry?.revoked_at !== undefined && (
                    <span className="text-xs text-muted">revoked {formatUnix(entry.revoked_at)}</span>
                  )}
                </span>
                <span className="mt-1.5 block text-xs text-muted">{keyStatusNote(status)}</span>
              </Term>
            </dl>
            <p className="text-sm text-muted">
              {keySource === "bundled"
                ? "These keys came from the file you supplied, so whoever made the file chose them: a valid result shows " +
                  "the file is self-consistent, not that the issuer published this key. Compare the key ID with the " +
                  "issuer's published key set."
                : "The key set was fetched from the server that issued the receipt. Compare this key ID with a copy of " +
                  "the key set you trust for full independence."}{" "}
              <Link href="/transparency#keys" prefetch={false} className={linkClass}>Key history and rotation</Link>
            </p>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
