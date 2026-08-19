import { describe, expect, it } from "vitest";
import { bookingContent } from "./BookingPage";

describe("booking date placeholders", () => {
  it("uses an explicit localized placeholder for every supported language", () => {
    expect(bookingContent.fr.form.datePlaceholder).toBe("JJ/MM/AAAA · HH:MM");
    expect(bookingContent.en.form.datePlaceholder).toBe("DD/MM/YYYY · HH:MM");
    expect(bookingContent.de.form.datePlaceholder).toBe("TT.MM.JJJJ · HH:MM");
    expect(bookingContent.zh.form.datePlaceholder).toBe("年/月/日 · 时:分");
  });

  it("keeps the date field accessible with a native datetime-local control", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("./BookingPage.tsx", import.meta.url), "utf8")
    );

    expect(source).toContain('id="booking-date"');
    expect(source).toContain('type="datetime-local"');
    expect(source).not.toContain('cursor-pointer opacity-0');
  });
});
