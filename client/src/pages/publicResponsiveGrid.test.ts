import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = (relativePath: string) => readFile(path.resolve(process.cwd(), "client", "src", relativePath), "utf8");

describe("grille responsive publique", () => {
  it("conserve un conteneur commun progressif", async () => {
    const css = await source("index.css");

    expect(css).toContain(".container {");
    expect(css).toContain("padding-left: 1rem;");
    expect(css).toContain("@media (min-width: 640px)");
    expect(css).toContain("@media (min-width: 1024px)");
    expect(css).toContain("max-width: 1280px;");
  });

  it("conserve les grilles empilées avant les colonnes sur les formulaires principaux", async () => {
    const [booking, recruitment, employers, legal] = await Promise.all([
      source("pages/BookingPage.tsx"),
      source("pages/RecruitmentPage.tsx"),
      source("pages/EmployersPage.tsx"),
      source("pages/LegalPage.tsx"),
    ]);

    expect(booking).toContain("lg:grid-cols");
    expect(recruitment).toContain("lg:grid-cols");
    expect(employers).toContain("lg:grid-cols");
    expect(legal).toContain("container max-w-4xl");
  });
});
