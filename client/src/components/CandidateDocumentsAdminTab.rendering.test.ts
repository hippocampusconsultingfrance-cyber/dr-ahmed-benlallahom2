import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("revue administrative des documents", () => {
  it("rend chaque document une seule fois", async () => {
    const source = await readFile(new URL("./CandidateDocumentsAdminTab.tsx", import.meta.url), "utf8");
    expect(source.match(/list\.data\?\.map\(document =>/g)).toHaveLength(1);
  });
});
