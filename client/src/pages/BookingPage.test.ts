import { describe, expect, it } from "vitest";
import { bookingContent, getBookingAvailabilityState, parseBookingDateTime } from "./BookingPage";

describe("booking date placeholders", () => {
  it("uses an explicit localized placeholder for every supported language", () => {
    expect(bookingContent.fr.form.datePlaceholder).toBe("JJ/MM/AAAA · HH:MM");
    expect(bookingContent.en.form.datePlaceholder).toBe("DD/MM/YYYY · HH:MM");
    expect(bookingContent.de.form.datePlaceholder).toBe("TT.MM.JJJJ · HH:MM");
    expect(bookingContent.zh.form.datePlaceholder).toBe("年/月/日 · 时:分");
  });

  it("keeps date and time controls visible and keyboard accessible", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("./BookingPage.tsx", import.meta.url), "utf8")
    );

    expect(source).toContain('id="booking-date"');
    expect(source).toContain('id="booking-time"');
    expect(source).toContain('type="text"');
    expect(source).not.toContain('opacity-0');
  });

  it("aide la saisie tactile avec le remplissage automatique et les touches d’action", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("./BookingPage.tsx", import.meta.url), "utf8")
    );

    expect(source).toContain('autoComplete="name"');
    expect(source).toContain('autoComplete="email"');
    expect(source).toContain('autoComplete="tel"');
    expect(source).toContain('enterKeyHint="next"');
    expect(source).toContain('enterKeyHint="done"');
  });

  it("parses a valid French date and time and rejects invalid calendar values", () => {
    const parsed = parseBookingDateTime("21/08/2026", "10:00");

    expect(parsed?.getFullYear()).toBe(2026);
    expect(parsed?.getMonth()).toBe(7);
    expect(parsed?.getDate()).toBe(21);
    expect(parsed?.getHours()).toBe(10);
    expect(parseBookingDateTime("31/02/2026", "10:00")).toBeNull();
    expect(parseBookingDateTime("21/08/2026", "25:00")).toBeNull();
  });

  it("distingue explicitement les états de disponibilité du créneau", () => {
    expect(getBookingAvailabilityState({ selected: false, pending: false, blocked: false, booked: false })).toBe("select");
    expect(getBookingAvailabilityState({ selected: true, pending: true, blocked: false, booked: false })).toBe("checking");
    expect(getBookingAvailabilityState({ selected: true, pending: false, blocked: true, booked: false })).toBe("unavailable");
    expect(getBookingAvailabilityState({ selected: true, pending: false, blocked: false, booked: true })).toBe("unavailable");
    expect(getBookingAvailabilityState({ selected: true, pending: false, blocked: false, booked: false })).toBe("available");
  });

  it("verrouille immédiatement une soumission de paiement répétée avant le rendu du bouton désactivé", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("./BookingPage.tsx", import.meta.url), "utf8")
    );

    expect(source).toContain("const paymentSubmissionRef = useRef(false)");
    expect(source).toContain("if (paymentSubmissionRef.current || isLoading) return;");
    expect(source).toContain("paymentSubmissionRef.current = true;");
    expect(source).toContain("paymentSubmissionRef.current = false;");
  });

  it("n’expose pas de détail technique dans les alertes publiques de paiement", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("./BookingPage.tsx", import.meta.url), "utf8")
    );

    expect(source).toContain("alert(content.paymentError);");
    expect(source).toContain("alert(content.bookingError);");
    expect(source).not.toContain("alert(`${content.paymentError} ${error.message}`)");
    expect(source).not.toContain("alert(`${content.bookingError} ${error instanceof Error ? error.message : \"Unknown error\"}`)");
  });

  it("réduit le poids visuel de l’illustration purement décorative", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("./BookingPage.tsx", import.meta.url), "utf8")
    );

    expect(source).toContain('aria-hidden="true"');
    expect(source).toContain("opacity-70 saturate-75");
  });
});
