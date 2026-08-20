import { describe, expect, it } from "vitest";
import { getBookingFormCopy } from "./publicFormCopy";

describe("catalogue partagé de réservation", () => {
  it("fournit les statuts de réservation dans les quatre langues avec repli français", () => {
    for (const language of ["fr", "en", "de", "zh"]) {
      const copy = getBookingFormCopy(language);
      expect(copy.submit).toBeTruthy();
      expect(copy.availabilityError).toBeTruthy();
      expect(copy.invalidDate).toBeTruthy();
    }

    expect(getBookingFormCopy("it")).toEqual(getBookingFormCopy("fr"));
  });
});
