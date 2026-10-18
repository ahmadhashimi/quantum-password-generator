import type { z } from "zod";

import { ApiError } from "@/lib/api/errors";
import { serverApiOrNull } from "@/lib/api/server";

export type Loaded<T> =
  | { state: "ok"; data: T }
  | { state: "denied"; status: 401 | 403 | 404 }
  | { state: "failed"; message: string; requestId: string | null };

/**
 * Fetch non-secret account metadata on the server and turn every expected failure into a value the page can render,
 * so a signed-out visitor, a non-admin or a down API gets an explanation instead of the generic error page.
 * Anything else (Next.js control-flow errors, bugs) is rethrown untouched.
 */
export async function load<T>(path: `/api/v2/${string}`, schema: z.ZodType<T>): Promise<Loaded<T>> {
  try {
    const { data, status } = await serverApiOrNull(path, schema);
    if (data !== null) return { state: "ok", data };
    return { state: "denied", status: status === 401 ? 401 : status === 403 ? 403 : 404 };
  } catch (e) {
    if (e instanceof ApiError) return { state: "failed", message: e.message, requestId: e.requestId };
    if (e instanceof TypeError) return { state: "failed", message: "The API could not be reached.", requestId: null };
    throw e;
  }
}
