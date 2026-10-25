import { describe, expect, it } from "vitest";
import { formatVisitorTime, getBookingLocale } from "./bookingTime";

describe("heure locale du visiteur (RES-04)", () => {
  const sevenPmParis = new Date("2026-10-29T18:00:00.000Z");

  it("n'affiche l'heure locale que si elle diffère de l'heure de Paris", () => {
    expect(formatVisitorTime(sevenPmParis, "en-GB", "Asia/Dubai")).toBe("22:00");
    expect(formatVisitorTime(sevenPmParis, "en-GB", "America/Montreal")).toBe("14:00");
    expect(formatVisitorTime(sevenPmParis, "en-GB", "Europe/London")).toBe("18:00");
    expect(formatVisitorTime(sevenPmParis, "fr-FR", "Europe/Paris")).toBeNull();
    expect(formatVisitorTime(sevenPmParis, "fr-FR", "Europe/Brussels")).toBeNull();
  });

  it("précise le jour quand il n'est plus le même qu'à Paris", () => {
    // 23:30 à Paris : déjà vendredi 02:30 à Dubaï ; 00:30 à Paris : encore la veille à Montréal.
    expect(formatVisitorTime(new Date("2026-10-29T22:30:00.000Z"), "fr-FR", "Asia/Dubai")).toBe("ven. 02:30");
    expect(formatVisitorTime(new Date("2026-10-29T23:30:00.000Z"), "en-GB", "America/Montreal")).toBe("Thu 19:30");
  });

  it("formate les dates dans la langue de la page", () => {
    expect(getBookingLocale("fr")).toBe("fr-FR");
    expect(getBookingLocale("zh")).toBe("zh-CN");
    expect(getBookingLocale("it")).toBe("en-GB");
  });
});
