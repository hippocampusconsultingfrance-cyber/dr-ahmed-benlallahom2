import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  getMissingCriticalProductionEnvironment,
  PRODUCTION_REQUIRED_ENVIRONMENT_VARIABLES,
} from "./_core/env";
import { secureMfaHashEquals } from "./adminMfa";

describe("remédiations de l’audit externe", () => {
  it("identifie les secrets et configurations critiques manquants en production", () => {
    const completeEnvironment = Object.fromEntries(
      PRODUCTION_REQUIRED_ENVIRONMENT_VARIABLES.map(name => [name, `${name}-configured-value`])
    );

    expect(getMissingCriticalProductionEnvironment(completeEnvironment)).toEqual([]);
    expect(getMissingCriticalProductionEnvironment({ ...completeEnvironment, JWT_SECRET: "" })).toEqual(["JWT_SECRET"]);
  });

  it("compare les condensats MFA de manière défensive", () => {
    const expected = "a".repeat(64);
    expect(secureMfaHashEquals(expected, expected)).toBe(true);
    expect(secureMfaHashEquals(expected, "b".repeat(64))).toBe(false);
    expect(secureMfaHashEquals(expected, "short")).toBe(false);
  });

  it("n’expose pas le bypass de test Stripe ni le détail des exceptions de webhook", async () => {
    const source = await readFile(path.join(process.cwd(), "server/_core/index.ts"), "utf8");
    expect(source).not.toContain("evt_test_");
    expect(source).not.toContain("send(`Webhook Error:");
    expect(source).toContain('res.status(500).json({ received: false })');
    expect(source).toContain('res.status(400).json({ error: "Invalid webhook" })');
  });

  it("fixe explicitement la confiance proxy et HSTS", async () => {
    const source = await readFile(path.join(process.cwd(), "server/_core/index.ts"), "utf8");
    expect(source).toContain('app.set("trust proxy", 1)');
    expect(source).toContain("Strict-Transport-Security");
  });
});
