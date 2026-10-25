import { describe, expect, it } from "vitest";
import { getContactFormCopy, getGdprRequestCopy, getTurnstileWidgetCopy, publicFormCopy } from "./publicFormCopy";

describe("catalogue des formulaires publics", () => {
  it("couvre les quatre langues et fournit un repli français sûr", () => {
    expect(Object.keys(publicFormCopy.contact)).toEqual(["fr", "en", "de", "zh"]);
    expect(Object.keys(publicFormCopy.gdpr)).toEqual(["fr", "en", "de", "zh"]);
    expect(Object.keys(publicFormCopy.turnstile)).toEqual(["fr", "en", "de", "zh"]);
    expect(getContactFormCopy("de").sending).toBe("Wird gesendet...");
    expect(getGdprRequestCopy("zh").back).toBe("返回");
    expect(getContactFormCopy("unsupported")).toBe(publicFormCopy.contact.fr);
    expect(getGdprRequestCopy("unsupported")).toBe(publicFormCopy.gdpr.fr);
    expect(getTurnstileWidgetCopy("en").retry).toBe("Try again");
    expect(getTurnstileWidgetCopy("unsupported")).toBe(publicFormCopy.turnstile.fr);
  });
});
