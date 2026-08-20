import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("illustrations publiques responsives", () => {
  it("utilise des variantes WebP 640/1280 sans modifier la sémantique décorative", async () => {
    const [services, booking] = await Promise.all([
      readFile(path.resolve(process.cwd(), "client/src/components/ServicesSection.tsx"), "utf8"),
      readFile(path.resolve(process.cwd(), "client/src/pages/BookingPage.tsx"), "utf8"),
    ]);

    for (const source of [services, booking]) {
      expect(source).toContain("srcSet=");
      expect(source).toContain("640w");
      expect(source).toContain("1280w");
      expect(source).toContain('decoding="async"');
      expect(source).toContain('alt=""');
      expect(source).toContain('aria-hidden="true"');
    }
    expect(services).toContain('sizes="100vw"');
    expect(booking).toContain('sizes="(min-width: 1024px) 30vw, 100vw"');
  });
});
