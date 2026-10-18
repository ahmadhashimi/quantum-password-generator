/**
 * Server-side API client for non-secret, per-user metadata (dashboards, admin). Never used for generation:
 * secrets are only ever fetched by the browser. Forwards the user's Clerk token and client IP (FastAPI trusts
 * X-Forwarded-For only from the Caddy and web containers), and never caches.
 */
import "server-only";

import { headers } from "next/headers";
import type { z } from "zod";

import { clerkEnabled } from "@/lib/auth/config";

import { ApiError, errorFrom } from "./errors";

const BASE = process.env.API_INTERNAL_URL ?? "http://localhost:8000";

export async function serverApi<T>(path: `/api/v2/${string}`, schema: z.ZodType<T>): Promise<T> {
  const h: Record<string, string> = { accept: "application/json" };
  if (clerkEnabled) {
    const { auth } = await import("@clerk/nextjs/server");
    const token = await (await auth()).getToken();
    if (token) h.authorization = `Bearer ${token}`;
  }
  const incoming = await headers();
  const xff = incoming.get("x-forwarded-for");
  if (xff) h["x-forwarded-for"] = xff;
  const res = await fetch(`${BASE}${path}`, { headers: h, cache: "no-store" });
  if (!res.ok) throw await errorFrom(res);
  const parsed = schema.safeParse(await res.json());
  if (!parsed.success) throw new ApiError("Unexpected response from the API", res.status, res.headers.get("x-request-id"));
  return parsed.data;
}

/** Like serverApi, but returns null instead of throwing on 401/403/404 (e.g. signed out, not an admin). */
export async function serverApiOrNull<T>(path: `/api/v2/${string}`, schema: z.ZodType<T>):
    Promise<{ data: T | null; status: number }> {
  try {
    return { data: await serverApi(path, schema), status: 200 };
  } catch (e) {
    if (e instanceof ApiError && [401, 403, 404].includes(e.status)) return { data: null, status: e.status };
    throw e;
  }
}
