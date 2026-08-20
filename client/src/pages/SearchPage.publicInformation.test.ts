import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("recherche d’informations publiques", () => {
  it("se limite rédactionnellement aux informations publiques visibles", async () => {
    const source = await readFile(new URL("./SearchPage.tsx", import.meta.url), "utf8");
    expect(source).toContain("informations publiques visibles sur le site");
    expect(source).toContain("Rechercher une information publique");
    expect(source).not.toContain("Retrouvez rapidement une consultation, un parcours candidat");
    expect(source).not.toContain("strings.title");
    expect(source).not.toContain("strings.intro");
  });
});
