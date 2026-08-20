import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("transition de route", () => {
  it("reste brève et se désactive pour les préférences d’accessibilité", async () => {
    const [app, css] = await Promise.all([
      readFile(path.resolve(process.cwd(), "client", "src", "App.tsx"), "utf8"),
      readFile(path.resolve(process.cwd(), "client", "src", "index.css"), "utf8"),
    ]);

    expect(app).toContain('key={location} className="page-transition"');
    expect(css).toContain("animation: page-enter 180ms");
    expect(css).toContain("html.high-readability .page-transition");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
