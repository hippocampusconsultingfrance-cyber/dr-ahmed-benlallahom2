import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("navigation de l’administration", () => {
  it("garde chaque onglet distinct et défilable sans rétrécir les libellés", async () => {
    const source = await readFile(path.join(process.cwd(), "client/src/pages/AdminDashboard.tsx"), "utf8");

    expect(source).toContain("gap-3 overflow-x-auto overscroll-x-contain");
    expect(source).toContain("shrink-0 flex items-center");
    expect(source).toContain('aria-label="Navigation des sections d’administration"');
    expect(source).toContain('aria-current={activeTab === tab.id ? "page" : undefined}');

    const messagesIndex = source.indexOf('{ id: "contacts" as Tab, label: "Messages"');
    const questionsIndex = source.indexOf('{ id: "medicalQuestions" as Tab, label: "Questions santé"');
    const gdprIndex = source.indexOf('{ id: "gdpr" as Tab, label: "RGPD"');
    expect(messagesIndex).toBeGreaterThan(-1);
    expect(questionsIndex).toBeGreaterThan(messagesIndex);
    expect(questionsIndex).toBeLessThan(gdprIndex);
  });
});
