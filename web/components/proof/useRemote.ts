"use client";

import { useEffect, useState } from "react";

import { ApiError } from "@/lib/api/client";

import type { Optional } from "./proof-data";

type Settled<T> = Exclude<Optional<T>, { status: "idle" | "loading" }>;

function failure(error: unknown): Settled<never> {
  if (error instanceof ApiError) return { status: "error", message: error.message, httpStatus: error.status };
  if (error instanceof TypeError) return { status: "error", message: "The server could not be reached.", httpStatus: null };
  if (error instanceof SyntaxError) return { status: "error", message: "The server sent something that isn't JSON.", httpStatus: null };
  return { status: "error", message: error instanceof Error ? error.message : "Something went wrong.", httpStatus: null };
}

/**
 * Runs `load` whenever `key` changes; a null key means "don't ask" (idle). Results are tagged with their key, so a
 * response for an earlier key is never shown, and a superseded request is aborted. `load` must be stable
 * (useCallback), otherwise it restarts on every render.
 */
export function useRemote<T>(key: string | null, load: (signal: AbortSignal) => Promise<T>): Optional<T> {
  const [settled, setSettled] = useState<{ key: string; state: Settled<T> } | null>(null);

  useEffect(() => {
    if (key === null) return;
    const controller = new AbortController();
    load(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setSettled({ key, state: { status: "ok", data } });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setSettled({ key, state: failure(error) });
      },
    );
    return () => controller.abort();
  }, [key, load]);

  if (key === null) return { status: "idle" };
  return settled?.key === key ? settled.state : { status: "loading" };
}
