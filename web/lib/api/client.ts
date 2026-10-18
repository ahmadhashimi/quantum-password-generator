/**
 * Browser API client. Every call goes to same-origin /api/v2/* with `cache: "no-store"`: in production Caddy routes
 * these straight to FastAPI, so generated secrets never pass through the Next.js server or its caches.
 */
import type { z } from "zod";

import { ApiError, errorFrom } from "./errors";
import type { Provenance } from "./schemas";

export { ApiError };
export type TokenGetter = () => Promise<string | null>;
type Query = Record<string, string | number | boolean | undefined>;
type ApiPath = `/api/v2/${string}` | "/.well-known/quantumpass-keys.json";

interface CallOptions<T> {
  schema: z.ZodType<T>;
  method?: "GET" | "POST" | "DELETE";
  query?: Query;
  body?: unknown;
  getToken?: TokenGetter;
  idempotencyKey?: string;
  signal?: AbortSignal;
}

function url(path: ApiPath, query?: Query): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined) qs.set(k, String(v));
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}

async function send(path: ApiPath, opts: Omit<CallOptions<unknown>, "schema">): Promise<Response> {
  const headers: Record<string, string> = { accept: "application/json" };
  const token = opts.getToken ? await opts.getToken() : null;
  if (token) headers.authorization = `Bearer ${token}`;
  if (opts.idempotencyKey) headers["idempotency-key"] = opts.idempotencyKey;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(url(path, opts.query), {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers,
    cache: "no-store",
    credentials: "same-origin",
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
    ...(opts.signal ? { signal: opts.signal } : {}),
  });
  if (!res.ok) throw await errorFrom(res);
  return res;
}

function parse<T>(schema: z.ZodType<T>, data: unknown, res: Response): T {
  const r = schema.safeParse(data);
  if (!r.success) throw new ApiError("Unexpected response from the server", res.status, res.headers.get("x-request-id"));
  return r.data;
}

export async function api<T>(path: ApiPath, opts: CallOptions<T>): Promise<T> {
  const res = await send(path, opts);
  return parse(opts.schema, await res.json(), res);
}

/** Also returns the raw body text: receipts are verified from the exact bytes received (see lib/verify). */
export async function apiWithText<T>(path: ApiPath, opts: CallOptions<T>): Promise<{ data: T; text: string }> {
  const res = await send(path, opts);
  const text = await res.text();
  return { data: parse(opts.schema, JSON.parse(text), res), text };
}

/** A fresh Idempotency-Key (8-64 chars of A-Z a-z 0-9 _ -). */
export function idempotencyKey(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

export type ChatEvent =
  | { event: "conversation"; data: { id: string } }
  | { event: "text"; data: { text: string } }
  | { event: "tool"; data: { name: string } }
  | { event: "secret"; data: { secret_id: string; kind: string; value: string; entropy_bits: number;
                               provenance: Provenance } }
  | { event: "error"; data: { message: string } }
  | { event: "done"; data: Record<string, unknown> };

/** Parse a text/event-stream body into events. */
export async function* parseSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<ChatEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const chunk = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      let event = "message";
      let data = "";
      for (const line of chunk.split("\n")) {
        if (line.startsWith("event: ")) event = line.slice(7);
        else if (line.startsWith("data: ")) data += line.slice(6);
      }
      if (data) yield { event, data: JSON.parse(data) } as ChatEvent;
    }
  }
}

export async function* streamChat(message: string, conversationId: string | null, getToken: TokenGetter,
                                  signal?: AbortSignal): AsyncGenerator<ChatEvent> {
  const res = await send("/api/v2/assistant/chat", {
    method: "POST", body: { message, conversation_id: conversationId }, getToken, ...(signal ? { signal } : {}),
  });
  if (!res.body) throw new ApiError("No response stream", res.status, res.headers.get("x-request-id"));
  yield* parseSSE(res.body);
}
