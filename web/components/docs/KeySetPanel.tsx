"use client";

import { sha256 } from "@noble/hashes/sha2.js";
import { CheckCircle2, KeyRound, RefreshCw, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Badge, Button, Callout, Card, CardBody, Skeleton, type Tone } from "@/components/ui";
import { api, ApiError } from "@/lib/api/client";
import { KeySet } from "@/lib/api/schemas";
import { formatUnix } from "@/lib/format";
import { b64urlDecode, concat, toHex } from "@/lib/verify/encoding";

type PublicKey = KeySet["keys"][number];
type View = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; keyset: KeySet };

const EXPECTED_BYTES = { ed25519: 32, "ml-dsa-65": 1952 } as const;

const STATUS: Record<string, { tone: Tone; label: string; meaning: string }> = {
  active: { tone: "success", label: "Active", meaning: "Signs new receipts." },
  retired: { tone: "neutral", label: "Retired", meaning: "Rotated out. Receipts it signed still verify." },
  revoked: { tone: "danger", label: "Revoked", meaning: "Receipts issued at or after the revocation time fail." },
};

interface Length {
  chars: number;
  bytes: number | null;
}

function lengthOf(text: string): Length {
  try {
    return { chars: text.length, bytes: b64urlDecode(text).length };
  } catch {
    return { chars: text.length, bytes: null };
  }
}

/** key_id is the first 16 hex of SHA-256(ed25519_pk || ml-dsa-65_pk); a mismatch means a mislabelled key set. */
function fingerprintMatches(key: PublicKey): boolean {
  try {
    const digest = sha256(concat(b64urlDecode(key.ed25519), b64urlDecode(key["ml-dsa-65"])));
    return toHex(digest).slice(0, 16) === key.key_id;
  } catch {
    return false;
  }
}

function KeyRow({ k }: { k: PublicKey }) {
  const status = STATUS[k.status ?? "active"] ?? { tone: "neutral" as const, label: k.status ?? "Unknown", meaning: "" };
  const ed = lengthOf(k.ed25519);
  const ml = lengthOf(k["ml-dsa-65"]);
  const sizes: [string, Length, number][] = [["Ed25519", ed, EXPECTED_BYTES.ed25519],
                                             ["ML-DSA-65", ml, EXPECTED_BYTES["ml-dsa-65"]]];
  const matches = fingerprintMatches(k);
  return (
    <li className="space-y-4 rounded-lg border border-border bg-surface-raised p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-wide text-subtle uppercase">Key ID</p>
          <code className="font-mono text-base tracking-wide break-all text-fg">{k.key_id}</code>
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>
      <p className="text-sm text-muted">
        {status.meaning}
        {k.status === "revoked" && k.revoked_at !== undefined && (
          <> Revoked at <time dateTime={new Date(k.revoked_at * 1000).toISOString()} className="font-medium text-fg">
            {formatUnix(k.revoked_at)}</time>.</>
        )}
      </p>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        {sizes.map(([name, len, expected]) => (
          <div key={name}>
            <dt className="text-xs font-medium tracking-wide text-subtle uppercase">{name} public key</dt>
            <dd className="mt-1 text-fg tabular-nums">
              {len.chars.toLocaleString("en-US")} base64url characters
              <span className="block text-xs text-muted">
                {len.bytes === null ? "Not valid base64url" : `${len.bytes.toLocaleString("en-US")} bytes`}
                {len.bytes !== null && len.bytes !== expected && ` (expected ${expected.toLocaleString("en-US")})`}
              </span>
            </dd>
          </div>
        ))}
      </dl>
      <p className={matches ? "flex items-start gap-2 text-sm text-success" : "flex items-start gap-2 text-sm text-danger"}>
        {matches ? <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0" />
                 : <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />}
        <span>
          {matches
            ? "Key ID matches SHA-256 of the two public keys (computed in your browser)."
            : "Key ID does not match SHA-256 of the two public keys. Do not trust this key set."}
        </span>
      </p>
    </li>
  );
}

/**
 * The signing key set, fetched from the browser (the keys live at /.well-known, not under /api/v2). It comes from
 * the same server that signs, so it shows what is published, not an independent copy: pin your own.
 */
export function KeySetPanel() {
  const [view, setView] = useState<View>({ kind: "loading" });
  const controller = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    controller.current?.abort();
    const c = (controller.current = new AbortController());
    try {
      const keyset = await api("/.well-known/quantumpass-keys.json", { schema: KeySet, signal: c.signal });
      if (!c.signal.aborted) setView({ kind: "ready", keyset });
    } catch (e) {
      if (c.signal.aborted) return;
      setView({ kind: "error", message: e instanceof ApiError ? e.message : "Could not reach the server." });
    }
  }, []);

  useEffect(() => {
    void load();
    return () => controller.current?.abort();
  }, [load]);

  const keys = view.kind === "ready" ? view.keyset.keys : [];
  const revoked = keys.filter((k) => k.status === "revoked");

  return (
    <Card>
      <div className="flex items-start justify-between gap-4 px-6 pt-6">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 font-semibold text-fg">
            <KeyRound aria-hidden className="size-4 text-accent" />
            Published signing keys
          </h3>
          <p className="mt-1 text-sm text-muted">Fetched live from /.well-known/quantumpass-keys.json.</p>
        </div>
        <Button variant="secondary" size="sm" disabled={view.kind === "loading"}
                onClick={() => { setView({ kind: "loading" }); void load(); }}>
          <RefreshCw aria-hidden className="size-3.5" /> Reload
        </Button>
      </div>
      <CardBody className="space-y-4">
        {view.kind === "loading" && (
          <div role="status" aria-busy="true" className="space-y-3">
            <span className="sr-only">Loading the key set</span>
            <Skeleton className="h-36" />
          </div>
        )}
        {view.kind === "error" && (
          <Callout tone="danger" role="alert" title="The key set could not be loaded">
            <p>{view.message}</p>
          </Callout>
        )}
        {view.kind === "ready" && (
          <>
            {revoked.length > 0 && (
              <Callout tone="danger" role="status" title="A signing key has been revoked">
                <p>
                  Receipts signed by {revoked.map((k) => k.key_id).join(", ")} at or after the revocation time are invalid.
                  Receipts issued before it stay valid.
                </p>
              </Callout>
            )}
            {keys.length === 0 ? (
              <Callout tone="warning" title="The server published no keys" />
            ) : (
              <ul className="space-y-3" aria-label="Signing keys">
                {keys.map((k) => <KeyRow key={k.key_id} k={k} />)}
              </ul>
            )}
            <p className="text-xs text-subtle">
              Algorithms: {(view.keyset.algorithms ?? ["ed25519", "ml-dsa-65"]).join(" + ")}. This copy comes from the same
              server that signs receipts. For independence, download it once over a channel you trust and verify against
              your own copy.{" "}
              <a href="/.well-known/quantumpass-keys.json" className="text-accent underline">Open the raw JSON</a>
            </p>
          </>
        )}
      </CardBody>
    </Card>
  );
}
