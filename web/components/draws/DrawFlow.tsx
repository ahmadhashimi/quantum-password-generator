"use client";

import { useEffect, useRef, useState } from "react";

import { Callout, ButtonLink } from "@/components/ui";
import { ApiError, apiWithText, idempotencyKey } from "@/lib/api/client";
import { DrawCommitResponse, DrawRunResponse } from "@/lib/api/schemas";
import { useAppAuth } from "@/lib/auth/client";
import { losslessField } from "@/lib/verify/json";

import { CommitForm } from "./CommitForm";
import { CommitSummary } from "./CommitSummary";
import {
  CONFLICT_COPY, type Committed, conflictKind, type ConflictKind, describeError, type DrawResult, matchesSubmission,
  readSelection,
} from "./draw-data";
import { DrawResultCards } from "./DrawResult";
import { type DrawPhase, DrawStepper } from "./DrawStepper";
import type { DrawBody } from "./entries";
import { RunPanel } from "./RunPanel";

const SIGN_IN_HREF = "/sign-in?redirect_url=%2Fdraws";
const COMMIT_RETRY = "Retrying is safe: the same request key is reused, so it can't create a second draw.";
const RUN_RETRY = "Retrying is safe: a draw can only run once, and a retry returns the stored result.";

interface Conflict {
  kind: ConflictKind;
  /** The server's own wording, shown as supporting detail. */
  message: string;
}

function SignInNotice({ enabled, message }: { enabled: boolean; message: string }) {
  return (
    <Callout tone="warning" role="alert" title="Sign in to run draws">
      <p>{message}</p>
      {enabled && (
        <p className="pt-2">
          <ButtonLink href={SIGN_IN_HREF} variant="secondary" size="sm">Sign in</ButtonLink>
        </p>
      )}
    </Callout>
  );
}

/**
 * Commit-then-run draws. Entries are not secret (the receipt publishes the winners), but each request is made
 * idempotent anyway: the commit key is tied to the exact request body and the run key to the draw, and both are reused
 * on retry, so a dropped connection can never create a second draw or re-roll one.
 */
