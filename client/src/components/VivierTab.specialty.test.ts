import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("vivier — affichage de la spécialité candidate", () => {
  it("affiche la spécialité enregistrée, y compris lorsqu’elle est personnalisée", async () => {
    const component = await readFile(path.join(process.cwd(), "client/src/components/VivierTab.tsx"), "utf8");
    expect(component).toContain("{candidate.specialty}");
  });
});
