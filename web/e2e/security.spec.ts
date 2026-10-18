import { expect, type Response, test } from "@playwright/test";

/**
 * Release gates from the V2.1 brief: generated secrets never reach URLs, server-rendered HTML or RSC payloads;
 * sensitive pages and API responses are never cached; pages carry a nonce CSP; sensitive links aren't prefetched.
 */

const SENSITIVE = ["/generate", "/verify", "/draws", "/dashboard", "/admin"];

test("API responses are no-store with a locked-down CSP", async ({ request }) => {
  for (const path of ["/api/v2/password", "/api/v2/health", "/.well-known/quantumpass-keys.json"]) {
    const r = await request.get(path);
    expect(r.ok(), path).toBeTruthy();
    expect(r.headers()["cache-control"], path).toMatch(/^no-store/);
  }
});

test("pages carry a per-request nonce CSP and security headers", async ({ request }) => {
  const a = await request.get("/");
  const b = await request.get("/");
  const csp = a.headers()["content-security-policy"] ?? "";
  expect(csp).toMatch(/script-src[^;]*'nonce-[A-Za-z0-9+/=]+'[^;]*'strict-dynamic'/);
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("object-src 'none'");
  expect(b.headers()["content-security-policy"]).not.toBe(csp); // fresh nonce per request
  expect(a.headers()["x-frame-options"]).toBe("DENY");
  expect(a.headers()["x-content-type-options"]).toBe("nosniff");
  expect(a.headers()["referrer-policy"]).toBe("no-referrer");
  expect(a.headers()["x-powered-by"]).toBeUndefined();
});

test("sensitive pages are never cached", async ({ request }) => {
  for (const path of SENSITIVE) {
    const r = await request.get(path, { maxRedirects: 0 });
    expect(r.headers()["cache-control"] ?? "", path).toMatch(/no-store/);
  }
});

test("a generated secret never appears in HTML, RSC payloads or URLs", async ({ page }) => {
  const nextBodies: { url: string; body: string }[] = [];
  const pending: Promise<void>[] = [];
  page.on("response", (res: Response) => {
    const url = new URL(res.url());
    if (url.pathname.startsWith("/api/v2/") || url.pathname.startsWith("/_next/static/")) return;
    pending.push(res.text().then((body) => void nextBodies.push({ url: res.url(), body })).catch(() => undefined));
  });
  const requested: string[] = [];
  page.on("request", (req) => requested.push(req.url()));

  await page.goto("/generate");
  await page.getByRole("button", { name: /^generate/i }).first().click();
  const secretEl = page.getByTestId("secret");
  await expect(secretEl).not.toHaveText(/generate|press|click/i, { timeout: 15_000 });
  const secret = (await secretEl.textContent())?.trim() ?? "";
  expect(secret.length).toBeGreaterThanOrEqual(8);

  // Navigate around the app (client-side navigations fetch RSC payloads) and reload.
  await page.goto("/verify");
  await page.goto("/generate");
  await page.reload();
  await Promise.all(pending);

  for (const { url, body } of nextBodies) expect(body.includes(secret), `secret leaked in ${url}`).toBe(false);
  for (const url of requested) expect(url.includes(encodeURIComponent(secret)) || url.includes(secret)).toBe(false);
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage })))
    .not.toContain(secret);
});

test("links to sensitive pages are not prefetched", async ({ page }) => {
  const rsc: string[] = [];
  page.on("request", (req) => {
    const url = new URL(req.url());
    if (req.headers()["next-router-prefetch"] || req.headers()["rsc"] || url.searchParams.has("_rsc")) {
      rsc.push(url.pathname);
    }
  });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.mouse.move(10, 10);
  for (const link of await page.locator('a[href="/generate"], a[href="/verify"], a[href="/draws"]').all()) {
    await link.hover().catch(() => undefined);
  }
  await page.waitForTimeout(1000);
  expect(rsc.filter((p) => SENSITIVE.some((s) => p.startsWith(s)))).toEqual([]);
});
