import { ApiError } from "@/lib/api/client";

export const isAbortError = (e: unknown): boolean =>
  typeof e === "object" && e !== null && "name" in e && e.name === "AbortError";

export interface ShownError {
  message: string;
  requestId: string | null;
}

/** A user-facing error: the API's own message when there is one, a generic line otherwise. */
export function toShownError(e: unknown): ShownError {
  if (e instanceof ApiError) return { message: e.message, requestId: e.requestId };
  return { message: "Could not complete the request. Check your connection and try again.", requestId: null };
}
