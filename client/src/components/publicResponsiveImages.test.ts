import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("illustrations publiques responsives", () => {
  it("utilise des SVG locaux légers sans modifier la sémantique décorative", async () => {
    const [services, booking] = await Promise.all([
      readFile(path.resolve(process.cwd(), "client/src/components/ServicesSection.tsx"), "utf8"),
      readFile(path.resolve(process.cwd(), "client/src/pages/BookingPage.tsx"), "utf8"),
    ]);

    for (const source of [services, booking]) {
      expect(source).toContain('decoding="async"');
      expect(source).toContain('alt=""');
      expect(source).toContain('aria-hidden="true"');
      expect(source).not.toContain("/manus-storage/");
    }
    expect(services).toContain('src="/assets/medical-compass.svg"');
    expect(booking).toContain('src="/assets/booking-care.svg"');
    expect(services).toContain('sizes="100vw"');
    expect(booking).toContain('sizes="(min-width: 1024px) 30vw, 100vw"');
  });
});
