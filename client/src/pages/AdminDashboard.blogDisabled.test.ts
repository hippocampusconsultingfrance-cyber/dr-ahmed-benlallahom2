import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("administration sans actualités", () => {
  it("n’expose plus d’onglet Blog lorsque la section Actualités est désactivée", async () => {
    const source = await readFile(new URL("./AdminDashboard.tsx", import.meta.url), "utf8");

    expect(source).not.toContain('{ id: "blog" as Tab, label: "Blog"');
    expect(source).not.toContain('{activeTab === "blog" && <BlogTab />}');
  });
});
