"use client";

import { ChevronDown, ChevronUp, RefreshCw, ScrollText, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { formatIso } from "@/components/dashboard/format";
import { Badge, Button, Callout, Card, CardBody, CardHeader, Skeleton, type Tone, Table, Td, Th } from "@/components/ui";
import { api, ApiError } from "@/lib/api/client";
import { AuditList, AuditVerify } from "@/lib/api/schemas";
import type { AuditEvent } from "@/lib/api/schemas";
import { useAppAuth } from "@/lib/auth/client";

export const PAGE_SIZE = 50;
const PREVIEW_CHARS = 72;

const messageOf = (e: unknown): string =>
  e instanceof ApiError ? e.message
    : e instanceof TypeError ? "The server could not be reached."
    : "Something went wrong.";

export function actionTone(action: string): Tone {
  if (action.endsWith(".denied") || action.endsWith(".kill_switch")) return "warning";
  if (action === "draw.admin_complete") return "violet";
  return "neutral";
}

type Verification =
  | { status: "idle" }
  | { status: "running" }
  | { status: "done"; result: AuditVerify }
  | { status: "error"; message: string };

function Row({ event, expanded, onToggle, flagged }: { event: AuditEvent; expanded: boolean; onToggle: () => void;
                                                       flagged: boolean }) {
  const compact = Object.keys(event.details).length === 0 ? "" : JSON.stringify(event.details);
  const long = compact.length > PREVIEW_CHARS;
  const detailsId = `audit-${event.seq}-details`;
  return (
    <tr className={flagged ? "bg-danger-soft" : undefined}>
      <Td className="font-mono text-xs text-muted tabular-nums">
        {event.seq}
        {flagged && <Badge tone="danger" className="mt-1 whitespace-nowrap">First bad entry</Badge>}
      </Td>
      <Td className="text-xs text-muted tabular-nums whitespace-nowrap">
        <time dateTime={event.ts}>{formatIso(event.ts)}</time>
      </Td>
      <Td className="max-w-40 font-mono text-xs break-all">{event.actor}</Td>
      <Td><Badge tone={actionTone(event.action)} className="font-mono whitespace-nowrap">{event.action}</Badge></Td>
      <Td className="max-w-48 font-mono text-xs break-all text-muted">
        {event.target ?? <span className="text-subtle">-</span>}
      </Td>
      <Td className="min-w-64">
        {compact === "" ? <span className="text-subtle">-</span> : (
          <>
            <code id={detailsId} className="font-mono text-xs break-all text-muted">
              {expanded || !long ? compact : `${compact.slice(0, PREVIEW_CHARS)}…`}
            </code>
            {long && (
              <button type="button" onClick={onToggle} aria-expanded={expanded} aria-controls={detailsId}
                      className="mt-1 flex items-center gap-1 text-xs text-accent underline-offset-2 hover:underline">
                {expanded ? <ChevronUp className="size-3" aria-hidden /> : <ChevronDown className="size-3" aria-hidden />}
                {expanded ? "Show less" : "Show all"}
                <span className="sr-only"> details for entry {event.seq}</span>
              </button>
            )}
            {expanded && (
              <dl className="mt-2 space-y-1 font-mono text-[0.7rem] break-all text-subtle">
                <div><dt className="inline">hash </dt><dd className="inline">{event.hash}</dd></div>
                <div><dt className="inline">prev </dt><dd className="inline">{event.prev_hash}</dd></div>
              </dl>
            )}
          </>
        )}
      </Td>
    </tr>
  );
}

function VerificationResult({ v }: { v: Verification }) {
  if (v.status === "idle") return null;
  if (v.status === "running") return <p role="status" className="text-sm text-muted">Checking the hash chain...</p>;
  if (v.status === "error") {
    return <Callout tone="danger" role="alert" title="Could not verify the chain"><p>{v.message}</p></Callout>;
  }
  const { result } = v;
  return (
    <Callout tone={result.ok ? "success" : "danger"} role={result.ok ? "status" : "alert"}
             title={result.ok ? `Hash chain intact: ${result.events.toLocaleString("en-US")} events`
                              : `Hash chain broken at entry ${result.first_bad_seq ?? "unknown"}`}>
      <p>
        {result.ok
          ? "Every entry's hash matches its contents and links to the one before it."
          : "The entry's hash or its link to the previous entry does not match. Entries from there on cannot be trusted."}
      </p>
      <p className="pt-1">
        Head hash <code className="font-mono text-xs break-all select-all">{result.head}</code>
      </p>
      <p className="pt-1 text-xs">
        The server checked its own log. That detects edits and deletions inside the chain, not a rewrite of the whole
        chain, and the head is not anchored outside this server. Keep a copy of the head hash elsewhere to notice later
        rewrites.
      </p>
    </Callout>
  );
}

/** The operator audit log: paged by sequence number, with an on-demand check of the hash chain. */
export function AuditLog() {
  const { loaded, getToken } = useAppAuth();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [more, setMore] = useState<{ status: "idle" | "loading" } | { status: "error"; message: string }>({ status: "idle" });
  const [reloadKey, setReloadKey] = useState(0);
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set());
  const [verification, setVerification] = useState<Verification>({ status: "idle" });
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const fetchPage = useCallback(
    (before: number | undefined, signal?: AbortSignal) =>
      api("/api/v2/admin/audit", { schema: AuditList, query: { order: "desc", before, limit: PAGE_SIZE }, getToken,
                                   ...(signal ? { signal } : {}) }).then((r) => r.events),
    [getToken],
  );

  useEffect(() => {
    if (!loaded) return;
    const controller = new AbortController();
    fetchPage(undefined, controller.signal).then(
      (page) => {
        if (controller.signal.aborted) return;
        setEvents(page);
        setHasMore(page.length === PAGE_SIZE);
        setStatus("ready");
      },
      (e: unknown) => {
        if (controller.signal.aborted) return;
        setError(messageOf(e));
        setStatus("error");
      },
    );
    return () => controller.abort();
  }, [loaded, fetchPage, reloadKey]);

  function reload() {
    setStatus("loading");
    setEvents([]);
    setHasMore(false);
    setMore({ status: "idle" });
    setExpanded(new Set());
    setVerification({ status: "idle" });
    setReloadKey((k) => k + 1);
  }

  async function loadMore() {
    const before = events[events.length - 1]?.seq;
    setMore({ status: "loading" });
    try {
      const page = await fetchPage(before);
      if (!alive.current) return;
      setEvents((prev) => [...prev, ...page]);
      setHasMore(page.length === PAGE_SIZE);
      setMore({ status: "idle" });
    } catch (e) {
      if (alive.current) setMore({ status: "error", message: messageOf(e) });
    }
  }

  async function verifyChain() {
    setVerification({ status: "running" });
    try {
      const result = await api("/api/v2/admin/audit/verify", { schema: AuditVerify, getToken });
      if (alive.current) setVerification({ status: "done", result });
    } catch (e) {
      if (alive.current) setVerification({ status: "error", message: messageOf(e) });
    }
  }

  const toggle = (seq: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(seq)) next.add(seq);
      return next;
    });

  const badSeq = verification.status === "done" && !verification.result.ok ? verification.result.first_bad_seq : null;

  return (
    <Card id="audit" className="scroll-mt-20">
      <CardHeader icon={<ScrollText />} title="Audit log"
                  description="An append-only, hash-chained record of operator-relevant actions, newest first. It is operated by this server: it is not an externally anchored transparency log." />
      <CardBody className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={verifyChain} disabled={verification.status === "running"}>
            <ShieldCheck className="size-4" aria-hidden /> Verify hash chain
          </Button>
          <Button variant="ghost" size="sm" onClick={reload} disabled={status === "loading"}>
            <RefreshCw className="size-4" aria-hidden /> Reload
          </Button>
        </div>

        <VerificationResult v={verification} />

        {status === "loading" && (
          <div role="status" aria-busy="true" className="space-y-2">
            <span className="sr-only">Loading the audit log</span>
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        )}

        {status === "error" && (
          <Callout tone="danger" role="alert" title="Could not load the audit log">
            <p>{error}</p>
            <div className="pt-2"><Button variant="secondary" size="sm" onClick={reload}>Try again</Button></div>
          </Callout>
        )}

        {status === "ready" && events.length === 0 && (
          <Callout tone="neutral" title="No audit events yet"><p>Entries appear as operator-relevant actions happen.</p></Callout>
        )}

        {status === "ready" && events.length > 0 && (
          <>
            <Table className="min-w-[56rem]">
              <caption className="sr-only">Audit log entries by sequence number</caption>
              <thead>
                <tr><Th>Seq</Th><Th>Time (UTC)</Th><Th>Actor</Th><Th>Action</Th><Th>Target</Th><Th>Details</Th></tr>
              </thead>
              <tbody>
                {events.map((ev) => (
                  <Row key={ev.seq} event={ev} expanded={expanded.has(ev.seq)} onToggle={() => toggle(ev.seq)}
                       flagged={ev.seq === badSeq} />
                ))}
              </tbody>
            </Table>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted" aria-live="polite">
                {events.length.toLocaleString("en-US")} {events.length === 1 ? "entry" : "entries"} loaded
                {!hasMore && ", oldest entry reached"}
              </p>
              {hasMore && (
                <Button variant="secondary" size="sm" onClick={loadMore} disabled={more.status === "loading"}>
                  {more.status === "loading" ? "Loading..." : "Load more"}
                </Button>
              )}
            </div>
            {more.status === "error" && (
              <Callout tone="danger" role="alert" title="Could not load more entries"><p>{more.message}</p></Callout>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}
