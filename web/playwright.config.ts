import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against the real stack: FastAPI (development mode, throwaway SQLite DB and signing key) and the
 * production Next.js build. Build the site first with API_REWRITE_ORIGIN=http://127.0.0.1:8000 so /api/v2/* reaches
 * FastAPI the way Caddy routes it in production. Set PW_CHROMIUM_PATH to use a preinstalled Chromium.
 */
const python = process.env.E2E_PYTHON ?? "python3";
const tmp = process.env.RUNNER_TEMP ?? "/tmp";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  timeout: 60_000,
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  webServer: [
    {
      command: `${python} -m uvicorn app.main:app --host 127.0.0.1 --port 8000`,
      cwd: "../backend",
      url: "http://127.0.0.1:8000/api/v2/health",
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        ENVIRONMENT: "development",
        ALLOWED_HOSTS: '["127.0.0.1","localhost"]',
        ALLOWED_ORIGINS: '["http://127.0.0.1:3000"]',
        DATABASE_URL: `sqlite:///${tmp}/qpg-e2e-${Date.now()}.db`,
        SIGNING_KEY_PATH: `${tmp}/qpg-e2e-keys-${Date.now()}.json`,
        POOL_PATH: `${tmp}/qpg-e2e-pool.bin`,
        LOG_FORMAT: "json",
      },
    },
    {
      // The standalone server, assembled exactly as in web/Dockerfile.
      command: "cp -r .next/static .next/standalone/.next/ && cp -r public .next/standalone/ && " +
        "node .next/standalone/server.js",
      url: "http://127.0.0.1:3000/healthz",
      reuseExistingServer: false,
      timeout: 60_000,
      env: { API_INTERNAL_URL: "http://127.0.0.1:8000", NEXT_TELEMETRY_DISABLED: "1", PORT: "3000",
             HOSTNAME: "127.0.0.1" },
    },
  ],
});
