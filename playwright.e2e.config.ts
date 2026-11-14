import { defineConfig } from "@playwright/test";
import { e2eSettings } from "./e2e/support/settings";

/**
 * End-to-end scenarios (CODE-22) of the paths that earn money or collect personal data,
 * on the built server with a local PostgreSQL and the doubles of e2e/support: no real
 * service is called. Run after `VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA pnpm build`:
 *   E2E_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/e2e pnpm test:e2e
 * (a database that every run empties; README, « Tests de bout en bout »). One worker and no
 * retry: the scenarios share the server, and one that passes only on a second try fails.
 * Chromium is Playwright's (`pnpm exec playwright install chromium`), or the one CHROMIUM names.
 */
const settings = e2eSettings();

export default defineConfig({
  testDir: "e2e",
  testMatch: "*.spec.ts",
  globalSetup: "./e2e/global-setup.ts",
  outputDir: "tmp/e2e/results",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  forbidOnly: true,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: settings.appOrigin,
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    viewport: { width: 1280, height: 900 },
    trace: "retain-on-failure",
    launchOptions: {
      executablePath: process.env.CHROMIUM?.trim() || undefined,
      args: ["--no-sandbox", "--no-proxy-server"],
    },
  },
});