export function DrawFlow() {
  const auth = useAppAuth();
  const [phase, setPhase] = useState<DrawPhase>("compose");
  const [committed, setCommitted] = useState<Committed | null>(null);
  const [result, setResult] = useState<DrawResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signInMessage, setSignInMessage] = useState<string | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [moved, setMoved] = useState(false); // after the first transition, new steps take focus
  const [formVersion, setFormVersion] = useState(0);
  const commitAttempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const runAttempt = useRef<{ drawId: string; key: string } | null>(null);
  const inFlight = useRef(false);

  // A committed draw can only be run from this page: ask before the tab is closed or reloaded.
  useEffect(() => {
    if (phase !== "committed") return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [phase]);

  function begin(): boolean {
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setSignInMessage(null);
    return true; // a standing conflict stays on screen (and keeps focus on "Check again") until the next outcome
  }

  function fail(err: unknown, retryNote: string) {
    const status = err instanceof ApiError ? err.status : null;
    setSignInMessage(status === 401 && err instanceof ApiError ? err.message : null);
    setConflict(status === 409 && err instanceof ApiError ? { kind: conflictKind(err), message: err.message } : null);
    setError(status === 401 || status === 409 ? null : describeError(err, retryNote));
  }

  async function commit(body: DrawBody) {
    if (!begin()) return;
    try {
      // One key per distinct request body: unchanged content retries with the same key, edited content gets a new one.
      const fingerprint = JSON.stringify(body);
      const attempt = commitAttempt.current?.fingerprint === fingerprint
        ? commitAttempt.current
        : (commitAttempt.current = { fingerprint, key: idempotencyKey() });
      const { data, text } = await apiWithText("/api/v2/draws", {
        schema: DrawCommitResponse, method: "POST", body, getToken: auth.getToken, idempotencyKey: attempt.key,
      });
      const receiptText = losslessField(text, "commit_receipt");
      if (receiptText === null) throw new ApiError("Unexpected response from the server", 200, null);
      setCommitted({ drawId: data.draw_id, receipt: data.commit_receipt, receiptText,
                     matchesSubmission: matchesSubmission(data.commit_receipt, body) });
      setPhase("committed");
      setMoved(true);
    } catch (err) {
      fail(err, COMMIT_RETRY);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function run() {
    if (!committed || !begin()) return;
    const { drawId } = committed;
    try {
      const attempt = runAttempt.current?.drawId === drawId
        ? runAttempt.current
        : (runAttempt.current = { drawId, key: idempotencyKey() });
      const { data, text } = await apiWithText(`/api/v2/draws/${encodeURIComponent(drawId)}/run`, {
        schema: DrawRunResponse, method: "POST", getToken: auth.getToken, idempotencyKey: attempt.key,
      });
      const receiptText = losslessField(text, "receipt");
      if (receiptText === null) throw new ApiError("Unexpected response from the server", 200, null);
      setResult({ winners: data.winners, receipt: data.receipt, receiptText, replayed: data.replayed === true,
                  selection: readSelection(data.receipt) });
      setPhase("done");
    } catch (err) {
      fail(err, RUN_RETRY);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function startOver() {
    commitAttempt.current = null;
    runAttempt.current = null;
    setPhase("compose");
    setCommitted(null);
    setResult(null);
    setError(null);
    setConflict(null);
    setSignInMessage(null);
    setFormVersion((v) => v + 1);
    setMoved(true);
  }

  const signInNeeded = signInMessage !== null && (
    <SignInNotice enabled={auth.enabled}
                  message={auth.enabled ? "Draws belong to an account. Sign in, then try again."
                                        : `${signInMessage.replace(/\.$/, "")}. This deployment has no sign-in configured.`} />
  );
  const status = (
    <>
      {signInNeeded}
      {error && <Callout tone="danger" role="alert" title="That didn't work">{error}</Callout>}
      {conflict && (
        <Callout tone="warning" role="alert" title={CONFLICT_COPY[conflict.kind].title}>
          <p>{CONFLICT_COPY[conflict.kind].body}</p>
          <p className="pt-1 text-xs text-subtle">
            Server message: {conflict.message}
            {committed && <> Quote draw ID {committed.drawId} if you contact the operator.</>}
          </p>
          <p className="pt-2">
            <button type="button" onClick={() => void run()} disabled={busy}
                    className="text-sm font-medium text-accent underline underline-offset-2 hover:text-accent-strong
                               disabled:opacity-50">
              {busy ? "Checking…" : "Check again"}
            </button>
          </p>
        </Callout>
      )}
    </>
  );

  const prompt = auth.enabled && auth.loaded && !auth.signedIn && phase === "compose" && signInMessage === null;

  return (
    <div className="space-y-6">
      <DrawStepper phase={phase} />
      {phase === "compose" && (
        <>
          {prompt && (
            <Callout tone="info" title="Sign in to commit a draw">
              <p>Draws are tied to your account so only you can run them.</p>
              <p className="pt-2"><ButtonLink href={SIGN_IN_HREF} variant="secondary" size="sm">Sign in</ButtonLink></p>
            </Callout>
          )}
          <CommitForm key={formVersion} busy={busy} status={status} focusTitle={moved} onSubmit={(b) => void commit(b)} />
        </>
      )}
      {committed && phase === "committed" && (
        <>
          <CommitSummary committed={committed} focusTitle={moved} />
          <RunPanel busy={busy} status={status} focusTitle={false} onRun={() => void run()} onStartOver={startOver} />
        </>
      )}
      {committed && result && phase === "done" && (
        <>
          <DrawResultCards result={result} focusTitle={moved} onStartOver={startOver} />
          <CommitSummary committed={committed} focusTitle={false} />
        </>
      )}
    </div>
  );
}
