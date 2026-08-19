import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("candidature VVIP — erreurs publiques", () => {
  it("uses a localized generic error instead of surfacing a backend message", async () => {
    const source = await readFile(new URL("./VvipOffshorePage.tsx", import.meta.url), "utf8");

    expect(source).toContain("setErrorMessage(t.genericError);");
    expect(source).not.toContain("err instanceof Error ? err.message : t.genericError");
  });
});
