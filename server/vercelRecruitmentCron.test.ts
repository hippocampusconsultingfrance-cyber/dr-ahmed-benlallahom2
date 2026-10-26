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
});
