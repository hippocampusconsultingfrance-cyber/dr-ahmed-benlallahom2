import { describe, expect, it } from "vitest";
import { readOledDarkPreference } from "./oledPreference";

describe("préférence OLED", () => {
  it("n’active le noir OLED que pour une préférence explicite", () => {
    expect(readOledDarkPreference("true")).toBe(true);
    expect(readOledDarkPreference("false")).toBe(false);
    expect(readOledDarkPreference(null)).toBe(false);
    expect(readOledDarkPreference("unexpected")).toBe(false);
  });
});
