import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("illustrations publiques décoratives", () => {
  it("utilise un chargement différé et un décodage asynchrone sans exposer de contenu redondant", async () => {
    const [services, booking] = await Promise.all([
      readFile(path.resolve(process.cwd(), "client", "src", "components", "ServicesSection.tsx"), "utf8"),
      readFile(path.resolve(process.cwd(), "client", "src", "pages", "BookingPage.tsx"), "utf8"),
    ]);

    for (const source of [services, booking]) {
      expect(source).toContain('loading="lazy"');
      expect(source).toContain('decoding="async"');
      expect(source).toContain('alt=""');
      expect(source).toContain('aria-hidden="true"');
      expect(source).toContain('srcSet="/manus-storage/');
      expect(source).toContain('sizes="(max-width: 640px)');
      expect(source).toContain('.webp');
    }
  });
});
