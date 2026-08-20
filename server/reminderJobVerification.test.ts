import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("vérification interne des rappels", () => {
  it("documente une tâche horaire sans prétendre à une livraison réelle", async () => {
    const source = await readFile(path.join(process.cwd(), "REMINDER_JOB_VERIFICATION.md"), "utf8");
    for (const marker of ["appointment-reminder-24h", "/api/scheduled/reminder", "0 0 * * * *", "{\"ok\":true,\"reminded\":0}", "EXTERNAL_VALIDATION_REGISTER.md", "n’envoie de notification de test"]) expect(source).toContain(marker);
  });
});
