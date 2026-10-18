import type { ReactNode } from "react";

import { Badge, Table, Td, type Tone, Th } from "@/components/ui";

type Auth = "none" | "optional" | "signed-in" | "owner" | "admin";

const AUTH: Record<Auth, { label: string; tone: Tone }> = {
  none: { label: "None", tone: "neutral" },
  optional: { label: "Optional", tone: "accent" },
  "signed-in": { label: "Signed in", tone: "info" },
  owner: { label: "Owner", tone: "info" },
  admin: { label: "Admin + MFA", tone: "warning" },
};

interface Endpoint {
  method: "GET" | "POST";
  path: string;
  auth: Auth;
  purpose: ReactNode;
  note?: ReactNode;
}

const ENDPOINTS: Endpoint[] = [
  {
    method: "GET", path: "/api/v2/password", auth: "optional",
    purpose: "Generate a password. Add ?receipt=true for a signed receipt and its salt, returned only to you.",
    note: "length 4-128 (20), upper, lower, digits, symbols, exclude_ambiguous, require_each",
  },
  {
    method: "GET", path: "/api/v2/passphrase", auth: "optional",
    purpose: "Generate a passphrase. Supports ?receipt=true.",
    note: "words 3-16 (6), separator (- _ . space or empty), capitalize, add_number",
  },
  {
    method: "GET", path: "/api/v2/random", auth: "optional",
    purpose: "Random bytes as hex. Supports ?receipt=true.",
    note: "bytes 1-1024 (32)",
  },
  {
    method: "GET", path: "/api/v2/entropy/status", auth: "none",
    purpose: "Live source status: state, mode, last success, pool level. Coarse: no raw provider errors or job ids.",
  },
  { method: "GET", path: "/api/v2/health", auth: "none", purpose: "Liveness and API version." },
  {
    method: "GET", path: "/api/v2/receipts/{id}", auth: "none",
    purpose: "A published receipt. Commitments only, never secrets.",
  },
  {
    method: "GET", path: "/api/v2/receipts/{id}/verify-material", auth: "none",
    purpose: "The server's byte-exact canonical payload, the signing domain and the key entry, for verifiers that cannot " +
      "parse numbers losslessly.",
  },
  {
    method: "POST", path: "/api/v2/receipts/verify", auth: "none",
    purpose: "Server verdicts for {receipt} or {receipt_id}. Optional entries (draws) are recomputed.",
    note: "Check secret commitments locally instead: never send a secret to a verification endpoint",
  },
  {
    method: "GET", path: "/.well-known/quantumpass-keys.json", auth: "none",
    purpose: "Active, retired and revoked public keys. Also served at /api/v2/receipts/keys.",
  },
  {
    method: "POST", path: "/api/v2/draws", auth: "signed-in",
    purpose: "Commit a draw: {title, entries, winners}. Returns the draw_commit receipt. No randomness yet.",
    note: "Idempotency-Key supported",
  },
  {
    method: "POST", path: "/api/v2/draws/{id}/run", auth: "owner",
    purpose: "Run the committed draw once. Later calls replay the stored result and never re-roll.",
    note: "Idempotency-Key supported",
  },
  { method: "GET", path: "/api/v2/me", auth: "signed-in", purpose: "Account overview and issuance counts." },
  {
    method: "GET", path: "/api/v2/me/receipts", auth: "signed-in",
    purpose: "Your receipt metadata, newest first, paginated.",
    note: "before (timestamp), limit 1-200 (50)",
  },
  { method: "GET", path: "/api/v2/me/usage", auth: "signed-in", purpose: "Today's and this month's usage, and your quotas." },
  {
    method: "GET", path: "/api/v2/admin/audit", auth: "admin",
    purpose: "Hash-chained audit events.",
    note: "after (seq), limit 1-500 (100)",
  },
  {
    method: "GET", path: "/api/v2/admin/audit/verify", auth: "admin",
    purpose: "Walk the audit chain: {ok, events, first_bad_seq, head}.",
  },
  {
    method: "GET", path: "/api/v2/admin/draws/investigate", auth: "admin",
    purpose: "Draws interrupted after their seed was fixed, with persisted seed provenance.",
  },
  {
    method: "POST", path: "/api/v2/admin/draws/{id}/complete", auth: "admin",
    purpose: "Publish an interrupted draw from its persisted seed. Draws no new randomness.",
  },
];

export function EndpointTable() {
  return (
    <div className="space-y-3">
      <Table className="min-w-[46rem]">
        <caption className="sr-only">Evidence API endpoints</caption>
        <thead>
          <tr>
            <Th>Method</Th>
            <Th>Path</Th>
            <Th>Auth</Th>
            <Th>Purpose</Th>
          </tr>
        </thead>
        <tbody>
          {ENDPOINTS.map((e) => (
            <tr key={`${e.method} ${e.path}`}>
              <Td className="font-mono text-xs font-semibold text-accent">{e.method}</Td>
              <Td className="font-mono text-xs break-all">{e.path}</Td>
              <Td className="whitespace-nowrap">
                <Badge tone={AUTH[e.auth].tone}>{AUTH[e.auth].label}</Badge>
              </Td>
              <Td className="text-muted">
                {e.purpose}
                {e.note && <span className="mt-1 block text-xs text-subtle">{e.note}</span>}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <p className="text-xs text-subtle">
        Defaults in parentheses. Draw commits need a signed-in session; in local development mode the backend signs every
        request in as a local admin.
      </p>
    </div>
  );
}
