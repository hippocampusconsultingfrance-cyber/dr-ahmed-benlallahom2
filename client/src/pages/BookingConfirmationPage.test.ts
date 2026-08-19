import { describe, expect, it } from "vitest";
import { confirmationContent, getBookingConfirmationState } from "./BookingConfirmationPage";

describe("booking confirmation state", () => {
  it("does not treat an absent or unknown Stripe status as a successful payment", () => {
    expect(getBookingConfirmationState("success")).toBe("success");
    expect(getBookingConfirmationState("canceled")).toBe("canceled");
    expect(getBookingConfirmationState(null)).toBe("unknown");
    expect(getBookingConfirmationState("unexpected")).toBe("unknown");
  });

  it("provides a neutral and explicit state in every supported language", () => {
    for (const language of ["fr", "en", "de", "zh"] as const) {
      expect(confirmationContent[language].unknown.title.length).toBeGreaterThan(0);
      expect(confirmationContent[language].unknown.description.length).toBeGreaterThan(0);
      expect(confirmationContent[language].unknown.nextSteps.length).toBeGreaterThan(0);
    }
  });

  it("keeps the confirmation route out of search indexing", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("./BookingConfirmationPage.tsx", import.meta.url), "utf8")
    );

    expect(source).toContain("noIndex");
    expect(source).toContain("paymentConfirmed && (");
  });
});
