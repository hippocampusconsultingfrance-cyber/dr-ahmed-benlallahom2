import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("illustrations originales des parcours", () => {
  it("utilise les visuels décoratifs sur les sections Services et Réservation", async () => {
    const [services, booking] = await Promise.all([
      readFile(new URL("./ServicesSection.tsx", import.meta.url), "utf8"),
      readFile(new URL("../pages/BookingPage.tsx", import.meta.url), "utf8"),
    ]);

    expect(services).toContain("/manus-storage/services-medical-compass_333540df.jpg");
    expect(booking).toContain("/manus-storage/booking-care-path_b41c3403.jpg");
    expect(services).toContain('alt=""');
    expect(booking).toContain('alt=""');
  });
});
