import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("planification Vercel du traitement des CV", () => {
  it("déclare un cron quotidien vers le worker recrutement", () => {
    const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
    expect(config.crons).toContainEqual({
      path: "/api/scheduled/recruitment-processing",
      schedule: "15 1 * * *",
    });
  });

  it("protège le worker Vercel avec CRON_SECRET, comparé en temps constant", () => {
    const source = readFileSync(new URL("./_core/index.ts", import.meta.url), "utf8");
    const cronAuth = readFileSync(new URL("./_core/cronAuth.ts", import.meta.url), "utf8");
    expect(source).toContain('app.get("/api/scheduled/recruitment-processing", requireVercelCron,');
    expect(source).not.toContain("req.headers.authorization !== `Bearer ${cronSecret}`");
    expect(cronAuth).toContain("process.env.CRON_SECRET?.trim()");
    expect(cronAuth).toContain("timingSafeEqual(");
    expect(source).toContain("retryDueFailedCvConfirmationEmails");
  });
});
