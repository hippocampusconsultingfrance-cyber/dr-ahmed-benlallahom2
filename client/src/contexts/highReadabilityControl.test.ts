import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("contrôle de lisibilité renforcée", () => {
  it("applique une taille de police sûre, la persiste et l’expose dans la navigation", async () => {
    const root = process.cwd();
    const [context, css, navigation] = await Promise.all([
      readFile(path.join(root, "client/src/contexts/ThemeContext.tsx"), "utf8"),
      readFile(path.join(root, "client/src/index.css"), "utf8"),
      readFile(path.join(root, "client/src/components/Navigation.tsx"), "utf8"),
    ]);
    expect(context).toContain('classList.toggle("high-readability", highReadability)');
    expect(context).toContain("HIGH_READABILITY_STORAGE_KEY");
    expect(context).toContain("toggleHighReadability");
    expect(css).toContain("html.high-readability");
    expect(css).toContain("font-size: 106.25%");
    expect(css).toContain("html.high-readability p");
    expect(navigation).toContain("toggleHighReadability");
    expect(navigation).toContain("Lisibilité renforcée");
  });
});
