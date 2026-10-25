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

  it("crée ses formateurs une seule fois pour toute la grille, même quand l'horloge la recalcule", () => {
    const RealDateTimeFormat = Intl.DateTimeFormat;
    let constructed = 0;
    Intl.DateTimeFormat = class extends RealDateTimeFormat {
      constructor(...args: ConstructorParameters<typeof RealDateTimeFormat>) {
        super(...args);
        constructed += 1;
      }
    } as typeof Intl.DateTimeFormat;
    // Trente et un horaires d'un jour, vus de Tokyo en allemand : langue et fuseau pas encore utilisés ici.
    const starts = Array.from({ length: 31 }, (_, index) => new Date(Date.UTC(2026, 10, 10, 7 + Math.floor(index / 2), (index % 2) * 30)));
    let first: Array<string | null>, again: Array<string | null>, created: number, createdAgain: number;
    try {
      first = starts.map((start) => formatVisitorTime(start, "de-DE", "Asia/Tokyo"));
      created = constructed;
      again = starts.map((start) => formatVisitorTime(start, "de-DE", "Asia/Tokyo"));
      createdAgain = constructed - created;
    } finally {
      Intl.DateTimeFormat = RealDateTimeFormat;
    }

    expect(created).toBeLessThanOrEqual(5);
    expect(createdAgain).toBe(0);
    expect(again).toEqual(first);
    // 08:00 à Paris : 16:00 à Tokyo ; 23:00 à Paris : déjà mercredi 07:00 à Tokyo.
    expect(first[0]).toBe("16:00");
    expect(first.at(-1)).toBe("Mi., 07:00");
  });

  it("formate les dates dans la langue de la page", () => {
    expect(getBookingLocale("fr")).toBe("fr-FR");
    expect(getBookingLocale("zh")).toBe("zh-CN");
    expect(getBookingLocale("it")).toBe("en-GB");
  });
});
