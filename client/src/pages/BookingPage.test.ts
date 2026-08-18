import { describe, expect, it } from "vitest";
import { bookingContent } from "./BookingPage";

describe("booking date placeholders", () => {
  it("uses an explicit localized placeholder for every supported language", () => {
    expect(bookingContent.fr.form.datePlaceholder).toBe("JJ/MM/AAAA · HH:MM");
    expect(bookingContent.en.form.datePlaceholder).toBe("DD/MM/YYYY · HH:MM");
    expect(bookingContent.de.form.datePlaceholder).toBe("TT.MM.JJJJ · HH:MM");
    expect(bookingContent.zh.form.datePlaceholder).toBe("年/月/日 · 时:分");
  });
});
