import { describe, expect, it } from "vitest";
import { formatBookingDateInput, formatBookingTimeInput, parseBookingDateTime, toParisBookingDateKey } from "./BookingPage";

/**
 * Frappe touche par touche dans un champ contrôlé, curseur en fin de saisie :
 * le navigateur insère le caractère (ou efface celui qui précède le curseur),
 * l'événement input appelle le onChange du formulaire, qui réécrit la valeur
 * mise en forme. Renvoie la valeur affichée après chaque touche.
 */
function typeInto(format: (value: string) => string, keys: Array<string>, initial = "") {
  let value = initial;
  const displayed: string[] = [];
  for (const key of keys) {
    value = format(key === "Backspace" ? value.slice(0, -1) : `${value}${key}`);
    displayed.push(value);
  }
  return displayed;
}

const keysOf = (text: string) => Array.from(text);
const typeDate = (text: string, separator?: "/" | ".") => typeInto((value) => formatBookingDateInput(value, separator), keysOf(text));
const typeTime = (text: string) => typeInto(formatBookingTimeInput, keysOf(text));

describe("saisie de la date et de l'heure au pavé numérique (RES-01)", () => {
  it("insère « / » pendant la frappe de chiffres seuls", () => {
    expect(typeDate("05112026")).toEqual(["0", "05", "05/1", "05/11", "05/11/2", "05/11/20", "05/11/202", "05/11/2026"]);
    expect(typeDate("05112026", ".").at(-1)).toBe("05.11.2026");
    expect(typeDate("0511202699").at(-1)).toBe("05/11/2026");
  });

  it("insère « : » pendant la frappe de l'heure, avec une heure à un ou deux chiffres", () => {
    expect(typeTime("1900")).toEqual(["1", "19", "19:0", "19:00"]);
    expect(typeTime("930")).toEqual(["9", "9:3", "9:30"]);
    expect(typeTime("0930").at(-1)).toBe("09:30");
    expect(typeTime("10h00")).toEqual(["1", "10", "10:", "10:0", "10:00"]);
    expect(typeTime("10.00").at(-1)).toBe("10:00");
    expect(typeTime("10,00").at(-1)).toBe("10:00");
    expect(typeTime("19:005").at(-1)).toBe("19:00");
  });

  it("garde les séparateurs tapés au clavier complet et n'empêche jamais d'effacer", () => {
    expect(typeDate("5/11/2026").at(-1)).toBe("5/11/2026");
    expect(typeDate("05.11.2026").at(-1)).toBe("05/11/2026");
    expect(typeTime("9:30").at(-1)).toBe("9:30");
    expect(typeTime("1:30").at(-1)).toBe("1:30");

    const erased = typeInto((value) => formatBookingDateInput(value), Array(10).fill("Backspace"), "05/11/2026");
    expect(erased).toEqual(["05/11/202", "05/11/20", "05/11/2", "05/11/", "05/11", "05/1", "05/", "05", "0", ""]);
    expect(typeInto(formatBookingTimeInput, Array(5).fill("Backspace"), "19:00")).toEqual(["19:0", "19:", "19", "1", ""]);
  });

  it("donne un créneau en heure de Paris après une frappe en chiffres seuls", () => {
    const date = typeDate("05112026").at(-1)!;
    const time = typeTime("1900").at(-1)!;
    const parsed = parseBookingDateTime(date, time);
    expect(parsed?.toISOString()).toBe("2026-11-05T18:00:00.000Z");
    expect(toParisBookingDateKey(parsed!)).toBe("2026-11-05");
    expect(parseBookingDateTime(typeDate("21082026").at(-1)!, typeTime("930").at(-1)!)?.toISOString()).toBe("2026-08-21T07:30:00.000Z");
    expect(parseBookingDateTime(typeDate("05112026", ".").at(-1)!, typeTime("10h00").at(-1)!)?.toISOString()).toBe("2026-11-05T09:00:00.000Z");
  });
});

describe("parseBookingDateTime tolère les saisies sans séparateur (RES-01)", () => {
  it("lit huit chiffres comme JJMMAAAA", () => {
    expect(parseBookingDateTime("05112026", "10:00")?.toISOString()).toBe("2026-11-05T09:00:00.000Z");
    expect(parseBookingDateTime(" 05/112026 ", "10:00")?.toISOString()).toBe("2026-11-05T09:00:00.000Z");
    expect(parseBookingDateTime("05 11 2026", "10:00")?.toISOString()).toBe("2026-11-05T09:00:00.000Z");
    expect(parseBookingDateTime("5/11/2026", "10:00")?.toISOString()).toBe("2026-11-05T09:00:00.000Z");
    expect(parseBookingDateTime("31022026", "10:00")).toBeNull();
    expect(parseBookingDateTime("0511202", "10:00")).toBeNull();
    expect(parseBookingDateTime("051120266", "10:00")).toBeNull();
    expect(parseBookingDateTime("05nov2026", "10:00")).toBeNull();
  });

  it("lit trois ou quatre chiffres comme H:MM ou HH:MM et accepte h . , et l'espace", () => {
    for (const time of ["10:00", "1000", "10h00", "10H00", "10h 00", "10.00", "10,00", "10 00"]) {
      expect(parseBookingDateTime("05/11/2026", time)?.toISOString(), time).toBe("2026-11-05T09:00:00.000Z");
    }
    expect(parseBookingDateTime("05/11/2026", "930")?.toISOString()).toBe("2026-11-05T08:30:00.000Z");
    expect(parseBookingDateTime("05/11/2026", "1900")?.toISOString()).toBe("2026-11-05T18:00:00.000Z");
    expect(parseBookingDateTime("05/11/2026", "9:30")?.toISOString()).toBe("2026-11-05T08:30:00.000Z");
    for (const time of ["2500", "1960", "19", "10h", "10:0", "12345", "dix heures"]) {
      expect(parseBookingDateTime("05/11/2026", time), time).toBeNull();
    }
  });
});
