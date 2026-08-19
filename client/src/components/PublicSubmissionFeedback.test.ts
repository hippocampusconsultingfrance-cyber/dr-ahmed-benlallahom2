import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("feedbacks publics après soumission", () => {
  it("conserve des confirmations explicites pour Contact, RGPD et paiement", async () => {
    const [contact, gdpr, booking, bookingConfirmation] = await Promise.all([
      readFile(new URL("./ContactSection.tsx", import.meta.url), "utf8"),
      readFile(new URL("./GDPRRequestForm.tsx", import.meta.url), "utf8"),
      readFile(new URL("../pages/BookingPage.tsx", import.meta.url), "utf8"),
      readFile(new URL("../pages/BookingConfirmationPage.tsx", import.meta.url), "utf8"),
    ]);

    expect(contact).toContain("const [submitted, setSubmitted] = useState(false)");
    expect(contact).toContain("success-panel");
    expect(contact).toContain("toast.error(copy.sendError)");
    expect(contact).toContain("toast.error(copy.consentRequired)");
    expect(gdpr).toContain("const [submitted, setSubmitted] = useState(false)");
    expect(gdpr).toContain("setSubmitted(true)");
    expect(gdpr).toContain("{copy.received}");
    expect(gdpr).toContain("toast.error(copy.error)");
    expect(booking).toContain("alert(content.paymentError);");
    expect(booking).toContain("alert(content.bookingError);");
    expect(bookingConfirmation).toContain('export type BookingConfirmationState = "success" | "canceled" | "unknown"');
    expect(bookingConfirmation).toContain('if (status === "success") return "success"');
    expect(bookingConfirmation).toContain('if (status === "canceled") return "canceled"');
  });
});
