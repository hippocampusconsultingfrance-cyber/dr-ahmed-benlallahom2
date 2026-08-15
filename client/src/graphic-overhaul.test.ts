import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { bookingContent } from "./pages/BookingPage";

const projectRoot = resolve(import.meta.dirname, "../..");

function readProjectFile(relativePath: string) {
  return readFileSync(resolve(projectRoot, relativePath), "utf8");
}

describe("premium graphic overhaul contracts", () => {
  it("keeps the multilingual booking reassurance copy complete", () => {
    for (const language of ["fr", "en", "de", "zh"] as const) {
      const content = bookingContent[language];
      expect(content.form.checkingAvailability).toBeTruthy();
      expect(content.form.available).toBeTruthy();
      expect(content.form.blocked).toBeTruthy();
      expect(content.form.alreadyBooked).toBeTruthy();
      expect(content.cancellation).toBeTruthy();
      expect(content.paymentTrust).toBeTruthy();
      expect(content.availabilityLabel).toBeTruthy();
    }
  });

  it("preserves the homepage premium component contracts", () => {
    const hero = readProjectFile("client/src/components/HeroSection.tsx");
    const navigation = readProjectFile("client/src/components/Navigation.tsx");
    const booking = readProjectFile("client/src/pages/BookingPage.tsx");
    const css = readProjectFile("client/src/index.css");

    expect(hero).toContain("hero-panel");
    expect(hero).toContain("cta-primary");
    expect(navigation).toContain("aria-label");
    expect(navigation).toContain("site-nav");
    expect(navigation).toContain("mobile-navigation");
    expect(booking).toContain("availability-status");
    expect(booking).toContain("booking-notes");
    expect(css).toContain("form-field-premium");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
