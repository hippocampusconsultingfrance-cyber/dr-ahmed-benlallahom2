import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("consignes d’urgence de réservation", () => {
  it("oriente vers les secours sans imposer un numéro unique", async () => {
    const source = await readFile(new URL("./BookingPage.tsx", import.meta.url), "utf8");
    expect(source).not.toMatch(/appel(?:ez|er)? le 112|call 112|rufen Sie 112|拨打 112/i);
    expect(source).toContain("appelez immédiatement les secours");
    expect(source).toContain("call emergency services immediately");
  });
});
