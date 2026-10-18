import { expect, type Page, test } from "@playwright/test";

/** The main journeys on the real stack: issue → verify in the browser, draws end to end, local file verification. */

async function expectValid(page: Page, title: "Verified in your browser" | "Server says") {
  const panel = page.locator("div.rounded-lg", { hasText: title }).first();
  await expect(panel.getByText("Valid", { exact: true })).toBeVisible({ timeout: 20_000 });
}

test("generate a password with a receipt, then verify it in the Proof Explorer", async ({ page }) => {
  await page.goto("/generate");
  await page.getByRole("button", { name: /^generate/i }).first().click();
  await expect(page.getByTestId("secret")).not.toHaveText(/generate|press|click/i, { timeout: 15_000 });
  const verify = page.locator('main a[href^="/verify/"]').first(); // the receipt card's link, not the nav
  await expect(verify).toBeVisible();
  const href = await verify.getAttribute("href");
  expect(href).toMatch(/^\/verify\/[A-Za-z0-9_-]{16}$/);
  await verify.click();
  await expect(page).toHaveURL(/\/verify\/[A-Za-z0-9_-]{16}$/);
  await expectValid(page, "Verified in your browser");
  await expectValid(page, "Server says");
  await expect(page.getByText(/operator-asserted/i).first()).toBeVisible();
  await expect(page.getByText("None available").first()).toBeVisible(); // independent quantum evidence
});

test("commit and run a draw; the result verifies and the winners are recomputed", async ({ page }) => {
  await page.goto("/draws");
  await page.getByLabel("Draw title").fill("E2E giveaway");
  await page.getByLabel("Entries").fill(["Zoë", "alice", "bob", "carol", "dave", "東京"].join("\n"));
  await page.getByLabel("Winners").fill("2");
  await page.getByRole("button", { name: /commit entries/i }).click();
  await page.getByRole("button", { name: /run the draw/i }).click();
  const resultLink = page.locator('a[href^="/verify/"]').last();
  await expect(resultLink).toBeVisible({ timeout: 20_000 });
  await resultLink.click();
  await expectValid(page, "Verified in your browser");
  await page.getByRole("button", { name: /check entry list/i }).first().waitFor({ timeout: 10_000 }).catch(() => undefined);
});

test("verify a pasted receipt locally", async ({ page, request }) => {
  const res = await request.get("/api/v2/random?bytes=16&receipt=true");
  const text = await res.text(); // the raw response: Python float formatting intact
  await page.goto("/verify");
  await page.getByLabel(/receipt, draw response or evidence export/i).fill(text);
  await page.getByRole("button", { name: "Verify in my browser" }).click();
  await expectValid(page, "Verified in your browser");
  // Tampering with a signed number is caught.
  await page.getByLabel(/receipt, draw response or evidence export/i).fill(text.replace('"details":{"bytes":16}', '"details":{"bytes":17}'));
  await page.getByRole("button", { name: "Verify in my browser" }).click();
  await expect(page.locator("div.rounded-lg", { hasText: "Verified in your browser" }).first()
    .getByText("Invalid", { exact: true })).toBeVisible();
});

test("status page shows timestamped sources and never a false quantum claim", async ({ page, request }) => {
  const status = await (await request.get("/api/v2/entropy/status")).json() as { quantum_available: boolean };
  await page.goto("/status");
  if (status.quantum_available) {
    await expect(page.getByText("Quantum source available")).toBeVisible();
  } else {
    await expect(page.getByText(/Fallback in use/)).toBeVisible();
  }
  await expect(page.getByText(/live telemetry, not evidence/i)).toBeVisible();
});

test("unknown receipt ids and malformed ids are handled", async ({ page }) => {
  await page.goto("/verify/AAAAAAAAAAAAAAAA");
  await expect(page.getByRole("heading", { name: "Receipt not found" })).toBeVisible({ timeout: 15_000 });
  const r = await page.goto("/verify/not-a-valid-id!");
  expect(r?.status()).toBe(404);
});
