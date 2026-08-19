import { describe, expect, it } from "vitest";
import { withCsvUtf8Bom } from "./recruitmentCsvDownload";

describe("withCsvUtf8Bom", () => {
  it("prefixes exports so accented column labels remain readable in spreadsheet software", () => {
    expect(withCsvUtf8Bom("Prénom;Spécialité")).toBe("\uFEFFPrénom;Spécialité");
  });
});
