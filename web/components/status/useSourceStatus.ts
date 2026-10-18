"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";

import { api, ApiError } from "@/lib/api/client";
import { EntropyStatus } from "@/lib/api/schemas";

export const POLL_MS = 30_000;
const TICK_MS = 10_000;

const Health = z.looseObject({ status: z.string(), version: z.string() });

export type HealthResult = { ok: true; status: string; version: string } | { ok: false };

export interface StatusError {
  message: string;
  requestId: string | null;
}

interface Snapshot {
  status: EntropyStatus;
  /** Browser clock (ms) when the response arrived. */
  receivedAt: number;
}

export interface SourceStatusState {
  status: EntropyStatus | null;
  health: HealthResult | null;
  error: StatusError | null;
  refreshing: boolean;
  /**
   * The server's clock now, in unix seconds: `checked_at` plus the time elapsed since the response arrived. Relative
   * times computed against it do not depend on the browser's clock being right.
   */
  serverNow: number | null;
  /** When the server reported the status (its `checked_at`, or the arrival time if it sent none), unix seconds. */
  checkedAt: number | null;
  refresh: () => void;
}

function describe(e: unknown): StatusError {
  if (e instanceof ApiError) return { message: e.message, requestId: e.requestId };
  return { message: "Could not reach the server.", requestId: null };
}

/**
 * Polls GET /api/v2/entropy/status (and /api/v2/health) every 30 seconds. Polling pauses while the document is
 * hidden and catches up as soon as it is visible again. A failed poll keeps the last good snapshot on screen.
 */
export function useSourceStatus(): SourceStatusState {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [health, setHealth] = useState<HealthResult | null>(null);
  const [error, setError] = useState<StatusError | null>(null);
  const [refreshing, setRefreshing] = useState(true);
  const [now, setNow] = useState<number | null>(null);
  const run = useRef<() => Promise<void>>(async () => undefined);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    let lastStart = 0;

    const clear = () => {
      clearTimeout(timer);
      timer = undefined;
    };
    const schedule = () => {
      clear();
      if (active && !document.hidden) timer = setTimeout(() => void load(), POLL_MS);
    };
    const load = async () => {
      clear();
      controller?.abort();
      const mine = (controller = new AbortController());
      lastStart = Date.now();
      const [s, h] = await Promise.allSettled([
        api("/api/v2/entropy/status", { schema: EntropyStatus, signal: mine.signal }),
        api("/api/v2/health", { schema: Health, signal: mine.signal }),
      ]);
      if (!active || mine.signal.aborted) return;
      const receivedAt = Date.now();
      if (s.status === "fulfilled") {
        setSnapshot({ status: s.value, receivedAt });
        setNow(receivedAt);
        setError(null);
      } else {
        setError(describe(s.reason));
      }
      setHealth(h.status === "fulfilled" ? { ok: true, status: h.value.status, version: h.value.version } : { ok: false });
      setRefreshing(false);
      schedule();
    };
    const onVisibility = () => {
      if (document.hidden) clear();
      else if (Date.now() - lastStart >= POLL_MS) void load();
      else schedule();
    };

    run.current = load;
    void load();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      clear();
      controller?.abort();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // Advances relative times between polls without refetching.
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) setNow(Date.now());
    }, TICK_MS);
    return () => clearInterval(id);
  }, []);

  const refresh = useCallback(() => {
    setRefreshing(true);
    void run.current();
  }, []);

  let serverNow: number | null = null;
  let checkedAt: number | null = null;
  if (snapshot) {
    checkedAt = snapshot.status.checked_at ?? snapshot.receivedAt / 1000;
    serverNow = checkedAt + (Math.max(now ?? 0, snapshot.receivedAt) - snapshot.receivedAt) / 1000;
  }

  return { status: snapshot?.status ?? null, health, error, refreshing, serverNow, checkedAt, refresh };
}
