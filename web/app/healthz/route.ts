/** Container healthcheck: no rendering, no upstream calls. */
export function GET(): Response {
  return new Response("ok", { headers: { "content-type": "text/plain", "cache-control": "no-store" } });
}
