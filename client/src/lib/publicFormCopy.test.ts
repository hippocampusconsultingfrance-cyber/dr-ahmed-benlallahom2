import { getContactFormCopy, getGdprRequestCopy, publicFormCopy } from "./publicFormCopy";
import { describe, expect, it } from "vitest";

describe("catalogue des formulaires publics", () => {
  it("couvre les quatre langues de l’interface pour Contact et RGPD", () => {
    expect(Object.keys(publicFormCopy.contact)).toEqual(["fr", "en", "de", "zh"]);
    expect(Object.keys(publicFormCopy.gdpr)).toEqual(["fr", "en", "de", "zh"]);
  });

  it("préserve un repli français sûr pour une langue inconnue", () => {
    expect(getContactFormCopy("unsupported").sending).toBe(publicFormCopy.contact.fr.sending);
    expect(getGdprRequestCopy("unsupported").back).toBe(publicFormCopy.gdpr.fr.back);
  });
});
