import { test } from "@playwright/test";

/** README screenshots (dark theme, 1440px). Run with SCREENSHOTS=1; skipped otherwise. */
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture README screenshots");
test.use({ viewport: { width: 1440, height: 900 }, colorScheme: "dark", deviceScaleFactor: 1 });

const OUT = "../docs/screenshots";

test("capture", async ({ page }) => {
  await page.goto("/");
  await page.screenshot({ path: `${OUT}/v21-home.png` });

  await page.goto("/generate");
  await page.getByRole("button", { name: /^generate/i }).first().click();
  await page.locator('main a[href^="/verify/"]').first().waitFor();
  await page.screenshot({ path: `${OUT}/v21-generate.png`, fullPage: false });

  await page.locator('main a[href^="/verify/"]').first().click();
  await page.locator("div.rounded-lg", { hasText: "Verified in your browser" }).first().getByText("Valid", { exact: true })
    .waitFor({ timeout: 20_000 });
  await page.screenshot({ path: `${OUT}/v21-proof.png` });

  await page.goto("/draws");
  await page.getByLabel("Draw title").fill("Launch week giveaway");
  await page.getByLabel("Entries").fill(["Zoë", "alice", "bob", "carol", "dave", "Émile", "frank", "grace"].join("\n"));
  await page.getByLabel("Winners").fill("2");
  await page.getByRole("button", { name: /commit entries/i }).click();
  await page.getByRole("button", { name: /run the draw/i }).click();
  await page.locator('a[href^="/verify/"]').last().waitFor();
  await page.screenshot({ path: `${OUT}/v21-draws.png` });

  await page.goto("/status");
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${OUT}/v21-status.png` });
});
