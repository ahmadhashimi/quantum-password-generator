import type { ChatEvent } from "./types";

export type TokenGetter = () => Promise<string | null>;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function authHeaders(getToken?: TokenGetter): Promise<HeadersInit> {
  const token = getToken ? await getToken() : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function errorFrom(res: Response): Promise<ApiError> {
  let message = res.statusText;
  try {
    const body = await res.json();
    message = typeof body.detail === "string" ? body.detail : (body.error ?? message);
  } catch {
    /* non-JSON error body */
  }
  if (res.status === 429) message = "Too many requests — slow down a little.";
  return new ApiError(res.status, message);
}

export async function apiGet<T>(path: string, params?: Record<string, string | number | boolean>, getToken?: TokenGetter) {
  const qs = params ? `?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}` : "";
  const res = await fetch(`${path}${qs}`, { headers: await authHeaders(getToken), cache: "no-store" });
  if (!res.ok) throw await errorFrom(res);
  return (await res.json()) as T;
}

/** Parse a text/event-stream body into typed events. */
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

export async function* streamChat(
  message: string,
  conversationId: string | null,
  getToken: TokenGetter,
  signal?: AbortSignal,
): AsyncGenerator<ChatEvent> {
  const res = await fetch("/api/v2/assistant/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders(getToken)) },
    body: JSON.stringify({ message, conversation_id: conversationId }),
    signal,
  });
  if (!res.ok || !res.body) throw await errorFrom(res);
  yield* parseSSE(res.body);
}
